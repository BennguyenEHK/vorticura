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
//     → Action internally: business logic → modifyDatabase() → eventBus.emit()
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
    handleRFQ: processRFQ,                        // RFQ detected → maps input → processAnalysis
    handleSuppliersRespond: processSuppliersRespond, // Supplier response → stub (future processor)
    handleUnknown: processUnknownEmail,           // Fallback → maps input → processEmail for UI report
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
 *   4. Execute processor (which handles DB + SSE internally)
 *   5. Return standardized JSON result with session_id + timing
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
      return {
        ...chainResult,
        session_id: sessionId,
        processing_time_ms: Date.now() - startTime,
      };
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

    // Step 7: Execute the processor (handles DB + SSE internally)
    const result = await processor(normalizedInput);

    // Step 8: Update statistics
    updateStats(actionType);

    // Step 9: Return result with overridden session_id and timing
    return {
      ...result,
      session_id: sessionId,
      processing_time_ms: Date.now() - startTime,
    };
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
// INCOMING EMAIL — Centralized Processor Functions
// =============================================
// Transform incoming_email payloads to downstream processor formats.
// Each function maps incoming_email fields → target input shape → calls target processor.
// No separate actions file needed — routing is dictionary-driven via DATA_PROCESSORS above.

/**
 * Process RFQ email: map incoming_email → rfq_analysis input → processAnalysis
 * Builds analysis content from email body + parsed attachments for AI processing.
 */
async function processRFQ(input: ProcessorInput): Promise<ProcessorResult> {
  const ie = input.incoming_email;
  if (!ie) return incomingEmailError(input, 'incoming_email data required for handleRFQ');

  // Combine body + attachment text into analysis content for AI
  const analysisContent = buildIncomingAnalysisContent(ie);
  // Extract RFQ reference from subject (e.g., "RFQ-2026-001") or generate fallback
  const rfqReference = extractIncomingRfqReference(ie.subject) || `EMAIL-${Date.now()}`;

  // Map to rfq_analysis input and delegate to processAnalysis
  const rfqInput: ProcessorInput = {
    data_type: 'rfq_analysis',
    action_type: 'analyze',
    workspace: input.workspace,
    rfq_reference: rfqReference,
    analysis: {
      subject: ie.subject || '(no subject)',
      analysis_content: analysisContent,
    },
  };

  // Emit SSE so UI knows an RFQ was routed
  eventBus.emit('comms-update', {
    type: 'incoming-email-routed',
    routedTo: 'rfq_analysis',
    from: ie.from_email,
    subject: ie.subject,
    rfqReference,
    timestamp: new Date().toISOString(),
  });

  return processAnalysis(rfqInput);
}

/**
 * Process supplier response email: map incoming_email → supplier_respond:update → delegate.
 * Builds a supplier_respond input from the incoming email data and calls processSupplierRespond
 * which handles AI extraction, DB updates, and all_items_available check.
 */
async function processSuppliersRespond(input: ProcessorInput): Promise<ProcessorResult> {
  const ie = input.incoming_email;
  if (!ie) return incomingEmailError(input, 'incoming_email data required for handleSuppliersRespond');

  // Emit SSE so UI knows a supplier response was received
  eventBus.emit('comms-update', {
    type: 'incoming-email-routed',
    routedTo: 'supplier_respond',
    from: ie.from_email,
    subject: ie.subject,
    timestamp: new Date().toISOString(),
  });

  // Map incoming_email → supplier_respond:update input and delegate to processor
  const supplierRespondInput: ProcessorInput = {
    data_type: 'supplier_respond',
    action_type: 'update',
    workspace: input.workspace,
    incoming_email: ie, // Pass email data for AI extraction inside the processor
  };

  return processSupplierRespond(supplierRespondInput);
}

/**
 * Process unknown/unclassified email: map to email input → processEmail for UI report.
 * Generates an email report so the user can review and validate in the UI panel.
 */
async function processUnknownEmail(input: ProcessorInput): Promise<ProcessorResult> {
  const ie = input.incoming_email;
  if (!ie) return incomingEmailError(input, 'incoming_email data required for handleUnknown');

  // Map to email input shape and delegate to processEmail for UI report generation
  const emailInput: ProcessorInput = {
    data_type: 'email',
    action_type: 'generate',
    workspace: input.workspace,
    quotation_id: 0,
    rfq_reference: extractIncomingRfqReference(ie.subject) || `UNCLASSIFIED-${Date.now()}`,
    email: {
      recipient_email: ie.from_email,
      subject: `RE: ${ie.subject || '(no subject)'}`,
      email_content: ie.email_body_text || '',
    },
  };

  // Emit SSE so UI can show unclassified email in inbox
  eventBus.emit('comms-update', {
    type: 'incoming-email-unclassified',
    from: ie.from_email,
    subject: ie.subject,
    timestamp: new Date().toISOString(),
  });

  return processEmail(emailInput);
}

// =============================================
// INCOMING EMAIL — Helpers (inlined to avoid circular imports with email-pipeline)
// =============================================

/**
 * Build analysis content from incoming_email body + parsed attachment text.
 * Mirrors email-pipeline's buildAnalysisContent but works with flat IncomingEmailData shape.
 */
function buildIncomingAnalysisContent(ie: { email_body_text: string; attachments_parsed?: Array<{ filename: string; content_type: string; extracted_text: string }> }): string {
  const parts: string[] = [];

  // Add email body
  if (ie.email_body_text) {
    parts.push('--- EMAIL BODY ---');
    parts.push(ie.email_body_text);
  }

  // Add extracted attachment text (skip failed extractions)
  for (const att of ie.attachments_parsed || []) {
    if (att.extracted_text && att.extracted_text !== '[extraction_failed]') {
      parts.push(`--- ATTACHMENT: ${att.filename} ---`);
      parts.push(att.extracted_text);
    }
  }

  return parts.join('\n\n');
}

/**
 * Extract RFQ reference from subject line (e.g., "RFQ-2026-001", "Q#456")
 * Returns null if no reference pattern found.
 */
function extractIncomingRfqReference(subject: string): string | null {
  const match = subject.match(/(?:RFQ|Q|REF|PO|PR)[- #]?\d{1,}[-\d]*/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Build standardized error result for incoming_email processors
 */
function incomingEmailError(input: ProcessorInput, message: string): ProcessorResult {
  return {
    success: false,
    data_type: input.data_type,
    action_type: input.action_type,
    status: 'error',
    session_id: '',
    processing_time_ms: 0,
    error: message,
    timestamp: new Date().toISOString(),
  };
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
