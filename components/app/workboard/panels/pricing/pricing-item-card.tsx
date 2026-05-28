"use client";

// =============================================
// PRICING ITEM CARD - Per-item variable inputs
// =============================================
// Displays item info and editable pricing variables.
// Each input is *string-backed* during editing so partial-typing tokens
// (e.g. "1.", "5,") survive re-renders. We only commit to numeric state
// when the input parses to a complete number (parseFormattedNumber returns
// non-null). On blur, we commit the latest typed value (resolves "1." → 1).

import { useState, useCallback, useEffect, useRef, memo } from "react";
import { Input } from "@/components/ui/input";
import { usePricingPanel } from "./pricing-panel-provider";
import {
  VARIABLE_FIELDS,
  DEFAULT_PRICING_VARIABLES,
  type QuotationItem,
  type PricingVariable,
} from "@/types/pricing";
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
// Helpers
// ---------------------------------------------

type VarField = keyof Omit<PricingVariable, "item_id">;

/** Convert a numeric variable value to the string shown when the input is
 *  focused (raw, no thousand separators). Returns "" for null. */
function rawString(field: VarField, value: number | null): string {
  if (value === null) return "";
  if (field === "discount_rate") return String(value * 100);
  return String(value);
}

/** Convert a numeric variable value to the string shown when the input is
 *  *not* focused (formatted display). Returns "" for null so the placeholder
 *  (ghost default) shows through. */
function formattedString(field: VarField, value: number | null): string {
  if (value === null) return "";
  const config = VARIABLE_FIELDS.find((f) => f.key === field);
  switch (config?.format) {
    case "currency":
      return formatNumber(value, 0);
    case "percent":
      return (value * 100).toFixed(1);
    case "rate":
    default:
      return String(value);
  }
}

/** Ghost placeholder string for a field, derived from DEFAULT_PRICING_VARIABLES.
 *  This is what the user sees when the field is null and unfocused. */
function placeholderFor(field: VarField): string {
  const def = DEFAULT_PRICING_VARIABLES[field];
  if (field === "discount_rate") return String(def * 100); // 0 → "0"
  return String(def);
}

// ---------------------------------------------
// Component
// ---------------------------------------------

/**
 * PricingItemCard - Individual item with pricing variable inputs.
 *
 * Carries a per-field draft string in local state. The driver here is the
 * draft, not the numeric variables: as the user types we update the draft
 * immediately and only commit to the upstream provider when the draft is a
 * complete number. This keeps partial-typing tokens like "1." stable across
 * re-renders.
 */
// memo prevents re-renders when unrelated variables change in sibling items.
// Effective only when the parent passes stable prop references — ensured by:
//   - item: loaded once, same reference throughout the session
//   - variables: updateVariable keeps unchanged items as the same object reference
//   - onContextMenu: stabilized via variablesMapRef in PricingItemList
export const PricingItemCard = memo(function PricingItemCard({
  item,
  variables,
  onContextMenu,
  className = "",
}: PricingItemCardProps) {
  const { updateVariable } = usePricingPanel();

  const [focusedField, setFocusedField] = useState<VarField | null>(null);
  // Per-field input draft. Object indexed by field key.
  const [drafts, setDrafts] = useState<Record<VarField, string>>({
    shipping_cost: "",
    tax_rate: "",
    exchange_rate: "",
    profit_rate: "",
    discount_rate: "",
  });

  // Re-sync drafts from upstream variables whenever they change AND the field
  // isn't currently being edited. Without this guard, an upstream re-render
  // during typing would clobber the in-flight draft.
  const focusedFieldRef = useRef<VarField | null>(null);
  useEffect(() => {
    focusedFieldRef.current = focusedField;
  }, [focusedField]);
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      (Object.keys(prev) as VarField[]).forEach((field) => {
        if (focusedFieldRef.current === field) return; // don't clobber active draft
        next[field] = formattedString(field, variables[field]);
      });
      return next;
    });
  }, [variables]);

  // Truncate description for display
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  // Per-field handlers --------------------------------------------------------

  const handleFocus = useCallback(
    (field: VarField) => {
      setFocusedField(field);
      // On focus, swap formatted display for raw (no thousand separators) so
      // editing is intuitive. Empty for null.
      setDrafts((prev) => ({ ...prev, [field]: rawString(field, variables[field]) }));
    },
    [variables]
  );

  const handleChange = useCallback(
    (field: VarField, rawValue: string) => {
      // Always reflect the user's keystrokes in the draft, even if not yet a
      // complete number. This is what makes "1." stable while typing toward "1.5".
      setDrafts((prev) => ({ ...prev, [field]: rawValue }));

      // Empty string → clear the upstream value (back to ghost / use default).
      if (rawValue.trim() === "") {
        updateVariable(item.item_id, field, null);
        return;
      }

      const parsed = parseFormattedNumber(rawValue);
      if (parsed === null) return; // partial token (e.g. "1.") — wait for more input

      const finalValue = field === "discount_rate" ? parsed / 100 : parsed;
      updateVariable(item.item_id, field, finalValue);
    },
    [item.item_id, updateVariable]
  );

  const handleBlur = useCallback(
    (field: VarField) => {
      setFocusedField(null);

      // Commit the trailing draft on blur: if the user left "1." in the field,
      // resolve it to 1 (or to null when empty/garbage).
      const draft = drafts[field];
      if (draft.trim() === "") {
        updateVariable(item.item_id, field, null);
      } else {
        const parsed = parseFormattedNumber(draft);
        if (parsed !== null) {
          const finalValue = field === "discount_rate" ? parsed / 100 : parsed;
          updateVariable(item.item_id, field, finalValue);
        }
        // If parse still null after blur (e.g. literally "abc"), leave the
        // upstream value alone; the next render will replace the draft with
        // whatever variables[field] currently is.
      }

      // After blur, re-derive draft from the (now committed) upstream value
      // so the display flips to formatted.
      // The variables-driven useEffect will handle that on the next render.
    },
    [drafts, item.item_id, updateVariable]
  );

  // contextmenu's sole job: suppress the OS-native context menu.
  // The popover trigger lives in handleMouseDown (button=2) below.
  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
    },
    []
  );

  // Right-click trigger via mousedown(button=2). Two things must happen here,
  // in order, BEFORE we call up to the parent to open the popover:
  //   1. Blur the input. When the input has focus + uncommitted typing,
  //      Chromium aggressively prepares its spellcheck/IME context menu and
  //      can show the OS menu even when the subsequent contextmenu's
  //      preventDefault() runs. Blurring clears that edit state, so the OS
  //      menu suppression is reliable. It also commits the in-flight draft
  //      to upstream variables via onBlur.
  //   2. Open the popover via onContextMenu prop.
  // We deliberately do NOT call event.preventDefault() on mousedown — that
  // has side effects on focus/selection and is unnecessary (the local
  // onContextMenu={handleContextMenu} above suppresses the OS menu).
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLInputElement>, field: VarField) => {
      if (event.button !== 2) return;
      event.currentTarget.blur();
      onContextMenu?.(event, field);
    },
    [onContextMenu]
  );

  return (
    <div
      data-item-id={item.item_id}
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
            <label className="text-xs text-muted-foreground block">
              {field.label}
            </label>
            <Input
              type="text"
              value={drafts[field.key]}
              onChange={(e) => handleChange(field.key, e.target.value)}
              onFocus={() => handleFocus(field.key)}
              onBlur={() => handleBlur(field.key)}
              onMouseDown={(e) => handleMouseDown(e, field.key)}
              onContextMenu={handleContextMenu}
              spellCheck={false}
              autoComplete="off"
              className="h-7 text-xs px-2"
              placeholder={placeholderFor(field.key)}
            />
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
});
