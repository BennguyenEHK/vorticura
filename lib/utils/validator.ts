// =============================================
// VALIDATOR MODULE - Multi-Data-Type Input Validation
// =============================================
// Unified input validation for all data types
// - Validates data_type + action_type combinations
// - Routes to specific validators via EXTRACTION_VALIDATE mapping
// - Supports: quotation, email, rfq_analysis, supplier_search
// Reference: make_sales_sse_server/api/quotation/validator.js

// =============================================
// Types
// =============================================

/** Supported data types for processing */
export type DataType = 'quotation' | 'email' | 'rfq_analysis' | 'supplier_search';

/** Action types per data_type */
export type QuotationActionType = 'generate' | 'update' | 'manual_update';
export type EmailActionType = 'send' | 'generate' | 're_generate';
export type RfqAnalysisActionType = 'analyze' | 'reanalyze';
export type SupplierSearchActionType = 'search' | 'research';
export type ActionType = QuotationActionType | EmailActionType | RfqAnalysisActionType | SupplierSearchActionType;

/** Standardized processor output - returned by all action files */
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

/** Generic processor input shape (JSON from HTTP request) */
export interface ProcessorInput {
  data_type: DataType;
  action_type: ActionType;
  session_id?: string;
  quotation_id?: number;
  rfq_reference?: string;
  comments?: string;                    // Optional user comments for manual_update
  quotation_data?: QuotationData;       // For quotation data_type
  pricing_variables?: PricingVariable[];// For quotation calculate
  modify_content?: ModifyContent;       // For quotation manual_update
  email?: EmailData;                    // For email data_type
  analysis?: AnalysisData;              // For rfq_analysis data_type
  search?: SearchData;                  // For supplier_search data_type
  [key: string]: unknown;               // Allow additional fields
}

/** Quotation data structure */
interface QuotationData {
  quotation_id?: number;
  rfq_reference: string;
  customer_info: CustomerInfo;
  quotation_items: QuotationItem[];
  commercial_terms: string;
  [key: string]: unknown;
}

/** Customer info within quotation */
interface CustomerInfo {
  company_name: string;
  attention_person: string;
  carbon_copy_person: string[];
  email: string;
  phone: string;
  customer_address: string;
  [key: string]: unknown;
}

/** Single quotation item */
interface QuotationItem {
  item_id?: number;
  currency_code: string;
  company_requirement: {
    company_description: string;
    qty: number;
    uom?: string;
    [key: string]: unknown;
  };
  bidder_proposal: {
    bidder_description: string;
    bidder_unit_price: number;
    delivery_time: string;
    compliance_deviation: string;
    currency_code?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Pricing variable for calculate action */
interface PricingVariable {
  item_id: string | number;
  shipping_cost: number;
  exchange_rate: number;
  tax_rate: number;
  profit_rate: number;
  discount_rate?: number;
}

/** Modify content for manual_update */
interface ModifyContent {
  quotation_id?: number;
  seller_info?: Record<string, unknown>;
  customer_info?: Record<string, unknown>;
  quotation_data?: Record<string, unknown>;
  quotation_items?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** Email data structure */
interface EmailData {
  email_id?: number;
  recipient_email: string;
  subject: string;
  email_content: string;
  [key: string]: unknown;
}

/** RFQ analysis data structure */
interface AnalysisData {
  analysis_id?: number;
  subject: string;
  analysis_content: string;
  [key: string]: unknown;
}

/** Supplier search data structure */
interface SearchData {
  search_id?: number;
  subject: string;
  search_content: string;
  [key: string]: unknown;
}

// =============================================
// Validator function type
// =============================================

type ValidatorFn = (input: ProcessorInput) => ProcessorInput;

// =============================================
// EXTRACTION VALIDATION MAPPING TABLE
// =============================================
// Maps data_type + action_type → specific validator function
// Each data_type has its own set of allowed action_types

const EXTRACTION_VALIDATE: Record<string, Record<string, ValidatorFn>> = {
  'quotation': {
    generate: validateQuotationGenerateUpdate,     // Full quotation generation
    update: validateQuotationGenerateUpdate,        // Full quotation update
    manual_update: validateQuotationManualUpdate,   // User edits from preview panel
  },
  'email': {
    send: validateEmail,          // Send approved email
    generate: validateEmail,      // Generate new email draft
    re_generate: validateEmail,   // Regenerate rejected email
  },
  'rfq_analysis': {
    analyze: validateRfqAnalysis,    // Analyze new RFQ
    reanalyze: validateRfqAnalysis,  // Re-analyze with user feedback
  },
  'supplier_search': {
    search: validateSuppliersSearch,    // Search for new suppliers
    research: validateSuppliersSearch,  // Re-search with updated criteria
  },
};

// =============================================
// MAIN VALIDATION ENTRY POINT
// =============================================

/**
 * Validate and route input data based on data_type and action_type
 * Flow: check data_type → check action_type → route to specific validator
 * @param input - Raw JSON input from HTTP request
 * @returns Validated and normalized input
 * @throws Error if validation fails
 */
export function validateInput(input: ProcessorInput): ProcessorInput {
  // Step 1: Input must exist
  if (!input) {
    throw new Error('Input data is required');
  }

  // Step 2: data_type is required
  if (!input.data_type) {
    throw new Error('data_type is required');
  }

  // Step 3: data_type must be one of the supported types
  const validDataTypes: DataType[] = ['quotation', 'email', 'rfq_analysis', 'supplier_search'];
  if (!validDataTypes.includes(input.data_type)) {
    throw new Error(`Invalid data_type: must be one of ${validDataTypes.join(' | ')}`);
  }

  // Step 4: action_type is required
  if (!input.action_type) {
    throw new Error('action_type is required');
  }

  // Step 5: action_type must be valid for this data_type
  const dataTypeValidators = EXTRACTION_VALIDATE[input.data_type];
  if (!dataTypeValidators) {
    throw new Error(`No validators configured for data_type: ${input.data_type}`);
  }

  const validator = dataTypeValidators[input.action_type];
  if (!validator) {
    const allowedActions = Object.keys(dataTypeValidators).join(' | ');
    throw new Error(
      `action_type '${input.action_type}' not supported for data_type '${input.data_type}'. Allowed: ${allowedActions}`
    );
  }

  // Step 6: Execute type-specific validator
  return validator(input);
}

// =============================================
// NORMALIZE QUOTATION DATA
// =============================================

/**
 * Normalize quotation data for consistent structure
 * - Converts item_id to integer (prevents Map lookup failures)
 * - Preserves currency_code at both item and bidder_proposal level
 * @param input - Raw input data
 * @returns Deep-cloned normalized input
 */
export function normalizeQuotationData(input: ProcessorInput): ProcessorInput {
  // Deep clone to avoid mutations
  const normalized = JSON.parse(JSON.stringify(input)) as ProcessorInput;

  // Only normalize if quotation_data with items exists
  if (normalized.quotation_data?.quotation_items) {
    normalized.quotation_data.quotation_items = normalized.quotation_data.quotation_items.map(
      (item) => {
        // Normalize item_id to integer
        if (item.item_id !== undefined && item.item_id !== null) {
          item.item_id = parseInt(String(item.item_id), 10);
        }

        // Ensure currency_code exists in both item and bidder_proposal
        if (item.currency_code !== undefined) {
          if (!item.bidder_proposal) {
            item.bidder_proposal = {} as QuotationItem['bidder_proposal'];
          }
          item.bidder_proposal.currency_code = item.currency_code;
        }

        return item;
      }
    );
  }

  return normalized;
}

// #############################################################################
// QUOTATION VALIDATORS
// #############################################################################

/**
 * Validate quotation generate/update action
 * Checks: quotation_data, customer_info, quotation_items (1-100 items)
 * @param input - Raw input
 * @returns Validated input
 */
function validateQuotationGenerateUpdate(input: ProcessorInput): ProcessorInput {
  const actionType = input.action_type;

  // quotation_data is required
  if (!input.quotation_data) {
    throw new Error('quotation_data is required');
  }

  // quotation_id required for update, optional for generate
  if (actionType === 'update') {
    if (!input.quotation_data.quotation_id) {
      throw new Error('quotation_data.quotation_id is required for update action');
    }
    const qId = parseInt(String(input.quotation_data.quotation_id));
    if (isNaN(qId) || qId <= 0) {
      throw new Error('quotation_data.quotation_id must be a positive integer');
    }
  }

  // rfq_reference is required
  if (!input.quotation_data.rfq_reference) {
    throw new Error('quotation_data.rfq_reference is required');
  }

  // customer_info is required with specific fields
  const ci = input.quotation_data.customer_info;
  if (!ci) throw new Error('customer_info is required');
  if (!ci.company_name) throw new Error('customer_info.company_name is required');
  if (!ci.attention_person) throw new Error('customer_info.attention_person is required');
  if (!Array.isArray(ci.carbon_copy_person)) throw new Error('customer_info.carbon_copy_person must be an array');
  if (!ci.email) throw new Error('customer_info.email is required');
  if (!ci.phone) throw new Error('customer_info.phone is required');
  if (!ci.customer_address) throw new Error('customer_info.customer_address is required');

  // commercial_terms is required
  if (!input.quotation_data.commercial_terms || typeof input.quotation_data.commercial_terms !== 'string') {
    throw new Error('commercial_terms is required and must be a string');
  }

  // quotation_items must be a non-empty array (max 100)
  const items = input.quotation_data.quotation_items;
  if (!Array.isArray(items)) throw new Error('quotation_data.quotation_items must be an array');
  if (items.length < 1) throw new Error('At least 1 quotation item is required');
  if (items.length > 100) throw new Error('Maximum 100 quotation items allowed');

  // Validate each item
  items.forEach((item, index) => validateQuotationItem(item, index));

  return input;
}

/**
 * Validate a single quotation item structure
 * Checks: currency_code, company_requirement (qty > 0), bidder_proposal (price > 0)
 * @param item - Quotation item
 * @param index - Item index for error messages
 */
function validateQuotationItem(item: QuotationItem, index: number): void {
  const ref = `Item ${index + 1}`;

  // item_id is optional but must be positive if provided
  if (item.item_id !== undefined && item.item_id !== null) {
    const id = parseInt(String(item.item_id), 10);
    if (isNaN(id) || id < 1) throw new Error(`${ref}: item_id must be a positive integer`);
  }

  // currency_code is required
  if (!item.currency_code) throw new Error(`${ref}: currency_code is required`);

  // company_requirement is required with qty > 0
  if (!item.company_requirement) throw new Error(`${ref}: company_requirement is required`);
  if (!item.company_requirement.company_description) throw new Error(`${ref}: company_requirement.company_description is required`);
  if (!item.company_requirement.qty || item.company_requirement.qty <= 0) {
    throw new Error(`${ref}: company_requirement.qty must be greater than 0`);
  }

  // bidder_proposal is required with price > 0
  if (!item.bidder_proposal) throw new Error(`${ref}: bidder_proposal is required`);
  if (!item.bidder_proposal.bidder_description) throw new Error(`${ref}: bidder_proposal.bidder_description is required`);
  if (!item.bidder_proposal.bidder_unit_price || item.bidder_proposal.bidder_unit_price <= 0) {
    throw new Error(`${ref}: bidder_proposal.bidder_unit_price must be greater than 0`);
  }
  if (!item.bidder_proposal.delivery_time) throw new Error(`${ref}: bidder_proposal.delivery_time is required`);
  if (!item.bidder_proposal.compliance_deviation) throw new Error(`${ref}: bidder_proposal.compliance_deviation is required`);
}

/**
 * Validate quotation manual_update action
 * For user edits from the Preview Panel (optional comments for AI regeneration)
 * Checks: quotation_id required, modify_content optional but validated if present
 * @param input - Raw input
 * @returns Validated input
 */
function validateQuotationManualUpdate(input: ProcessorInput): ProcessorInput {
  // quotation_id is required
  if (!input.quotation_id) throw new Error('quotation_id is required for manual_update action');
  const qId = parseInt(String(input.quotation_id));
  if (isNaN(qId) || qId <= 0) throw new Error('quotation_id must be a positive integer');

  // comments is optional (text or empty string) - for AI regeneration
  if (input.comments !== undefined && typeof input.comments !== 'string') {
    throw new Error('comments must be a string when provided');
  }

  // modify_content is optional but validated if present
  if (input.modify_content) {
    const mc = input.modify_content;
    if (typeof mc !== 'object' || mc === null) throw new Error('modify_content must be an object');

    // Validate quotation_id in modify_content matches input
    if (mc.quotation_id && mc.quotation_id !== qId) {
      throw new Error('modify_content.quotation_id must match input.quotation_id');
    }

    // Validate seller_info if provided
    if (mc.seller_info && typeof mc.seller_info !== 'object') {
      throw new Error('modify_content.seller_info must be an object');
    }

    // Validate customer_info if provided
    if (mc.customer_info) {
      if (typeof mc.customer_info !== 'object') throw new Error('modify_content.customer_info must be an object');
      const ccPerson = (mc.customer_info as Record<string, unknown>).carbon_copy_person;
      if (ccPerson && !Array.isArray(ccPerson)) {
        throw new Error('modify_content.customer_info.carbon_copy_person must be an array');
      }
    }

    // Validate quotation_items array if provided
    if (mc.quotation_items) {
      if (!Array.isArray(mc.quotation_items)) throw new Error('modify_content.quotation_items must be an array');

      mc.quotation_items.forEach((item, index) => {
        if (typeof item !== 'object' || item === null) {
          throw new Error(`modify_content.quotation_items[${index}] must be an object`);
        }
        // item_id is required for matching
        if (!item.item_id) throw new Error(`modify_content.quotation_items[${index}].item_id is required`);
        const itemId = parseInt(String(item.item_id), 10);
        if (isNaN(itemId) || itemId < 1) {
          throw new Error(`modify_content.quotation_items[${index}].item_id must be a positive integer`);
        }
        // Validate numeric fields if provided
        if (item.sales_unit_price !== undefined && isNaN(parseFloat(String(item.sales_unit_price)))) {
          throw new Error(`modify_content.quotation_items[${index}].sales_unit_price must be a number`);
        }
        if (item.ext_price !== undefined && isNaN(parseFloat(String(item.ext_price)))) {
          throw new Error(`modify_content.quotation_items[${index}].ext_price must be a number`);
        }
      });
    }
  }

  return input;
}

// #############################################################################
// EMAIL VALIDATORS
// #############################################################################

/**
 * Validate email data_type (send, generate, re_generate)
 * Checks: quotation_id, rfq_reference, email object with recipient/subject/content
 * @param input - Raw input
 * @returns Validated input
 */
function validateEmail(input: ProcessorInput): ProcessorInput {
  // quotation_id is required
  if (!input.quotation_id) throw new Error('quotation_id is required for email data_type');
  const qId = parseInt(String(input.quotation_id));
  if (isNaN(qId) || qId <= 0) throw new Error('quotation_id must be a positive integer');

  // rfq_reference is required
  if (!input.rfq_reference) throw new Error('rfq_reference is required for email data_type');

  // email object is required
  if (!input.email || typeof input.email !== 'object') {
    throw new Error('email object is required for email data_type');
  }

  // email.recipient_email is required with basic format check
  if (!input.email.recipient_email) throw new Error('email.recipient_email is required');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(input.email.recipient_email)) {
    throw new Error('email.recipient_email must be a valid email address');
  }

  // email.subject is required and non-empty
  if (!input.email.subject || input.email.subject.trim().length === 0) {
    throw new Error('email.subject is required and cannot be empty');
  }

  // email.email_content is required and non-empty
  if (!input.email.email_content || input.email.email_content.trim().length === 0) {
    throw new Error('email.email_content is required and cannot be empty');
  }

  return input;
}

// #############################################################################
// RFQ ANALYSIS VALIDATORS
// #############################################################################

/**
 * Validate rfq_analysis data_type (analyze, reanalyze)
 * Checks: quotation_id, rfq_reference, analysis object with subject/content
 * @param input - Raw input
 * @returns Validated input
 */
function validateRfqAnalysis(input: ProcessorInput): ProcessorInput {
  // quotation_id is required
  if (!input.quotation_id) throw new Error('quotation_id is required for rfq_analysis data_type');
  const qId = parseInt(String(input.quotation_id));
  if (isNaN(qId) || qId <= 0) throw new Error('quotation_id must be a positive integer');

  // rfq_reference is required
  if (!input.rfq_reference) throw new Error('rfq_reference is required for rfq_analysis data_type');

  // analysis object is required
  if (!input.analysis || typeof input.analysis !== 'object') {
    throw new Error('analysis object is required for rfq_analysis data_type');
  }

  // analysis.subject is required
  if (!input.analysis.subject || input.analysis.subject.trim().length === 0) {
    throw new Error('analysis.subject is required and cannot be empty');
  }

  // analysis.analysis_content is required
  if (!input.analysis.analysis_content || input.analysis.analysis_content.trim().length === 0) {
    throw new Error('analysis.analysis_content is required and cannot be empty');
  }

  return input;
}

// #############################################################################
// SUPPLIER SEARCH VALIDATORS
// #############################################################################

/**
 * Validate supplier_search data_type (search, research)
 * Checks: quotation_id, rfq_reference, search object with subject/content
 * @param input - Raw input
 * @returns Validated input
 */
function validateSuppliersSearch(input: ProcessorInput): ProcessorInput {
  // quotation_id is required
  if (!input.quotation_id) throw new Error('quotation_id is required for supplier_search data_type');
  const qId = parseInt(String(input.quotation_id));
  if (isNaN(qId) || qId <= 0) throw new Error('quotation_id must be a positive integer');

  // rfq_reference is required
  if (!input.rfq_reference) throw new Error('rfq_reference is required for supplier_search data_type');

  // search object is required
  if (!input.search || typeof input.search !== 'object') {
    throw new Error('search object is required for supplier_search data_type');
  }

  // search.subject is required
  if (!input.search.subject || input.search.subject.trim().length === 0) {
    throw new Error('search.subject is required and cannot be empty');
  }

  // search.search_content is required
  if (!input.search.search_content || input.search.search_content.trim().length === 0) {
    throw new Error('search.search_content is required and cannot be empty');
  }

  return input;
}

// =============================================
// MODULE EXPORTS
// =============================================

export {
  EXTRACTION_VALIDATE,
  normalizeQuotationData as normalizeData,
  validateQuotationGenerateUpdate,
  validateQuotationManualUpdate,
  validateQuotationItem,
  validateEmail,
  validateRfqAnalysis,
  validateSuppliersSearch,
};
