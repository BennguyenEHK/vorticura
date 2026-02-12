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
import { Loader2, AlertCircle } from "lucide-react";
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
  const { isLoading, error, items } = usePricingPanel();

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

      {/* Formula display */}
      <div className="mb-3 p-2 bg-muted rounded-lg">
        <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
          sales_price = ((unit_price + shipping) × tax × exchange × profit) − discount
        </p>
      </div>

      {/* Main scrollable content area */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {/* Currency selector */}
        <CurrencySelector />

        {/* Search bar - only show if items exist */}
        {items.length > 0 && <ItemSearch />}

        {/* Item list with pricing variables */}
        <PricingItemList />

        {/* Profit summary table */}
        <ProfitSummaryTable />
      </div>

      {/* Footer with actions - fixed at bottom */}
      <div className="mt-3 pt-3 border-t border-border">
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
}: PricingPanelContentProps) {
  return (
    <PricingPanelProvider quotationId={quotationId}>
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
