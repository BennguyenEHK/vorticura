// =============================================
// DATA PROCESSING API - Unified Handler for All Data Types
// =============================================
// God class that orchestrates all data processing operations
// Input: JSON structured data → Output: JSON structured result
// Supports: quotation, email, rfq_analysis, supplier_search
//
// Architecture:
//   HTTP Request → Validator → Coordinator (routing) → Action Processor → Response
//
// Reference: make_sales_sse_server/api/data-processing.js

// ========== MODULAR COMPONENTS ==========
// Validator module for input validation and routing
import {
  validateInput,
  normalizeQuotationData,
  type ProcessorInput,
  type DataType,
  type ActionType,
} from './quotation/validator';

// ========== PROCESSOR MODULES ==========
// Import all specialized processors (action files)
import { processQuotation } from './actions/quotation-actions';         // Quotation generation/update
import { generateEmailDrafts } from './actions/email-actions';          // Email draft generation
import { searchSuppliers } from './actions/supplier-search-actions';    // Supplier discovery
import { analyzeRFQ } from './actions/analysis-actions';                // RFQ analysis

// =============================================
// Types
// =============================================

/** Processor function signature - takes validated input, returns result */
type ProcessorFn = (input: ProcessorInput) => Promise<ProcessorResult>;

/** Standardized processor output */
export interface ProcessorResult {
  success: boolean;
  data_type: DataType;
  action_type: ActionType;
  status: 'completed' | 'error';
  session_id: string;
  processing_time_ms: number;
  data?: unknown;           // Processor-specific result data
  error?: string;           // Error message if failed
  timestamp: string;
}

/** Processing statistics for monitoring */
interface ProcessingStats {
  totalGenerations: number;
  totalUpdates: number;
  totalProcessed: number;
  errors: number;
}

// =============================================
// DATA PROCESSING API CLASS
// =============================================

/**
 * DataProcessingAPI - Unified processing system for all data types
 *
 * Responsibilities:
 * 1. Validate incoming JSON input (via Validator)
 * 2. Route to correct processor based on data_type (via Coordinator)
 * 3. Execute processor and return standardized JSON output
 * 4. Track processing statistics
 *
 * Usage:
 *   const api = new DataProcessingAPI();
 *   const result = await api.handleHTTPRequest(jsonInput);
 */
export class DataProcessingAPI {
  // Active sessions storage: Map<sessionId, sessionData>
  private activeSessions: Map<string, unknown>;

  // Processing statistics
  private stats: ProcessingStats;

  // ========== DATA PROCESSORS MAPPING TABLE ==========
  // Routes data_type → processor function
  // Coordinator pattern: filter JSON by data_type to its correct action file
  private DATA_PROCESSORS: Record<string, ProcessorFn>;

  constructor() {
    // Initialize active sessions storage
    this.activeSessions = new Map();

    // Initialize statistics
    this.stats = {
      totalGenerations: 0,
      totalUpdates: 0,
      totalProcessed: 0,
      errors: 0,
    };

    // ========== COORDINATOR MAPPING TABLE ==========
    // Each data_type maps to its dedicated processor function
    // The processor receives the full validated input and handles action_type routing internally
    this.DATA_PROCESSORS = {
      'quotation': this.processQuotationAction.bind(this),
      'email': this.processEmailAction.bind(this),
      'rfq_analysis': this.processRFQAnalysisAction.bind(this),
      'supplier_search': this.processSupplierSearchAction.bind(this),
    };
  }

  // =========================================================================
  // HTTP ENDPOINT HANDLER (Unified entry point)
  // =========================================================================

  /**
   * Main entry point for all data processing operations
   * Takes raw JSON input, validates, routes, and returns JSON output
   *
   * Flow:
   *   1. Validate input structure via Validator
   *   2. Extract data_type and action_type
   *   3. Route to correct processor via DATA_PROCESSORS mapping
   *   4. Execute processor
   *   5. Return standardized JSON result
   *
   * @param input - Raw JSON input from HTTP request body
   * @returns ProcessorResult with success/error status and data
   */
  async handleHTTPRequest(input: ProcessorInput): Promise<ProcessorResult> {
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

      // Step 4: Look up processor from mapping table (Coordinator)
      const processor = this.DATA_PROCESSORS[dataType];
      if (!processor) {
        throw new Error(`No processor configured for data_type: ${dataType}`);
      }

      // Step 5: Generate session ID for tracking
      sessionId = this.generateSessionId(normalizedInput, dataType, actionType);

      // Step 6: Execute the processor
      const result = await processor(normalizedInput);

      // Step 7: Update statistics based on action_type
      this.updateStats(actionType);

      // Step 8: Return standardized success response
      return {
        success: true,
        data_type: dataType,
        action_type: actionType,
        status: 'completed',
        session_id: sessionId,
        processing_time_ms: Date.now() - startTime,
        data: result.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Track error in statistics
      this.stats.errors++;

      // Return standardized error response (use extracted values or defaults)
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

  // =========================================================================
  // PROCESSOR DELEGATION METHODS
  // =========================================================================
  // Each method adapts the generic ProcessorInput to the specific action function signature

  /**
   * Process quotation action - delegates to processQuotation from quotation-actions.ts
   * Handles: generate, update, manual_update
   * @param input - Validated quotation input
   * @returns ProcessorResult with quotation data
   */
  private async processQuotationAction(input: ProcessorInput): Promise<ProcessorResult> {
    // Map generic input to QuotationInput shape expected by processQuotation
    const quotationInput = {
      rfqId: input.rfq_reference || input.quotation_data?.rfq_reference || '',
      actionType: input.action_type === 'manual_update' ? 'update' : input.action_type,
      supplierResponses: input.quotation_data?.quotation_items || [],
      updates: input.modify_content?.quotation_items || [],
      comments: input.comments,    // Optional user comments for AI regeneration
    };

    // Call the quotation processor action
    const result = await processQuotation(quotationInput as Parameters<typeof processQuotation>[0]);

    return {
      success: result.success,
      data_type: 'quotation',
      action_type: input.action_type,
      status: result.success ? 'completed' : 'error',
      session_id: '',
      processing_time_ms: 0,
      data: result.data,
      error: result.error,
      timestamp: result.timestamp,
    };
  }

  /**
   * Process email action - delegates to generateEmailDrafts from email-actions.ts
   * Handles: send, generate, re_generate
   * @param input - Validated email input
   * @returns ProcessorResult with email data
   */
  private async processEmailAction(input: ProcessorInput): Promise<ProcessorResult> {
    // Map generic input to EmailInput shape expected by generateEmailDrafts
    const emailInput = {
      rfqId: input.rfq_reference || '',
      templateType: 'supplier_inquiry' as const,  // Default template type
      recipients: input.email?.recipient_email ? [input.email.recipient_email] : [],
      context: {
        subject: input.email?.subject || '',
        content: input.email?.email_content || '',
        quotation_id: input.quotation_id,
        action_type: input.action_type,            // Pass through for processor to handle
      },
    };

    // Call the email processor action
    const result = await generateEmailDrafts(emailInput as Parameters<typeof generateEmailDrafts>[0]);

    return {
      success: result.success,
      data_type: 'email',
      action_type: input.action_type,
      status: result.success ? 'completed' : 'error',
      session_id: '',
      processing_time_ms: 0,
      data: result.data,
      error: result.error,
      timestamp: result.timestamp,
    };
  }

  /**
   * Process RFQ analysis action - delegates to analyzeRFQ from analysis-actions.ts
   * Handles: analyze, reanalyze
   * @param input - Validated RFQ analysis input
   * @returns ProcessorResult with analysis data
   */
  private async processRFQAnalysisAction(input: ProcessorInput): Promise<ProcessorResult> {
    // Map generic input to AnalysisInput shape expected by analyzeRFQ
    const analysisInput = {
      rfqId: input.rfq_reference || '',
      emailContent: input.analysis?.analysis_content || '',
      senderEmail: '',                          // Populated from analysis context
      subject: input.analysis?.subject || '',
    };

    // Call the RFQ analysis processor action
    const result = await analyzeRFQ(analysisInput as Parameters<typeof analyzeRFQ>[0]);

    return {
      success: result.success,
      data_type: 'rfq_analysis',
      action_type: input.action_type,
      status: result.success ? 'completed' : 'error',
      session_id: '',
      processing_time_ms: 0,
      data: result.data,
      error: result.error,
      timestamp: result.timestamp,
    };
  }

  /**
   * Process supplier search action - delegates to searchSuppliers from supplier-search-actions.ts
   * Handles: search, research
   * @param input - Validated supplier search input
   * @returns ProcessorResult with supplier data
   */
  private async processSupplierSearchAction(input: ProcessorInput): Promise<ProcessorResult> {
    // Map generic input to SupplierSearchInput shape expected by searchSuppliers
    const searchInput = {
      rfqId: input.rfq_reference || '',
      items: [{
        description: input.search?.search_content || '',
        quantity: undefined,
        unit: undefined,
      }],
      preferences: {},
    };

    // Call the supplier search processor action
    const result = await searchSuppliers(searchInput as Parameters<typeof searchSuppliers>[0]);

    return {
      success: result.success,
      data_type: 'supplier_search',
      action_type: input.action_type,
      status: result.success ? 'completed' : 'error',
      session_id: '',
      processing_time_ms: 0,
      data: result.data,
      error: result.error,
      timestamp: result.timestamp,
    };
  }

  // =========================================================================
  // HELPER FUNCTIONS
  // =========================================================================

  /**
   * Generate a stable session ID based on data type and input identifiers
   * Uses quotation_id for stable tracking, falls back to timestamp + random
   * @param input - Validated input data
   * @param dataType - Data type (quotation, email, etc.)
   * @param actionType - Action type (generate, update, etc.)
   * @returns Generated session ID string
   */
  private generateSessionId(input: ProcessorInput, dataType: string, actionType: string): string {
    // Use quotation_id for a stable session key if available
    const itemId = input.quotation_data?.quotation_id || input.quotation_id;
    if (itemId) {
      return `${dataType}_${itemId}`;
    }

    // Fallback: timestamp + random suffix
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 11);
    return `${dataType}_${actionType}_${timestamp}_${randomId}`;
  }

  /**
   * Update processing statistics based on action type
   * @param actionType - The action type that was processed
   */
  private updateStats(actionType: string): void {
    // Classify action for statistics
    if (['generate', 'analyze', 'search'].includes(actionType)) {
      this.stats.totalGenerations++;
    }
    if (['update', 'manual_update', 'send', 're_generate', 'reanalyze', 'research'].includes(actionType)) {
      this.stats.totalUpdates++;
    }
    this.stats.totalProcessed++;
  }

  /**
   * Get processing statistics snapshot
   * @returns Copy of current stats
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Get active sessions count
   * @returns Number of active sessions
   */
  getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }
}
