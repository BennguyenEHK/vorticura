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
  CalculatedPricing,
  CalculatePricingResponse,
  PricingError,
} from '@/types/pricing';
import { DEFAULT_PRICING_VARIABLES } from '@/types/pricing';
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
  calculateItemPricing(
    item: QuotationItem,
    variables: PricingVariable
  ): CalculatedPricing {
    // Extract base values
    const unitPrice = item.bidder_unit_price;
    const qty = item.qty;

    // STEP 1: Calculate actual unit price (cost price after all additions)
    // Formula: ((unit_price + shipping_cost) × tax_rate) × exchange_rate
    const withShipping = unitPrice + variables.shipping_cost;
    const withTax = withShipping * variables.tax_rate;
    const actualUnitPrice = withTax * variables.exchange_rate;

    // STEP 2: Calculate profit unit price
    // Formula: actual_unit_price × profit_rate
    const profitUnitPrice = actualUnitPrice * variables.profit_rate;

    // STEP 3: Apply discount to get final sales price
    // Formula: profit_unit_price - (profit_unit_price × discount_rate)
    const discountAmount = profitUnitPrice * variables.discount_rate;
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

        // Get variables for this item (use defaults if not found)
        let itemVariables = variablesMap.get(item.item_id);
        if (!itemVariables) {
          // Create default variables for this item
          itemVariables = {
            item_id: item.item_id,
            ...DEFAULT_PRICING_VARIABLES,
          };
        }

        // Validate variables
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
  getDefaultVariables(itemId: number): PricingVariable {
    return {
      item_id: itemId,
      ...DEFAULT_PRICING_VARIABLES,
    };
  }

  /**
   * Merge partial variables with defaults
   * @param itemId - Item ID
   * @param partial - Partial variable updates
   * @returns Complete PricingVariable
   */
  mergeWithDefaults(
    itemId: number,
    partial: Partial<Omit<PricingVariable, 'item_id'>>
  ): PricingVariable {
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
