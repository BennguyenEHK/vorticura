'use server';

// =============================================
// DATA PROCESSING API - Unified Handler for All Data Types
// =============================================
// Server action entry point for all UI → server communication
// Input: JSON structured data → Output: JSON structured result
// Supports: quotation, email, rfq_analysis, supplier_search, respond_service, incoming_email
//
// Architecture:
//   UI Component → handleHTTPRequest(ProcessorInput)
//     → Validator → Coordinator (routing) → Action Processor → Response
//     → If action_type = 'proceed': Pipeline chain → data-loader → next processor
//     → Action returns result → data-processor emits SSE centrally
//
// Reference: make_sales_sse_server/api/data-processing.js

// ========== MODULAR COMPONENTS ==========
import {
  validateInput,
  normalizeQuotationData,
  type ProcessorInput,
  type ProcessorResult,
  type DataType,
  type ActionType,
} from './utils/validator';

// ========== PROCESSOR MODULES ==========
import { processQuotation } from './actions/quotation-actions';
import { processEmail } from './actions/email-actions';
import { processSupplierSearch } from './actions/supplier-search-actions';
import { processAnalysis } from './actions/analysis-actions';
import { processRespond } from './actions/respond-actions';
import { eventBus } from './event-bus';
// Queue-sidebar push emitter — called after every successful processor result
// so all connected clients see the sidebar row update without re-fetching.
import { emitQueuedRFQs } from './services/rfq-queue/queue-manager';
import type { RFQStage } from '@/types/rfq-queue';
// Persist last_preview_type before SSE emit so workspace hydration picks the right tableMap
import { updateData } from './db/queries';
import type { PreviewType } from '@/types/ui-reload';

// ========== WORKSPACE RESOLUTION ==========
import { getServerActionWorkspace } from './middleware/get-workspace';

// ========== PIPELINE CHAINING ==========
import { loadProcessorInput } from './data-loader';

// =============================================
// Types
// =============================================

/** Processor function signature — takes validated input, returns result */
type ProcessorFn = (input: ProcessorInput) => Promise<ProcessorResult>;

/** Pipeline chain config — defines what step follows when action_type = 'proceed' */
interface PipelineStep {
  nextDataType: DataType;    // Which data_type to chain into
  nextActionType: ActionType; // Which action_type to use for the next processor
}

/** Processing statistics for monitoring */
interface ProcessingStats {
  totalGenerations: number;
  totalUpdates: number;
  totalProcessed: number;
  errors: number;
}

// =============================================
// DATA PROCESSORS MAPPING TABLE (2-LEVEL)
// =============================================
// Routes data_type → action_type → processor function
// Mirrors EXTRACTION_VALIDATE structure in validator.ts for consistency

const DATA_PROCESSORS: Record<string, Record<string, ProcessorFn>> = {
  'quotation': {
    generate: processQuotation,       // Create new quotation shell
    update: processQuotation,          // Update existing quotation with new values
    manual_update: processQuotation,   // User edits from preview panel
    calculate: processQuotation,       // Calculate sales prices from pricing variables
  },
  'email': {
    generate: processEmail,            // Generate email draft (supplier inquiry or quotation)
    re_generate: processEmail,         // Regenerate email with user feedback
    send: processEmail,                // Send approved email
  },
  'rfq_analysis': {
    analyze: processAnalysis,          // AI analyzes new RFQ email
    reanalyze: processAnalysis,        // Re-analyze with user corrections
  },
  'supplier_search': {
    search: processSupplierSearch,     // Search for potential suppliers
    research: processSupplierSearch,   // Re-search with user corrections
  }, 
  'respond_service': {
    supplier_respond: processRespond, // Supplier replied to inquiry → AI parse + update item statuses
    customer_respond: processRespond, // Customer replied to quotation → AI parse + route response
  },
};

const INCOMING_EMAIL_ROUTE: Record<string, PipelineStep> = {
  handleRFQ:                      { nextDataType: 'rfq_analysis',    nextActionType: 'analyze' },           // New RFQ detected
  handleSupplierRespond:          { nextDataType: 'respond_service', nextActionType: 'supplier_respond' },  // Supplier replied
  handleCustomerRespond:          { nextDataType: 'respond_service', nextActionType: 'customer_respond' }  // Customer replied
};
// =============================================
// PIPELINE CHAIN MAP
// =============================================
// Defines the "next step" for each data_type when action_type = 'proceed'.
// data-processor uses data-loader to build the input for the next step,
// then calls the next processor DIRECTLY (no recursive handleHTTPRequest).
//
// Pipeline flow:
//   rfq_analysis → supplier_search → email (contact suppliers)
//   respond_service (all available) → quotation → email (send quotation)

const PIPELINE_NEXT: Record<string, PipelineStep | null> = {
  'rfq_analysis':    { nextDataType: 'supplier_search', nextActionType: 'search' },
  'supplier_search': { nextDataType: 'email',           nextActionType: 'generate' },
  'quotation':       { nextDataType: 'email',           nextActionType: 'generate' },
  'email':           null, // Terminal — no automatic next step after email send
  'respond_service': null, // Complex logic — handled inside processor (check all items status)
};

// =============================================
// MODULE-LEVEL STATE
// =============================================

const stats: ProcessingStats = {
  totalGenerations: 0,
  totalUpdates: 0,
  totalProcessed: 0,
  errors: 0,
};

// =============================================
// MAIN SERVER ACTION ENTRY POINT
// =============================================

/**
 * Main entry point for all data processing operations (server action)
 * Takes raw JSON input, validates, routes, and returns JSON output
 *
 * Flow:
 *   1. Validate input structure via Validator
 *   2. If action_type = 'proceed' → execute pipeline chain
 *   3. Otherwise → route to correct processor via DATA_PROCESSORS
 *   4. Execute processor (handles DB internally, returns result)
 *   5. Centralized SSE emit → Return standardized JSON result with session_id + timing
 *
 * @param input - Raw JSON input from UI component
 * @returns ProcessorResult with success/error status and data
 */
export async function handleHTTPRequest(input: ProcessorInput): Promise<ProcessorResult> {
  const startTime = Date.now();
  let sessionId = '';
  let dataType: DataType | null = null;
  let actionType: ActionType | null = null;

  try {
    // Step 1: Validate request body exists
    if (!input) {
      throw new Error('Request body is empty. Ensure Content-Type: application/json');
    }

    // Step 2: Validate input via Validator (checks data_type + action_type + structure)
    const validatedInput = validateInput(input);
    
    // If input is an incoming email, map it to the next routed step; otherwise keep original data/action types //also changed the within validatedInput 
    const typeTransfer =
      validatedInput.data_type === 'incoming_email'
        ? INCOMING_EMAIL_ROUTE[validatedInput.action_type]
        : undefined;

    Object.assign(validatedInput, {
      data_type: typeTransfer?.nextDataType ?? validatedInput.data_type,
      action_type: typeTransfer?.nextActionType ?? validatedInput.action_type,
    });

    dataType =  validatedInput.data_type;
    actionType = validatedInput.action_type;

    // Step 2.5: Resolve workspace from auth cookie (server action context)
    // SECURITY: Always prefer cookie-based auth to prevent tenant impersonation
    // Only allow input.workspace passthrough in non-production (test/dev scripts)
    let cookieWorkspace: import('./middleware/workspace-context').WorkspaceContext | null = null;
    try { cookieWorkspace = await getServerActionWorkspace(); } catch { /* outside Next.js server action context */ }
    if (cookieWorkspace) {
      validatedInput.workspace = cookieWorkspace; // cookie always wins over input
    } else if (!validatedInput.workspace) {
      throw new Error('Authentication required — no workspace context');
    }

    // Step 3: Handle 'proceed' action — pipeline chain to next step
    if (actionType === 'proceed') {
      sessionId = generateSessionId(validatedInput, dataType, 'proceed');
      const chainResult = await executePipelineChain(validatedInput);
      updateStats('proceed');

      const finalResult = {
        ...chainResult,
        session_id: sessionId,
        processing_time_ms: Date.now() - startTime,
      };

      // Emit SSE for pipeline-chain result (use chainResult's data_type as it's what was actually processed)
      emitProcessorResult(finalResult, chainResult.data_type as DataType, validatedInput);

      return finalResult;
    }

    // Step 3.5: Enrich input with DB context via data-loader
    // When UI sends minimal payload (e.g., rfq_id + ai_comments for reanalyze),
    // data-loader fills in the full JSON shape from DB tables.
    // Skip for:
    //   - incoming_email origin (typeTransfer set) — payload already complete from email watcher
    //   - missing rfq_id/quotation_id — nothing to load from DB (e.g., fresh file upload)
    const hasDbKey = validatedInput.rfq_id || validatedInput.quotation_id;
    if (!typeTransfer && hasDbKey && validatedInput.workspace) {
      try {
        const enrichedInput = await loadProcessorInput({
          data_type: dataType,
          action_type: actionType,
          rfq_id: validatedInput.rfq_id,
          quotation_id: validatedInput.quotation_id,
          email_id: validatedInput.email?.email_id,
          workspace: validatedInput.workspace,
          overrides: validatedInput, // User-provided fields always override DB values
        });
        // Merge enriched DB data back — user overrides survive via the overrides param above
        Object.assign(validatedInput, enrichedInput);
      } catch {
        // Non-fatal: if loader has no builder for this data_type/action_type combo,
        // fall through and let the processor handle the raw input as-is
        // (e.g., email/send has no loader — it just needs the validated input)
      }
    }

    // Step 4: Normalize quotation data if applicable
    const normalizedInput = dataType === 'quotation'
      ? normalizeQuotationData(validatedInput)
      : validatedInput;

    // Step 5: Look up processor from 2-level mapping table (data_type → action_type)
    const typeProcessors = DATA_PROCESSORS[dataType];
    if (!typeProcessors) {
      throw new Error(`No processor configured for data_type: ${dataType}`);
    }
    const processor = typeProcessors[actionType];
    if (!processor) {
      const allowed = Object.keys(typeProcessors).join(' | ');
      throw new Error(
        `No processor for data_type="${dataType}", action_type="${actionType}". Allowed: ${allowed}`
      );
    }

    // Step 6: Generate session ID for tracking
    sessionId = generateSessionId(normalizedInput, dataType, actionType);

    // Step 7: Execute the processor (handles DB internally, returns result)
    const result = await processor(normalizedInput);

    // Step 8: Update statistics
    updateStats(actionType);

    // Step 9: Centralized SSE emission — all processors return data, emit happens here
    const finalResult = {
      ...result,
      session_id: sessionId,
      processing_time_ms: Date.now() - startTime,
    };
    emitProcessorResult(finalResult, dataType, normalizedInput);

    return finalResult;
  } catch (error) {
    // Track error in statistics
    stats.errors++;

    // Return standardized error response
    return {
      success: false,
      data_type: dataType ?? 'quotation',
      action_type: actionType ?? 'generate',
      status: 'error',
      session_id: sessionId,
      processing_time_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown processing error',
      timestamp: new Date().toISOString(),
    };
  }
}

// =============================================
// PIPELINE CHAIN EXECUTOR
// =============================================

/**
 * Execute pipeline chain: look up the next step for the current data_type,
 * use data-loader to build input from DB, then call the next processor directly.
 *
 * This is called when action_type = 'proceed' (user clicked Accept).
 * The chain runs ONE step — it does NOT recurse through the entire pipeline.
 * Each Accept click advances one step.
 *
 * @param input - Validated input with action_type = 'proceed'
 * @returns ProcessorResult from the next processor in the pipeline
 */
async function executePipelineChain(input: ProcessorInput): Promise<ProcessorResult> {
  const { data_type, workspace } = input;
  // Look up what comes next in the pipeline
  const typeTransfer =  PIPELINE_NEXT[data_type];

  if (!typeTransfer) {
    // No next step defined — this data_type is terminal or handled internally
    return {
      success: true,
      data_type,
      action_type: 'proceed',
      status: 'completed',
      session_id: '',
      processing_time_ms: 0,
      data: { message: `Pipeline complete for ${data_type}. No automatic next step.` },
      timestamp: new Date().toISOString(),
    };
  }

  // Extract rfq_id from input (needed by data-loader to query DB)
  const rfqId = input.rfq_id || 0;

  if (!rfqId || !workspace) {
    throw new Error(`Pipeline chain requires rfq_id and workspace. Got rfq_id=${rfqId}`);
  }

  // Use data-loader to build a complete ProcessorInput for the next step
  // Passes action_type directly so the 2-level PAYLOAD_LOADERS map can route correctly
  const nextInput = await loadProcessorInput({
    data_type: typeTransfer.nextDataType,
    action_type: typeTransfer.nextActionType,
    rfq_id: rfqId,
    quotation_id: input.quotation_id,  // Forward quotation_id if present
    email_id: input.email?.email_id,   // Forward email_id if present
    workspace,
  });

  // Look up the processor for the next data_type + action_type (2-level)
  const nextTypeProcessors = DATA_PROCESSORS[typeTransfer.nextDataType];
  if (!nextTypeProcessors) {
    throw new Error(`No processor group for pipeline next step: ${typeTransfer.nextDataType}`);
  }
  const nextProcessor = nextTypeProcessors[typeTransfer.nextActionType];
  if (!nextProcessor) {
    throw new Error(
      `No processor for pipeline step: ${typeTransfer.nextDataType}:${typeTransfer.nextActionType}`
    );
  }

  // Normalize if chaining into quotation
  const finalInput = typeTransfer.nextDataType === 'quotation'
    ? normalizeQuotationData(nextInput)
    : nextInput;

  // Execute the next processor directly (no re-validation, no recursive handleHTTPRequest)
  return nextProcessor(finalInput);
}

// =============================================
// CENTRALIZED SSE EMISSION
// =============================================
// All action processors return results without emitting SSE.
// data-processor handles all SSE emission centrally after receiving the result.

// Maps the processor's data_type to the previewType tag stored on rfq_analysis.last_preview_type.
// Drives which content table fetch-workspace pulls from on next workspace hydration.
const DATA_TYPE_TO_PREVIEW: Record<string, PreviewType> = {
  rfq_analysis:    'analysis',
  supplier_search: 'suppliers_search',
  email:           'email',
  quotation:       'quotation',
};

/**
 * Emit SSE events based on processor result.
 * Handles: preview-update for all results, comms-update for all-items-available.
 * Persists last_preview_type onto rfq_analysis BEFORE the SSE emit so a parallel
 * workspace hydration sees the freshest preview tag.
 */
function emitProcessorResult(result: ProcessorResult, _dataType: DataType, input: ProcessorInput): void {
  // ── Persist last_preview_type before emit ──
  // Only update when we have rfq_id + workspace + a known preview-type mapping.
  const resultDataPre = result.data as Record<string, unknown> | undefined;
  const rfqIdForPreview = resultDataPre?.rfq_id;
  const previewTag = DATA_TYPE_TO_PREVIEW[_dataType];
  if (
    previewTag &&
    typeof rfqIdForPreview === 'number' &&
    rfqIdForPreview > 0 &&
    input.workspace
  ) {
    // Filter is intentionally {rfqId} only. buildWhereClause inside updateData layers
    // company_id (and user_id when ENABLE_CLIENT_ISOLATION=true) on top. Previously we
    // passed { userId: wsFilter.user_id } here, but wsFilter.user_id is undefined in
    // Phase 1 (shared) mode — multipleCol then produced `user_id = NULL`, which matches
    // zero rows and silently no-ops the UPDATE. Trimming the filter mirrors every
    // working getData('rfqAnalysis', { rfqId }, workspace) call elsewhere.
    void updateData(
      'rfqAnalysis',
      { rfqId: rfqIdForPreview },
      { lastPreviewType: previewTag },
      input.workspace,
    ).catch((err) => {
      console.warn('[data-processor] last_preview_type persistence failed:', err);
    });
  }

  // Always emit preview-update for UI real-time rendering
  eventBus.emit('preview-update', result);

  // Emit all-items-available when respond_service indicates readiness for quotation
  const resultData = result.data as Record<string, unknown> | undefined;
  if (resultData?.all_items_available === true) {
    eventBus.emit('comms-update', {
      type: 'all-items-available',
      rfq_id: resultData.rfq_id,
      message: 'All supplier items are now available. Ready for quotation pricing.',
      timestamp: new Date().toISOString(),
    });
  }

  // Sidebar queue push — fire-and-forget so a queue-emit failure cannot break the main pipeline.
  // Workspace is the cookie-validated context from the HTTP boundary (line ~181 above); reusing
  // it here avoids a second cookies() call, which would throw when the processor runs outside a
  // request scope (tests, cron, IMAP watcher). `.catch()` prevents unhandled promise rejections.
  try {
    const rfqIdRaw = resultData?.rfq_id;
    if (typeof rfqIdRaw === 'number' && rfqIdRaw > 0 && input.workspace) {
      const stageRaw = resultData?.current_stage;
      const currentStage =
        typeof stageRaw === 'string' && stageRaw.length > 0 ? (stageRaw as RFQStage) : undefined;
      void emitQueuedRFQs(rfqIdRaw, input.workspace, currentStage).catch((err) => {
        console.warn('[data-processor] emitQueuedRFQs failed:', err);
      });
    }
  } catch (err) {
    // Synchronous guard — never let a queue-emit issue surface to the caller
    console.warn('[data-processor] emitQueuedRFQs dispatch failed:', err);
  }
}

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Generate a stable session ID based on data type and input identifiers
 */
function generateSessionId(input: ProcessorInput, dataType: string, actionType: string): string {
  const itemId = input.quotation_data?.quotation_id || input.quotation_id;
  if (itemId) {
    return `${dataType}_${itemId}`;
  }
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 11);
  return `${dataType}_${actionType}_${timestamp}_${randomId}`;
}

/**
 * Update processing statistics based on action type
 */
function updateStats(actionType: string): void {
  if (['generate', 'analyze', 'search', 'proceed', 'handleRFQ'].includes(actionType)) {
    stats.totalGenerations++;
  }
  if (['update', 'manual_update', 'send', 're_generate', 'reanalyze', 'research', 'supplier_respond', 'customer_respond', 'handleSupplierRespond', 'handleCustomerRespond'].includes(actionType)) {
    stats.totalUpdates++;
  }
  stats.totalProcessed++;
}

/**
 * Get processing statistics snapshot
 */
export async function getStats(): Promise<ProcessingStats> {
  return { ...stats };
}
