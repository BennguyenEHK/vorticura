// =============================================
// PRICING ACTIONS - Price Calculation Server Actions
// =============================================
// Server actions for pricing operations:
// - Receive user input pricing variables
// - Calculate prices using pricing-calculator service
// - Return data for PreviewPanel display

'use server';

import type {
  ActionResult,
  PricingInput,
  PricingOutput,
  CalculatedItem,
} from '@/types/workflow';
import type { QuotationItem as WorkflowQuotationItem } from '@/types/workflow';
import { PricingInputSchema } from '@/types/workflow';
import { pricingCalculator } from '@/lib/services/pricing/pricing-calculator';
import type {
  QuotationItem as PricingQuotationItem,
  PricingVariable,
  CalculatedPricing,
} from '@/types/pricing';

// ---------------------------------------------
// In-Memory Storage (Development)
// ---------------------------------------------
// TODO: Replace with database when DB layer is implemented

const pricingVariablesStore = new Map<string, PricingInput['variables']>();
const pricingResultsStore = new Map<string, PricingOutput>();
const quotationItemsStore = new Map<string, WorkflowQuotationItem[]>();

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

    // Get quotation items from memory store (TODO: replace with DB)
    const workflowItems = quotationItemsStore.get(input.quotationId);

    if (!workflowItems || workflowItems.length === 0) {
      // Use mock data for development
      console.warn('[Pricing] No items found, using mock data');
      const mockItems = generateMockItems();
      quotationItemsStore.set(input.quotationId, mockItems);
    }

    const items = quotationItemsStore.get(input.quotationId)!;

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
    const quotationItems: PricingQuotationItem[] = items.map((item) => ({
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

    // Store in memory (TODO: replace with DB)
    pricingVariablesStore.set(input.quotationId, input.variables);
    pricingResultsStore.set(input.quotationId, output);

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
// Mock Data (Development)
// ---------------------------------------------

/**
 * Generate mock quotation items for development
 */
function generateMockItems(): WorkflowQuotationItem[] {
  return [
    {
      itemId: 1,
      description: 'Industrial Bearing XYZ-100',
      quantity: 100,
      unitPrice: 50000,
      currency: 'VND',
    },
    {
      itemId: 2,
      description: 'Hydraulic Seal Kit HS-200',
      quantity: 50,
      unitPrice: 75000,
      currency: 'VND',
    },
    {
      itemId: 3,
      description: 'Steel Pipe DN100 - 6m length',
      quantity: 50,
      unitPrice: 125,
      currency: 'USD',
    },
    {
      itemId: 4,
      description: 'Gate Valve DN100 PN16',
      quantity: 20,
      unitPrice: 450,
      currency: 'USD',
    },
    {
      itemId: 5,
      description: 'Flange DN100 PN16 (pair)',
      quantity: 100,
      unitPrice: 35,
      currency: 'USD',
    },
  ];
}

// ---------------------------------------------
// Set Quotation Items (for store integration)
// ---------------------------------------------

/**
 * Set quotation items in memory store
 * Called from client to populate items before calculation
 * @param quotationId - Quotation identifier
 * @param items - Array of quotation items
 */
export async function setQuotationItems(
  quotationId: string,
  items: WorkflowQuotationItem[]
): Promise<ActionResult<{ set: boolean }>> {
  const timestamp = new Date().toISOString();

  try {
    quotationItemsStore.set(quotationId, items);

    return {
      success: true,
      data: { set: true },
      timestamp,
      stepId: 'pricing',
      rfqId: `rfq-${quotationId}`,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set items',
      timestamp,
      stepId: 'pricing',
      rfqId: `rfq-${quotationId}`,
    };
  }
}

// ---------------------------------------------
// Helper Actions
// ---------------------------------------------

/**
 * Get pricing result for a quotation
 * @param quotationId - Quotation identifier
 * @param rfqId - RFQ identifier
 */
export async function getPricingResult(
  quotationId: string,
  rfqId: string
): Promise<ActionResult<PricingOutput | null>> {
  const timestamp = new Date().toISOString();

  try {
    const result = pricingResultsStore.get(quotationId);

    return {
      success: true,
      data: result || null,
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
 * @param rfqId - RFQ identifier
 */
export async function getPricingVariables(
  quotationId: string,
  rfqId: string
): Promise<ActionResult<PricingInput['variables'] | null>> {
  const timestamp = new Date().toISOString();

  try {
    const variables = pricingVariablesStore.get(quotationId);

    return {
      success: true,
      data: variables || null,
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
    pricingVariablesStore.set(input.quotationId, input.variables);

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
 * Reset pricing variables to defaults
 * @param quotationId - Quotation identifier
 * @param rfqId - RFQ identifier
 */
export async function resetPricingVariables(
  quotationId: string,
  rfqId: string
): Promise<ActionResult<void>> {
  const timestamp = new Date().toISOString();

  try {
    pricingVariablesStore.delete(quotationId);
    pricingResultsStore.delete(quotationId);

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
