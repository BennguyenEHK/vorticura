// =============================================
// DATABASE HANDLER - Hybrid Registry Pattern
// =============================================
// Unified database operations with typed payload builders + registry-driven routing.
//
// Architecture:
//   modifyDatabase(input, workspace)
//     ├─ data_type === 'quotation'  → handleQuotationWrite()  (dedicated multi-table handler)
//     └─ all other data_types       → TABLE_REGISTRY lookup   → handleSingleTableWrite()
//
// Adding a new single-table data_type:
//   1. Add a buildXxxPayload() function
//   2. Add one entry to TABLE_REGISTRY (~10 lines)
//   Done — no if/else needed.
//
// Reference: Documents/json_sample/json_method_plan.md

import { insertData, getData, updateData } from '@/lib/db/queries';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

// =============================================
// Types
// =============================================

/** Generic record type for payload building (cast to table-specific types at call site) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = Record<string, any>;

/** Builder function signature — maps raw data to Drizzle-compatible payload */
type BuilderFn = (data: Record<string, unknown>, update?: boolean) => Payload;

/** Registry config for single-table data types */
interface SingleTableConfig {
  table: string;                                              // camelCase name for queries.ts (e.g., 'emailTable')
  existsTable: string;                                        // snake_case name for checkDataExists (e.g., 'email_table')
  builder: BuilderFn;                                         // payload builder function
  canUpdate: (input: ModifyDatabaseInput) => boolean;         // are required IDs present to attempt update?
  getExistsId: (input: ModifyDatabaseInput) => number;        // ID value for existence check
  getUpdateFilter: (input: ModifyDatabaseInput) => Record<string, unknown>; // WHERE clause for UPDATE
  extractData: (input: ModifyDatabaseInput) => Record<string, unknown>;     // merge input fields into flat data for builder
}

/** Input shape for modifyDatabase — flexible JSON from processors */
export interface ModifyDatabaseInput {
  data_type: string;               // quotation | email | rfq_analysis | supplier_search | incoming_email
  rfq_id?: number;                 // Top-level RFQ ID (for rfq_analysis/supplier_search types)
  quotation_id?: number;           // Top-level quotation ID (for quotation-stage types)
  rfq_reference?: string;          // RFQ reference string
  exchange_currency?: string;      // Target currency for pricing
  // Quotation-specific
  quotationData?: {
    quotation_id?: number;
    rfq_id?: number;
    rfq_reference?: string;
    quotation_name?: string;
    commercial_terms?: string;
    quotation_status?: string;
    transfer_currency_code?: string;
    generated_day?: string;
    version_number?: number;
    created_by?: string;
    customer_info?: Record<string, unknown>;
    quotation_items?: Array<Record<string, unknown>>;
  };
  // Pricing-specific (per-item array from pricing calculator)
  calculatedPricing?: {
    calculated_pricing?: Array<Record<string, unknown>>;
    total_amount?: number;
  };
  pricing_variables?: Array<Record<string, unknown>>; // Per-item pricing variables
  // Email-specific
  email?: Record<string, unknown>;
  email_id?: number;
  // RFQ Analysis-specific
  rfq_analysis?: Record<string, unknown>;
  // Supplier Search-specific
  suppliers_search?: Record<string, unknown>;
  search_id?: number;
  // Incoming Email-specific
  incoming_email?: Record<string, unknown>;
  incoming_email_id?: number;
}

// =============================================
// PAYLOAD BUILDERS
// =============================================
// Each builder maps input -> database columns, only including present fields.
// `update` flag excludes PK/FK columns (used in WHERE clause, not SET).

/**
 * Build quotation payload for QUOTATIONS table
 */
export function buildQuotationPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  if (!update && data.quotation_id != null) payload.quotationId = data.quotation_id;
  if (data.rfq_id != null) payload.rfqId = data.rfq_id;
  if (data.rfq_reference != null) payload.rfqReference = String(data.rfq_reference);
  if (data.quotation_name != null) payload.quotationName = String(data.quotation_name);
  if (data.commercial_terms != null) payload.commercialTerms = String(data.commercial_terms);
  if (data.quotation_status != null) payload.quotationStatus = String(data.quotation_status);
  if (data.transfer_currency_code != null) payload.transferCurrencyCode = String(data.transfer_currency_code);
  if (data.generated_day != null) payload.generatedDay = data.generated_day;
  if (data.version_number != null) payload.versionNumber = parseInt(String(data.version_number));
  if (data.created_by != null) payload.createdBy = String(data.created_by);

  return payload;
}

/**
 * Build quotation items payload for QUOTATION_ITEMS table
 * Supports nested company_requirement/bidder_proposal or flat fields
 */
export function buildQuotationItemsPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  // PK/FK — exclude on UPDATE
  if (!update && data.quotation_id != null) payload.quotationId = data.quotation_id;
  if (!update && data.item_id != null) {
    const itemId = parseInt(String(data.item_id), 10);
    if (isNaN(itemId) || itemId < 1) throw new Error('Invalid item_id: must be positive integer');
    payload.itemId = itemId;
  }

  // Extract from nested company_requirement or flat fallback
  const companyReq = (data.company_requirement || {}) as Record<string, unknown>;
  if (companyReq.company_description != null) payload.companyDescription = String(companyReq.company_description);
  else if (data.company_description != null) payload.companyDescription = String(data.company_description);

  if (companyReq.qty != null) payload.qty = String(parseFloat(String(companyReq.qty)));
  else if (data.qty != null) payload.qty = String(parseFloat(String(data.qty)));

  if (companyReq.uom != null) payload.uom = String(companyReq.uom);
  else if (data.uom != null) payload.uom = String(data.uom);

  // Extract from nested bidder_proposal or flat fallback
  const bidderProposal = (data.bidder_proposal || {}) as Record<string, unknown>;
  if (bidderProposal.bidder_description != null) payload.bidderDescription = String(bidderProposal.bidder_description);
  else if (data.bidder_description != null) payload.bidderDescription = String(data.bidder_description);

  if (bidderProposal.bidder_unit_price != null) payload.bidderUnitPrice = String(parseFloat(String(bidderProposal.bidder_unit_price)));
  else if (data.bidder_unit_price != null) payload.bidderUnitPrice = String(parseFloat(String(data.bidder_unit_price)));

  if (bidderProposal.delivery_time != null) payload.deliveryTime = String(bidderProposal.delivery_time);
  else if (data.delivery_time != null) payload.deliveryTime = String(data.delivery_time);

  if (bidderProposal.compliance_deviation != null) payload.complianceDeviation = String(bidderProposal.compliance_deviation);
  else if (data.compliance_deviation != null) payload.complianceDeviation = String(data.compliance_deviation);

  // Root-level currency
  if (data.currency_code != null) payload.currencyCode = String(data.currency_code);

  return payload;
}

/**
 * Build customer payload for CUSTOMERS table
 * Expects customer_info nested object inside data
 */
export function buildCustomerPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};
  const ci = (data.customer_info || {}) as Record<string, unknown>;

  if (!update && data.rfq_id != null) payload.rfqId = data.rfq_id;
  if (ci.company_name != null) payload.companyName = String(ci.company_name);
  if (ci.attention_person != null) payload.attentionPerson = String(ci.attention_person);
  if (ci.carbon_copy_person != null) {
    // Ensure array of strings
    payload.carbonCopyPerson = Array.isArray(ci.carbon_copy_person)
      ? (ci.carbon_copy_person as unknown[]).map((cc) => String(cc))
      : [];
  }
  if (ci.email != null) payload.email = String(ci.email);
  if (ci.customer_address != null) payload.customerAddress = String(ci.customer_address);
  if (ci.phone != null) payload.phone = String(ci.phone);
  if (ci.fax_number != null) payload.faxNumber = String(ci.fax_number);
  if (ci.customer_status != null) payload.customerStatus = String(ci.customer_status);

  return payload;
}

/**
 * Build pricing payload for QUOTATION_PRICING table
 * Expects pricingVariables + calculatedPricing nested objects
 */
export function buildPricingPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};
  const pv = (data.pricingVariables || {}) as Record<string, unknown>;
  const cp = (data.calculatedPricing || {}) as Record<string, unknown>;

  // PK/FK
  if (!update && data.quotation_id != null) payload.quotationId = data.quotation_id;
  if (!update && data.item_id != null) {
    const itemId = parseInt(String(data.item_id), 10);
    if (isNaN(itemId) || itemId < 1) throw new Error('Invalid item_id: must be positive integer');
    payload.itemId = itemId;
  }

  // Pricing variables
  if (pv.shipping_cost != null) payload.shippingCost = String(pv.shipping_cost);
  if (data.exchange_currency != null) payload.exchangeCurrency = String(data.exchange_currency);
  if (pv.tax_rate != null) payload.taxRate = String(pv.tax_rate);
  if (pv.profit_rate != null) payload.profitRate = String(pv.profit_rate);
  if (pv.discount_rate != null) payload.discountRate = String(pv.discount_rate);
  if (pv.exchange_rate != null) payload.exchangeRate = String(pv.exchange_rate);

  // Calculated pricing (single-item array)
  const cpItems = (cp.calculated_pricing || []) as Array<Record<string, unknown>>;
  const itemData = cpItems[0];
  if (itemData) {
    if (itemData.sales_unit_price != null) payload.salesUnitPrice = String(itemData.sales_unit_price);
    if (itemData.ext_price != null) payload.extPrice = String(itemData.ext_price);
    if (itemData.potential_profit != null) payload.potentialProfit = String(itemData.potential_profit);
  }

  return payload;
}

/**
 * Build email payload for EMAIL_TABLE
 */
export function buildEmailPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  if (!update && data.quotation_id != null) payload.quotationId = data.quotation_id;
  if (!update && data.email_id != null) payload.emailId = data.email_id;
  if (data.rfq_id != null) payload.rfqId = data.rfq_id;
  if (data.rfq_reference != null) payload.rfqReference = String(data.rfq_reference);
  if (data.recipient_email != null) payload.recipientEmail = String(data.recipient_email);
  if (data.subject != null) payload.subject = String(data.subject);
  if (data.email_content != null) payload.emailContent = String(data.email_content);
  if (data.email_status != null) payload.emailStatus = String(data.email_status);
  if (data.sent_at != null) payload.sentAt = data.sent_at;

  return payload;
}

/**
 * Build RFQ analysis payload for RFQ_ANALYSIS table
 */
export function buildRfqAnalysisPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  if (!update && data.rfq_id != null) payload.rfqId = data.rfq_id;
  if (data.rfq_reference != null) payload.rfqReference = String(data.rfq_reference);
  if (data.subject != null) payload.subject = String(data.subject);
  if (data.analysis_content != null) payload.analysisContent = String(data.analysis_content);
  if (data.analysis_status != null) payload.analysisStatus = String(data.analysis_status);

  return payload;
}

/**
 * Build supplier search payload for SUPPLIER_SEARCH table
 */
export function buildSupplierSearchPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  if (!update && data.rfq_id != null) payload.rfqId = data.rfq_id;
  if (!update && data.search_id != null) payload.searchId = data.search_id;
  if (data.rfq_reference != null) payload.rfqReference = String(data.rfq_reference);
  if (data.subject != null) payload.subject = String(data.subject);
  if (data.search_content != null) payload.searchContent = String(data.search_content);
  if (data.search_status != null) payload.searchStatus = String(data.search_status);

  return payload;
}

/**
 * Build supplier item status payload for SUPPLIER_ITEM_STATUS table
 * Used by supplier_respond flow to track per-item availability from suppliers
 */
export function buildSupplierItemStatusPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  // PK/FK — exclude on UPDATE (with numeric validation)
  if (!update && data.id != null) payload.id = parseInt(String(data.id), 10);
  if (!update && data.rfq_id != null) payload.rfqId = parseInt(String(data.rfq_id), 10);
  if (data.item_id != null) payload.itemId = parseInt(String(data.item_id), 10);
  if (data.supplier_id != null) payload.supplierId = parseInt(String(data.supplier_id), 10);
  if (data.supplier_name != null) payload.supplierName = String(data.supplier_name);
  if (data.source_url != null) payload.sourceUrl = String(data.source_url);
  // Status: 'pending' | 'available' | 'unavailable'
  if (data.status != null) payload.status = String(data.status);
  if (data.unit_price != null) payload.unitPrice = String(data.unit_price);
  if (data.delivery_time != null) payload.deliveryTime = String(data.delivery_time);
  if (data.notes != null) payload.notes = String(data.notes);
  if (data.responded_at != null) payload.respondedAt = data.responded_at;

  return payload;
}

/**
 * Build client company payload for CLIENT_COMPANY table
 */
export function buildClientCompanyPayload(data: Record<string, unknown>): Payload {
  const payload: Payload = {};

  if (data.company_name != null) payload.companyName = String(data.company_name);
  if (data.company_number != null) payload.companyNumber = String(data.company_number);
  if (data.company_address != null) payload.companyAddress = String(data.company_address);
  if (data.company_fax != null) payload.companyFax = String(data.company_fax);
  if (data.company_email != null) payload.companyEmail = String(data.company_email);

  return payload;
}

/**
 * Build incoming email payload for INCOMING_EMAILS table
 * Maps raw email fields from email-watcher to DB columns
 */
export function buildIncomingEmailPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  // PK — exclude on UPDATE (with NaN guard)
  if (!update && data.id != null) {
    const id = parseInt(String(data.id), 10);
    if (!isNaN(id)) payload.id = id;
  }
  // Dedup key
  if (data.message_id != null) payload.messageId = String(data.message_id);
  // Sender info
  if (data.from_email != null) payload.fromEmail = String(data.from_email);
  if (data.from_name != null) payload.fromName = String(data.from_name);
  // Recipients (arrays)
  if (data.to != null) {
    payload.toRecipients = Array.isArray(data.to) ? data.to.map(String) : [String(data.to)];
  }
  if (data.cc != null) {
    payload.ccRecipients = Array.isArray(data.cc) ? data.cc.map(String) : [String(data.cc)];
  }
  // Email content
  if (data.subject != null) payload.subject = String(data.subject);
  if (data.email_body_text != null) payload.emailBodyText = String(data.email_body_text);
  // Attachments (jsonb — pass through as-is)
  if (data.attachments_parsed != null) payload.attachmentsParsed = data.attachments_parsed;
  // Classification (set after AI classify step)
  if (data.classification_type != null) payload.classificationType = String(data.classification_type);
  if (data.classification_confidence != null) payload.classificationConfidence = String(data.classification_confidence);
  // FK link to rfq_analysis (set after routing, with NaN guard)
  if (data.rfq_id != null) {
    const rfqId = parseInt(String(data.rfq_id), 10);
    if (!isNaN(rfqId)) payload.rfqId = rfqId;
  }
  // Timestamps
  if (data.received_at != null) payload.receivedAt = data.received_at;
  if (data.processed_at != null) payload.processedAt = data.processed_at;

  return payload;
}

// =============================================
// TABLE REGISTRY — Single-table data types
// =============================================
// Each entry defines how to route a data_type to its table.
// Adding a new data_type = add one entry here + one builder above.

const TABLE_REGISTRY: Record<string, SingleTableConfig> = {
  // Email drafts and sent emails
  email: {
    table: 'emailTable',
    existsTable: 'email_table',
    builder: buildEmailPayload,
    canUpdate: (input) => !!(input.email_id && input.quotation_id), // need both IDs to find existing
    getExistsId: (input) => input.quotation_id!,                    // check by quotation_id
    getUpdateFilter: (input) => ({ emailId: input.email_id }),      // update by email_id
    extractData: (input) => ({
      ...input.email,
      quotation_id: input.quotation_id,
      rfq_id: input.rfq_id,
      rfq_reference: input.rfq_reference,
    }),
  },

  // RFQ analysis reports
  rfq_analysis: {
    table: 'rfqAnalysis',
    existsTable: 'rfq_analysis',
    builder: buildRfqAnalysisPayload,
    canUpdate: (input) => !!input.rfq_id,             // rfq_id is both check and update key
    getExistsId: (input) => input.rfq_id!,
    getUpdateFilter: (input) => ({ rfqId: input.rfq_id }),
    extractData: (input) => ({
      ...input.rfq_analysis,
      rfq_id: input.rfq_id,
      rfq_reference: input.rfq_reference,
    }),
  },

  // Supplier search results
  supplier_search: {
    table: 'supplierSearch',
    existsTable: 'supplier_search',
    builder: buildSupplierSearchPayload,
    canUpdate: (input) => !!(input.search_id && input.rfq_id), // need both to find existing
    getExistsId: (input) => input.rfq_id!,                     // check by rfq_id
    getUpdateFilter: (input) => ({ searchId: input.search_id }),// update by search_id
    extractData: (input) => ({
      ...input.suppliers_search,
      rfq_id: input.rfq_id,
      rfq_reference: input.rfq_reference,
    }),
  },

  // Raw incoming emails from email-watcher
  incoming_email: {
    table: 'incomingEmails',
    existsTable: 'incoming_emails',
    builder: buildIncomingEmailPayload,
    canUpdate: (input) => !!input.incoming_email_id,             // update by incoming_email_id
    getExistsId: (input) => input.incoming_email_id!,
    getUpdateFilter: (input) => ({ id: input.incoming_email_id }),
    extractData: (input) => ({
      ...input.incoming_email,
      rfq_id: input.rfq_id,
    }),
  },
};

// =============================================
// CHECK DATA EXISTENCE
// =============================================

/**
 * Check if data exists in a table by primary/foreign key
 * Uses getData from queries.ts for workspace-isolated lookups
 * @returns Array of matching rows (empty if not found)
 */
export async function checkDataExists(
  table: string,
  keysId: number,
  workspace: WorkspaceContext
): Promise<Record<string, unknown>[]> {
  try {
    // Map snake_case table names to camelCase keys used by queries.ts getTableByName()
    const tableNameMap: Record<string, string> = {
      'quotations': 'quotations',
      'quotation_items': 'quotationItems',
      'quotation_pricing': 'quotationPricing',
      'customers': 'customers',
      'email_table': 'emailTable',
      'rfq_analysis': 'rfqAnalysis',
      'supplier_search': 'supplierSearch',
      'client_company': 'clientCompany',
      'supplier_item_status': 'supplierItemStatus',
      'incoming_emails': 'incomingEmails',
    };

    const tableName = tableNameMap[table];
    if (!tableName) {
      console.warn(`checkDataExists: unknown table "${table}", falling back to quotations`);
      return await getData('quotations', { quotationId: keysId }, workspace) as Record<string, unknown>[];
    }

    // Determine the correct lookup column based on table
    let filterColumn: string;
    switch (table) {
      case 'client_company':
        filterColumn = 'companyId';
        break;
      case 'incoming_emails':
        filterColumn = 'id';             // PK lookup for incoming emails
        break;
      case 'rfq_analysis':
      case 'supplier_search':
      case 'customers':
      case 'supplier_item_status':
        filterColumn = 'rfqId';
        break;
      default:
        filterColumn = 'quotationId';    // quotations, quotation_items, quotation_pricing, email_table
        break;
    }

    return await getData(tableName, { [filterColumn]: keysId }, workspace) as Record<string, unknown>[];
  } catch (error) {
    console.error(`Error checking data existence in ${table}:`, error);
    return []; // Return empty on error (assume not exists)
  }
}

// =============================================
// GENERIC SINGLE-TABLE HANDLER
// =============================================

/**
 * Handle insert/update for any single-table data_type using registry config.
 * Pattern: extract data → check exists → INSERT or UPDATE
 */
async function handleSingleTableWrite(
  config: SingleTableConfig,
  input: ModifyDatabaseInput,
  workspace: WorkspaceContext
): Promise<void> {
  const data = config.extractData(input);

  // Attempt update if required IDs are present
  if (config.canUpdate(input)) {
    const existsId = config.getExistsId(input);
    const existing = await checkDataExists(config.existsTable, existsId, workspace);

    if (existing.length > 0) {
      // UPDATE — exclude PK/FK from SET clause
      const updatePayload = config.builder(data, true);
      const filter = config.getUpdateFilter(input);
      await updateData(config.table, filter, updatePayload, workspace);
      console.log(`[DB] ${config.table} updated`);
      return;
    }
  }

  // INSERT — include all fields
  const insertPayload = config.builder(data, false);
  await insertData(config.table, {}, insertPayload, workspace);
  console.log(`[DB] ${config.table} inserted`);
}

// =============================================
// MULTI-TABLE HANDLER: QUOTATION
// =============================================

/**
 * Dedicated handler for quotation data_type — writes to multiple tables in order:
 *   1. quotations (parent row)
 *   2. customers (linked by rfq_id)
 *   3. quotation_items (per-item, linked by quotation_id)
 *   4. quotation_pricing (per-item pricing, linked by quotation_id)
 *
 * Which tables are written depends on which input fields are populated.
 * Action processors control this by choosing what data to include.
 */
async function handleQuotationWrite(
  input: ModifyDatabaseInput,
  workspace: WorkspaceContext
): Promise<void> {
  const qd = input.quotationData!;

  // --- STEP 1: QUOTATIONS table ---
  if (qd.quotation_id) {
    const existing = await checkDataExists('quotations', qd.quotation_id, workspace);
    if (existing.length > 0) {
      const payload = buildQuotationPayload(qd as unknown as Record<string, unknown>, true);
      await updateData('quotations', { quotationId: qd.quotation_id }, payload, workspace);
      console.log(`[DB] Quotation updated: ${qd.quotation_id}`);
    } else {
      const payload = buildQuotationPayload(qd as unknown as Record<string, unknown>, false);
      const result = await insertData('quotations', {}, payload, workspace);
      qd.quotation_id = result?.quotationId;
      console.log(`[DB] Quotation inserted: ${qd.quotation_id}`);
    }
  } else {
    // INSERT with auto-generated ID
    const payload = buildQuotationPayload(qd as unknown as Record<string, unknown>, false);
    const result = await insertData('quotations', {}, payload, workspace);
    qd.quotation_id = result?.quotationId;
    console.log(`[DB] Quotation inserted (auto-ID): ${qd.quotation_id}`);
  }

  // --- STEP 2: CUSTOMERS table (uses rfqId as FK) ---
  if (qd.customer_info && qd.rfq_id) {
    const existingCustomer = await checkDataExists('customers', qd.rfq_id, workspace);
    if (existingCustomer.length > 0) {
      const payload = buildCustomerPayload(qd as unknown as Record<string, unknown>, true);
      await updateData('customers', { rfqId: qd.rfq_id }, payload, workspace);
      console.log(`[DB] Customer updated for rfq: ${qd.rfq_id}`);
    } else {
      const payload = buildCustomerPayload(qd as unknown as Record<string, unknown>, false);
      await insertData('customers', {}, payload, workspace);
      console.log(`[DB] Customer inserted for rfq: ${qd.rfq_id}`);
    }
  }

  // --- STEP 3: QUOTATION_ITEMS table (iterate each item) ---
  if (qd.quotation_items && qd.quotation_items.length > 0 && qd.quotation_id) {
    for (const item of qd.quotation_items) {
      const itemId = item.item_id ? parseInt(String(item.item_id), 10) : null;
      let shouldInsert = true;

      // Check existence by composite key: quotation_id + item_id
      if (itemId) {
        const existingItem = await getData(
          'quotationItems',
          { quotationId: qd.quotation_id!, itemId },
          workspace
        );

        if (existingItem.length > 0) {
          const payload = buildQuotationItemsPayload(
            { ...item, quotation_id: qd.quotation_id } as Record<string, unknown>,
            true
          );
          await updateData(
            'quotationItems',
            { quotationId: qd.quotation_id!, itemId },
            payload,
            workspace
          );
          console.log(`[DB] Item ${itemId} updated`);
          shouldInsert = false;
        }
      }

      if (shouldInsert) {
        const itemData: Record<string, unknown> = { ...item, quotation_id: qd.quotation_id };
        if (itemId) itemData.item_id = itemId;
        const payload = buildQuotationItemsPayload(itemData, false);
        await insertData('quotationItems', {}, payload, workspace);
        console.log(`[DB] Item inserted ${itemId ? `(id: ${itemId})` : '(auto-ID)'}`);
      }
    }
  }

  // --- STEP 4: QUOTATION_PRICING table (per-item pricing) ---
  if (input.calculatedPricing?.calculated_pricing && input.calculatedPricing.calculated_pricing.length > 0 && qd.quotation_id) {
    for (const pricingItem of input.calculatedPricing.calculated_pricing) {
      const itemId = pricingItem.item_id ? parseInt(String(pricingItem.item_id), 10) : null;
      let shouldInsert = true;

      // Match pricing variables for this item
      let itemPricingVars: Record<string, unknown> = {};
      if (Array.isArray(input.pricing_variables) && itemId) {
        const matched = input.pricing_variables.find((v) => Number(v.item_id) === itemId);
        itemPricingVars = (matched || {}) as Record<string, unknown>;
      }

      // Build shared payload data
      const payloadData: Record<string, unknown> = {
        quotation_id: qd.quotation_id,
        pricingVariables: itemPricingVars,
        calculatedPricing: { calculated_pricing: [pricingItem] },
        exchange_currency: input.exchange_currency || 'VND',
      };

      // Check existence (composite key: quotation_id + item_id)
      if (itemId) {
        const existingPricing = await getData(
          'quotationPricing',
          { quotationId: qd.quotation_id!, itemId },
          workspace
        );

        if (existingPricing.length > 0) {
          const payload = buildPricingPayload(payloadData, true);
          await updateData(
            'quotationPricing',
            { quotationId: qd.quotation_id!, itemId },
            payload,
            workspace
          );
          console.log(`[DB] Pricing item ${itemId} updated`);
          shouldInsert = false;
        }
      }

      if (shouldInsert) {
        if (itemId) payloadData.item_id = itemId;
        const payload = buildPricingPayload(payloadData, false);
        await insertData('quotationPricing', {}, payload, workspace);
        console.log(`[DB] Pricing inserted ${itemId ? `(id: ${itemId})` : '(auto-ID)'}`);
      }
    }

    // Update total_amount in quotations table
    if (input.calculatedPricing.total_amount !== undefined && qd.quotation_id) {
      await updateData(
        'quotations',
        { quotationId: qd.quotation_id },
        { totalAmount: String(input.calculatedPricing.total_amount) },
        workspace
      );
      console.log(`[DB] Total amount updated: ${input.calculatedPricing.total_amount}`);
    }
  }
}

// =============================================
// MAIN ENTRY POINT — modifyDatabase
// =============================================

/**
 * Unified database modification function.
 * Routes by data_type:
 *   - 'quotation' → handleQuotationWrite (multi-table, explicit ordering)
 *   - all others  → TABLE_REGISTRY lookup → handleSingleTableWrite (generic)
 *
 * All DB operations go through queries.ts for workspace isolation.
 */
export async function modifyDatabase(
  input: ModifyDatabaseInput,
  workspace: WorkspaceContext
): Promise<void> {
  try {
    console.log(`[DB] Starting modification for data_type: ${input.data_type}`);

    // Multi-table type: quotation (dedicated handler with dependency ordering)
    if (input.data_type === 'quotation' && input.quotationData) {
      await handleQuotationWrite(input, workspace);
      console.log('[DB] Database modification completed');
      return;
    }

    // Single-table types: registry-driven generic handler
    const config = TABLE_REGISTRY[input.data_type];
    if (!config) {
      throw new Error(`[DB] Unknown data_type: "${input.data_type}". Available: ${Object.keys(TABLE_REGISTRY).join(', ')}, quotation`);
    }

    await handleSingleTableWrite(config, input, workspace);
    console.log('[DB] Database modification completed');
  } catch (error) {
    console.error('[DB] Error in modifyDatabase:', error);
    throw error; // Re-throw for caller to handle
  }
}
