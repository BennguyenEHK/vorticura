"use client";

// =============================================
// CURRENCY SELECTOR - Global currency dropdown
// =============================================
// Allows user to select target currency for conversions
// Persists selection to localStorage

import { Globe } from "lucide-react";
import { usePricingPanel } from "./pricing-panel-provider";
import { CURRENCIES, type Currency } from "@/types/pricing";

// ---------------------------------------------
// Component
// ---------------------------------------------

interface CurrencySelectorProps {
  className?: string;
}

/**
 * CurrencySelector - Global currency selection dropdown
 * Uses design tokens: bg-muted, text-label, border-border
 */
export function CurrencySelector({ className = "" }: CurrencySelectorProps) {
  // Get state and actions from context
  const { targetCurrency, setTargetCurrency } = usePricingPanel();

  // Handle currency change
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTargetCurrency(e.target.value as Currency);
  };

  return (
    <div className={`bg-muted rounded-lg p-3 ${className}`}>
      {/* Section label */}
      <label className="text-xs font-medium text-label uppercase tracking-wide mb-2 block">
        Global Currency Setting
      </label>

      {/* Currency dropdown row */}
      <div className="flex items-center gap-2">
        {/* Icon container */}
        <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center">
          <Globe className="w-4 h-4 text-muted-foreground" />
        </div>

        {/* Label and select */}
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-1">
            Target Currency
          </label>
          <select
            value={targetCurrency}
            onChange={handleChange}
            className="w-full h-8 px-2 text-sm bg-card border border-border rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0
                       text-foreground cursor-pointer"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} - {currency.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Helper text */}
      <p className="text-xs text-placeholder mt-2">
        All prices will be converted to {targetCurrency}
      </p>
    </div>
  );
}
