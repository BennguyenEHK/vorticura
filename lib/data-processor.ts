'use server';

// =============================================
// DATA PROCESSING API - Unified Handler for All Data Types
// =============================================
// Server action entry point for all UI → server communication
// Input: JSON structured data → Output: JSON structured result
// Supports: quotation, email, rfq_analysis, supplier_search, supplier_respond, incoming_email
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
import { processSupplierRespond } from './actions/supplier-respond-actions';
import { eventBus } from './event-bus';

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
  'incoming_email': {
    handleRFQ: processAnalysis,                    // RFQ detected → processAnalysis handles incoming_email input
    handleSuppliersRespond: processSupplierRespond, // Supplier response → processSupplierRespond handles incoming_email input
    handleUnknown: processEmail,                   // Fallback → processEmail handles incoming_email input for UI report
  },
  'supplier_respond': {
    update: processSupplierRespond,       // AI parses supplier email → update item statuses + bidder_proposal
    available: processSupplierRespond,    // Manual UI override: mark items as available
    unavailable: processSupplierRespond,  // Manual UI override: mark items as unavailable
  },
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
//   supplier_respond (all available) → quotation → email (send quotation)

const PIPELINE_NEXT: Record<string, PipelineStep | null> = {
  'incoming_email':  null,  // Handled internally — routes to rfq_analysis or supplier_respond
  'rfq_analysis':    { nextDataType: 'supplier_search', nextActionType: 'search' },
  'supplier_search': { nextDataType: 'email',           nextActionType: 'generate' },
  'quotation':       { nextDataType: 'email',           nextActionType: 'generate' },
  'email':           null, // Terminal — no automatic next step after email send
  'supplier_respond': null, // Complex logic — handled inside processor (check all items status)
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
    dataType = validatedInput.data_type;
    actionType = validatedInput.action_type;

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
  const nextStep = PIPELINE_NEXT[data_type];
  if (!nextStep) {
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
  const nextInput = await loadProcessorInput({
    data_type: nextStep.nextDataType,
    rfq_id: rfqId,
    workspace,
    overrides: { action_type: nextStep.nextActionType },
  });

  // Look up the processor for the next data_type + action_type (2-level)
  const nextTypeProcessors = DATA_PROCESSORS[nextStep.nextDataType];
  if (!nextTypeProcessors) {
    throw new Error(`No processor group for pipeline next step: ${nextStep.nextDataType}`);
  }
  const nextProcessor = nextTypeProcessors[nextStep.nextActionType];
  if (!nextProcessor) {
    throw new Error(
      `No processor for pipeline step: ${nextStep.nextDataType}:${nextStep.nextActionType}`
    );
  }

  // Normalize if chaining into quotation
  const finalInput = nextStep.nextDataType === 'quotation'
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

/**
 * Emit SSE events based on processor result and input context.
 * Handles: preview-update for all results, comms-update for incoming_email routing
 * and supplier_respond all-items-available notifications.
 */
function emitProcessorResult(result: ProcessorResult, dataType: DataType, input: ProcessorInput): void {
  // Always emit preview-update for UI real-time rendering
  eventBus.emit('preview-update', result);

  // Emit comms-update for incoming_email routing notifications
  if (dataType === 'incoming_email' && input.incoming_email) {
    const ie = input.incoming_email;
    const routeType = input.action_type === 'handleUnknown'
      ? 'incoming-email-unclassified'
      : 'incoming-email-routed';
    eventBus.emit('comms-update', {
      type: routeType,
      routedTo: result.data_type, // effective data_type after routing
      from: ie.from_email,
      subject: ie.subject,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit all-items-available when supplier_respond indicates readiness for quotation
  const resultData = result.data as Record<string, unknown> | undefined;
  if (resultData?.all_items_available === true) {
    eventBus.emit('comms-update', {
      type: 'all-items-available',
      rfq_id: resultData.rfq_id,
      message: 'All supplier items are now available. Ready for quotation pricing.',
      timestamp: new Date().toISOString(),
    });
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
  if (['update', 'manual_update', 'send', 're_generate', 'reanalyze', 'research', 'available', 'unavailable', 'handleSuppliersRespond', 'handleUnknown'].includes(actionType)) {
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
