// =============================================
// PRICING PANEL STORE - Zustand state management
// =============================================
// Manages pricing panel state with server action integration
// Syncs calculated results to workboard store for preview display
// Pattern: 'use client' store + 'use server' actions

'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  Currency,
  QuotationItem,
  PricingVariable,
  CalculatedPricing,
} from '@/types/pricing';
import { DEFAULT_PRICING_VARIABLES } from '@/types/pricing';
import { currencyService } from '@/lib/services/pricing';
import { useWorkboardStore } from './workboard-store';

// ---------------------------------------------
// Store State Type
// ---------------------------------------------

interface PricingPanelState {
  // Data state
  quotationId: number | null;              // Current quotation being edited
  rfqId: string | null;                    // Associated RFQ ID for server actions
  items: QuotationItem[];                  // Quotation items with base prices
  variables: PricingVariable[];            // Per-item pricing variables
  calculatedPricing: CalculatedPricing[];  // Calculation results

  // UI state
  targetCurrency: Currency;                // User's selected target currency
  isLoading: boolean;                      // Data loading state
  isCalculating: boolean;                  // Calculation in progress
  searchTerm: string;                      // Item search filter
  error: string | null;                    // Error message if any
}

interface PricingPanelActions {
  // Initialization
  initializeFromQuotation: (quotationId: number, rfqId: string) => Promise<void>;
  setQuotationData: (items: QuotationItem[], variables?: PricingVariable[]) => void;

  // Variable management
  updateVariable: (
    itemId: number,
    field: keyof Omit<PricingVariable, 'item_id'>,
    value: number
  ) => void;
  bulkUpdateVariable: (
    itemIds: number[],
    field: keyof Omit<PricingVariable, 'item_id'>,
    value: number
  ) => void;

  // Currency and search
  setTargetCurrency: (currency: Currency) => void;
  setSearchTerm: (term: string) => void;

  // Pricing operations
  applyPricing: () => Promise<void>;
  resetVariables: () => void;

  // State management
  setLoading: (loading: boolean) => void;
  setCalculating: (calculating: boolean) => void;
  setError: (error: string | null) => void;
  clearPricingPanel: () => void;
}

export type PricingPanelStore = PricingPanelState & PricingPanelActions;

// ---------------------------------------------
// Initial State
// ---------------------------------------------

const initialState: PricingPanelState = {
  quotationId: null,
  rfqId: null,
  items: [],
  variables: [],
  calculatedPricing: [],
  targetCurrency: 'VND',
  isLoading: false,
  isCalculating: false,
  searchTerm: '',
  error: null,
};

// ---------------------------------------------
// Store Implementation
// ---------------------------------------------

/**
 * Pricing Panel Store - Manages all pricing panel state
 * Uses subscribeWithSelector for efficient component updates
 */
export const usePricingPanelStore = create<PricingPanelStore>()(
  subscribeWithSelector((set, get) => ({
    // Spread initial state
    ...initialState,

    // =========================================
    // INITIALIZATION
    // =========================================

    /**
     * Initialize store from quotation data
     * Loads items and variables from server action
     */
    initializeFromQuotation: async (quotationId: number, rfqId: string) => {
      set({ isLoading: true, error: null, quotationId, rfqId });

      try {
        // Import server action dynamically to avoid 'use server' issues
        const { getPricingResult } = await import('@/lib/actions/pricing-actions');

        // Fetch existing pricing data
        const result = await getPricingResult(String(quotationId), rfqId);

        if (result.success && result.data) {
          // Use existing calculated data
          set({
            calculatedPricing: result.data.calculatedItems.map((item) => ({
              item_id: item.itemId,
              sales_unit_price: item.salesUnitPrice,
              ext_price: item.extendedPrice,
              potential_profit: item.potentialProfit,
              calculation_timestamp: result.data!.calculatedAt,
            })),
            isLoading: false,
          });

          // Sync to workboard store for preview panel
          useWorkboardStore.getState().setPricingResult(result.data);
        } else {
          set({ isLoading: false });
        }
      } catch (error) {
        console.error('[PricingPanelStore] Init error:', error);
        set({
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load pricing data',
        });
      }
    },

    /**
     * Set quotation items and optionally variables
     * Used when items are loaded from another source
     */
    setQuotationData: (items: QuotationItem[], variables?: PricingVariable[]) => {
      // Initialize default variables for items without explicit variables
      const initializedVariables = items.map((item) => {
        const existing = variables?.find((v) => v.item_id === item.item_id);
        return existing || {
          item_id: item.item_id,
          ...DEFAULT_PRICING_VARIABLES,
        };
      });

      set({
        items,
        variables: initializedVariables,
        error: null,
      });
    },

    // =========================================
    // VARIABLE MANAGEMENT
    // =========================================

    /**
     * Update a single variable field for an item
     */
    updateVariable: (itemId, field, value) => {
      set((state) => {
        const newVariables = state.variables.map((v) =>
          v.item_id === itemId ? { ...v, [field]: value } : v
        );

        // Create default variable if doesn't exist
        if (!newVariables.find((v) => v.item_id === itemId)) {
          newVariables.push({
            item_id: itemId,
            ...DEFAULT_PRICING_VARIABLES,
            [field]: value,
          });
        }

        return { variables: newVariables };
      });
    },

    /**
     * Bulk update a variable field for multiple items
     */
    bulkUpdateVariable: (itemIds, field, value) => {
      set((state) => {
        const itemIdSet = new Set(itemIds);
        const newVariables = state.variables.map((v) =>
          itemIdSet.has(v.item_id) ? { ...v, [field]: value } : v
        );

        // Add new variables for items that don't have one
        for (const itemId of itemIds) {
          if (!newVariables.find((v) => v.item_id === itemId)) {
            newVariables.push({
              item_id: itemId,
              ...DEFAULT_PRICING_VARIABLES,
              [field]: value,
            });
          }
        }

        return { variables: newVariables };
      });
    },

    // =========================================
    // CURRENCY AND SEARCH
    // =========================================

    /**
     * Set target currency and persist preference
     */
    setTargetCurrency: (currency: Currency) => {
      currencyService.saveTargetCurrency(currency);
      set({ targetCurrency: currency });
    },

    /**
     * Set search term for filtering items
     */
    setSearchTerm: (term: string) => {
      set({ searchTerm: term });
    },

    // =========================================
    // PRICING OPERATIONS
    // =========================================

    /**
     * Apply pricing calculations via server action
     * Results are synced to workboard store for preview display
     */
    applyPricing: async () => {
      const { quotationId, rfqId, variables, targetCurrency, items } = get();

      if (!quotationId || variables.length === 0) {
        set({ error: 'Missing quotation or variables' });
        return;
      }

      set({ isCalculating: true, error: null });

      try {
        // Import server actions dynamically
        const { calculatePricing, setQuotationItems } = await import('@/lib/actions/pricing-actions');

        // Set items in server-side store before calculating
        if (items.length > 0) {
          await setQuotationItems(
            String(quotationId),
            items.map((item) => ({
              itemId: item.item_id,
              description: item.bidder_description,
              quantity: item.qty,
              unitPrice: item.bidder_unit_price,
              currency: item.currency_code,
            }))
          );
        }

        // Transform variables to server action format
        const pricingInput = {
          rfqId: rfqId || `rfq-${quotationId}`,
          quotationId: String(quotationId),
          targetCurrency,
          variables: variables.map((v) => ({
            itemId: v.item_id,
            shippingCost: v.shipping_cost,
            taxRate: v.tax_rate,
            exchangeRate: v.exchange_rate,
            profitRate: v.profit_rate,
            discountRate: v.discount_rate,
          })),
        };

        // Call server action
        const result = await calculatePricing(pricingInput);

        if (result.success && result.data) {
          // Transform to store format
          const calculatedPricing: CalculatedPricing[] = result.data.calculatedItems.map(
            (item) => ({
              item_id: item.itemId,
              sales_unit_price: item.salesUnitPrice,
              ext_price: item.extendedPrice,
              potential_profit: item.potentialProfit,
              calculation_timestamp: result.data!.calculatedAt,
            })
          );

          set({
            calculatedPricing,
            isCalculating: false,
          });

          // Sync to workboard store for preview panel
          useWorkboardStore.getState().setPricingResult(result.data);

          console.log('[PricingPanelStore] Pricing calculated and synced to preview');
        } else {
          throw new Error(result.error || 'Calculation failed');
        }
      } catch (error) {
        console.error('[PricingPanelStore] Apply pricing error:', error);
        set({
          isCalculating: false,
          error: error instanceof Error ? error.message : 'Calculation failed',
        });

        // Set error in workboard store
        useWorkboardStore.getState().setPricingError(
          error instanceof Error ? error.message : 'Calculation failed'
        );
      }
    },

    /**
     * Reset all variables to defaults
     */
    resetVariables: () => {
      const { items } = get();

      set({
        variables: items.map((item) => ({
          item_id: item.item_id,
          ...DEFAULT_PRICING_VARIABLES,
        })),
        calculatedPricing: [],
        error: null,
      });

      // Clear pricing in workboard store
      useWorkboardStore.getState().clearPricing();
    },

    // =========================================
    // STATE MANAGEMENT
    // =========================================

    setLoading: (loading: boolean) => set({ isLoading: loading }),

    setCalculating: (calculating: boolean) => set({ isCalculating: calculating }),

    setError: (error: string | null) => set({ error }),

    /**
     * Clear all pricing panel state
     */
    clearPricingPanel: () => {
      set(initialState);

      // Also clear workboard pricing
      useWorkboardStore.getState().clearPricing();
    },
  }))
);

// ---------------------------------------------
// Selector Hooks for Components
// ---------------------------------------------

/** Select items for display (with optional filtering) */
export const usePricingItems = () =>
  usePricingPanelStore((state) => {
    if (!state.searchTerm) return state.items;

    const term = state.searchTerm.toLowerCase();
    return state.items.filter(
      (item) =>
        item.bidder_description.toLowerCase().includes(term) ||
        String(item.item_id).includes(term)
    );
  });

/** Select variables map for O(1) lookup */
export const usePricingVariablesMap = () =>
  usePricingPanelStore((state) =>
    new Map(state.variables.map((v) => [v.item_id, v]))
  );

/** Select loading states */
export const usePricingLoadingStates = () =>
  usePricingPanelStore((state) => ({
    isLoading: state.isLoading,
    isCalculating: state.isCalculating,
  }));

/** Select error state */
export const usePricingError = () =>
  usePricingPanelStore((state) => state.error);

/** Select calculated pricing results */
export const useCalculatedPricing = () =>
  usePricingPanelStore((state) => state.calculatedPricing);

/** Select target currency */
export const useTargetCurrency = () =>
  usePricingPanelStore((state) => state.targetCurrency);
