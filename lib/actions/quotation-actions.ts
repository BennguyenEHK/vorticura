// =============================================
// QUOTATION ACTIONS - Quotation Processor
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → route by action_type → pricing calc → save to DB → emit SSE → return ProcessorResult
// Supports: generate | update | manual_update | calculate

import { eventBus } from '@/lib/event-bus';
import { getData } from '@/lib/db/queries';
import { modifyDatabase, type ModifyDatabaseInput } from '@/lib/utils/databaseHandler';
import { pricingCalculator } from '@/lib/services/pricing/pricing-calculator';
import type { QuotationItem as PricingQuotationItem, PricingVariable } from '@/types/pricing';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';
import type { WorkspaceContext } from '@/lib/middleware/workspace-context';

// ---------------------------------------------
// Main Processor: Process Quotation
// ---------------------------------------------

/**
 * Process quotation based on action_type
 * @param input - Validated ProcessorInput (data_type: 'quotation')
 * @returns ProcessorResult with quotation data
 */
export async function processQuotation(input: ProcessorInput): Promise<ProcessorResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const { action_type, workspace } = input;
    let resultData: unknown;

    // ensure we have workspace context
    if (!workspace) {
      throw new Error('Missing workspace context');
    }

    // Route by action_type
    switch (action_type) {
      case 'generate':
      case 'update': {
        resultData = await handleGenerateOrUpdate(input, timestamp, workspace);
        break;
      }
      case 'manual_update': {
        resultData = await handleManualUpdate(input, timestamp, workspace);
        break;
      }
      case 'calculate': {
        resultData = await handleCalculate(input, timestamp, workspace);
        break;
      }
      default:
        throw new Error(`Unsupported quotation action_type: ${action_type}`);
    }

    // Build result
    const result: ProcessorResult = {
      success: true,
      data_type: 'quotation',
      action_type,
      status: 'completed',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      data: resultData,
      timestamp,
    };

    // Emit SSE for real-time preview update
    eventBus.emit('preview-update', result);

    return result;
  } catch (error) {
    console.error('[Quotation] Error:', error);

    const errorResult: ProcessorResult = {
      success: false,
      data_type: 'quotation',
      action_type: input.action_type,
      status: 'error',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Quotation processing failed',
      timestamp,
    };

    eventBus.emit('preview-update', errorResult);
    return errorResult;
  }
}

// ---------------------------------------------
// Generate / Update Handler
// ---------------------------------------------

/**
 * Handle generate and update action_types
 * - Reads quotation_data (items, customer_info, commercial_terms, seller_info)
 * - Optionally runs pricing calculator if pricing_variables present
 * - Saves multi-table via modifyDatabase
 * - Returns rfq_id and updated quotation_id from INSERT operation
 */
async function handleGenerateOrUpdate(
  input: ProcessorInput,
  timestamp: string,
  workspace: WorkspaceContext
): Promise<unknown> {
  const { quotation_data, pricing_variables, action_type, rfq_id } = input;

  if (!quotation_data) {
    throw new Error('quotation_data is required for generate/update');
  }

  // For update, quotation_id is required
  if (action_type === 'update' && !quotation_data.quotation_id) {
    throw new Error('quotation_data.quotation_id is required for update action');
  }

  // Transform validator's nested items to pricing calculator's flat format
  const pricingItems = transformItemsForPricing(quotation_data.quotation_items || []);

  // Run pricing calculator if pricing_variables are provided
  let calculatedPricing: ModifyDatabaseInput['calculatedPricing'];
  let pricingVarsForDB: Array<Record<string, unknown>> | undefined;

  if (pricing_variables && pricing_variables.length > 0) {
    // Transform pricing_variables to PricingVariable[] (ensure item_id is number, pass nulls verbatim)
    const typedVars: PricingVariable[] = pricing_variables.map(toPricingVariable);

    const pricingResult = pricingCalculator.calculateQuotationPricing(pricingItems, typedVars);

    calculatedPricing = {
      calculated_pricing: pricingResult.calculated_pricing as unknown as Array<Record<string, unknown>>,
      total_amount: pricingResult.total_amount,
    };

    pricingVarsForDB = typedVars as unknown as Array<Record<string, unknown>>;
  }

  // Build quotation data for DB
  const quotationData: ModifyDatabaseInput['quotationData'] = {
    quotation_id: quotation_data.quotation_id,
    rfq_id: rfq_id,
    rfq_reference: quotation_data.rfq_reference,
    commercial_terms: quotation_data.commercial_terms,
    quotation_status: action_type === 'generate' ? 'draft' : 'updated',
    customer_info: quotation_data.customer_info as unknown as Record<string, unknown>,
    quotation_items: quotation_data.quotation_items as unknown as Array<Record<string, unknown>>,
    generated_day: timestamp,
  };

  // Save to database (non-blocking, errors don't fail the response)
  try {
    await modifyDatabase({
      data_type: 'quotation',
      quotationData,
      calculatedPricing,
      pricing_variables: pricingVarsForDB,
    }, workspace);
  } catch (dbError) {
    console.error('[Quotation] DB save failed (non-blocking):', dbError);
  }

  // Return result data (rfq_id included so emitProcessorResult can update lastPreviewType + stage)
  return {
    rfq_id: rfq_id ?? null,
    quotation_id: quotationData.quotation_id ?? quotation_data.quotation_id ?? null,
    rfq_reference: quotation_data.rfq_reference,
    action_type,
    items: quotation_data.quotation_items,
    customer_info: quotation_data.customer_info,
    seller_info: (quotation_data as unknown as Record<string, unknown>).seller_info,
    commercial_terms: quotation_data.commercial_terms,
    calculated_pricing: calculatedPricing,
    generated_at: timestamp,
  };
}

// ---------------------------------------------
// Manual Update Handler
// ---------------------------------------------

/**
 * Handle manual_update action_type
 * - Reads modify_content with partial updates
 * - Applies direct overrides (no pricing recalculation)
 * - Saves partial data via modifyDatabase
 */
async function handleManualUpdate(
  input: ProcessorInput,
  timestamp: string,
  workspace: WorkspaceContext
): Promise<unknown> {
  const { quotation_id, modify_content, comments } = input;

  if (!quotation_id) {
    throw new Error('quotation_id is required for manual_update');
  }

  // Build partial quotation data for DB update
  const quotationData: ModifyDatabaseInput['quotationData'] = {
    quotation_id,
    quotation_status: 'manually_updated',
  };

  // Apply modify_content fields if present
  if (modify_content) {
    if (modify_content.customer_info) {
      quotationData.customer_info = modify_content.customer_info;
    }
    if (modify_content.quotation_items) {
      quotationData.quotation_items = modify_content.quotation_items;
    }
    if (modify_content.quotation_data) {
      // Merge quotation-level fields
      Object.assign(quotationData, modify_content.quotation_data);
    }
  }

  // Save to database (non-blocking)
  try {
    await modifyDatabase({
      data_type: 'quotation',
      quotationData,
    }, workspace);
  } catch (dbError) {
    console.error('[Quotation] DB save failed (non-blocking):', dbError);
  }

  return {
    quotation_id,
    action_type: 'manual_update',
    modify_content,
    comments,
    updated_at: timestamp,
  };
}

// ---------------------------------------------
// Transform Helpers
// ---------------------------------------------

/**
 * Transform validator's nested QuotationItem format to pricing calculator's flat format
 * Validator: { company_requirement: { qty }, bidder_proposal: { bidder_unit_price } }
 * Pricing:   { qty, bidder_unit_price, item_id, bidder_description, currency_code }
 */
function transformItemsForPricing(
  items: Array<Record<string, unknown>>
): PricingQuotationItem[] {
  return items.map((item, index) => {
    const companyReq = (item.company_requirement || {}) as Record<string, unknown>;
    const bidderProp = (item.bidder_proposal || {}) as Record<string, unknown>;

    return {
      item_id: item.item_id ? parseInt(String(item.item_id), 10) : index + 1,
      bidder_description: String(bidderProp.bidder_description || companyReq.company_description || ''),
      qty: Number(companyReq.qty || item.qty || 0),
      currency_code: (item.currency_code || 'USD') as PricingQuotationItem['currency_code'],
      bidder_unit_price: Number(bidderProp.bidder_unit_price || item.bidder_unit_price || 25),
    };
  });
}

interface RawPricingVariable {
  item_id: string | number;
  shipping_cost: number | null;
  exchange_rate: number | null;
  tax_rate: number | null;
  profit_rate: number | null;
  discount_rate?: number | null;
}

/** Normalize a pricing_variables entry to a typed PricingVariable, preserving nulls. */
function toPricingVariable(pv: RawPricingVariable): PricingVariable {
  return {
    item_id: typeof pv.item_id === 'string' ? parseInt(pv.item_id, 10) : Number(pv.item_id),
    shipping_cost: pv.shipping_cost,
    exchange_rate: pv.exchange_rate,
    tax_rate: pv.tax_rate,
    profit_rate: pv.profit_rate,
    discount_rate: pv.discount_rate ?? null,
  };
}

// ---------------------------------------------
// Calculate Handler
// ---------------------------------------------

async function handleCalculate(
  input: ProcessorInput,
  timestamp: string,
  workspace: WorkspaceContext
): Promise<unknown> {
  const { quotation_id, pricing_variables } = input;

  if (!quotation_id) throw new Error('quotation_id is required for calculate');
  if (!pricing_variables || pricing_variables.length === 0) throw new Error('pricing_variables is required for calculate');

  // Look up the quotation to get its rfq_id
  const quotationRows = await getData('quotations', { quotationId: quotation_id }, workspace);
  if (!quotationRows.length) throw new Error(`Quotation ${quotation_id} not found`);
  const quotationRow = quotationRows[0] as Record<string, unknown>;
  const rfq_id = Number(quotationRow.rfqId);

  // Load rfq items and ordered supplier statuses
  const [rfqItemRows, supplierRows] = await Promise.all([
    getData('rfqItems', { rfqId: rfq_id }, workspace),
    getData('supplierItemStatus', { rfqId: rfq_id, status: 'ordered' }, workspace),
  ]);

  // Index ordered supplier by itemId (first match wins)
  const supplierByItem = new Map<number, Record<string, unknown>>();
  for (const s of supplierRows as Array<Record<string, unknown>>) {
    const id = Number(s.itemId);
    if (!supplierByItem.has(id)) supplierByItem.set(id, s);
  }

  // Build PricingQuotationItem[] — currency_code and bidder_unit_price from ordered supplier
  const items: PricingQuotationItem[] = (rfqItemRows as Array<Record<string, unknown>>).map(row => {
    const itemId = Number(row.itemId);
    const supplier = supplierByItem.get(itemId);
    return {
      item_id: itemId,
      bidder_description: String(supplier?.bidderDescription ?? row.companyDescription ?? ''),
      qty: Number(row.qty ?? 1),
      currency_code: String(supplier?.currencyCode ?? 'USD') as PricingQuotationItem['currency_code'],
      bidder_unit_price: supplier?.bidderUnitPrice ? Number(supplier.bidderUnitPrice) : 25,
    };
  });

  const typedVars: PricingVariable[] = pricing_variables.map(toPricingVariable);

  const pricingResult = pricingCalculator.calculateQuotationPricing(items, typedVars);

  // Persist via modifyDatabase (non-blocking)
  try {
    await modifyDatabase({
      data_type: 'quotation',
      quotationData: { quotation_id, rfq_id },
      calculatedPricing: {
        calculated_pricing: pricingResult.calculated_pricing as unknown as Array<Record<string, unknown>>,
        total_amount: pricingResult.total_amount,
      },
      pricing_variables: typedVars as unknown as Array<Record<string, unknown>>,
    }, workspace);
  } catch (dbError) {
    console.error('[Quotation] DB save failed (non-blocking):', dbError);
  }

  return {
    rfq_id,
    quotation_id,
    action_type: 'calculate',
    calculated_pricing: pricingResult.calculated_pricing,
    total_amount: pricingResult.total_amount,
    total_profit: pricingResult.total_profit,
    errors: pricingResult.errors,
    calculated_at: timestamp,
  };
}
