"use client";

// =============================================
// PRICING PANEL PROVIDER - Local state management
// =============================================
// Provides pricing state via React Context to child components
// Uses local useState (Zustand store removed during cleanup)
// Connects to server actions for pricing calculations

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type {
  PricingPanelContextType,
  Currency,
  QuotationItem,
  PricingVariable,
  CalculatedPricing,
} from "@/types/pricing";
import { DEFAULT_PRICING_VARIABLES } from "@/types/pricing";
import { currencyService } from "@/lib/services/pricing";

// ---------------------------------------------
// Context Creation
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
 * Uses local state for pricing panel management
 * @param children - Child components to wrap
 * @param quotationId - Optional quotation ID to load on mount
 * @param rfqId - Optional RFQ ID for server action calls
 */
export function PricingPanelProvider({
  children,
  quotationId: propQuotationId,
  rfqId,
}: PricingPanelProviderProps) {
  // Local state (replaces Zustand store)
  const [quotationId, setQuotationId] = useState<number | null>(propQuotationId ?? null);
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [variables, setVariables] = useState<PricingVariable[]>([]);
  const [calculatedPricing, setCalculatedPricing] = useState<CalculatedPricing[]>([]);
  const [targetCurrency, setTargetCurrencyState] = useState<Currency>("USD");
  const [isLoading, setIsLoading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Load target currency from localStorage on mount
  useEffect(() => {
    const savedCurrency = currencyService.loadTargetCurrency();
    setTargetCurrencyState(savedCurrency);
  }, []);

  // Sync quotationId from props
  useEffect(() => {
    if (propQuotationId && propQuotationId !== quotationId) {
      setQuotationId(propQuotationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propQuotationId]);

  // --- Actions ---

  /** Load quotation data by ID (placeholder for server action integration) */
  const loadQuotationData = useCallback(async (qId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      setQuotationId(qId);
      // TODO: Integrate with server action to fetch quotation data
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quotation");
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Update a single pricing variable for an item */
  const updateVariable = useCallback(
    (itemId: number, field: keyof Omit<PricingVariable, "item_id">, value: number) => {
      setVariables((prev) =>
        prev.map((v) => (v.item_id === itemId ? { ...v, [field]: value } : v))
      );
    },
    []
  );

  /** Bulk update a pricing variable across multiple items */
  const bulkUpdateVariable = useCallback(
    (itemIds: number[], field: keyof Omit<PricingVariable, "item_id">, value: number) => {
      setVariables((prev) =>
        prev.map((v) =>
          itemIds.includes(v.item_id) ? { ...v, [field]: value } : v
        )
      );
    },
    []
  );

  /** Set target currency and persist to localStorage */
  const setTargetCurrency = useCallback((currency: Currency) => {
    setTargetCurrencyState(currency);
    currencyService.saveTargetCurrency(currency);
  }, []);

  /** Apply pricing calculations (placeholder for server action) */
  const applyPricing = useCallback(async () => {
    setIsCalculating(true);
    setError(null);
    try {
      // TODO: Integrate with server action to calculate pricing
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pricing calculation failed");
    } finally {
      setIsCalculating(false);
    }
  }, []);

  /** Reset all variables to defaults */
  const resetVariables = useCallback(() => {
    setVariables((prev) =>
      prev.map((v) => ({
        ...v,
        ...DEFAULT_PRICING_VARIABLES,
        item_id: v.item_id, // Preserve item ID
      }))
    );
    setCalculatedPricing([]);
  }, []);

  // Build context value
  const contextValue: PricingPanelContextType = {
    // State
    quotationId,
    items,
    variables,
    calculatedPricing,
    targetCurrency,
    isLoading,
    isCalculating,
    searchTerm,
    error,
    // Actions
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
// Context Hook
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
