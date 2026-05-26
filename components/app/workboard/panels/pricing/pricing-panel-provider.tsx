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
import { fetchQuotationForPricing } from "@/lib/actions/thread-ai-actions";
import { usePreview } from "@/hooks/preview-context";

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
  rfqId?: number;        // Active RFQ — auto-loads pricing data when quotation exists
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
  rfqId: propRfqId,
}: PricingPanelProviderProps) {
  // Subscribe to SSE preview so panel re-fetches when a quotation document arrives
  const { state: previewState } = usePreview();
  // Changes when a new quotation_id is broadcast; null when no quotation active
  const previewQuotationKey =
    previewState.activeDocument?.type === 'quotation'
      ? ((previewState.activeDocument.data as unknown as Record<string, unknown>).quotation_id ?? 'pending')
      : null;

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

  // Auto-load pricing data when the active RFQ changes.
  // previewQuotationKey is a secondary dep: refreshes the panel as soon as a
  // freshly-generated quotation document is broadcast via SSE.
  // Returns null gracefully when no quotation exists yet (still in items_ordering stage).
  useEffect(() => {
    if (!propRfqId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchQuotationForPricing(propRfqId)
      .then(data => {
        if (cancelled) return;
        if (!data) {
          // No quotation yet — keep panel empty until generate quote is pressed
          setItems([]);
          setVariables([]);
          return;
        }
        setQuotationId(data.quotationId);
        setItems(data.items as QuotationItem[]);
        setVariables(data.variables as PricingVariable[]);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load pricing data');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [propRfqId, previewQuotationKey]);

  // --- Actions ---

  /** Load quotation data by ID (used for direct quotation_id access) */
  const loadQuotationData = useCallback(async (qId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      setQuotationId(qId);
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
