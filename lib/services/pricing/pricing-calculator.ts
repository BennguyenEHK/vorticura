// =============================================
// PRICING CALCULATOR - Core calculation engine
// =============================================
// Implements the pricing formula for quotation items
// Formula:
//   actual_unit_price = ((unit_price + shipping_cost) × tax_rate) × exchange_rate
//   profit_unit_price = actual_unit_price × profit_rate
//   sales_unit_price = profit_unit_price - (profit_unit_price × discount_rate)
//   potential_profit = (profit_unit_price - actual_unit_price) × qty

import type {
  QuotationItem,
  PricingVariable,
  ResolvedPricingVariable,
  CalculatedPricing,
  CalculatePricingResponse,
  PricingError,
} from '@/types/pricing';
import { DEFAULT_PRICING_VARIABLES, resolvePricingVariable } from '@/types/pricing';
import { validateQuotationItem, validatePricingVariable } from './validation';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** Rounding configuration for prices */
const ROUNDING_CONFIG = {
  roundToNearest: 1000,   // Round to nearest 1000 VND
  minimumPrice: 1000,     // Minimum price (1000 VND)
};

// ---------------------------------------------
// Pricing Calculator Class
// ---------------------------------------------

/**
 * PricingCalculator - Core calculation engine for quotation pricing
 */
export class PricingCalculator {
  /**
   * Calculate pricing for a single item
   * @param item - Quotation item with base price and quantity
   * @param variables - Pricing variables (shipping, tax, etc.)
   * @returns Calculated pricing result
   */
  /**
   * Accepts nullable (ghost-mode) or fully-resolved variables. Any null field
   * is substituted with the system default just-in-time, so the calculator
   * itself only ever operates on numbers.
   */
  calculateItemPricing(
    item: QuotationItem,
    variables: PricingVariable | ResolvedPricingVariable
  ): CalculatedPricing {
    const resolved = resolvePricingVariable(variables as PricingVariable);
    const unitPrice = item.bidder_unit_price;
    const qty = item.qty;

    // STEP 1: Calculate actual unit price (cost price after all additions)
    // Formula: ((unit_price + shipping_cost) × tax_rate) × exchange_rate
    const withShipping = unitPrice + resolved.shipping_cost;
    const withTax = withShipping * resolved.tax_rate;
    const actualUnitPrice = withTax * resolved.exchange_rate;

    // STEP 2: Calculate profit unit price
    // Formula: actual_unit_price × profit_rate
    const profitUnitPrice = actualUnitPrice * resolved.profit_rate;

    // STEP 3: Apply discount to get final sales price
    // Formula: profit_unit_price - (profit_unit_price × discount_rate)
    const discountAmount = profitUnitPrice * resolved.discount_rate;
    const salesUnitPrice = Math.round(profitUnitPrice - discountAmount);

    // STEP 4: Calculate extended price and potential profit
    const extPrice = this.roundPrice(salesUnitPrice * qty);
    const potentialProfit = (Math.round(profitUnitPrice) - Math.round(actualUnitPrice)) * qty;

    return {
      item_id: item.item_id,
      sales_unit_price: salesUnitPrice,
      ext_price: extPrice,
      potential_profit: potentialProfit,
      calculation_timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate pricing for multiple items
   * @param items - Array of quotation items
   * @param variables - Array of pricing variables (must match items by item_id)
   * @returns Complete calculation response
   */
  calculateQuotationPricing(
    items: QuotationItem[],
    variables: PricingVariable[]
  ): CalculatePricingResponse {
    const calculatedPricing: CalculatedPricing[] = [];
    const errors: PricingError[] = [];
    let totalAmount = 0;
    let totalProfit = 0;

    // Build lookup map for O(1) variable access
    const variablesMap = new Map<number, PricingVariable>(
      variables.map(v => [v.item_id, v])
    );

    // Process each item
    for (const item of items) {
      try {
        // Validate item
        const itemValidation = validateQuotationItem(item);
        if (!itemValidation.isValid) {
          errors.push({
            item_id: item.item_id,
            error: itemValidation.error || 'Invalid item',
          });
          continue;
        }

        // Get variables for this item (use ghost defaults if not found).
        // Defaults are substituted just-in-time by resolvePricingVariable.
        let itemVariables = variablesMap.get(item.item_id);
        if (!itemVariables) {
          itemVariables = {
            item_id: item.item_id,
            shipping_cost: null,
            tax_rate: null,
            exchange_rate: null,
            profit_rate: null,
            discount_rate: null,
          };
        }

        // Validate variables (validator already resolves nulls to defaults).
        const varValidation = validatePricingVariable(itemVariables);
        if (!varValidation.isValid) {
          errors.push({
            item_id: item.item_id,
            error: varValidation.error || 'Invalid variables',
          });
          continue;
        }

        // Calculate pricing
        const result = this.calculateItemPricing(item, itemVariables);
        calculatedPricing.push(result);
        totalAmount += result.ext_price;
        totalProfit += result.potential_profit;

      } catch (error) {
        errors.push({
          item_id: item.item_id,
          error: error instanceof Error ? error.message : 'Calculation error',
        });
      }
    }

    // Round totals
    totalAmount = this.roundPrice(totalAmount);

    return {
      calculation_success: errors.length === 0,
      total_items: calculatedPricing.length,
      calculated_pricing: calculatedPricing,
      total_amount: totalAmount,
      total_profit: totalProfit,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Round price to nearest configured value
   * @param price - Price to round
   * @returns Rounded price
   */
  roundPrice(price: number): number {
    const { roundToNearest, minimumPrice } = ROUNDING_CONFIG;
    const rounded = Math.round(price / roundToNearest) * roundToNearest;
    return Math.max(rounded, minimumPrice);
  }

  /**
   * Get default pricing variables for an item
   * @param itemId - Item ID
   * @returns Default PricingVariable
   */
  getDefaultVariables(itemId: number): ResolvedPricingVariable {
    return {
      item_id: itemId,
      ...DEFAULT_PRICING_VARIABLES,
    };
  }

  /**
   * Merge partial variables with defaults
   * @param itemId - Item ID
   * @param partial - Partial variable updates
   * @returns Resolved (all-numeric) PricingVariable
   */
  mergeWithDefaults(
    itemId: number,
    partial: Partial<Omit<PricingVariable, 'item_id'>>
  ): ResolvedPricingVariable {
    return {
      item_id: itemId,
      shipping_cost: partial.shipping_cost ?? DEFAULT_PRICING_VARIABLES.shipping_cost,
      tax_rate: partial.tax_rate ?? DEFAULT_PRICING_VARIABLES.tax_rate,
      exchange_rate: partial.exchange_rate ?? DEFAULT_PRICING_VARIABLES.exchange_rate,
      profit_rate: partial.profit_rate ?? DEFAULT_PRICING_VARIABLES.profit_rate,
      discount_rate: partial.discount_rate ?? DEFAULT_PRICING_VARIABLES.discount_rate,
    };
  }
}

// ---------------------------------------------
// Singleton Instance
// ---------------------------------------------

/** Shared pricing calculator instance */
export const pricingCalculator = new PricingCalculator();
