"use client";

// =============================================
// PRICING ITEM CARD - Per-item variable inputs
// =============================================
// Displays item info and editable pricing variables
// Supports right-click for bulk update context menu

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { usePricingPanel } from "./pricing-panel-provider";
import { VARIABLE_FIELDS, type QuotationItem, type PricingVariable } from "@/types/pricing";
import { formatNumber, parseFormattedNumber } from "@/lib/services/pricing/validation";

// ---------------------------------------------
// Component Props
// ---------------------------------------------

interface PricingItemCardProps {
  item: QuotationItem;
  variables: PricingVariable;
  onContextMenu?: (
    event: React.MouseEvent,
    field: keyof Omit<PricingVariable, "item_id">
  ) => void;
  className?: string;
}

// ---------------------------------------------
// Component
// ---------------------------------------------

/**
 * PricingItemCard - Individual item with pricing variable inputs
 * Uses design tokens: border-border, text-foreground, bg-brand-muted, text-brand-dark
 */
export function PricingItemCard({
  item,
  variables,
  onContextMenu,
  className = "",
}: PricingItemCardProps) {
  // Get update action from context
  const { updateVariable, targetCurrency } = usePricingPanel();

  // Local state for input formatting
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Truncate description for display
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  // Handle input change
  const handleChange = useCallback(
    (field: keyof Omit<PricingVariable, "item_id">, rawValue: string) => {
      const parsed = parseFormattedNumber(rawValue);
      if (parsed !== null) {
        // For discount rate, convert percentage to decimal (5% -> 0.05)
        const value = field === "discount_rate" ? parsed / 100 : parsed;
        updateVariable(item.item_id, field, value);
      }
    },
    [item.item_id, updateVariable]
  );

  // Handle right-click for bulk update
  const handleContextMenu = useCallback(
    (event: React.MouseEvent, field: keyof Omit<PricingVariable, "item_id">) => {
      event.preventDefault();
      onContextMenu?.(event, field);
    },
    [onContextMenu]
  );

  // Format value for display
  const formatValue = (field: keyof Omit<PricingVariable, "item_id">, value: number) => {
    // When focused, show raw number for editing
    if (focusedField === field) {
      return field === "discount_rate" ? (value * 100).toString() : value.toString();
    }

    // Format based on field type
    const config = VARIABLE_FIELDS.find((f) => f.key === field);
    switch (config?.format) {
      case "currency":
        return formatNumber(value, 0);
      case "percent":
        return (value * 100).toFixed(1);
      case "rate":
        return value.toString();
      default:
        return value.toString();
    }
  };

  return (
    <div
      className={`border border-border rounded-lg p-3 bg-card hover:border-brand/30
                  transition-colors ${className}`}
    >
      {/* Item header */}
      <div className="flex items-center justify-between mb-3">
        <h5 className="text-sm font-medium text-foreground">
          Item {item.item_id}: {truncateText(item.bidder_description, 35)}
        </h5>
        {/* Currency badge */}
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-brand-muted text-brand-dark">
          {item.currency_code}
        </span>
      </div>

      {/* Variables grid - 2 columns */}
      <div className="grid grid-cols-2 gap-2">
        {VARIABLE_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            {/* Label */}
            <label className="text-xs text-muted-foreground block">
              {field.label}
            </label>
            {/* Input with right-click support */}
            <Input
              type="text"
              value={formatValue(field.key, variables[field.key])}
              onChange={(e) => handleChange(field.key, e.target.value)}
              onFocus={() => setFocusedField(field.key)}
              onBlur={() => setFocusedField(null)}
              onContextMenu={(e) => handleContextMenu(e, field.key)}
              className="h-7 text-xs px-2"
              placeholder={`Enter ${field.label.toLowerCase()}`}
            />
            {/* Hint text */}
            <p className="text-[10px] text-placeholder truncate">{field.hint}</p>
          </div>
        ))}
      </div>

      {/* Item metadata */}
      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span>Qty: <span className="font-data tabular-nums text-ink">{item.qty}</span></span>
        <span className="flex items-center gap-1">
          <span className="text-graphite">Unit:</span>
          <span className="font-data tabular-nums text-neon-amber neon-glow-sm">{formatNumber(item.bidder_unit_price)}</span>
          <span className="text-graphite">{item.currency_code}</span>
        </span>
      </div>
    </div>
  );
}
