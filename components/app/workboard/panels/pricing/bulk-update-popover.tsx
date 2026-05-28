"use client";

// =============================================
// BULK UPDATE POPOVER - Context menu for bulk updates
// =============================================
// Allows applying a value to multiple items at once
// Triggered by right-click on input fields

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePricingPanel } from "./pricing-panel-provider";
import { VARIABLE_FIELDS, type QuotationItem, type PricingVariable } from "@/types/pricing";
import { parseFormattedNumber } from "@/lib/services/pricing/validation";

// ---------------------------------------------
// Component Props
// ---------------------------------------------

interface BulkUpdatePopoverProps {
  field: keyof Omit<PricingVariable, "item_id">;
  items: QuotationItem[];
  initialValue: string;
  position: { x: number; y: number };
  onClose: () => void;
}

// ---------------------------------------------
// Component
// ---------------------------------------------

/**
 * BulkUpdatePopover - Floating panel for bulk variable updates
 * Uses design tokens: bg-card, border-border, shadow-lg
 */
export function BulkUpdatePopover({
  field,
  items,
  initialValue,
  position,
  onClose,
}: BulkUpdatePopoverProps) {
  // Get action from context
  const { bulkUpdateVariable } = usePricingPanel();

  // Local state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(items.map((i) => i.item_id))
  );
  const [value, setValue] = useState(initialValue);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Get field config for labels
  const fieldConfig = VARIABLE_FIELDS.find((f) => f.key === field);

  // Calculate popover position (prevent overflow)
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Mount/unmount tracer — confirms the popover actually reached the DOM via portal.
  useEffect(() => {
    console.log(`[pricing:popover] mounted field=${field} items=${items.length} pos=(${position.x},${position.y}) seed="${initialValue}"`);
    return () => {
      console.log(`[pricing:popover] unmounted field=${field}`);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Position clamping: deferred via rAF to avoid blocking the main thread.
  useEffect(() => {
    if (!popoverRef.current) {
      console.warn("[pricing:popover] position rAF: popoverRef null at schedule time");
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (!popoverRef.current) {
        console.warn("[pricing:popover] position rAF: popoverRef null inside rAF — skipping clamp");
        return;
      }
      const rect = popoverRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 12;

      let x = position.x;
      if (x + rect.width > vw - margin) x = vw - rect.width - margin;
      if (x < margin) x = margin;

      let y = position.y;
      const spaceBelow = vh - position.y - margin;
      const spaceAbove = position.y - margin;
      if (rect.height > spaceBelow && rect.height <= spaceAbove) {
        y = position.y - rect.height;
      } else if (rect.height > spaceBelow) {
        y = vh - rect.height - margin;
      }
      if (y < margin) y = margin;

      console.log(`[pricing:popover] position clamped (${position.x},${position.y})→(${x},${y}) popover=${Math.round(rect.width)}x${Math.round(rect.height)} viewport=${vw}x${vh}`);
      setAdjustedPosition({ x, y });
    });
    return () => cancelAnimationFrame(frame);
  }, [position]);

  // Close on click outside.
  // We use 'click' (not 'mousedown') so a touchpad two-finger tap that also
  // generates a synthetic mousedown doesn't close the popover before the user
  // sees it. 'click' fires only on a full press+release pair (primary button),
  // which is the correct user-intent signal for "dismiss".
  //
  // Grace period: a touchpad two-finger-tap (contextmenu gesture) can produce a
  // delayed synthetic click after blur() is called on the previously-focused
  // input (Chromium text-editing state cleanup). That synthetic click arrives
  // after our 100 ms open-defer and would immediately close the popover on the
  // first tap. Ignoring clicks that arrive within 300 ms of mount sidesteps this
  // entirely — legitimate user dismiss-clicks happen well after 300 ms.
  useEffect(() => {
    const mountTime = Date.now();

    const handleClickOutside = (e: MouseEvent) => {
      if (Date.now() - mountTime < 300) {
        console.log(`[pricing:popover] click-outside suppressed (grace period, +${Date.now() - mountTime}ms)`);
        return;
      }
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        console.log(`[pricing:popover] click-outside → closing (target=${(e.target as HTMLElement).tagName})`);
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        console.log("[pricing:popover] Escape key → closing");
        onClose();
      }
    };

    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Toggle select all
  const handleToggleAll = useCallback(() => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.item_id)));
    }
  }, [items, selectedIds.size]);

  // Toggle single item
  const handleToggleItem = useCallback((itemId: number) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const handleApply = useCallback(() => {
    if (selectedIds.size === 0) {
      console.warn("[pricing:popover] apply blocked: no items selected");
      return;
    }

    if (value.trim() === "") {
      console.log(`[pricing:popover] apply field=${field} value="" → null (clear) ids=[${Array.from(selectedIds).join(",")}]`);
      bulkUpdateVariable(Array.from(selectedIds), field, null);
      onClose();
      return;
    }

    const parsed = parseFormattedNumber(value);
    if (parsed === null) {
      console.warn(`[pricing:popover] apply blocked: value="${value}" is still a partial token (parseFormattedNumber returned null)`);
      return;
    }

    const finalValue = field === "discount_rate" ? parsed / 100 : parsed;
    console.log(`[pricing:popover] apply field=${field} value="${value}" parsed=${parsed} final=${finalValue} ids=[${Array.from(selectedIds).join(",")}]`);
    bulkUpdateVariable(Array.from(selectedIds), field, finalValue);
    onClose();
  }, [value, selectedIds, field, bulkUpdateVariable, onClose]);

  // Truncate text helper
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const allSelected = selectedIds.size === items.length;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 9999,
      }}
      className="w-72 bg-card border border-border rounded-xl shadow-lg p-4 animate-in fade-in-0 zoom-in-95"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <h4 className="text-sm font-semibold text-foreground">
          Apply to Multiple Items
        </h4>
        <button
          onClick={onClose}
          className="p-1 hover:bg-secondary rounded-md transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Select all checkbox */}
      <label className="flex items-center gap-2 cursor-pointer mb-2 p-1.5 rounded-md hover:bg-muted">
        <button onClick={handleToggleAll} className="text-brand">
          {allSelected ? (
            <CheckSquare className="w-4 h-4" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
        <span className="text-sm text-foreground font-medium">
          Apply to all items
        </span>
      </label>

      {/* Item list */}
      <div className="max-h-36 overflow-y-auto space-y-1 mb-3 p-1 bg-muted rounded-lg">
        {items.map((item) => {
          const isSelected = selectedIds.has(item.item_id);
          return (
            <label
              key={item.item_id}
              className={`flex items-center gap-2 cursor-pointer p-1.5 rounded-md transition-colors ${
                isSelected ? "bg-card" : "hover:bg-card/50"
              }`}
            >
              <button
                onClick={() => handleToggleItem(item.item_id)}
                className={isSelected ? "text-brand" : "text-muted-foreground"}
              >
                {isSelected ? (
                  <CheckSquare className="w-3.5 h-3.5" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
              </button>
              <span className="text-xs text-foreground">
                Item {item.item_id}: {truncateText(item.bidder_description, 20)}
              </span>
            </label>
          );
        })}
      </div>

      {/* Value input */}
      <div className="mb-3">
        <label className="text-xs text-muted-foreground block mb-1">
          {fieldConfig?.label || field.replace("_", " ")}
        </label>
        <Input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9"
          placeholder="Enter value"
          autoFocus
        />
        {fieldConfig && (
          <p className="text-[10px] text-placeholder mt-1">{fieldConfig.hint}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          onClick={handleApply}
          disabled={selectedIds.size === 0}
          className="flex-1 bg-brand text-brand-foreground hover:bg-brand-hover"
          size="sm"
        >
          Apply ({selectedIds.size})
        </Button>
        <Button onClick={onClose} variant="secondary" size="sm">
          Cancel
        </Button>
      </div>
    </div>,
    document.body
  );
}
