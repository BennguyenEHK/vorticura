"use client";

// =============================================
// PRICING ITEM LIST - Scrollable list of items
// =============================================
// Displays filtered list of pricing item cards
// Manages bulk update popover state

import { useState, useCallback, useMemo } from "react";
import { usePricingPanel } from "./pricing-panel-provider";
import { PricingItemCard } from "./pricing-item-card";
import { BulkUpdatePopover } from "./bulk-update-popover";
import type { PricingVariable, BulkUpdateState } from "@/types/pricing";

// Convert a raw numeric variable value to the string the popover input
// should pre-fill. Mirrors the focused-state formatting in pricing-item-card:
// discount_rate is stored as decimal (0.05) but displayed as percent ("5").
function variableToInputString(
  field: keyof Omit<PricingVariable, "item_id">,
  value: number | null
): string {
  if (value === null) return "";
  if (field === "discount_rate") return String(value * 100);
  return String(value);
}

// ---------------------------------------------
// Component
// ---------------------------------------------

interface PricingItemListProps {
  className?: string;
}

/**
 * PricingItemList - Scrollable list of pricing item cards
 * Handles search filtering and bulk update popover
 */
export function PricingItemList({ className = "" }: PricingItemListProps) {
  // Get state from context
  const { items, variables, searchTerm } = usePricingPanel();

  // Bulk update popover state
  const [bulkState, setBulkState] = useState<BulkUpdateState>({
    isOpen: false,
    field: null,
    selectedItemIds: [],
    value: "",
    anchorPosition: null,
  });

  // Build variables map for O(1) lookup
  const variablesMap = useMemo(
    () => new Map(variables.map((v) => [v.item_id, v])),
    [variables]
  );

  // Filter items based on search term
  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;

    const term = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        item.bidder_description.toLowerCase().includes(term) ||
        String(item.item_id).includes(term)
    );
  }, [items, searchTerm]);

  // Handle context menu on input field.
  // Seed the popover from the raw numeric variable (not the formatted DOM
  // value), so right-clicking an unfocused "50,000"-displayed field doesn't
  // re-parse as 50 via the strip-commas parser.
  const handleContextMenu = useCallback(
    (
      event: React.MouseEvent,
      field: keyof Omit<PricingVariable, "item_id">
    ) => {
      event.preventDefault();

      // Resolve the clicked item from data-item-id attribute on the card.
      // Falls back to the first filtered item if the attribute is missing.
      const cardEl = (event.target as HTMLElement).closest('[data-item-id]') as HTMLElement | null;
      const clickedId = cardEl ? Number(cardEl.dataset.itemId) : filteredItems[0]?.item_id;
      const clickedVar = variablesMap.get(clickedId ?? -1);
      const seed = clickedVar ? variableToInputString(field, clickedVar[field]) : '';

      setBulkState({
        isOpen: true,
        field,
        selectedItemIds: filteredItems.map((item) => item.item_id),
        value: seed,
        anchorPosition: { x: event.clientX, y: event.clientY },
      });
    },
    [filteredItems, variablesMap]
  );

  // Close bulk update popover
  const handleCloseBulkUpdate = useCallback(() => {
    setBulkState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Ghost-mode fallback when no row exists: all fields null so the UI shows
  // the default values as placeholders (not as actual values).
  const getVariables = (itemId: number): PricingVariable => {
    return (
      variablesMap.get(itemId) || {
        item_id: itemId,
        shipping_cost: null,
        tax_rate: null,
        exchange_rate: null,
        profit_rate: null,
        discount_rate: null,
      }
    );
  };

  // Empty state
  if (items.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <p className="text-muted-foreground text-sm">
            No quotation items loaded
          </p>
          <p className="text-placeholder text-xs mt-1">
            Load a quotation to configure pricing variables
          </p>
        </div>
      </div>
    );
  }

  // No search results
  if (filteredItems.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <p className="text-muted-foreground text-sm">
            No items match &quot;{searchTerm}&quot;
          </p>
          <p className="text-placeholder text-xs mt-1">
            Try a different search term
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Item list */}
      <div className="space-y-2">
        {filteredItems.map((item) => (
          <PricingItemCard
            key={item.item_id}
            item={item}
            variables={getVariables(item.item_id)}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>

      {/* Bulk update popover */}
      {bulkState.isOpen && bulkState.anchorPosition && (
        <BulkUpdatePopover
          field={bulkState.field!}
          items={filteredItems}
          initialValue={bulkState.value}
          position={bulkState.anchorPosition}
          onClose={handleCloseBulkUpdate}
        />
      )}
    </div>
  );
}
