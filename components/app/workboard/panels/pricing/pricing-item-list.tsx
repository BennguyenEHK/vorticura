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

  // Native capture-phase contextmenu listener for bulk-update popover.
  //
  // Handles: mouse right-click and two-finger touchpad tap — both fire contextmenu.
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
  // We use refs (variablesMapRef, filteredItemsRef) so the effect never needs
  // to re-run; it always reads the latest data via ref.current.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      console.error("[pricing:list] containerRef is null — native contextmenu listener NOT attached");
      return;
    }
    console.log("[pricing:list] native contextmenu capture listener attached");

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

      // Fallback blur: nativeMouseDown already blurs on mousedown(2) so this is
      // usually a no-op. Kept for safety (e.g. keyboard-triggered contextmenu).
      inputEl.blur();

      console.log(`[pricing:list] popover queued field=${field} itemId=${clickedId} seed="${seed}" filteredItems=${itemIds.length} pos=(${pos.x},${pos.y})`);

      // 100 ms is enough because nativeMouseDown pre-blurs the input before
      // contextmenu fires, clearing Chromium's editing state early. The stale
      // pointer-completion click that the touchpad driver generates is therefore
      // not produced (no editing state to clean up), so the 350 ms workaround
      // is no longer needed.
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

    // Pre-blur helpers — exit edit mode before contextmenu fires so Chromium
    // has no editing state to clean up, preventing the stale pointer-completion
    // click that would otherwise close the popover immediately.
    const preBlurActive = (source: string) => {
      const active = document.activeElement as HTMLElement | null;
      if (active && active.tagName === "INPUT" && (active as HTMLInputElement).dataset.field) {
        console.log(`[pricing:list] ${source} pre-blur field=${(active as HTMLInputElement).dataset.field}`);
        active.blur();
      }
    };

    // Path A — physical mouse right-click: mousedown(button=2) fires before contextmenu.
    const nativeMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      preBlurActive("mousedown(2)");
    };

    // Path B — touchpad two-finger tap: fires pointerdown(isPrimary=false) when the
    // second finger touches down, BEFORE contextmenu. Physical mouse never sets
    // isPrimary=false, so this path is touchpad-only.
    const nativePointerDown = (e: PointerEvent) => {
      if (e.isPrimary) return;
      preBlurActive("pointerdown(non-primary)");
    };

    const nativeContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Three-tier input resolution — touchpad two-finger tap fires contextmenu
      // with the gesture midpoint as coordinates, which can land on a parent
      // element (label, card border) rather than the <input> itself.
      let inputEl: HTMLInputElement | null = null;

      // Tier 1: direct hit — mouse right-click always lands here.
      if (target.tagName === "INPUT" && (target as HTMLInputElement).dataset.field) {
        inputEl = target as HTMLInputElement;
      }

      // Tier 2: elementFromPoint — gesture midpoint may miss the input but the
      // topmost element at those coordinates is still the input.
      if (!inputEl && (e.clientX !== 0 || e.clientY !== 0)) {
        const atPoint = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        if (atPoint?.tagName === "INPUT" && (atPoint as HTMLInputElement).dataset.field) {
          inputEl = atPoint as HTMLInputElement;
          console.log(`[pricing:list] contextmenu: tier-2 elementFromPoint found field=${inputEl.dataset.field}`);
        }
      }

      // Tier 3: active-element fallback — when the user is editing a field and
      // two-finger taps near it, honour the focused input within the same card.
      if (!inputEl) {
        const card = target.closest("[data-item-id]") as HTMLElement | null;
        const active = document.activeElement as HTMLElement | null;
        if (
          card &&
          active?.tagName === "INPUT" &&
          (active as HTMLInputElement).dataset.field &&
          card.contains(active)
        ) {
          inputEl = active as HTMLInputElement;
          console.log(`[pricing:list] contextmenu: tier-3 activeElement fallback field=${inputEl.dataset.field}`);
        }
      }

      if (!inputEl) {
        console.log(`[pricing:list] contextmenu target=${target.tagName} at (${e.clientX},${e.clientY}) — no pricing input found, skipped`);
        return;
      }

      const field = inputEl.dataset.field as
        | keyof Omit<PricingVariable, "item_id">
        | undefined;
      if (!field) {
        console.warn("[pricing:list] contextmenu: input has no data-field attr — skipped");
        return;
      }

      e.preventDefault();
      openPopover(field, inputEl, { x: e.clientX, y: e.clientY });
    };

    container.addEventListener("mousedown", nativeMouseDown, { capture: true });
    container.addEventListener("pointerdown", nativePointerDown, { capture: true });
    container.addEventListener("contextmenu", nativeContextMenu, { capture: true });
    return () => {
      console.log("[pricing:list] native mousedown + pointerdown + contextmenu capture listeners removed");
      container.removeEventListener("mousedown", nativeMouseDown, { capture: true });
      container.removeEventListener("pointerdown", nativePointerDown, { capture: true });
      container.removeEventListener("contextmenu", nativeContextMenu, { capture: true });
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
