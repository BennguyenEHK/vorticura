'use server';

// =============================================
// DATA PROCESSING API - Unified Handler for All Data Types
// =============================================
// Server action entry point for all UI → server communication
// Input: JSON structured data → Output: JSON structured result
// Supports: quotation, email, rfq_analysis, supplier_search
//
// Architecture:
//   UI Component → handleHTTPRequest(ProcessorInput)
//     → Validator → Coordinator (routing) → Action Processor → Response
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

// Re-export types for consumers
export type { ProcessorInput, ProcessorResult, DataType, ActionType };

// ========== PROCESSOR MODULES ==========
import { processQuotation } from './actions/quotation-actions';
import { processEmail } from './actions/email-actions';
import { processSupplierSearch } from './actions/supplier-search-actions';
import { processAnalysis } from './actions/analysis-actions';

// =============================================
// Types
// =============================================

/** Processor function signature - takes validated input, returns result */
type ProcessorFn = (input: ProcessorInput) => Promise<ProcessorResult>;

/** Processing statistics for monitoring */
interface ProcessingStats {
  totalGenerations: number;
  totalUpdates: number;
  totalProcessed: number;
  errors: number;
}

// =============================================
// DATA PROCESSORS MAPPING TABLE
// =============================================
// Routes data_type → processor function (direct references, no delegation)

const DATA_PROCESSORS: Record<string, ProcessorFn> = {
  'quotation': processQuotation,
  'email': processEmail,
  'rfq_analysis': processAnalysis,
  'supplier_search': processSupplierSearch,
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
 *   2. Extract data_type and action_type
 *   3. Route to correct processor via DATA_PROCESSORS mapping
 *   4. Execute processor (which handles DB + SSE internally)
 *   5. Override session_id and processing_time_ms
 *   6. Return standardized JSON result
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

    // Step 3: Normalize quotation data if applicable
    const normalizedInput = dataType === 'quotation'
      ? normalizeQuotationData(validatedInput)
      : validatedInput;

    // Step 4: Look up processor from mapping table
    const processor = DATA_PROCESSORS[dataType];
    if (!processor) {
      throw new Error(`No processor configured for data_type: ${dataType}`);
    }

    // Step 5: Generate session ID for tracking
    sessionId = generateSessionId(normalizedInput, dataType, actionType);

    // Step 6: Execute the processor (handles DB + SSE internally)
    const result = await processor(normalizedInput);

    // Step 7: Update statistics
    updateStats(actionType);

    // Step 8: Override session_id and processing_time_ms from processor result
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
  if (['generate', 'analyze', 'search'].includes(actionType)) {
    stats.totalGenerations++;
  }
  if (['update', 'manual_update', 'send', 're_generate', 'reanalyze', 'research'].includes(actionType)) {
    stats.totalUpdates++;
  }
  stats.totalProcessed++;
}

/**
 * Get processing statistics snapshot
 */
export function getStats(): ProcessingStats {
  return { ...stats };
}
