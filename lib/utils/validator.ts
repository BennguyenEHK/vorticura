// =============================================
// VALIDATOR MODULE - Multi-Data-Type Input Validation
// =============================================
// Unified input validation for all data types.
// Routes data_type + action_type → dedicated validator via EXTRACTION_VALIDATE.
// JSON schemas match data-loader.ts builders and Documents/json_sample/*.json.

// =============================================
// Types
// =============================================

/** Supported data types for processing */
export type DataType = 'quotation' | 'email' | 'rfq_analysis' | 'supplier_search' | 'respond_service' | 'incoming_email';

/** Action types per data_type */
export type QuotationActionType = 'generate' | 'update' | 'manual_update' | 'calculate';
export type EmailActionType = 'send' | 'generate' | 're_generate';
export type RfqAnalysisActionType = 'analyze' | 'reanalyze';
export type SupplierSearchActionType = 'search' | 'research';
export type RespondServiceActionType = 'supplier_respond' | 'customer_respond';
export type IncomingEmailActionType = 'handleRFQ' | 'handleRespond' | 'handleUnknown';

/** Universal action: 'proceed' = accept current result, move to next pipeline step */
export type UniversalActionType = 'proceed';

export type ActionType =
  | QuotationActionType
  | EmailActionType
  | RfqAnalysisActionType
  | SupplierSearchActionType
  | RespondServiceActionType
  | IncomingEmailActionType
  | UniversalActionType;

/** Standardized processor output - returned by all action files */
export interface ProcessorResult {
  success: boolean;
  data_type: DataType;
  action_type: ActionType;
  status: 'completed' | 'error';
  session_id: string;
  processing_time_ms: number;
  data?: unknown;
  error?: string;
  timestamp: string;
}

// =============================================
// Sub-type interfaces
// =============================================

/** Quotation data for generate/update actions (quotation_Inpt.json) */
interface QuotationData {
  quotation_id?: number;
  rfq_reference: string;
  customer_info: CustomerInfo;
  quotation_items: QuotationItem[];
  commercial_terms: string;
  [key: string]: unknown;
}

/** Customer info within quotation generate/update */
interface CustomerInfo {
  company_name: string;
  attention_person: string;
  carbon_copy_person: string[];
  email: string;
  phone: string;
  customer_address: string;
  [key: string]: unknown;
}

/** Single quotation item (generate/update shape) */
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

/** Pricing variable for quotation/calculate (quotation_calulate.json) */
interface PricingVariable {
  item_id: string | number;
  shipping_cost: number;
  exchange_rate: number;
  tax_rate: number;
  profit_rate: number;
  discount_rate?: number;
}

/** Email data for email/send action */
interface EmailData {
  email_id?: number;
  recipient_email: string;
  subject: string;
  email_content: string;
  [key: string]: unknown;
}

/** Analysis object shared by rfq_analysis and supplier_search/search */
interface AnalysisData {
  rfq_id?: number;
  subject: string;
  analysis_content: string;
  [key: string]: unknown;
}

/** Search object for supplier_search/research */
interface SearchData {
  search_id?: number;
  subject: string;
  search_content: string;
  [key: string]: unknown;
}

/** RFQ item — shared by rfq_analysis/reanalyze and respond_service/customer_respond */
export interface RfqItem {
  item_id: string | number;
  currency_code: string;
  company_requirement: {
    company_description: string;
    qty: number;
    uom: string;
  };
}

/** Supplier item source — shared by supplier_search/research and respond_service/supplier_respond */
export interface SupplierItemSource {
  item_id: number;
  supplier_id: number;
  supplier_name: string;
  source_url: string;
  status: string;
  delivery_time: string;
  bidder_description: string;
  bidder_unit_price: number;
  compliance_deviation: string;
  notes: string;
}

/** Previous email for email/re_generate (email-actions-json.json Input_2) */
export interface PreviousEmail {
  subject: string;
  email_content: string;
}

/** Manual-update quotation data (quotation_ui_manual.json) — extends base with seller_info + pricing fields */
interface ManualUpdateQuotationData {
  quotation_id: number;
  quotation_name?: string;
  rfq_reference: string;
  total_amount?: number;
  quotation_date?: string;
  page_number?: string;
  commercial_terms?: string;
  seller_info?: Record<string, unknown>;
  customer_info?: Record<string, unknown>;
  quotation_items?: ManualUpdateItem[];
  [key: string]: unknown;
}

/** Single item in manual_update shape — has sales_unit_price / ext_price instead of bidder_unit_price */
interface ManualUpdateItem {
  item_id: number;
  sales_unit_price?: number;
  ext_price?: number;
  company_requirement?: {
    company_description: string;
    qty: number;
    uom?: string;
  };
  bidder_proposal?: {
    bidder_description: string;
    delivery_time: string;
    compliance_deviation: string;
  };
  [key: string]: unknown;
}

/** Incoming email data (from email-watcher) */
export interface IncomingEmailData {
  message_id: string;
  from_email: string;
  from_name?: string;
  to: string[];
  cc?: string[];
  subject: string;
  email_body_text: string;
  attachments_parsed?: Array<{
    filename: string;
    content_type: string;
    extracted_text: string;
  }>;
  received_at?: string;
}

/** AI feedback comments (used in reject/regenerate actions) */
interface AiComments {
  general_feedback: string;
  inline_notes: Array<{
    id: string;
    selected_text: string;
    comment: string;
    position: { start: number; end: number };
    timestamp: string;
  }>;
}

// =============================================
// ProcessorInput — main input interface
// =============================================

/** Generic processor input shape (JSON from HTTP request) */
export interface ProcessorInput {
  data_type: DataType;
  action_type: ActionType;
  session_id?: string;

  // Identifiers
  quotation_id?: number;
  rfq_id?: number;
  rfq_reference?: string;

  // Quotation payloads
  quotation_data?: QuotationData | ManualUpdateQuotationData;  // generate/update or manual_update shapes
  pricing_variables?: PricingVariable[];                       // quotation/calculate

  // Email payloads
  email?: EmailData;                          // email/send
  reference_content?: string;                 // email/generate — combined source content for AI
  instructions?: string;                      // email/generate — optional AI/human instructions
  previous_email?: PreviousEmail;             // email/re_generate — previous email to revise

  // RFQ analysis payloads
  analysis?: AnalysisData;                    // rfq_analysis/reanalyze, supplier_search/search
  incoming_email?: IncomingEmailData;          // rfq_analysis/analyze, respond_service, incoming_email

  // Supplier search payloads
  search?: SearchData;                        // supplier_search/research
  items_source?: SupplierItemSource[];         // supplier_search/research, respond_service/supplier_respond

  // Shared payloads
  rfq_items?: RfqItem[];                      // rfq_analysis/reanalyze, respond_service/customer_respond
  ai_comments?: AiComments;                   // reanalyze/research/re_generate feedback
  comments?: string;                          // Optional user comments

  // Runtime
  workspace?: import('@/lib/middleware/workspace-context').WorkspaceContext;
  [key: string]: unknown;
}

// =============================================
// Validator function type
// =============================================

type ValidatorFn = (input: ProcessorInput) => ProcessorInput;

// #############################################################################
// SHARED SUB-VALIDATORS (reusable helpers)
// #############################################################################

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Basic email format check
const MAX_TEXT_LENGTH = 5_000_000; // 5MB cap on large text fields to prevent DoS

/** Sanitize user-controlled values before interpolation into error messages (XSS prevention) */
function safeLabel(val: unknown): string {
  return String(val).slice(0, 50).replace(/[<>"'&]/g, '');
}

/**
 * Validate an incoming_email object structure.
 * Reused by: rfq_analysis/analyze, respond_service/*, incoming_email/*
 */
function validateIncomingEmailObject(ie: unknown, context: string): asserts ie is IncomingEmailData {
  if (!ie || typeof ie !== 'object') {
    throw new Error(`incoming_email object is required for ${context}`);
  }
  const email = ie as Record<string, unknown>;

  // message_id — dedup key
  if (!email.message_id || (typeof email.message_id === 'string' && email.message_id.trim().length === 0)) {
    throw new Error(`incoming_email.message_id is required for ${context}`);
  }
  // from_email — sender address
  if (!email.from_email || typeof email.from_email !== 'string') {
    throw new Error(`incoming_email.from_email is required for ${context}`);
  }
  if (!EMAIL_REGEX.test(email.from_email)) {
    throw new Error(`incoming_email.from_email must be a valid email for ${context}`);
  }
  // to — recipient array
  if (!Array.isArray(email.to) || email.to.length === 0) {
    throw new Error(`incoming_email.to must be a non-empty array for ${context}`);
  }
  // subject — email subject line
  if (!email.subject || (typeof email.subject === 'string' && email.subject.trim().length === 0)) {
    throw new Error(`incoming_email.subject is required for ${context}`);
  }
  // email_body_text — plain-text body (capped to prevent DoS)
  if (!email.email_body_text || (typeof email.email_body_text === 'string' && email.email_body_text.trim().length === 0)) {
    throw new Error(`incoming_email.email_body_text is required for ${context}`);
  }
  if (typeof email.email_body_text === 'string' && email.email_body_text.length > MAX_TEXT_LENGTH) {
    throw new Error(`incoming_email.email_body_text exceeds max length (${MAX_TEXT_LENGTH}) for ${context}`);
  }
  // Optional: cc must be array if provided
  if (email.cc !== undefined && !Array.isArray(email.cc)) {
    throw new Error(`incoming_email.cc must be an array for ${context}`);
  }
  // Optional: attachments_parsed must be array if provided
  if (email.attachments_parsed !== undefined && !Array.isArray(email.attachments_parsed)) {
    throw new Error(`incoming_email.attachments_parsed must be an array for ${context}`);
  }
  // Optional: received_at must be string if provided
  if (email.received_at !== undefined && typeof email.received_at !== 'string') {
    throw new Error(`incoming_email.received_at must be an ISO 8601 string for ${context}`);
  }
}

/**
 * Validate ai_comments object structure.
 * Reused by: rfq_analysis/reanalyze, supplier_search/research, email/re_generate
 */
function validateAiCommentsObject(ac: unknown, context: string): asserts ac is AiComments {
  if (!ac || typeof ac !== 'object') {
    throw new Error(`ai_comments object is required for ${context}`);
  }
  const comments = ac as Record<string, unknown>;
  if (typeof comments.general_feedback !== 'string') {
    throw new Error(`ai_comments.general_feedback must be a string for ${context}`);
  }
  if (!Array.isArray(comments.inline_notes)) {
    throw new Error(`ai_comments.inline_notes must be an array for ${context}`);
  }
}

/**
 * Validate rfq_items array structure.
 * Reused by: rfq_analysis/reanalyze, respond_service/customer_respond
 */
function validateRfqItemsArray(items: unknown, context: string): asserts items is RfqItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`rfq_items must be a non-empty array for ${context}`);
  }
  items.forEach((item: Record<string, unknown>, i: number) => {
    const ref = `rfq_items[${i}]`;
    if (item.item_id === undefined || item.item_id === null) {
      throw new Error(`${ref}.item_id is required for ${context}`);
    }
    if (!item.currency_code) {
      throw new Error(`${ref}.currency_code is required for ${context}`);
    }
    const cr = item.company_requirement as Record<string, unknown> | undefined;
    if (!cr) throw new Error(`${ref}.company_requirement is required for ${context}`);
    if (!cr.company_description) throw new Error(`${ref}.company_requirement.company_description is required for ${context}`);
    if (!cr.qty || Number(cr.qty) <= 0) throw new Error(`${ref}.company_requirement.qty must be > 0 for ${context}`);
  });
}

/**
 * Validate items_source array structure.
 * Reused by: supplier_search/research, respond_service/supplier_respond
 */
function validateItemsSourceArray(items: unknown, context: string): asserts items is SupplierItemSource[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`items_source must be a non-empty array for ${context}`);
  }
  items.forEach((item: Record<string, unknown>, i: number) => {
    const ref = `items_source[${i}]`;
    if (item.item_id === undefined) throw new Error(`${ref}.item_id is required for ${context}`);
    if (item.supplier_id === undefined) throw new Error(`${ref}.supplier_id is required for ${context}`);
    if (!item.supplier_name) throw new Error(`${ref}.supplier_name is required for ${context}`);
  });
}

/**
 * Validate analysis object { subject, analysis_content }.
 * Reused by: rfq_analysis/reanalyze, supplier_search/search
 */
function validateAnalysisObject(analysis: unknown, context: string): asserts analysis is AnalysisData {
  if (!analysis || typeof analysis !== 'object') {
    throw new Error(`analysis object is required for ${context}`);
  }
  const a = analysis as Record<string, unknown>;
  if (!a.subject || (typeof a.subject === 'string' && a.subject.trim().length === 0)) {
    throw new Error(`analysis.subject is required for ${context}`);
  }
  if (!a.analysis_content || (typeof a.analysis_content === 'string' && a.analysis_content.trim().length === 0)) {
    throw new Error(`analysis.analysis_content is required for ${context}`);
  }
  if (typeof a.analysis_content === 'string' && a.analysis_content.length > MAX_TEXT_LENGTH) {
    throw new Error(`analysis.analysis_content exceeds max length for ${context}`);
  }
}

/**
 * Validate search object { subject, search_content }.
 * Used by: supplier_search/research
 */
function validateSearchObject(search: unknown, context: string): asserts search is SearchData {
  if (!search || typeof search !== 'object') {
    throw new Error(`search object is required for ${context}`);
  }
  const s = search as Record<string, unknown>;
  if (!s.subject || (typeof s.subject === 'string' && s.subject.trim().length === 0)) {
    throw new Error(`search.subject is required for ${context}`);
  }
  if (!s.search_content || (typeof s.search_content === 'string' && s.search_content.trim().length === 0)) {
    throw new Error(`search.search_content is required for ${context}`);
  }
  if (typeof s.search_content === 'string' && s.search_content.length > MAX_TEXT_LENGTH) {
    throw new Error(`search.search_content exceeds max length for ${context}`);
  }
}

/**
 * Validate a value is a positive integer. Returns the parsed int.
 */
function requirePositiveInt(val: unknown, name: string): number {
  const n = parseInt(String(val), 10);
  if (isNaN(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

// #############################################################################
// RFQ ANALYSIS VALIDATORS
// #############################################################################

/**
 * rfq_analysis + analyze: Validates incoming_email object.
 * JSON shape: { incoming_email: IncomingEmailData }
 * Source: email watcher or direct upload
 */
function validateRfqAnalysisAnalyze(input: ProcessorInput): ProcessorInput {
  validateIncomingEmailObject(input.incoming_email, 'rfq_analysis/analyze');
  return input;
}

/**
 * rfq_analysis + reanalyze: Validates rfq_id + ai_comments.
 * rfq_reference, analysis, rfq_items are optional (enriched by data-loader).
 * JSON shape: { rfq_id, ai_comments, rfq_reference?, analysis?, rfq_items? }
 */
function validateRfqAnalysisReanalyze(input: ProcessorInput): ProcessorInput {
  // rfq_id is required — identifies which analysis to reprocess
  if (!input.rfq_id) throw new Error('rfq_id is required for rfq_analysis/reanalyze');
  requirePositiveInt(input.rfq_id, 'rfq_id');

  // ai_comments is required — user feedback for the reanalysis
  validateAiCommentsObject(input.ai_comments, 'rfq_analysis/reanalyze');

  // Optional fields validated if present (may arrive from data-loader enrichment)
  if (input.analysis) validateAnalysisObject(input.analysis, 'rfq_analysis/reanalyze');
  if (input.rfq_items) validateRfqItemsArray(input.rfq_items, 'rfq_analysis/reanalyze');

  return input;
}

// #############################################################################
// SUPPLIER SEARCH VALIDATORS
// #############################################################################

/**
 * supplier_search + search: Validates rfq_id + analysis object.
 * JSON shape: { rfq_id, rfq_reference, analysis: { subject, analysis_content } }
 * Note: uses `analysis` (from rfq_analysis output), NOT `search`.
 */
function validateSupplierSearchSearch(input: ProcessorInput): ProcessorInput {
  // rfq_id is required — links to the analyzed RFQ
  if (!input.rfq_id) throw new Error('rfq_id is required for supplier_search/search');
  requirePositiveInt(input.rfq_id, 'rfq_id');

  // analysis is optional at validation time — data-loader enriches from rfqAnalysis table
  if (input.analysis) validateAnalysisObject(input.analysis, 'supplier_search/search');

  return input;
}

/**
 * supplier_search + research: Validates rfq_id + ai_comments.
 * search, items_source, rfq_reference are optional (enriched by data-loader).
 * JSON shape: { rfq_id, ai_comments, rfq_reference?, search?, items_source? }
 */
function validateSupplierSearchResearch(input: ProcessorInput): ProcessorInput {
  // rfq_id is required — identifies which search to redo
  if (!input.rfq_id) throw new Error('rfq_id is required for supplier_search/research');
  requirePositiveInt(input.rfq_id, 'rfq_id');

  // ai_comments is required — user feedback for re-search
  validateAiCommentsObject(input.ai_comments, 'supplier_search/research');

  // Optional fields validated if present
  if (input.search) validateSearchObject(input.search, 'supplier_search/research');
  if (input.items_source) validateItemsSourceArray(input.items_source, 'supplier_search/research');

  return input;
}

// #############################################################################
// QUOTATION VALIDATORS
// #############################################################################

/**
 * quotation + generate/update: Validates full quotation_data shape.
 * JSON shape: { quotation_data: { rfq_reference, customer_info, quotation_items[], commercial_terms } }
 */
function validateQuotationGenerateUpdate(input: ProcessorInput): ProcessorInput {
  const actionType = input.action_type;

  // quotation_data is required
  if (!input.quotation_data) throw new Error('quotation_data is required');
  const qd = input.quotation_data as QuotationData;

  // quotation_id required for update, optional for generate
  if (actionType === 'update') {
    if (!qd.quotation_id) throw new Error('quotation_data.quotation_id is required for update action');
    requirePositiveInt(qd.quotation_id, 'quotation_data.quotation_id');
  }

  // rfq_reference is required
  if (!qd.rfq_reference) throw new Error('quotation_data.rfq_reference is required');

  // customer_info is required with specific fields
  const ci = qd.customer_info;
  if (!ci) throw new Error('customer_info is required');
  if (!ci.company_name) throw new Error('customer_info.company_name is required');
  if (!ci.attention_person) throw new Error('customer_info.attention_person is required');
  if (!Array.isArray(ci.carbon_copy_person)) throw new Error('customer_info.carbon_copy_person must be an array');
  if (!ci.email) throw new Error('customer_info.email is required');
  if (!ci.phone) throw new Error('customer_info.phone is required');
  if (!ci.customer_address) throw new Error('customer_info.customer_address is required');

  // commercial_terms is required
  if (!qd.commercial_terms || typeof qd.commercial_terms !== 'string') {
    throw new Error('commercial_terms is required and must be a string');
  }

  // quotation_items must be a non-empty array (max 100)
  const items = qd.quotation_items;
  if (!Array.isArray(items)) throw new Error('quotation_data.quotation_items must be an array');
  if (items.length < 1) throw new Error('At least 1 quotation item is required');
  if (items.length > 100) throw new Error('Maximum 100 quotation items allowed');

  // Validate each item
  items.forEach((item, index) => validateQuotationItem(item, index));

  return input;
}

/**
 * Validate a single quotation item (generate/update shape).
 * Checks: currency_code, company_requirement (qty > 0), bidder_proposal (price > 0)
 */
function validateQuotationItem(item: QuotationItem, index: number): void {
  const ref = `Item ${index + 1}`;

  if (item.item_id !== undefined && item.item_id !== null) {
    const id = parseInt(String(item.item_id), 10);
    if (isNaN(id) || id < 1) throw new Error(`${ref}: item_id must be a positive integer`);
  }
  if (!item.currency_code) throw new Error(`${ref}: currency_code is required`);

  // company_requirement
  if (!item.company_requirement) throw new Error(`${ref}: company_requirement is required`);
  if (!item.company_requirement.company_description) throw new Error(`${ref}: company_requirement.company_description is required`);
  if (!item.company_requirement.qty || item.company_requirement.qty <= 0) {
    throw new Error(`${ref}: company_requirement.qty must be greater than 0`);
  }

  // bidder_proposal
  if (!item.bidder_proposal) throw new Error(`${ref}: bidder_proposal is required`);
  if (!item.bidder_proposal.bidder_description) throw new Error(`${ref}: bidder_proposal.bidder_description is required`);
  if (!item.bidder_proposal.bidder_unit_price || item.bidder_proposal.bidder_unit_price <= 0) {
    throw new Error(`${ref}: bidder_proposal.bidder_unit_price must be greater than 0`);
  }
  if (!item.bidder_proposal.delivery_time) throw new Error(`${ref}: bidder_proposal.delivery_time is required`);
  if (!item.bidder_proposal.compliance_deviation) throw new Error(`${ref}: bidder_proposal.compliance_deviation is required`);
}

/**
 * quotation + manual_update: Validates quotation_data with manual-edit shape.
 * JSON shape: { quotation_data: { quotation_id, rfq_reference, seller_info?, customer_info?, quotation_items? } }
 */
function validateQuotationManualUpdate(input: ProcessorInput): ProcessorInput {
  // quotation_data is required
  if (!input.quotation_data) throw new Error('quotation_data is required for manual_update');
  const qd = input.quotation_data as ManualUpdateQuotationData;

  // quotation_id is required inside quotation_data
  if (!qd.quotation_id) throw new Error('quotation_data.quotation_id is required for manual_update');
  requirePositiveInt(qd.quotation_id, 'quotation_data.quotation_id');

  // rfq_reference is required
  if (!qd.rfq_reference) throw new Error('quotation_data.rfq_reference is required for manual_update');

  // seller_info is optional but must be object if present
  if (qd.seller_info && typeof qd.seller_info !== 'object') {
    throw new Error('quotation_data.seller_info must be an object');
  }

  // customer_info is optional but validated if present
  if (qd.customer_info) {
    if (typeof qd.customer_info !== 'object') throw new Error('quotation_data.customer_info must be an object');
    const ccPerson = (qd.customer_info as Record<string, unknown>).carbon_copy_person;
    if (ccPerson && !Array.isArray(ccPerson)) {
      throw new Error('quotation_data.customer_info.carbon_copy_person must be an array');
    }
  }

  // quotation_items validated if present
  if (qd.quotation_items) {
    if (!Array.isArray(qd.quotation_items)) throw new Error('quotation_data.quotation_items must be an array');
    if (qd.quotation_items.length > 100) throw new Error('Maximum 100 quotation items allowed');

    qd.quotation_items.forEach((item, i) => {
      const ref = `quotation_items[${i}]`;
      if (!item.item_id) throw new Error(`${ref}.item_id is required`);
      requirePositiveInt(item.item_id, `${ref}.item_id`);
      // Validate numeric pricing fields if present
      if (item.sales_unit_price !== undefined && isNaN(Number(item.sales_unit_price))) {
        throw new Error(`${ref}.sales_unit_price must be a number`);
      }
      if (item.ext_price !== undefined && isNaN(Number(item.ext_price))) {
        throw new Error(`${ref}.ext_price must be a number`);
      }
    });
  }

  // comments is optional — for AI regeneration
  if (input.comments !== undefined && typeof input.comments !== 'string') {
    throw new Error('comments must be a string when provided');
  }

  return input;
}

/**
 * quotation + calculate: Validates quotation_id + pricing_variables array.
 * JSON shape: { quotation_id, pricing_variables: [{ item_id, shipping_cost, tax_rate, exchange_rate, profit_rate, discount_rate? }] }
 */
function validateQuotationCalculate(input: ProcessorInput): ProcessorInput {
  // quotation_id is required at top level
  if (!input.quotation_id) throw new Error('quotation_id is required for quotation/calculate');
  requirePositiveInt(input.quotation_id, 'quotation_id');

  // pricing_variables is required — array of per-item pricing params
  if (!Array.isArray(input.pricing_variables) || input.pricing_variables.length === 0) {
    throw new Error('pricing_variables must be a non-empty array for quotation/calculate');
  }
  if (input.pricing_variables.length > 100) {
    throw new Error('Maximum 100 pricing variables allowed');
  }

  input.pricing_variables.forEach((pv, i) => {
    const ref = `pricing_variables[${i}]`;
    if (pv.item_id === undefined || pv.item_id === null) throw new Error(`${ref}.item_id is required`);
    if (typeof pv.shipping_cost !== 'number') throw new Error(`${ref}.shipping_cost must be a number`);
    if (typeof pv.tax_rate !== 'number') throw new Error(`${ref}.tax_rate must be a number`);
    if (typeof pv.exchange_rate !== 'number') throw new Error(`${ref}.exchange_rate must be a number`);
    if (typeof pv.profit_rate !== 'number') throw new Error(`${ref}.profit_rate must be a number`);
    if (pv.discount_rate !== undefined && typeof pv.discount_rate !== 'number') {
      throw new Error(`${ref}.discount_rate must be a number when provided`);
    }
  });

  return input;
}

// #############################################################################
// EMAIL VALIDATORS
// #############################################################################

/**
 * email + generate: Validates reference_content string.
 * JSON shape: { reference_content: string, instructions?: string }
 */
function validateEmailGenerate(input: ProcessorInput): ProcessorInput {
  // reference_content is required — source material for AI to draft email from
  if (input.reference_content === undefined || input.reference_content === null) {
    throw new Error('reference_content is required for email/generate');
  }
  if (typeof input.reference_content !== 'string' || input.reference_content.trim().length === 0) {
    throw new Error('reference_content must be a non-empty string for email/generate');
  }
  if (input.reference_content.length > MAX_TEXT_LENGTH) {
    throw new Error(`reference_content exceeds max length (${MAX_TEXT_LENGTH})`);
  }

  // instructions is optional but must be string if provided
  if (input.instructions !== undefined && typeof input.instructions !== 'string') {
    throw new Error('instructions must be a string when provided');
  }

  return input;
}

/**
 * email + re_generate: Validates previous_email object + optional ai_comments.
 * JSON shape: { previous_email: { subject, email_content }, ai_comments?: AiComments }
 */
function validateEmailRegenerate(input: ProcessorInput): ProcessorInput {
  // previous_email is required — the email draft being revised
  if (!input.previous_email || typeof input.previous_email !== 'object') {
    throw new Error('previous_email object is required for email/re_generate');
  }
  if (!input.previous_email.subject || typeof input.previous_email.subject !== 'string') {
    throw new Error('previous_email.subject is required for email/re_generate');
  }
  if (!input.previous_email.email_content || typeof input.previous_email.email_content !== 'string') {
    throw new Error('previous_email.email_content is required for email/re_generate');
  }

  // ai_comments is optional — validated if present
  if (input.ai_comments) {
    validateAiCommentsObject(input.ai_comments, 'email/re_generate');
  }

  return input;
}

/**
 * email + send: Validates email object with recipient/subject/content.
 * JSON shape: { quotation_id?, rfq_reference?, email: { recipient_email, subject, email_content } }
 */
function validateEmailSend(input: ProcessorInput): ProcessorInput {
  // email object is required for sending
  if (!input.email || typeof input.email !== 'object') {
    throw new Error('email object is required for email/send');
  }

  // recipient_email — validated with basic format check
  if (!input.email.recipient_email) throw new Error('email.recipient_email is required');
  if (!EMAIL_REGEX.test(input.email.recipient_email)) {
    throw new Error('email.recipient_email must be a valid email address');
  }

  // subject — non-empty
  if (!input.email.subject || input.email.subject.trim().length === 0) {
    throw new Error('email.subject is required and cannot be empty');
  }

  // email_content — non-empty
  if (!input.email.email_content || input.email.email_content.trim().length === 0) {
    throw new Error('email.email_content is required and cannot be empty');
  }

  return input;
}

// #############################################################################
// RESPOND SERVICE VALIDATORS
// #############################################################################

/**
 * respond_service + supplier_respond: Validates incoming_email + rfq_id.
 * items_source is optional (enriched by data-loader from supplierItemStatus).
 * JSON shape: { rfq_id, incoming_email: IncomingEmailData, items_source?: SupplierItemSource[] }
 */
function validateRespondSupplier(input: ProcessorInput): ProcessorInput {
  // rfq_id is required — links response to the correct RFQ
  if (!input.rfq_id) throw new Error('rfq_id is required for respond_service/supplier_respond');
  requirePositiveInt(input.rfq_id, 'rfq_id');

  // incoming_email is required — the raw supplier reply email
  validateIncomingEmailObject(input.incoming_email, 'respond_service/supplier_respond');

  // items_source is optional — validated if present (may be enriched by data-loader)
  if (input.items_source) validateItemsSourceArray(input.items_source, 'respond_service/supplier_respond');

  return input;
}

/**
 * respond_service + customer_respond: Validates incoming_email + rfq_id.
 * rfq_items is optional (enriched by data-loader from rfqItems table).
 * JSON shape: { rfq_id, incoming_email: IncomingEmailData, rfq_items?: RfqItem[] }
 */
function validateRespondCustomer(input: ProcessorInput): ProcessorInput {
  // rfq_id is required — links response to the correct RFQ
  if (!input.rfq_id) throw new Error('rfq_id is required for respond_service/customer_respond');
  requirePositiveInt(input.rfq_id, 'rfq_id');

  // incoming_email is required — the raw customer reply email
  validateIncomingEmailObject(input.incoming_email, 'respond_service/customer_respond');

  // rfq_items is optional — validated if present (may be enriched by data-loader)
  if (input.rfq_items) validateRfqItemsArray(input.rfq_items, 'respond_service/customer_respond');

  return input;
}

// #############################################################################
// INCOMING EMAIL VALIDATORS
// #############################################################################

/**
 * incoming_email + handleRFQ/handleRespond/handleUnknown: Validates incoming_email object.
 * JSON shape: { incoming_email: IncomingEmailData }
 */
function validateIncomingEmail(input: ProcessorInput): ProcessorInput {
  validateIncomingEmailObject(input.incoming_email, `incoming_email/${input.action_type}`);
  return input;
}

// =============================================
// EXTRACTION VALIDATION MAPPING TABLE
// =============================================
// Maps data_type + action_type → dedicated validator function.
// Each combination has its own validator aligned with the JSON sample schema.

const EXTRACTION_VALIDATE: Record<string, Record<string, ValidatorFn>> = {
  'rfq_analysis': {
    analyze:   validateRfqAnalysisAnalyze,     // incoming_email → rfq-analysis.json Input_1
    reanalyze: validateRfqAnalysisReanalyze,   // rfq_id + ai_comments → rfq-analysis.json Input_2
  },
  'supplier_search': {
    search:   validateSupplierSearchSearch,     // rfq_id + analysis → supplier-search.json Input_1
    research: validateSupplierSearchResearch,   // rfq_id + ai_comments → supplier-search.json Input_2
  },
  'quotation': {
    generate:      validateQuotationGenerateUpdate,  // quotation_data → quotation_Inpt.json
    update:        validateQuotationGenerateUpdate,  // same shape, quotation_id required
    manual_update: validateQuotationManualUpdate,    // quotation_data (manual shape) → quotation_ui_manual.json
    calculate:     validateQuotationCalculate,       // quotation_id + pricing_variables → quotation_calulate.json
  },
  'email': {
    generate:    validateEmailGenerate,     // reference_content → email-actions-json.json Input_1
    re_generate: validateEmailRegenerate,   // previous_email + ai_comments → email-actions-json.json Input_2
    send:        validateEmailSend,         // email object with recipient/subject/content
  },
  'respond_service': {
    supplier_respond: validateRespondSupplier,   // incoming_email + rfq_id → respond_service.json supplier case
    customer_respond: validateRespondCustomer,   // incoming_email + rfq_id → respond_service.json customer case
  },
  'incoming_email': {
    handleRFQ:     validateIncomingEmail,   // incoming_email → route to rfq_analysis/analyze
    handleRespond: validateIncomingEmail,   // incoming_email → route to respond_service
    handleUnknown: validateIncomingEmail,   // incoming_email → unknown classification
  },
};

// =============================================
// MAIN VALIDATION ENTRY POINT
// =============================================

/**
 * Validate and route input data based on data_type and action_type.
 * Flow: check data_type → check action_type → route to specific validator.
 * @param input - Raw JSON input from HTTP request
 * @returns Validated and normalized input
 * @throws Error if validation fails
 */
export function validateInput(input: ProcessorInput): ProcessorInput {
  // Step 1: Input must exist
  if (!input) throw new Error('Input data is required');

  // Step 2: data_type is required and must be supported
  if (!input.data_type) throw new Error('data_type is required');
  const validDataTypes: DataType[] = ['quotation', 'email', 'rfq_analysis', 'supplier_search', 'respond_service', 'incoming_email'];
  if (!validDataTypes.includes(input.data_type)) {
    throw new Error(`Invalid data_type: must be one of ${validDataTypes.join(' | ')}`);
  }

  // Step 3: action_type is required
  if (!input.action_type) throw new Error('action_type is required');

  // Step 4: Short-circuit for 'proceed' — lightweight, just needs rfq_id
  if (input.action_type === 'proceed') {
    if (!input.rfq_id) throw new Error('rfq_id is required for proceed action');
    requirePositiveInt(input.rfq_id, 'rfq_id');
    return input;
  }

  // Step 5: Look up validator for this data_type + action_type
  const dataTypeValidators = EXTRACTION_VALIDATE[input.data_type];
  if (!dataTypeValidators) {
    throw new Error(`No validators configured for data_type: ${safeLabel(input.data_type)}`);
  }

  const validator = dataTypeValidators[input.action_type];
  if (!validator) {
    const allowedActions = Object.keys(dataTypeValidators).join(' | ');
    throw new Error(
      `action_type '${safeLabel(input.action_type)}' not supported for data_type '${safeLabel(input.data_type)}'. Allowed: ${allowedActions}`
    );
  }

  // Step 6: Execute type-specific validator
  return validator(input);
}

// =============================================
// NORMALIZE QUOTATION DATA
// =============================================

/**
 * Normalize quotation data for consistent structure.
 * - Converts item_id to integer (prevents Map lookup failures)
 * - Preserves currency_code at both item and bidder_proposal level
 * @param input - Validated input
 * @returns Deep-cloned normalized input
 */
export function normalizeQuotationData(input: ProcessorInput): ProcessorInput {
  const normalized = JSON.parse(JSON.stringify(input)) as ProcessorInput;

  // Only normalize if quotation_data with items exists
  const qd = normalized.quotation_data as QuotationData | undefined;
  if (qd?.quotation_items) {
    qd.quotation_items = qd.quotation_items.map((item) => {
      // Normalize item_id to integer
      if (item.item_id !== undefined && item.item_id !== null) {
        item.item_id = parseInt(String(item.item_id), 10);
      }
      // Ensure currency_code propagates to bidder_proposal
      if (item.currency_code !== undefined) {
        if (!item.bidder_proposal) {
          item.bidder_proposal = {} as QuotationItem['bidder_proposal'];
        }
        item.bidder_proposal.currency_code = item.currency_code;
      }
      return item;
    });
  }

  return normalized;
}

// =============================================
// MODULE EXPORTS
// =============================================

export {
  EXTRACTION_VALIDATE,
  normalizeQuotationData as normalizeData,
  // Quotation validators
  validateQuotationGenerateUpdate,
  validateQuotationManualUpdate,
  validateQuotationCalculate,
  validateQuotationItem,
  // Email validators
  validateEmailGenerate,
  validateEmailRegenerate,
  validateEmailSend,
  // RFQ analysis validators
  validateRfqAnalysisAnalyze,
  validateRfqAnalysisReanalyze,
  // Supplier search validators
  validateSupplierSearchSearch,
  validateSupplierSearchResearch,
  // Respond service validators
  validateRespondSupplier,
  validateRespondCustomer,
  // Incoming email validator
  validateIncomingEmail,
  // Shared sub-validators (for external reuse)
  validateIncomingEmailObject,
  validateAiCommentsObject,
  validateRfqItemsArray,
  validateItemsSourceArray,
};
