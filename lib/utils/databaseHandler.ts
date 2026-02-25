// =============================================
// DATABASE HANDLER - Unified via queries.ts
// =============================================
// Unified database operations with typed payload builders
// - Build payload functions for all table types (only available fields)
// - Check data existence with flexible key lookup
// - Unified modifyDatabase function for INSERT/UPDATE
// - All DB calls routed through queries.ts for workspace isolation
// - Supports: quotations, quotation_items, customers, quotation_pricing,
//             email_table, rfq_analysis, supplier_search
// Reference: make_sales_sse_server/api/quotation/database-handler.js

import { insertData, getData, updateData } from '@/lib/db/queries';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

// =============================================
// Types
// =============================================

/** Generic record type for payload building (cast to table-specific types at call site) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = Record<string, any>;

/** Input shape for modifyDatabase - flexible JSON from processors */
export interface ModifyDatabaseInput {
  data_type: string;               // quotation | email | rfq_analysis | supplier_search
  quotation_id?: number;           // Top-level quotation ID (for non-quotation types)
  rfq_reference?: string;          // RFQ reference string
  exchange_currency?: string;      // Target currency for pricing
  // Quotation-specific
  quotationData?: {
    quotation_id?: number;
    rfq_reference?: string;
    quotation_name?: string;
    quotation_html?: string;
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
  analysis_id?: number;
  // Supplier Search-specific
  suppliers_search?: Record<string, unknown>;
  search_id?: number;
}

// =============================================
// PAYLOAD BUILDERS
// =============================================
// Each builder maps input -> database columns, only including present fields.
// `update` flag excludes PK/FK columns (used in WHERE clause, not SET).

/**
 * Build quotation payload for QUOTATIONS table
 * @param data - Input quotation data
 * @param update - Exclude PK/FK for UPDATE operations
 */
export function buildQuotationPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  if (!update && data.quotation_id != null) payload.quotationId = data.quotation_id;
  if (data.rfq_reference != null) payload.rfqReference = String(data.rfq_reference);
  if (data.quotation_name != null) payload.quotationName = String(data.quotation_name);
  if (data.quotation_html != null) payload.quotationHtml = String(data.quotation_html);
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
 * @param data - Input item data
 * @param update - Exclude PK/FK for UPDATE operations
 */
export function buildQuotationItemsPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  // PK/FK - exclude on UPDATE
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
 * @param data - Input data (expects customer_info nested object)
 * @param update - Exclude PK/FK for UPDATE operations
 */
export function buildCustomerPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};
  const ci = (data.customer_info || {}) as Record<string, unknown>;

  if (!update && data.quotation_id != null) payload.quotationId = data.quotation_id;
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
 * @param data - Input containing pricingVariables + calculatedPricing
 * @param update - Exclude PK/FK for UPDATE operations
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
 * @param data - Input email data (flat, pre-merged with top-level fields)
 * @param update - Exclude PK/FK for UPDATE operations
 */
export function buildEmailPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  if (!update && data.quotation_id != null) payload.quotationId = data.quotation_id;
  if (!update && data.email_id != null) payload.emailId = data.email_id;
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
 * @param data - Input analysis data (flat, pre-merged with top-level fields)
 * @param update - Exclude PK/FK for UPDATE operations
 */
export function buildRfqAnalysisPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  if (!update && data.quotation_id != null) payload.quotationId = data.quotation_id;
  if (!update && data.analysis_id != null) payload.analysisId = data.analysis_id;
  if (data.rfq_reference != null) payload.rfqReference = String(data.rfq_reference);
  if (data.subject != null) payload.subject = String(data.subject);
  if (data.analysis_content != null) payload.analysisContent = String(data.analysis_content);
  if (data.analysis_status != null) payload.analysisStatus = String(data.analysis_status);

  return payload;
}

/**
 * Build supplier search payload for SUPPLIER_SEARCH table
 * @param data - Input search data (flat, pre-merged with top-level fields)
 * @param update - Exclude PK/FK for UPDATE operations
 */
export function buildSupplierSearchPayload(data: Record<string, unknown>, update = false): Payload {
  const payload: Payload = {};

  if (!update && data.quotation_id != null) payload.quotationId = data.quotation_id;
  if (!update && data.search_id != null) payload.searchId = data.search_id;
  if (data.rfq_reference != null) payload.rfqReference = String(data.rfq_reference);
  if (data.subject != null) payload.subject = String(data.subject);
  if (data.search_content != null) payload.searchContent = String(data.search_content);
  if (data.search_status != null) payload.searchStatus = String(data.search_status);

  return payload;
}

/**
 * Build client company payload for CLIENT_COMPANY table
 * @param data - Input company data
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

// =============================================
// CHECK DATA EXISTENCE
// =============================================

/**
 * Check if data exists in a table by quotation_id (or company_id for client_company)
 * Uses getData from queries.ts for workspace-isolated lookups
 * @param table - Table name string for routing (snake_case mapped to camelCase)
 * @param keysId - Primary key value to search
 * @param workspace - Workspace context for tenant filtering (required)
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
    };

    const tableName = tableNameMap[table];
    if (!tableName) {
      console.warn(`checkDataExists: unknown table "${table}", falling back to quotations`);
      return await getData('quotations', { quotationId: keysId }, workspace) as Record<string, unknown>[];
    }

    // client_company uses companyId as its lookup key
    const filterColumn = table === 'client_company' ? 'companyId' : 'quotationId';

    return await getData(tableName, { [filterColumn]: keysId }, workspace) as Record<string, unknown>[];
  } catch (error) {
    console.error(`Error checking data existence in ${table}:`, error);
    return []; // Return empty on error (assume not exists)
  }
}

// =============================================
// UNIFIED DATABASE MODIFICATION (INSERT/UPDATE)
// =============================================

/**
 * Unified database modification function
 * Routes by data_type -> checks existence -> INSERT or UPDATE
 * Handles quotation (multi-table) and single-table types
 * All DB operations go through queries.ts (insertData/updateData/getData)
 * @param input - Structured input with data_type and content
 * @param workspace - Workspace context for tenant isolation (required)
 */
export async function modifyDatabase(
  input: ModifyDatabaseInput,
  workspace: WorkspaceContext
): Promise<void> {
  try {
    console.log(`[DB] Starting modification for data_type: ${input.data_type}`);

    // ========== QUOTATION DATA TYPE ==========
    if (input.data_type === 'quotation' && input.quotationData) {
      const qd = input.quotationData;

      // STEP 1: QUOTATIONS table
      if (qd.quotation_id) {
        const existing = await checkDataExists('quotations', qd.quotation_id, workspace);
        if (existing.length > 0) {
          // UPDATE - exclude PK
          const payload = buildQuotationPayload(qd as unknown as Record<string, unknown>, true);
          await updateData('quotations', { quotationId: qd.quotation_id }, payload, workspace);
          console.log(`[DB] Quotation updated: ${qd.quotation_id}`);
        } else {
          // INSERT with provided ID
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

      // STEP 2: CUSTOMERS table
      if (qd.customer_info && qd.quotation_id) {
        const existingCustomer = await checkDataExists('customers', qd.quotation_id, workspace);
        if (existingCustomer.length > 0) {
          const payload = buildCustomerPayload(qd as unknown as Record<string, unknown>, true);
          await updateData('customers', { quotationId: qd.quotation_id }, payload, workspace);
          console.log(`[DB] Customer updated for quotation: ${qd.quotation_id}`);
        } else {
          const payload = buildCustomerPayload(qd as unknown as Record<string, unknown>, false);
          await insertData('customers', {}, payload, workspace);
          console.log(`[DB] Customer inserted for quotation: ${qd.quotation_id}`);
        }
      }

      // STEP 3: QUOTATION_ITEMS table (iterate each item)
      if (qd.quotation_items && qd.quotation_items.length > 0 && qd.quotation_id) {
        for (const item of qd.quotation_items) {
          const itemId = item.item_id ? parseInt(String(item.item_id), 10) : null;
          let shouldInsert = true;

          // Check existence by item_id + quotation_id (composite key)
          if (itemId) {
            const existingItem = await getData(
              'quotationItems',
              { quotationId: qd.quotation_id!, itemId },
              workspace
            );

            if (existingItem.length > 0) {
              // UPDATE existing item
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
            // INSERT new item
            const itemData: Record<string, unknown> = { ...item, quotation_id: qd.quotation_id };
            if (itemId) itemData.item_id = itemId;
            const payload = buildQuotationItemsPayload(itemData, false);
            await insertData('quotationItems', {}, payload, workspace);
            console.log(`[DB] Item inserted ${itemId ? `(id: ${itemId})` : '(auto-ID)'}`);
          }
        }
      }

      // STEP 4: QUOTATION_PRICING table (per-item pricing)
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

    // ========== EMAIL DATA TYPE ==========
    if (input.data_type === 'email' && input.email) {
      const emailPayload = buildEmailPayload({
        ...input.email,
        quotation_id: input.quotation_id,
        rfq_reference: input.rfq_reference,
      });

      let shouldInsert = true;

      // Check existence by email_id
      if (input.email_id && input.quotation_id) {
        const existing = await checkDataExists('email_table', input.quotation_id, workspace);
        if (existing.length > 0) {
          await updateData('emailTable', { emailId: input.email_id }, emailPayload, workspace);
          console.log(`[DB] Email updated: ${input.email_id}`);
          shouldInsert = false;
        }
      }

      if (shouldInsert) {
        await insertData('emailTable', {}, emailPayload, workspace);
        console.log(`[DB] Email inserted`);
      }
    }

    // ========== RFQ ANALYSIS DATA TYPE ==========
    if (input.data_type === 'rfq_analysis' && input.rfq_analysis) {
      const analysisPayload = buildRfqAnalysisPayload({
        ...input.rfq_analysis,
        quotation_id: input.quotation_id,
        rfq_reference: input.rfq_reference,
      });

      let shouldInsert = true;

      if (input.analysis_id && input.quotation_id) {
        const existing = await checkDataExists('rfq_analysis', input.quotation_id, workspace);
        if (existing.length > 0) {
          await updateData('rfqAnalysis', { analysisId: input.analysis_id }, analysisPayload, workspace);
          console.log(`[DB] RFQ analysis updated: ${input.analysis_id}`);
          shouldInsert = false;
        }
      }

      if (shouldInsert) {
        await insertData('rfqAnalysis', {}, analysisPayload, workspace);
        console.log(`[DB] RFQ analysis inserted`);
      }
    }

    // ========== SUPPLIER SEARCH DATA TYPE ==========
    if (input.data_type === 'supplier_search' && input.suppliers_search) {
      const searchPayload = buildSupplierSearchPayload({
        ...input.suppliers_search,
        quotation_id: input.quotation_id,
        rfq_reference: input.rfq_reference,
      });

      let shouldInsert = true;

      if (input.search_id && input.quotation_id) {
        const existing = await checkDataExists('supplier_search', input.quotation_id, workspace);
        if (existing.length > 0) {
          await updateData('supplierSearch', { searchId: input.search_id }, searchPayload, workspace);
          console.log(`[DB] Supplier search updated: ${input.search_id}`);
          shouldInsert = false;
        }
      }

      if (shouldInsert) {
        await insertData('supplierSearch', {}, searchPayload, workspace);
        console.log(`[DB] Supplier search inserted`);
      }
    }

    console.log('[DB] Database modification completed');
  } catch (error) {
    console.error('[DB] Error in modifyDatabase:', error);
    throw error; // Re-throw for caller to handle
  }
}
