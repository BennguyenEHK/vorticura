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

  // Native capture-phase listeners for bulk-update popover.
  //
  // TWO trigger paths share one openPopover helper:
  //   1. contextmenu (right-click / two-finger tap / configured touchpad corner)
  //   2. click on [data-bulk-trigger] button (hover icon, works with any input method)
  //
  // WHY native + capture for contextmenu:
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
  // We use refs (variablesMapRef, filteredItemsRef) so the effect never needs
  // to re-run; it always reads the latest data via ref.current.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      console.error("[pricing:list] containerRef is null — native listeners NOT attached");
      return;
    }
    console.log("[pricing:list] native contextmenu + click capture listeners attached");

    // Shared: resolve seed/pos/itemIds from any trigger point and open the popover.
    const openPopover = (
      field: keyof Omit<PricingVariable, "item_id">,
      inputEl: HTMLInputElement,
      pos: { x: number; y: number }
    ) => {
      const cardEl = inputEl.closest("[data-item-id]") as HTMLElement | null;
      const clickedId = cardEl
        ? Number(cardEl.dataset.itemId)
        : filteredItemsRef.current[0]?.item_id;

      if (!cardEl) {
        console.warn(`[pricing:list] trigger field=${field} — no [data-item-id] ancestor, falling back to first item id=${clickedId}`);
      }

      const clickedVar = variablesMapRef.current.get(clickedId ?? -1);
      if (!clickedVar) {
        console.warn(`[pricing:list] trigger itemId=${clickedId} not in variablesMap (size=${variablesMapRef.current.size}) — seed will be ""`);
      }
      const seed = clickedVar ? variableToInputString(field, clickedVar[field]) : "";
      const itemIds = filteredItemsRef.current.map((item) => item.item_id);

      // Blur AFTER capturing data. Commits in-flight draft and clears Chromium's
      // active-edit state, but may trigger async browser cleanup events that would
      // hit the popover's click-outside listener and close it prematurely.
      inputEl.blur();

      console.log(`[pricing:list] popover queued field=${field} itemId=${clickedId} seed="${seed}" filteredItems=${itemIds.length} pos=(${pos.x},${pos.y})`);

      // 100 ms gives Chromium's async text-editing cleanup enough time to drain
      // before the popover mounts and its click-outside listener activates.
      // 0 ms only drains synchronous events; for a still-DOM-focused input the
      // cleanup is asynchronous and survives a 0 ms delay.
      setTimeout(() => {
        console.log(`[pricing:list] popover open (deferred) field=${field} itemId=${clickedId} seed="${seed}"`);
        setBulkState({
          isOpen: true,
          field,
          selectedItemIds: itemIds,
          value: seed,
          anchorPosition: pos,
        });
      }, 100);
    };

    // Path 1 — right-click on a pricing variable input.
    const nativeContextMenu = (e: MouseEvent) => {
      const inputEl = e.target as HTMLElement;
      if (inputEl.tagName !== "INPUT") {
        console.log(`[pricing:list] contextmenu target=${inputEl.tagName} — not an INPUT, skipped`);
        return;
      }
      const field = (inputEl as HTMLInputElement).dataset.field as
        | keyof Omit<PricingVariable, "item_id">
        | undefined;
      if (!field) {
        console.warn("[pricing:list] contextmenu on INPUT with no data-field attr — skipped");
        return;
      }
      e.preventDefault();
      openPopover(field, inputEl as HTMLInputElement, { x: e.clientX, y: e.clientY });
    };

    // Path 2 — left-click on the [data-bulk-trigger] hover button.
    const nativeClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest("[data-bulk-trigger]") as HTMLElement | null;
      if (!btn) return;
      const field = btn.dataset.bulkTrigger as
        | keyof Omit<PricingVariable, "item_id">
        | undefined;
      if (!field) return;
      // Locate the sibling input inside the same card.
      const cardEl = btn.closest("[data-item-id]") as HTMLElement | null;
      const inputEl = cardEl?.querySelector<HTMLInputElement>(`[data-field="${field}"]`) ?? null;
      if (!inputEl) {
        console.warn(`[pricing:list] click-trigger field=${field} — sibling input not found`);
        return;
      }
      console.log(`[pricing:list] click-trigger field=${field}`);
      openPopover(field, inputEl, { x: e.clientX, y: e.clientY });
    };

    container.addEventListener("contextmenu", nativeContextMenu, { capture: true });
    container.addEventListener("click", nativeClick, { capture: true });
    return () => {
      console.log("[pricing:list] native contextmenu + click capture listeners removed");
      container.removeEventListener("contextmenu", nativeContextMenu, { capture: true });
      container.removeEventListener("click", nativeClick, { capture: true });
    };
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
