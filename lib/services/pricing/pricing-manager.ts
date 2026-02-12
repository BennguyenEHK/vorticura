// =============================================
// PRICING MANAGER - CRUD operations for pricing
// =============================================
// Handles database operations for pricing variables
// and calculated pricing results

import type {
  QuotationItem,
  PricingVariable,
  CalculatedPricing,
  LoadPricingResponse,
} from '@/types/pricing';
import { DEFAULT_PRICING_VARIABLES } from '@/types/pricing';

// ---------------------------------------------
// Mock Data (for development/testing)
// ---------------------------------------------

/** Mock quotation items for testing */
const MOCK_ITEMS: QuotationItem[] = [
  {
    item_id: 1,
    bidder_description: 'Steel Pipe DN100 - 6m length',
    qty: 50,
    currency_code: 'USD',
    bidder_unit_price: 125,
  },
  {
    item_id: 2,
    bidder_description: 'Gate Valve DN100 PN16',
    qty: 20,
    currency_code: 'USD',
    bidder_unit_price: 450,
  },
  {
    item_id: 3,
    bidder_description: 'Flange DN100 PN16 (pair)',
    qty: 100,
    currency_code: 'USD',
    bidder_unit_price: 35,
  },
  {
    item_id: 4,
    bidder_description: 'Gasket DN100 EPDM',
    qty: 200,
    currency_code: 'VND',
    bidder_unit_price: 15000,
  },
  {
    item_id: 5,
    bidder_description: 'Bolt Set M16x80 A2-70',
    qty: 500,
    currency_code: 'VND',
    bidder_unit_price: 8500,
  },
];

// ---------------------------------------------
// Pricing Manager Class
// ---------------------------------------------

/**
 * PricingManager - Manages pricing data operations
 */
export class PricingManager {
  /**
   * Load quotation items from database
   * @param quotationId - Quotation ID to load
   * @returns Array of quotation items
   */
  async getQuotationItems(quotationId: number): Promise<QuotationItem[]> {
    try {
      // Call database API
      const response = await fetch('/api/database/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'quotation_items',
          columns: 'item_id, bidder_description, qty, currency_code, bidder_unit_price',
          where: { quotation_id: quotationId },
          options: { orderBy: 'item_id ASC' },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to load items: ${response.status}`);
      }

      const result = await response.json();
      const items = result.data || [];

      // If no items found, return mock data for development
      if (items.length === 0) {
        console.log('No items found, using mock data');
        return MOCK_ITEMS;
      }

      // Map database columns to interface
      return items.map((row: Record<string, unknown>) => ({
        item_id: Number(row.item_id),
        bidder_description: String(row.bidder_description || 'No description'),
        qty: Number(row.qty || 1),
        currency_code: String(row.currency_code || 'VND') as QuotationItem['currency_code'],
        bidder_unit_price: Number(row.bidder_unit_price || 0),
      }));

    } catch (error) {
      console.error('Error loading quotation items:', error);
      // Return mock data on error for development
      return MOCK_ITEMS;
    }
  }

  /**
   * Load pricing variables from database
   * @param quotationId - Quotation ID
   * @returns Array of pricing variables
   */
  async loadPricingVariables(quotationId: number): Promise<PricingVariable[]> {
    try {
      const response = await fetch('/api/database/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'quotation_pricing',
          columns: 'item_id, shipping_cost, tax_rate, exchange_rate, profit_rate, discount_rate',
          where: { quotation_id: quotationId },
          options: {},
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to load variables: ${response.status}`);
      }

      const result = await response.json();
      const rows = result.data || [];

      return rows.map((row: Record<string, unknown>) => ({
        item_id: Number(row.item_id),
        shipping_cost: Number(row.shipping_cost ?? DEFAULT_PRICING_VARIABLES.shipping_cost),
        tax_rate: Number(row.tax_rate ?? DEFAULT_PRICING_VARIABLES.tax_rate),
        exchange_rate: Number(row.exchange_rate ?? DEFAULT_PRICING_VARIABLES.exchange_rate),
        profit_rate: Number(row.profit_rate ?? DEFAULT_PRICING_VARIABLES.profit_rate),
        discount_rate: Number(row.discount_rate ?? DEFAULT_PRICING_VARIABLES.discount_rate),
      }));

    } catch (error) {
      console.error('Error loading pricing variables:', error);
      return [];
    }
  }

  /**
   * Save pricing variables to database
   * @param quotationId - Quotation ID
   * @param variables - Array of pricing variables
   */
  async savePricingVariables(
    quotationId: number,
    variables: PricingVariable[]
  ): Promise<void> {
    try {
      // Upsert each variable (insert or update)
      for (const variable of variables) {
        await fetch('/api/database/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'quotation_pricing',
            data: {
              quotation_id: quotationId,
              item_id: variable.item_id,
              shipping_cost: variable.shipping_cost,
              tax_rate: variable.tax_rate,
              exchange_rate: variable.exchange_rate,
              profit_rate: variable.profit_rate,
              discount_rate: variable.discount_rate,
              updated_at: new Date().toISOString(),
            },
            where: {
              quotation_id: quotationId,
              item_id: variable.item_id,
            },
            upsert: true,
          }),
        });
      }
    } catch (error) {
      console.error('Error saving pricing variables:', error);
      throw error;
    }
  }

  /**
   * Save calculated pricing results to database
   * @param quotationId - Quotation ID
   * @param pricing - Array of calculated pricing
   */
  async saveCalculatedPricing(
    quotationId: number,
    pricing: CalculatedPricing[]
  ): Promise<void> {
    try {
      for (const item of pricing) {
        await fetch('/api/database/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'quotation_pricing',
            data: {
              quotation_id: quotationId,
              item_id: item.item_id,
              sales_unit_price: item.sales_unit_price,
              ext_price: item.ext_price,
              potential_profit: item.potential_profit,
              calculation_timestamp: item.calculation_timestamp,
            },
            where: {
              quotation_id: quotationId,
              item_id: item.item_id,
            },
            upsert: true,
          }),
        });
      }
    } catch (error) {
      console.error('Error saving calculated pricing:', error);
      throw error;
    }
  }

  /**
   * Load complete pricing data (items + variables + calculated)
   * @param quotationId - Quotation ID
   * @returns Complete pricing response
   */
  async loadPricingData(quotationId: number): Promise<LoadPricingResponse> {
    // Load items and variables in parallel
    const [items, variables] = await Promise.all([
      this.getQuotationItems(quotationId),
      this.loadPricingVariables(quotationId),
    ]);

    // Load calculated pricing if exists
    let calculatedPricing: CalculatedPricing[] = [];
    try {
      const response = await fetch('/api/database/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'quotation_pricing',
          columns: 'item_id, sales_unit_price, ext_price, potential_profit, calculation_timestamp',
          where: { quotation_id: quotationId },
          options: {},
        }),
      });

      if (response.ok) {
        const result = await response.json();
        calculatedPricing = (result.data || [])
          .filter((row: Record<string, unknown>) => row.sales_unit_price != null)
          .map((row: Record<string, unknown>) => ({
            item_id: Number(row.item_id),
            sales_unit_price: Number(row.sales_unit_price),
            ext_price: Number(row.ext_price),
            potential_profit: Number(row.potential_profit),
            calculation_timestamp: String(row.calculation_timestamp || new Date().toISOString()),
          }));
      }
    } catch (error) {
      console.error('Error loading calculated pricing:', error);
    }

    return {
      quotation_id: quotationId,
      items,
      variables,
      calculated_pricing: calculatedPricing,
    };
  }

  /**
   * Initialize default variables for items without existing variables
   * @param items - Quotation items
   * @param existingVariables - Existing pricing variables
   * @returns Complete array of variables with defaults
   */
  initializeVariables(
    items: QuotationItem[],
    existingVariables: PricingVariable[]
  ): PricingVariable[] {
    const variablesMap = new Map(
      existingVariables.map(v => [v.item_id, v])
    );

    return items.map(item => {
      const existing = variablesMap.get(item.item_id);
      if (existing) {
        return existing;
      }
      // Create default variables for new item
      return {
        item_id: item.item_id,
        ...DEFAULT_PRICING_VARIABLES,
      };
    });
  }
}

// ---------------------------------------------
// Singleton Instance
// ---------------------------------------------

/** Shared pricing manager instance */
export const pricingManager = new PricingManager();
