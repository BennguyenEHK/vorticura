"use client";

// =============================================
// PRICING ACTIONS - Apply and Reset buttons
// =============================================
// Triggers pricing calculations and resets variables

import { RotateCcw, Calculator, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePricingPanel } from "./pricing-panel-provider";

// ---------------------------------------------
// Component
// ---------------------------------------------

interface PricingActionsProps {
  className?: string;
}

/**
 * PricingActions - Apply and Reset action buttons
 * Uses design tokens: bg-success, bg-secondary
 */
export function PricingActions({ className = "" }: PricingActionsProps) {
  // Get state and actions from context
  const { isCalculating, applyPricing, resetVariables, items, variables } =
    usePricingPanel();

  // Disable apply if no items or no variables
  const canApply = items.length > 0 && variables.length > 0 && !isCalculating;

  // Handle apply button click
  const handleApply = async () => {
    await applyPricing();
  };

  // Handle reset button click
  const handleReset = () => {
    resetVariables();
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      {/* Reset button */}
      <Button
        onClick={handleReset}
        variant="secondary"
        size="sm"
        disabled={isCalculating}
        className="flex-1"
      >
        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
        Reset
      </Button>

      {/* Apply button */}
      <Button
        onClick={handleApply}
        disabled={!canApply}
        size="sm"
        className="flex-1 bg-success text-success-foreground hover:bg-success-hover"
      >
        {isCalculating ? (
          <>
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            Calculating...
          </>
        ) : (
          <>
            <Calculator className="w-3.5 h-3.5 mr-1.5" />
            Apply
          </>
        )}
      </Button>
    </div>
  );
}
