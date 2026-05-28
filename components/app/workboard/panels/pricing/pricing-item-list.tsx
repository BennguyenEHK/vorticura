"use client";

// =============================================
// PRICING ITEM LIST - Scrollable list of items
// =============================================
// Displays filtered list of pricing item cards
// Manages bulk update popover state

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
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

  // Refs that are always current without causing effect re-runs.
  const variablesMapRef = useRef(variablesMap);
  useEffect(() => { variablesMapRef.current = variablesMap; }, [variablesMap]);

  const filteredItemsRef = useRef(filteredItems);
  useEffect(() => { filteredItemsRef.current = filteredItems; }, [filteredItems]);

  // Container ref for the native contextmenu listener.
  const containerRef = useRef<HTMLDivElement>(null);

  // Native capture-phase contextmenu listener.
  //
  // WHY native + capture:
  //   React delegates all events to the root container via bubbling. For text
  //   inputs with recent uncommitted typing, Chromium processes the contextmenu
  //   event SYNCHRONOUSLY during propagation — before the bubbling phase reaches
  //   React's root-container handler. That means React's synthetic onContextMenu
  //   (and its event.preventDefault()) fires too late; the OS/Chromium menu
  //   already committed to showing.
  //
  //   A native addEventListener with { capture: true } on a parent fires during
  //   the capture phase (document → container → input), which runs BEFORE
  //   Chromium's synchronous menu check. Calling preventDefault() here reliably
  //   suppresses the menu regardless of the input's edit state.
  //
  //   This matches what the reference implementation does:
  //   input.addEventListener('contextmenu', handler) — target phase, also early enough.
  //
  // We use refs (variablesMapRef, filteredItemsRef) so the effect never needs
  // to re-run; it always reads the latest data via ref.current.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const nativeContextMenu = (e: MouseEvent) => {
      // Only handle right-clicks on pricing variable inputs (have data-field attr)
      const inputEl = e.target as HTMLElement;
      if (inputEl.tagName !== "INPUT") return;
      const field = (inputEl as HTMLInputElement).dataset.field as
        | keyof Omit<PricingVariable, "item_id">
        | undefined;
      if (!field) return;

      // Suppress OS / Chromium context menu — this is what the reference does.
      e.preventDefault();

      // Blur the input to commit the in-flight draft and clear Chromium's
      // active-edit state so re-opening the popover works consistently.
      (inputEl as HTMLInputElement).blur();

      // Resolve which card was clicked from its data-item-id attribute.
      const cardEl = inputEl.closest("[data-item-id]") as HTMLElement | null;
      const clickedId = cardEl
        ? Number(cardEl.dataset.itemId)
        : filteredItemsRef.current[0]?.item_id;

      // Seed the popover from the raw numeric variable (not the DOM value),
      // so formatted "50,000" doesn't mis-parse as 50.
      const clickedVar = variablesMapRef.current.get(clickedId ?? -1);
      const seed = clickedVar ? variableToInputString(field, clickedVar[field]) : "";

      setBulkState({
        isOpen: true,
        field,
        selectedItemIds: filteredItemsRef.current.map((item) => item.item_id),
        value: seed,
        anchorPosition: { x: e.clientX, y: e.clientY },
      });
    };

    container.addEventListener("contextmenu", nativeContextMenu, { capture: true });
    return () => container.removeEventListener("contextmenu", nativeContextMenu, { capture: true });
  }, []); // empty — all dynamic data accessed via refs

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
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Item list */}
      <div className="space-y-2">
        {filteredItems.map((item) => (
          <PricingItemCard
            key={item.item_id}
            item={item}
            variables={getVariables(item.item_id)}
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
