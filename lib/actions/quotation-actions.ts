// =============================================
// QUOTATION ACTIONS - Quotation Processor
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → route by action_type → pricing calc → save to DB → emit SSE → return ProcessorResult
// Supports: generate | update | manual_update

import { eventBus } from '@/lib/event-bus';
import { modifyDatabase, type ModifyDatabaseInput } from '@/lib/utils/databaseHandler';
import { pricingCalculator } from '@/lib/services/pricing/pricing-calculator';
import type { QuotationItem as PricingQuotationItem, PricingVariable } from '@/types/pricing';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';

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
    const { action_type } = input;
    let resultData: unknown;

    // Route by action_type
    switch (action_type) {
      case 'generate':
      case 'update': {
        resultData = await handleGenerateOrUpdate(input, timestamp);
        break;
      }
      case 'manual_update': {
        resultData = await handleManualUpdate(input, timestamp);
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
 * - Reads quotation_data (items, customer_info, commercial_terms)
 * - Optionally runs pricing calculator if pricing_variables present
 * - Saves multi-table via modifyDatabase
 */
async function handleGenerateOrUpdate(
  input: ProcessorInput,
  timestamp: string
): Promise<unknown> {
  const { quotation_data, pricing_variables, action_type } = input;

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
    // Transform pricing_variables to PricingVariable[] (ensure item_id is number)
    const typedVars: PricingVariable[] = pricing_variables.map((pv) => ({
      item_id: typeof pv.item_id === 'string' ? parseInt(pv.item_id, 10) : Number(pv.item_id),
      shipping_cost: pv.shipping_cost,
      exchange_rate: pv.exchange_rate,
      tax_rate: pv.tax_rate,
      profit_rate: pv.profit_rate,
      discount_rate: pv.discount_rate ?? 0,
    }));

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
    });
  } catch (dbError) {
    console.error('[Quotation] DB save failed (non-blocking):', dbError);
  }

  // Return result data
  return {
    quotation_id: quotation_data.quotation_id,
    rfq_reference: quotation_data.rfq_reference,
    action_type,
    items: quotation_data.quotation_items,
    customer_info: quotation_data.customer_info,
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
  timestamp: string
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
    });
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
      bidder_unit_price: Number(bidderProp.bidder_unit_price || item.bidder_unit_price || 0),
    };
  });
}
