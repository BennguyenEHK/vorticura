"use client";

// =============================================
// PRICING PANEL PROVIDER - Context for state management
// =============================================
// Central state management for the pricing panel
// Manages items, variables, calculations, and user preferences

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type {
  Currency,
  QuotationItem,
  PricingVariable,
  CalculatedPricing,
  PricingPanelState,
  PricingPanelActions,
  PricingPanelContextType,
} from "@/types/pricing";
import { DEFAULT_PRICING_VARIABLES } from "@/types/pricing";
import { currencyService } from "@/lib/services/pricing";

// ---------------------------------------------
// Context Creation
// ---------------------------------------------

const PricingPanelContext = createContext<PricingPanelContextType | null>(null);

// ---------------------------------------------
// Initial State
// ---------------------------------------------

const initialState: PricingPanelState = {
  quotationId: null,
  items: [],
  variables: [],
  calculatedPricing: [],
  targetCurrency: "VND",
  isLoading: false,
  isCalculating: false,
  searchTerm: "",
  error: null,
};

// ---------------------------------------------
// Provider Component
// ---------------------------------------------

interface PricingPanelProviderProps {
  children: ReactNode;
  quotationId?: number;
}

/**
 * PricingPanelProvider - Provides pricing state to all child components
 * @param children - Child components to wrap
 * @param quotationId - Optional quotation ID to load on mount
 */
export function PricingPanelProvider({
  children,
  quotationId,
}: PricingPanelProviderProps) {
  // State
  const [state, setState] = useState<PricingPanelState>(initialState);

  // Load target currency from localStorage on mount
  useEffect(() => {
    const savedCurrency = currencyService.loadTargetCurrency();
    setState((prev) => ({ ...prev, targetCurrency: savedCurrency }));
  }, []);

  // Load quotation data when quotationId changes
  useEffect(() => {
    if (quotationId && quotationId !== state.quotationId) {
      loadQuotationData(quotationId);
    }
  }, [quotationId]);

  // ---------------------------------------------
  // Actions
  // ---------------------------------------------

  /**
   * Load quotation data from API
   */
  const loadQuotationData = useCallback(async (qId: number) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`/api/pricing?quotationId=${qId}`);
      if (!response.ok) {
        throw new Error(`Failed to load data: ${response.status}`);
      }

      const result = await response.json();
      const data = result.data;

      setState((prev) => ({
        ...prev,
        quotationId: qId,
        items: data.items || [],
        variables: data.variables || [],
        calculatedPricing: data.calculated_pricing || [],
        isLoading: false,
      }));
    } catch (error) {
      console.error("Error loading quotation data:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load data",
      }));
    }
  }, []);

  /**
   * Update a single variable field for an item
   */
  const updateVariable = useCallback(
    (
      itemId: number,
      field: keyof Omit<PricingVariable, "item_id">,
      value: number
    ) => {
      setState((prev) => {
        const newVariables = prev.variables.map((v) =>
          v.item_id === itemId ? { ...v, [field]: value } : v
        );

        // If variable doesn't exist for this item, create it
        if (!newVariables.find((v) => v.item_id === itemId)) {
          newVariables.push({
            item_id: itemId,
            ...DEFAULT_PRICING_VARIABLES,
            [field]: value,
          });
        }

        return { ...prev, variables: newVariables };
      });
    },
    []
  );

  /**
   * Bulk update a variable field for multiple items
   */
  const bulkUpdateVariable = useCallback(
    (
      itemIds: number[],
      field: keyof Omit<PricingVariable, "item_id">,
      value: number
    ) => {
      setState((prev) => {
        const itemIdSet = new Set(itemIds);
        const newVariables = prev.variables.map((v) =>
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

        return { ...prev, variables: newVariables };
      });
    },
    []
  );

  /**
   * Set target currency and save preference
   */
  const setTargetCurrency = useCallback((currency: Currency) => {
    currencyService.saveTargetCurrency(currency);
    setState((prev) => ({ ...prev, targetCurrency: currency }));
  }, []);

  /**
   * Set search term for filtering items
   */
  const setSearchTerm = useCallback((term: string) => {
    setState((prev) => ({ ...prev, searchTerm: term }));
  }, []);

  /**
   * Apply pricing calculations via API
   */
  const applyPricing = useCallback(async () => {
    if (!state.quotationId || state.variables.length === 0) {
      return;
    }

    setState((prev) => ({ ...prev, isCalculating: true, error: null }));

    try {
      const response = await fetch("/api/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotation_id: state.quotationId,
          pricing_variables: state.variables,
        }),
      });

      if (!response.ok) {
        throw new Error(`Calculation failed: ${response.status}`);
      }

      const result = await response.json();
      const data = result.data;

      setState((prev) => ({
        ...prev,
        calculatedPricing: data.calculated_pricing || [],
        isCalculating: false,
      }));
    } catch (error) {
      console.error("Error applying pricing:", error);
      setState((prev) => ({
        ...prev,
        isCalculating: false,
        error: error instanceof Error ? error.message : "Calculation failed",
      }));
    }
  }, [state.quotationId, state.variables]);

  /**
   * Reset all variables to defaults
   */
  const resetVariables = useCallback(() => {
    setState((prev) => ({
      ...prev,
      variables: prev.items.map((item) => ({
        item_id: item.item_id,
        ...DEFAULT_PRICING_VARIABLES,
      })),
      calculatedPricing: [],
    }));
  }, []);

  // ---------------------------------------------
  // Context Value
  // ---------------------------------------------

  const contextValue: PricingPanelContextType = {
    ...state,
    loadQuotationData,
    updateVariable,
    bulkUpdateVariable,
    setTargetCurrency,
    setSearchTerm,
    applyPricing,
    resetVariables,
  };

  return (
    <PricingPanelContext.Provider value={contextValue}>
      {children}
    </PricingPanelContext.Provider>
  );
}

// ---------------------------------------------
// Hook for consuming context
// ---------------------------------------------

/**
 * usePricingPanel - Hook to access pricing panel context
 * @throws Error if used outside PricingPanelProvider
 */
export function usePricingPanel(): PricingPanelContextType {
  const context = useContext(PricingPanelContext);
  if (!context) {
    throw new Error(
      "usePricingPanel must be used within a PricingPanelProvider"
    );
  }
  return context;
}
