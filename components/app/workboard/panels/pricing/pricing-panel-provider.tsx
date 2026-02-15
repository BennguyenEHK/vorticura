"use client";

// =============================================
// PRICING PANEL PROVIDER - Bridge component for state
// =============================================
// Provides backward-compatible hook while using Zustand store
// Connects to server actions for pricing calculations
// Syncs results to workboard store for preview display

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import type { PricingPanelContextType } from "@/types/pricing";
import { currencyService } from "@/lib/services/pricing";
import {
  usePricingPanelStore,
  usePricingItems,
  usePricingVariablesMap,
  usePricingLoadingStates,
  usePricingError,
  useCalculatedPricing,
  useTargetCurrency,
} from "@/lib/stores/pricing-panel-store";

// ---------------------------------------------
// Context Creation (for backward compatibility)
// ---------------------------------------------

const PricingPanelContext = createContext<PricingPanelContextType | null>(null);

// ---------------------------------------------
// Provider Props
// ---------------------------------------------

interface PricingPanelProviderProps {
  children: ReactNode;
  quotationId?: number;  // Optional: load specific quotation on mount
  rfqId?: string;        // Optional: associated RFQ ID
}

// ---------------------------------------------
// Provider Component
// ---------------------------------------------

/**
 * PricingPanelProvider - Provides pricing state to child components
 * Uses Zustand store internally while exposing context API
 * @param children - Child components to wrap
 * @param quotationId - Optional quotation ID to load on mount
 * @param rfqId - Optional RFQ ID for server action calls
 */
export function PricingPanelProvider({
  children,
  quotationId,
  rfqId,
}: PricingPanelProviderProps) {
  // Get store state and actions
  const store = usePricingPanelStore();

  // Load target currency from localStorage on mount
  useEffect(() => {
    const savedCurrency = currencyService.loadTargetCurrency();
    store.setTargetCurrency(savedCurrency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally run only on mount

  // Initialize from quotation when quotationId changes
  useEffect(() => {
    if (quotationId && quotationId !== store.quotationId) {
      store.initializeFromQuotation(quotationId, rfqId || `rfq-${quotationId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId, rfqId]); // Only re-run when props change

  // Build context value from store for backward compatibility
  const contextValue: PricingPanelContextType = {
    // State
    quotationId: store.quotationId,
    items: store.items,
    variables: store.variables,
    calculatedPricing: store.calculatedPricing,
    targetCurrency: store.targetCurrency,
    isLoading: store.isLoading,
    isCalculating: store.isCalculating,
    searchTerm: store.searchTerm,
    error: store.error,

    // Actions - delegate to store
    loadQuotationData: (qId: number) =>
      store.initializeFromQuotation(qId, rfqId || `rfq-${qId}`),
    updateVariable: store.updateVariable,
    bulkUpdateVariable: store.bulkUpdateVariable,
    setTargetCurrency: store.setTargetCurrency,
    setSearchTerm: store.setSearchTerm,
    applyPricing: store.applyPricing,
    resetVariables: store.resetVariables,
  };

  return (
    <PricingPanelContext.Provider value={contextValue}>
      {children}
    </PricingPanelContext.Provider>
  );
}

// ---------------------------------------------
// Context Hook (backward compatible)
// ---------------------------------------------

/**
 * usePricingPanel - Hook to access pricing panel context
 * Maintained for backward compatibility with existing components
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

// ---------------------------------------------
// Direct Store Hooks (preferred for new code)
// ---------------------------------------------

/**
 * usePricingStore - Direct access to Zustand store
 * Preferred for new components for better performance
 */
export { usePricingPanelStore } from "@/lib/stores/pricing-panel-store";

/**
 * Re-export selector hooks for component use
 */
export {
  usePricingItems,
  usePricingVariablesMap,
  usePricingLoadingStates,
  usePricingError,
  useCalculatedPricing,
  useTargetCurrency,
};
