"use client";

// =============================================
// PRICING PANEL CONTENT - Main orchestrator component
// =============================================
// Refactored v5.9 - Uses modular components from ./pricing/
// Features:
// - Global currency selection (VND, USD, EUR, JPY)
// - Per-item pricing variables (shipping, tax, exchange, profit, discount)
// - Search/filter items by keyword
// - Bulk update via right-click context menu
// - Profit summary table with calculations
// - Apply/Reset actions with API integration

import { useEffect } from "react";
import { Loader2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PricingPanelProvider,
  usePricingPanel,
  CurrencySelector,
  ItemSearch,
  PricingItemList,
  ProfitSummaryTable,
  PricingActions,
} from "./pricing";

// ---------------------------------------------
// Props Interface
// ---------------------------------------------

interface PricingPanelContentProps {
  className?: string;
  quotationId?: number; // Optional: load specific quotation on mount
  rfqId?: number;       // Active RFQ — auto-loads items when quotation exists
}

// ---------------------------------------------
// Inner Content Component (uses context)
// ---------------------------------------------

/**
 * PricingPanelInner - Inner content that consumes the pricing context
 * Separated to allow useContext to work properly
 */
function PricingPanelInner({ className = "" }: { className?: string }) {
  // Get state from context
  const { isLoading, error, items, warning, clearWarning } = usePricingPanel();

  // Loading state
  if (isLoading) {
    return (
      <div className={`p-4 h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-brand animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-2">
            Loading pricing data...
          </p>
        </div>
      </div>
    );
  }

  // Empty state — no quotation generated yet
  if (!isLoading && !error && items.length === 0) {
    return (
      <div className={`p-4 h-full flex items-center justify-center ${className}`}>
        <p className="text-sm text-muted-foreground text-center leading-relaxed">
          No quotation yet.<br />Generate a quote from the procurement panel first.
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`p-4 h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-error mx-auto" />
          <p className="text-sm text-error mt-2">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Please try reloading the page
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-3 h-full flex flex-col ${className}`}>
      {/* Header section */}
      <div className="mb-3">
        <h3 className="text-sm font-medium text-foreground">Pricing Variables</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure per-item pricing with formula calculation
        </p>
      </div>

      {/* Search bar */}
      <ItemSearch className="mb-2" />

      {/* Partial-calculation warning banner (non-fatal) */}
      {warning && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="flex-1">{warning}</span>
          <button
            onClick={clearWarning}
            className="shrink-0 hover:opacity-70 transition-opacity"
            aria-label="Dismiss warning"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Currency selector — pinned above scroll */}
      <div className="mb-2 border-t border-border pt-2">
        <CurrencySelector />
      </div>

      {/* Scrollable item list — min-h-24 keeps gap when empty */}
      <div className="flex-1 overflow-y-auto min-h-50 border-t border-border pt-2">
        <PricingItemList />
      </div>

      {/* Profit summary — pinned below scroll */}
      <div className="mt-2 pt-2 border-t border-border">
        <ProfitSummaryTable />
      </div>

      {/* Footer with actions */}
      <div className="mt-2 pt-2 border-t border-border">
        <PricingActions />
      </div>
    </div>
  );
}

// ---------------------------------------------
// Main Export Component
// ---------------------------------------------

/**
 * PricingPanelContent - Main pricing panel with provider wrapper
 * Wraps inner content with PricingPanelProvider for state management
 */
export function PricingPanelContent({
  className = "",
  quotationId,
  rfqId,
}: PricingPanelContentProps) {
  return (
    <PricingPanelProvider quotationId={quotationId} rfqId={rfqId}>
      <PricingPanelInner className={className} />
    </PricingPanelProvider>
  );
}

// ---------------------------------------------
// Auto-load hook for demo/testing
// ---------------------------------------------

/**
 * Hook to auto-load demo data when no quotationId is provided
 * Used for development and testing purposes
 */
export function usePricingAutoLoad(quotationId?: number) {
  const { loadQuotationData } = usePricingPanel();

  useEffect(() => {
    // Load demo quotation if no ID provided
    if (!quotationId) {
      // Use demo quotation ID 1 for testing
      loadQuotationData(1);
    }
  }, [quotationId, loadQuotationData]);
}
