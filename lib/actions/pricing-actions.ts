// =============================================
// PRICING ACTIONS - Price Calculation Server Actions
// =============================================
// Server actions for pricing operations:
// - Receive user input pricing variables
// - Calculate prices using pricing-calculator service
// - Store results in database
// - Return data for PreviewPanel display

'use server';

import { createClient } from '@supabase/supabase-js';
import type {
  ActionResult,
  PricingInput,
  PricingOutput,
  CalculatedItem,
} from '@/lib/types/workflow';
import { PricingInputSchema } from '@/lib/types/workflow';
import { pricingCalculator } from '@/lib/services/pricing/pricing-calculator';
import type {
  QuotationItem as PricingQuotationItem,
  PricingVariable,
  CalculatedPricing,
} from '@/types/pricing';
import type { QuotationItem as WorkflowQuotationItem } from '@/lib/types/workflow';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** Supabase client for database operations */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------
// Main Action: Calculate Pricing
// ---------------------------------------------

/**
 * Calculate pricing for quotation items
 * @param input - Pricing input with variables
 * @returns ActionResult with calculated pricing
 */
export async function calculatePricing(
  input: PricingInput
): Promise<ActionResult<PricingOutput>> {
  const timestamp = new Date().toISOString();

  try {
    // Validate input using Zod schema
    const validationResult = PricingInputSchema.safeParse(input);
    if (!validationResult.success) {
      return {
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
        timestamp,
        stepId: 'pricing',
        rfqId: input.rfqId,
      };
    }

    // Get quotation items from database
    const { data: quotation, error: fetchError } = await supabase
      .from('quotations')
      .select('items, currency')
      .eq('id', input.quotationId)
      .single();

    if (fetchError || !quotation) {
      throw new Error('Quotation not found');
    }

    // Items from database are in workflow format
    const workflowItems = quotation.items as WorkflowQuotationItem[];

    // Transform input variables to pricing calculator format
    const pricingVariables: PricingVariable[] = input.variables.map((v) => ({
      item_id: v.itemId,
      shipping_cost: v.shippingCost,
      tax_rate: v.taxRate,
      exchange_rate: v.exchangeRate,
      profit_rate: v.profitRate,
      discount_rate: v.discountRate,
    }));

    // Transform workflow items to pricing calculator format
    const quotationItems: PricingQuotationItem[] = workflowItems.map((item) => ({
      item_id: item.itemId,
      bidder_description: item.description,
      qty: item.quantity,
      currency_code: item.currency as 'VND' | 'USD' | 'EUR' | 'JPY',
      bidder_unit_price: item.unitPrice,
    }));

    // Calculate pricing using existing pricing calculator service
    const calcResult = pricingCalculator.calculateQuotationPricing(
      quotationItems,
      pricingVariables
    );

    if (!calcResult.calculation_success) {
      throw new Error(calcResult.errors?.[0]?.error || 'Calculation failed');
    }

    // Transform to output format
    const calculatedItems: CalculatedItem[] = calcResult.calculated_pricing.map(
      (calc: CalculatedPricing) => ({
        itemId: calc.item_id,
        salesUnitPrice: calc.sales_unit_price,
        extendedPrice: calc.ext_price,
        potentialProfit: calc.potential_profit,
      })
    );

    const output: PricingOutput = {
      rfqId: input.rfqId,
      quotationId: input.quotationId,
      calculatedItems,
      totalAmount: calcResult.total_amount,
      totalProfit: calcResult.total_profit,
      currency: input.targetCurrency,
      calculatedAt: timestamp,
    };

    // Store pricing result in database
    await storePricingResult(input, output, timestamp);

    return {
      success: true,
      data: output,
      timestamp,
      stepId: 'pricing',
      rfqId: input.rfqId,
    };

  } catch (error) {
    console.error('[Pricing] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Pricing calculation failed',
      timestamp,
      stepId: 'pricing',
      rfqId: input.rfqId,
    };
  }
}

// ---------------------------------------------
// Database Storage
// ---------------------------------------------

/**
 * Store pricing result in database
 */
async function storePricingResult(
  input: PricingInput,
  output: PricingOutput,
  timestamp: string
): Promise<void> {
  // Store variables
  const { error: varError } = await supabase
    .from('pricing_variables')
    .upsert({
      quotation_id: input.quotationId,
      rfq_id: input.rfqId,
      variables: input.variables,
      updated_at: timestamp,
    });

  if (varError) {
    console.error('[Pricing] Failed to store variables:', varError);
  }

  // Store calculated result
  const { error: resultError } = await supabase
    .from('pricing_results')
    .upsert({
      quotation_id: input.quotationId,
      rfq_id: input.rfqId,
      calculated_items: output.calculatedItems,
      total_amount: output.totalAmount,
      total_profit: output.totalProfit,
      currency: output.currency,
      calculated_at: timestamp,
    });

  if (resultError) {
    console.error('[Pricing] Failed to store result:', resultError);
  }
}

// ---------------------------------------------
// Helper Actions
// ---------------------------------------------

/**
 * Get pricing result for a quotation
 * @param quotationId - Quotation identifier
 */
export async function getPricingResult(
  quotationId: string,
  rfqId: string
): Promise<ActionResult<PricingOutput | null>> {
  const timestamp = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from('pricing_results')
      .select('*')
      .eq('quotation_id', quotationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          success: true,
          data: null,
          timestamp,
          stepId: 'pricing',
          rfqId,
        };
      }
      throw error;
    }

    const output: PricingOutput = {
      rfqId: data.rfq_id,
      quotationId: data.quotation_id,
      calculatedItems: data.calculated_items as CalculatedItem[],
      totalAmount: data.total_amount,
      totalProfit: data.total_profit,
      currency: data.currency,
      calculatedAt: data.calculated_at,
    };

    return {
      success: true,
      data: output,
      timestamp,
      stepId: 'pricing',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get pricing',
      timestamp,
      stepId: 'pricing',
      rfqId,
    };
  }
}

/**
 * Get saved pricing variables for a quotation
 * @param quotationId - Quotation identifier
 */
export async function getPricingVariables(
  quotationId: string,
  rfqId: string
): Promise<ActionResult<PricingInput['variables'] | null>> {
  const timestamp = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from('pricing_variables')
      .select('variables')
      .eq('quotation_id', quotationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          success: true,
          data: null,
          timestamp,
          stepId: 'pricing',
          rfqId,
        };
      }
      throw error;
    }

    return {
      success: true,
      data: data.variables as PricingInput['variables'],
      timestamp,
      stepId: 'pricing',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get variables',
      timestamp,
      stepId: 'pricing',
      rfqId,
    };
  }
}

/**
 * Save pricing variables without calculating
 * @param input - Pricing input with variables only
 */
export async function savePricingVariables(
  input: Omit<PricingInput, 'targetCurrency'> & { targetCurrency?: string }
): Promise<ActionResult<{ saved: boolean }>> {
  const timestamp = new Date().toISOString();

  try {
    const { error } = await supabase
      .from('pricing_variables')
      .upsert({
        quotation_id: input.quotationId,
        rfq_id: input.rfqId,
        variables: input.variables,
        target_currency: input.targetCurrency,
        updated_at: timestamp,
      });

    if (error) throw error;

    return {
      success: true,
      data: { saved: true },
      timestamp,
      stepId: 'pricing',
      rfqId: input.rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save variables',
      timestamp,
      stepId: 'pricing',
      rfqId: input.rfqId,
    };
  }
}

/**
 * Apply bulk update to pricing variables
 * @param quotationId - Quotation identifier
 * @param itemIds - Items to update
 * @param field - Field to update
 * @param value - New value
 */
export async function bulkUpdatePricingVariable(
  quotationId: string,
  rfqId: string,
  itemIds: number[],
  field: keyof PricingInput['variables'][0],
  value: number
): Promise<ActionResult<{ updatedCount: number }>> {
  const timestamp = new Date().toISOString();

  try {
    // Get existing variables
    const { data, error: fetchError } = await supabase
      .from('pricing_variables')
      .select('variables')
      .eq('quotation_id', quotationId)
      .single();

    if (fetchError) throw fetchError;

    // Update specified items
    const variables = (data.variables as PricingInput['variables']).map((v) => {
      if (itemIds.includes(v.itemId)) {
        return { ...v, [field]: value };
      }
      return v;
    });

    // Save back
    const { error: updateError } = await supabase
      .from('pricing_variables')
      .update({ variables, updated_at: timestamp })
      .eq('quotation_id', quotationId);

    if (updateError) throw updateError;

    return {
      success: true,
      data: { updatedCount: itemIds.length },
      timestamp,
      stepId: 'pricing',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Bulk update failed',
      timestamp,
      stepId: 'pricing',
      rfqId,
    };
  }
}

/**
 * Reset pricing variables to defaults
 * @param quotationId - Quotation identifier
 */
export async function resetPricingVariables(
  quotationId: string,
  rfqId: string
): Promise<ActionResult<void>> {
  const timestamp = new Date().toISOString();

  try {
    // Delete existing variables (will use defaults on next calculation)
    const { error } = await supabase
      .from('pricing_variables')
      .delete()
      .eq('quotation_id', quotationId);

    if (error) throw error;

    return {
      success: true,
      timestamp,
      stepId: 'pricing',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Reset failed',
      timestamp,
      stepId: 'pricing',
      rfqId,
    };
  }
}
