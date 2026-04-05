'use server';

// =============================================
// PRICING MANAGER - Server actions for pricing CRUD
// =============================================
// Handles database operations for pricing variables
// and calculated pricing results via server actions

import type {
  QuotationItem,
  PricingVariable,
  CalculatedPricing,
  LoadPricingResponse,
} from '@/types/pricing';
import { DEFAULT_PRICING_VARIABLES } from '@/types/pricing';
import { getData, insertData, updateData } from '@/lib/db/queries';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

// ---------------------------------------------
// Mock Data (for development/testing)
// ---------------------------------------------

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
// Server Action Functions
// ---------------------------------------------

/**
 * Load quotation items from database
 */
export async function getQuotationItems(
  quotationId: number,
  workspace: WorkspaceContext
): Promise<QuotationItem[]> {
  try {
    const rows = await getData(
      'rfqItems',
      { quotationId },
      workspace
    );

    if (rows.length === 0) {
      console.log('No items found, using mock data');
      return MOCK_ITEMS;
    }

    return rows.map((row: Record<string, unknown>) => ({
      item_id: Number(row.itemId),
      bidder_description: String(row.bidderDescription || 'No description'),
      qty: Number(row.qty || 1),
      currency_code: String(row.currencyCode || 'VND') as QuotationItem['currency_code'],
      bidder_unit_price: Number(row.bidderUnitPrice || 0),
    }));
  } catch (error) {
    console.error('Error loading quotation items:', error);
    return MOCK_ITEMS;
  }
}

/**
 * Load pricing variables from database
 */
export async function loadPricingVariables(
  quotationId: number,
  workspace: WorkspaceContext
): Promise<PricingVariable[]> {
  try {
    const rows = await getData(
      'quotationPricing',
      { quotationId },
      workspace
    );

    return rows.map((row: Record<string, unknown>) => ({
      item_id: Number(row.itemId),
      shipping_cost: Number(row.shippingCost ?? DEFAULT_PRICING_VARIABLES.shipping_cost),
      tax_rate: Number(row.taxRate ?? DEFAULT_PRICING_VARIABLES.tax_rate),
      exchange_rate: Number(row.exchangeRate ?? DEFAULT_PRICING_VARIABLES.exchange_rate),
      profit_rate: Number(row.profitRate ?? DEFAULT_PRICING_VARIABLES.profit_rate),
      discount_rate: Number(row.discountRate ?? DEFAULT_PRICING_VARIABLES.discount_rate),
    }));
  } catch (error) {
    console.error('Error loading pricing variables:', error);
    return [];
  }
}

/**
 * Save pricing variables to database (upsert per item)
 */
export async function savePricingVariables(
  quotationId: number,
  variables: PricingVariable[],
  workspace: WorkspaceContext
): Promise<void> {
  for (const variable of variables) {
    const whereColumns = { quotationId, itemId: variable.item_id };
    const existing = await getData('quotationPricing', whereColumns, workspace);

    const payload = {
      quotationId,
      itemId: variable.item_id,
      shippingCost: variable.shipping_cost,
      taxRate: variable.tax_rate,
      exchangeRate: variable.exchange_rate,
      profitRate: variable.profit_rate,
      discountRate: variable.discount_rate,
      updatedAt: new Date().toISOString(),
    };

    if (existing.length > 0) {
      await updateData('quotationPricing', whereColumns, payload, workspace);
    } else {
      await insertData('quotationPricing', {}, payload, workspace);
    }
  }
}

/**
 * Save calculated pricing results to database (upsert per item)
 */
export async function saveCalculatedPricing(
  quotationId: number,
  pricing: CalculatedPricing[],
  workspace: WorkspaceContext
): Promise<void> {
  for (const item of pricing) {
    const whereColumns = { quotationId, itemId: item.item_id };
    const existing = await getData('quotationPricing', whereColumns, workspace);

    const payload = {
      quotationId,
      itemId: item.item_id,
      salesUnitPrice: item.sales_unit_price,
      extPrice: item.ext_price,
      potentialProfit: item.potential_profit,
      calculationTimestamp: item.calculation_timestamp,
    };

    if (existing.length > 0) {
      await updateData('quotationPricing', whereColumns, payload, workspace);
    } else {
      await insertData('quotationPricing', {}, payload, workspace);
    }
  }
}

/**
 * Load complete pricing data (items + variables + calculated)
 */
export async function loadPricingData(
  quotationId: number,
  workspace: WorkspaceContext
): Promise<LoadPricingResponse> {
  const [items, variables] = await Promise.all([
    getQuotationItems(quotationId, workspace),
    loadPricingVariables(quotationId, workspace),
  ]);

  let calculatedPricing: CalculatedPricing[] = [];
  try {
    const rows = await getData('quotationPricing', { quotationId }, workspace);
    calculatedPricing = rows
      .filter((row: Record<string, unknown>) => row.salesUnitPrice != null)
      .map((row: Record<string, unknown>) => ({
        item_id: Number(row.itemId),
        sales_unit_price: Number(row.salesUnitPrice),
        ext_price: Number(row.extPrice),
        potential_profit: Number(row.potentialProfit),
        calculation_timestamp: String(row.calculationTimestamp || new Date().toISOString()),
      }));
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
 * (Pure function — no DB access needed)
 */
export async function initializeVariables(
  items: QuotationItem[],
  existingVariables: PricingVariable[]
): Promise<PricingVariable[]> {
  const variablesMap = new Map(
    existingVariables.map(v => [v.item_id, v])
  );

  return items.map(item => {
    const existing = variablesMap.get(item.item_id);
    if (existing) {
      return existing;
    }
    return {
      item_id: item.item_id,
      ...DEFAULT_PRICING_VARIABLES,
    };
  });
}
