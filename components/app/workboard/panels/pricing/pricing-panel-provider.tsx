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
import { currencyService } from "@/lib/services/pricing";
import { fetchQuotationForPricing } from "@/lib/actions/thread-ai-actions";
import { usePreview } from "@/hooks/preview-context";
import { handleHTTPRequest } from "@/lib/data-processor";

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
  const [warning, setWarning] = useState<string | null>(null);

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
          setCalculatedPricing([]);
          return;
        }
        setQuotationId(data.quotationId);
        setItems(data.items as QuotationItem[]);
        // Ghost-mode: only adopt a variable value if a saved row exists for it
        // (data.variables comes from quotation_pricing rows). Otherwise leave
        // the field null so the UI shows the default as placeholder text.
        const ghostVariables: PricingVariable[] = (data.variables as unknown as Array<Record<string, unknown>>).map(v => ({
          item_id: Number(v.item_id),
          shipping_cost: v.shipping_cost == null ? null : Number(v.shipping_cost),
          tax_rate: v.tax_rate == null ? null : Number(v.tax_rate),
          exchange_rate: v.exchange_rate == null ? null : Number(v.exchange_rate),
          profit_rate: v.profit_rate == null ? null : Number(v.profit_rate),
          discount_rate: v.discount_rate == null ? null : Number(v.discount_rate),
        }));
        setVariables(ghostVariables);
        // Rehydrate Potential Profit table from prior Apply — only rows where
        // sales_unit_price was actually saved are returned. Empty array on
        // first load keeps the "No calculations yet" empty state intact.
        const rehydratedCalc: CalculatedPricing[] = (data.calculated_pricing ?? []).map(c => ({
          item_id: Number(c.item_id),
          sales_unit_price: Number(c.sales_unit_price),
          ext_price: Number(c.ext_price),
          potential_profit: Number(c.potential_profit),
          calculation_timestamp: String(c.calculation_timestamp),
        }));
        setCalculatedPricing(rehydratedCalc);
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
    (itemId: number, field: keyof Omit<PricingVariable, "item_id">, value: number | null) => {
      setVariables((prev) =>
        prev.map((v) => (v.item_id === itemId ? { ...v, [field]: value } : v))
      );
    },
    []
  );

  /** Bulk update a pricing variable across multiple items */
  const bulkUpdateVariable = useCallback(
    (itemIds: number[], field: keyof Omit<PricingVariable, "item_id">, value: number | null) => {
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

  /** Apply pricing calculations via server action */
  const applyPricing = useCallback(async () => {
    if (!quotationId || variables.length === 0) {
      setError("No quotation loaded — generate a quote first.");
      return;
    }
    setIsCalculating(true);
    setError(null);
    setWarning(null);
    try {
      const payload = {
        data_type: 'quotation' as const,
        action_type: 'calculate' as const,
        quotation_id: quotationId,
        pricing_variables: variables.map(v => ({
          item_id: v.item_id,
          shipping_cost: v.shipping_cost,
          tax_rate: v.tax_rate,
          exchange_rate: v.exchange_rate,
          profit_rate: v.profit_rate,
          discount_rate: v.discount_rate,
        })),
      };
      const result = await handleHTTPRequest(payload) as { success: boolean; data?: any; error?: string };
      if (!result.success) {
        setError(result.error || 'Pricing calculation failed');
      } else {
        const calculated: CalculatedPricing[] = result.data.calculated_pricing;
        setCalculatedPricing(calculated);
        const partialErrors = result.data.errors;
        if (Array.isArray(partialErrors) && partialErrors.length > 0) {
          setWarning(`Calculated with ${partialErrors.length} partial error${partialErrors.length > 1 ? 's' : ''}. First: ${partialErrors[0].error}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pricing calculation failed");
    } finally {
      setIsCalculating(false);
    }
  }, [quotationId, variables]);

  /** Reset all variables to ghost-mode (null = default-as-placeholder). */
  const resetVariables = useCallback(() => {
    setVariables((prev) =>
      prev.map((v) => ({
        item_id: v.item_id,
        shipping_cost: null,
        tax_rate: null,
        exchange_rate: null,
        profit_rate: null,
        discount_rate: null,
      }))
    );
    setCalculatedPricing([]);
  }, []);

  const clearWarning = useCallback(() => setWarning(null), []);

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
    clearWarning,
    // Warning state (partial calc errors — non-fatal, shown as inline banner)
    warning,
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
