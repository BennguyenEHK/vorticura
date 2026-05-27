// =============================================
// DATABASE HANDLER - Unified WRITE_MAP Pattern
// =============================================
// Data-driven database operations: WRITE_MAP[data_type][action_type] → TableWriteConfig[]
// Single handler processes 1..N tables per data_type+action_type combination.

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

interface TableWriteConfig {
  table: string;
  builder: BuilderFn;
  extract: (input: ModifyDatabaseInput) => Record<string, unknown> | Record<string, unknown>[] | null;
  getExistsComposite: (data: Record<string, unknown>, input: ModifyDatabaseInput) => Record<string, unknown> | null;
  getUpdateFilter: (data: Record<string, unknown>, input: ModifyDatabaseInput) => Record<string, unknown>;
  updateOnly?: boolean;
  onInsert?: (result: Record<string, unknown>, input: ModifyDatabaseInput) => void;
}

/** Input shape for modifyDatabase — flexible JSON from processors */
export interface ModifyDatabaseInput {
  data_type: string;
  rfq_id?: number;
  quotation_id?: number;
  rfq_reference?: string;
  exchange_currency?: string;
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
    rfq_items?: Array<Record<string, unknown>>;
    quotation_items?: Array<Record<string, unknown>>;
  };
  // Pricing-specific (per-item array from pricing calculator)
  calculatedPricing?: {
    calculated_pricing?: Array<Record<string, unknown>>;
    total_amount?: number;
  };
  pricing_variables?: Array<Record<string, unknown>>;
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
  // Customer info (merged deterministic + AI data from analysis flow)
  customer_info?: Record<string, unknown>;
  // Multi-table support
  rfq_items?: Array<Record<string, unknown>>;
  items_source?: Array<Record<string, unknown>>;
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
 * Build RFQ items payload for RFQ_ITEMS table
 * Supports nested company_requirement or flat fields
 */
export function buildRfqItemsPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  // PK/FK — exclude on UPDATE
  if (!update && data.rfq_id != null) payload.rfqId = data.rfq_id;
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

  // currency_code moved to supplier_item_status — no longer written here

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

  // Pricing variables — use 'in' so an explicit null clears the column back to NULL
  if ('shipping_cost' in pv) payload.shippingCost = pv.shipping_cost != null ? String(pv.shipping_cost) : null;
  if (data.exchange_currency != null) payload.exchangeCurrency = String(data.exchange_currency);
  if ('tax_rate' in pv) payload.taxRate = pv.tax_rate != null ? String(pv.tax_rate) : null;
  if ('profit_rate' in pv) payload.profitRate = pv.profit_rate != null ? String(pv.profit_rate) : null;
  if ('discount_rate' in pv) payload.discountRate = pv.discount_rate != null ? String(pv.discount_rate) : null;
  if ('exchange_rate' in pv) payload.exchangeRate = pv.exchange_rate != null ? String(pv.exchange_rate) : null;

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
  // Deterministic extraction columns
  if (data.required_currency != null) payload.requiredCurrency = String(data.required_currency);
  if (data.deadline_period != null) payload.deadlinePeriod = String(data.deadline_period);
  if (data.closing_time != null) payload.closingTime = new Date(String(data.closing_time));
  // Workflow queue state (only set when caller explicitly provides — reanalyze passes undefined to avoid regressing stage)
  if (data.current_stage != null) payload.currentStage = String(data.current_stage);
  if (data.unread_count != null) payload.unreadCount = Number(data.unread_count);

  return payload;
}

/**
 * Build supplier search payload for SUPPLIER_SEARCH table
 */
export function buildSupplierSearchPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  if (!update && data.rfq_id != null) payload.rfqId = data.rfq_id;
  if (!update && data.search_id != null) payload.searchId = data.search_id;
  if (data.subject != null) payload.subject = String(data.subject);
  if (data.search_content != null) payload.searchContent = String(data.search_content);
  if (data.search_status != null) payload.searchStatus = String(data.search_status);

  return payload;
}

/**
 * Build supplier item status payload for SUPPLIER_ITEM_STATUS table
 */
export function buildSupplierItemStatusPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  if (!update && data.id != null) payload.id = parseInt(String(data.id), 10);
  if (!update && data.rfq_id != null) payload.rfqId = parseInt(String(data.rfq_id), 10);
  if (data.item_id != null) payload.itemId = parseInt(String(data.item_id), 10);
  if (data.supplier_id != null) payload.supplierId = parseInt(String(data.supplier_id), 10);
  if (data.supplier_name != null) payload.supplierName = String(data.supplier_name);
  if (data.source_url != null) payload.sourceUrl = String(data.source_url);
  if (data.status != null) payload.status = String(data.status);
  if (data.bidder_unit_price != null) payload.bidderUnitPrice = String(data.bidder_unit_price);
  else if (data.unit_price != null) payload.bidderUnitPrice = String(data.unit_price);
  if (data.currency_code != null) payload.currencyCode = String(data.currency_code);
  if (data.delivery_time != null) payload.deliveryTime = String(data.delivery_time);
  if (data.bidder_description != null) payload.bidderDescription = String(data.bidder_description);
  if (data.compliance_deviation != null) payload.complianceDeviation = String(data.compliance_deviation);
  if (data.notes != null) payload.notes = String(data.notes);
  if (data.contact_email != null) payload.contactEmail = String(data.contact_email);   // Map to DB column
  if (data.contact_phone != null) payload.contactPhone = String(data.contact_phone);   // Map to DB column
  if (data.responded_at != null) payload.respondedAt = data.responded_at;

  return payload;
}

/**
 * Build user company payload for USER_COMPANY table
 */
export function buildUserCompanyPayload(data: Record<string, unknown>): Payload {
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
 */
export function buildIncomingEmailPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  if (!update && data.id != null) {
    const id = parseInt(String(data.id), 10);
    if (!isNaN(id)) payload.id = id;
  }
  if (data.message_id != null) payload.messageId = String(data.message_id);
  if (data.from_email != null) payload.fromEmail = String(data.from_email);
  if (data.from_name != null) payload.fromName = String(data.from_name);
  if (data.to != null) {
    payload.toRecipients = Array.isArray(data.to) ? data.to.map(String) : [String(data.to)];
  }
  if (data.cc != null) {
    payload.ccRecipients = Array.isArray(data.cc) ? data.cc.map(String) : [String(data.cc)];
  }
  if (data.subject != null) payload.subject = String(data.subject);
  if (data.email_body_text != null) payload.emailBodyText = String(data.email_body_text);
  if (data.attachments_parsed != null) payload.attachmentsParsed = data.attachments_parsed;
  if (data.classification_type != null) payload.classificationType = String(data.classification_type);
  if (data.classification_confidence != null) {
    // The pipeline produces 'high'/'medium'/'low' labels; the DB column is numeric(4,3).
    // Map labels to canonical probabilities so PostgreSQL can cast them correctly.
    const raw = String(data.classification_confidence);
    const labelToNumeric: Record<string, string> = { high: '0.900', medium: '0.700', low: '0.500' };
    payload.classificationConfidence = labelToNumeric[raw] ?? raw;
  }
  if (data.rfq_id != null) {
    const rfqId = parseInt(String(data.rfq_id), 10);
    if (!isNaN(rfqId)) payload.rfqId = rfqId;
  }
  if (data.received_at != null) payload.receivedAt = new Date(String(data.received_at));
  if (data.processed_at != null) payload.processedAt = new Date(String(data.processed_at));

  return payload;
}

// =============================================
// TABLE CONFIGS — named per-table write configurations
// Referenced by name inside WRITE_MAP below.
// getExistsComposite returns a filter object: primary key (rfqId or quotationId) required,
// secondary key (itemId, supplierId, etc.) included when present.
// =============================================

// ─── RFQ ANALYSIS ──────────────────────────────

const TC_rfqAnalysis: TableWriteConfig = {
  table: 'rfqAnalysis',
  builder: buildRfqAnalysisPayload,
  extract: (input) => {
    if (!input.rfq_analysis) return null;
    return { ...input.rfq_analysis, rfq_id: input.rfq_id, rfq_reference: input.rfq_reference };
  },
  getExistsComposite: (_data, input) => {
    return input.rfq_id ? { rfqId: input.rfq_id } : null;
  },
  getUpdateFilter: (_data, input) => ({ rfqId: input.rfq_id }),
  onInsert: (result, input) => {
    if (result?.rfqId) {
      input.rfq_id = result.rfqId as number;
    }
  },
};

// ─── RFQ ITEMS (unified: analysis + quotation) ─

const TC_rfqItems: TableWriteConfig = {
  table: 'rfqItems',
  builder: buildRfqItemsPayload,
  extract: (input) => {
    const qd = input.quotationData || input;
    const items = (qd as Record<string, unknown>).rfq_items as Array<Record<string, unknown>> | undefined
      || (qd as Record<string, unknown>).quotation_items as Array<Record<string, unknown>> | undefined;
    if (!items?.length) return null;
    const rfqId = (qd as Record<string, unknown>).rfq_id ?? input.rfq_id;
    if (!rfqId) return null;
    return items.map((item) => ({ ...item, rfq_id: rfqId }));
  },
  getExistsComposite: (data, input) => {
    const rfqId = input.quotationData?.rfq_id ?? input.rfq_id;
    if (!rfqId || !data.item_id) return null;
    return { rfqId, itemId: parseInt(String(data.item_id)) };
  },
  getUpdateFilter: (data, input) => ({
    rfqId: input.quotationData?.rfq_id ?? input.rfq_id,
    itemId: parseInt(String(data.item_id)),
  }),
};

// ─── CUSTOMERS (unified: analysis + quotation) ─

const TC_customers: TableWriteConfig = {
  table: 'customers',
  builder: buildCustomerPayload,
  extract: (input) => {
    const qd = input.quotationData || input;
    if (!qd?.customer_info || !qd.rfq_id) return null;
    return { customer_info: qd.customer_info, rfq_id: qd.rfq_id } as Record<string, unknown>;
  },
  getExistsComposite: (_data, input) => {
    const rfqId = input.quotationData?.rfq_id ?? input.rfq_id;
    return rfqId ? { rfqId } : null;
  },
  getUpdateFilter: (_data, input) => ({ rfqId: input.quotationData?.rfq_id ?? input.rfq_id }),
};

// ─── SUPPLIER SEARCH ───────────────────────────

const TC_supplierSearch: TableWriteConfig = {
  table: 'supplierSearch',
  builder: buildSupplierSearchPayload,
  extract: (input) => {
    if (!input.suppliers_search) return null;
    return { ...input.suppliers_search, rfq_id: input.rfq_id };
  },
  getExistsComposite: (_data, input) => {
    return input.rfq_id ? { rfqId: input.rfq_id } : null;
  },
  getUpdateFilter: (_data, input) => ({ searchId: input.search_id }),
};

// ─── SUPPLIER ITEM STATUS (unified: search + quotation) ─

const TC_supplierItemStatus: TableWriteConfig = {
  table: 'supplierItemStatus',
  builder: buildSupplierItemStatusPayload,
  extract: (input) => {
    // Source 1: direct items_source (supplier_search flow)
    if (input.items_source?.length) {
      return input.items_source.map(item => ({ ...item, rfq_id: input.rfq_id }));
    }
    // Source 2: bidder proposals from rfq_items (quotation flow)
    const qd = input.quotationData;
    const items = qd?.rfq_items || qd?.quotation_items;
    if (!items?.length) return null;
    const withBidder = items.filter((item) => item.bidder_proposal && item.supplier_id);
    if (!withBidder.length) return null;
    return withBidder.map((item) => ({
      rfq_id: qd?.rfq_id || input.rfq_id,
      item_id: item.item_id,
      supplier_id: item.supplier_id,
      ...(item.bidder_proposal as Record<string, unknown>),
    }));
  },
  getExistsComposite: (data) => {
    const rfqId = data.rfq_id ? Number(data.rfq_id) : null;
    if (!rfqId) return null;
    const filter: Record<string, unknown> = { rfqId };
    if (data.item_id) filter.itemId = Number(data.item_id);
    if (data.supplier_id) filter.supplierId = Number(data.supplier_id);
    return filter;
  },
  getUpdateFilter: (data) => ({
    rfqId: Number(data.rfq_id),
    itemId: Number(data.item_id),
    supplierId: Number(data.supplier_id),
  }),
};

// ─── QUOTATION ─────────────────────────────────

const TC_quotations: TableWriteConfig = {
  table: 'quotations',
  builder: buildQuotationPayload,
  extract: (input) => {
    if (!input.quotationData) return null;
    return input.quotationData as unknown as Record<string, unknown>;
  },
  getExistsComposite: (_data, input) => {
    const quotationId = input.quotationData?.quotation_id;
    return quotationId ? { quotationId } : null;
  },
  getUpdateFilter: (_data, input) => ({ quotationId: input.quotationData!.quotation_id }),
  onInsert: (result, input) => {
    if (result?.quotationId && input.quotationData) {
      input.quotationData.quotation_id = result.quotationId as number;
    }
  },
};

const TC_userCompany: TableWriteConfig = {
  table: 'userCompany',
  builder: buildUserCompanyPayload,
  extract: (input) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const si = (input.quotationData as any)?.seller_info;
    if (!si) return null;
    return { company_name: si.company_name, company_address: si.address, company_fax: si.fax_number, company_email: si.email };
  },
  getExistsComposite: (_data, input) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qd = input.quotationData as any;
    const companyId = qd?.seller_info?.company_id ?? qd?.company_id;
    return companyId ? { companyId: Number(companyId) } : null;
  },
  getUpdateFilter: (_data, input) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qd = input.quotationData as any;
    const companyId = qd?.seller_info?.company_id ?? qd?.company_id;
    return companyId ? { companyId: Number(companyId) } : {};
  },
  updateOnly: true,
};

const TC_quotationPricing: TableWriteConfig = {
  table: 'quotationPricing',
  builder: buildPricingPayload,
  extract: (input) => {
    const cp = input.calculatedPricing?.calculated_pricing;
    if (!cp?.length || !input.quotationData?.quotation_id) return null;
    return cp.map(pricingItem => {
      const itemId = pricingItem.item_id ? Number(pricingItem.item_id) : null;
      let vars: Record<string, unknown> = {};
      if (Array.isArray(input.pricing_variables) && itemId) {
        vars = (input.pricing_variables.find(v => Number(v.item_id) === itemId) || {}) as Record<string, unknown>;
      }
      return {
        quotation_id: input.quotationData!.quotation_id,
        item_id: pricingItem.item_id,
        pricingVariables: vars,
        calculatedPricing: { calculated_pricing: [pricingItem] },
        exchange_currency: input.exchange_currency || 'VND',
      };
    });
  },
  getExistsComposite: (data) => {
    const quotationId = data.quotation_id ? Number(data.quotation_id) : null;
    if (!quotationId) return null;
    const filter: Record<string, unknown> = { quotationId };
    if (data.item_id) filter.itemId = parseInt(String(data.item_id));
    return filter;
  },
  getUpdateFilter: (data) => ({
    quotationId: Number(data.quotation_id),
    itemId: parseInt(String(data.item_id)),
  }),
};

const TC_quotationsTotal: TableWriteConfig = {
  table: 'quotations',
  builder: (_data) => ({ totalAmount: String(_data.total_amount) }),
  extract: (input) => {
    if (input.calculatedPricing?.total_amount == null || !input.quotationData?.quotation_id) return null;
    return { quotation_id: input.quotationData.quotation_id, total_amount: input.calculatedPricing.total_amount };
  },
  getExistsComposite: (data) => {
    const quotationId = Number(data.quotation_id);
    return quotationId ? { quotationId } : null;
  },
  getUpdateFilter: (data) => ({ quotationId: Number(data.quotation_id) }),
  updateOnly: true,
};

// ─── EMAIL ─────────────────────────────────────

const TC_email: TableWriteConfig = {
  table: 'emailTable',
  builder: buildEmailPayload,
  extract: (input) => {
    if (!input.email) return null;
    return { ...input.email, quotation_id: input.quotation_id, rfq_id: input.rfq_id };
  },
  getExistsComposite: (_data, input) => {
    if (!input.email_id || !input.quotation_id) return null;
    return { quotationId: input.quotation_id };
  },
  getUpdateFilter: (_data, input) => ({ emailId: input.email_id }),
};

// ─── INCOMING EMAIL ────────────────────────────

const TC_incomingEmail: TableWriteConfig = {
  table: 'incomingEmails',
  builder: buildIncomingEmailPayload,
  extract: (input) => {
    if (!input.incoming_email) return null;
    return { ...input.incoming_email, rfq_id: input.rfq_id };
  },
  getExistsComposite: (_data, input) => {
    return input.incoming_email_id ? { id: input.incoming_email_id } : null;
  },
  getUpdateFilter: (_data, input) => ({ id: input.incoming_email_id }),
};

// =============================================
// WRITE_MAP — data-driven table routing [data_type] → TableWriteConfig[]
// Each extract() self-gates on input presence — no action_type routing needed.
// =============================================

const WRITE_MAP: Record<string, TableWriteConfig[]> = {
  rfq_analysis:    [TC_rfqAnalysis, TC_rfqItems, TC_customers],
  supplier_search: [TC_supplierSearch, TC_supplierItemStatus],
  quotation:       [TC_quotations, TC_customers, TC_userCompany, TC_rfqItems, TC_supplierItemStatus, TC_quotationPricing, TC_quotationsTotal],
  email:           [TC_email],
  incoming_email:  [TC_incomingEmail],
};

// =============================================
// UNIFIED HANDLER — 3 Layers
// =============================================

async function handleWrite(
  configs: TableWriteConfig[],
  input: ModifyDatabaseInput,
  workspace: WorkspaceContext
): Promise<void> {
  for (const config of configs) {
    // Layer 1: Extract data
    const extracted = config.extract(input);
    if (extracted === null) continue;

    const items: Record<string, unknown>[] = Array.isArray(extracted) ? extracted : [extracted];

    for (const item of items) {
      // Layer 2: Check existence via composite filter
      let existing: Record<string, unknown>[] = [];
      const filter = config.getExistsComposite(item, input);
      if (filter !== null) {
        existing = await getData(config.table, filter, workspace) as Record<string, unknown>[];
      }

      if (existing.length > 0) {
        const updatePayload = config.builder(item, true);
        if (Object.keys(updatePayload).length === 0) continue;
        const updateFilter = config.getUpdateFilter(item, input);
        await updateData(config.table, updateFilter, updatePayload, workspace);
        console.log(`[DB] ${config.table} updated`);
        continue;
      }

      // Layer 3: Insert (skip if updateOnly)
      if (config.updateOnly) continue;

      const insertPayload = config.builder(item, false);
      if (Object.keys(insertPayload).length === 0) continue;
      const result = await insertData(config.table, {}, insertPayload, workspace);
      console.log(`[DB] ${config.table} inserted`);

      if (config.onInsert && result) {
        config.onInsert(result, input);
      }
    }
  }
}

// =============================================
// MAIN ENTRY POINT — modifyDatabase
// =============================================

export async function modifyDatabase(
  input: ModifyDatabaseInput,
  workspace: WorkspaceContext
): Promise<void> {
  const { data_type } = input;

  const configs = WRITE_MAP[data_type];
  if (!configs) {
    throw new Error(`[DB] Unknown data_type: "${data_type}". Available: ${Object.keys(WRITE_MAP).join(', ')}`);
  }

  console.log(`[DB] Writing ${data_type} → ${configs.map(c => c.table).join(', ')}`);
  await handleWrite(configs, input, workspace);
  console.log('[DB] Database modification completed');
}
