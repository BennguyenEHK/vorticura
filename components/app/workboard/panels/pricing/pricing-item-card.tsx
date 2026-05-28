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
export const PricingItemCard = memo(function PricingItemCard({
  item,
  variables,
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
  const commitDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel pending debounce on unmount to avoid state updates on dead components.
  useEffect(() => () => { if (commitDebounceRef.current) clearTimeout(commitDebounceRef.current); }, []);

  const focusedFieldRef = useRef<VarField | null>(null);
  useEffect(() => {
    focusedFieldRef.current = focusedField;
  }, [focusedField]);
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      (Object.keys(prev) as VarField[]).forEach((field) => {
        if (focusedFieldRef.current === field) {
          console.log(`[pricing:card] item=${item.item_id} sync skip field=${field} (currently focused)`);
          return;
        }
        const newDisplay = formattedString(field, variables[field]);
        if (prev[field] !== newDisplay) {
          console.log(`[pricing:card] item=${item.item_id} sync field=${field} "${prev[field]}"→"${newDisplay}" (upstream=${variables[field]})`);
        }
        next[field] = newDisplay;
      });
      return next;
    });
  }, [variables, item.item_id]);

  // Truncate description for display
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  // Per-field handlers --------------------------------------------------------

  const handleFocus = useCallback(
    (field: VarField) => {
      const raw = rawString(field, variables[field]);
      console.log(`[pricing:card] item=${item.item_id} focus field=${field} upstream=${variables[field]} raw="${raw}"`);
      setFocusedField(field);
      setDrafts((prev) => ({ ...prev, [field]: raw }));
    },
    [variables, item.item_id]
  );

  const handleChange = useCallback(
    (field: VarField, rawValue: string) => {
      setDrafts((prev) => ({ ...prev, [field]: rawValue }));

      // Cancel any pending debounce from the previous keystroke.
      if (commitDebounceRef.current) clearTimeout(commitDebounceRef.current);

      if (rawValue.trim() === "") {
        console.log(`[pricing:card] item=${item.item_id} change field=${field} empty → null`);
        updateVariable(item.item_id, field, null);
        return;
      }

      const parsed = parseFormattedNumber(rawValue);
      if (parsed !== null) {
        // Complete number — commit immediately.
        const finalValue = field === "discount_rate" ? parsed / 100 : parsed;
        console.log(`[pricing:card] item=${item.item_id} change field=${field} raw="${rawValue}" parsed=${parsed} committed=${finalValue}`);
        updateVariable(item.item_id, field, finalValue);
      } else {
        // Partial token (e.g. "1.", "5,") — auto-commit after 400 ms of no typing.
        // This ensures the value is already committed before a right-click fires
        // the contextmenu capture listener, so blur() in that handler is a no-op.
        commitDebounceRef.current = setTimeout(() => {
          commitDebounceRef.current = null;
          const resolved = parseFormattedNumber(rawValue);
          const finalValue = resolved !== null
            ? (field === "discount_rate" ? resolved / 100 : resolved)
            : null;
          console.log(`[pricing:card] item=${item.item_id} debounce-commit field=${field} draft="${rawValue}" committed=${finalValue}`);
          updateVariable(item.item_id, field, finalValue);
        }, 400);
      }
    },
    [item.item_id, updateVariable]
  );

  const handleBlur = useCallback(
    (field: VarField) => {
      // Blur commits immediately — cancel any pending debounce to avoid a
      // duplicate updateVariable call 400 ms later.
      if (commitDebounceRef.current) {
        clearTimeout(commitDebounceRef.current);
        commitDebounceRef.current = null;
      }
      setFocusedField(null);
      const draft = drafts[field];

      if (draft.trim() === "") {
        console.log(`[pricing:card] item=${item.item_id} blur field=${field} draft="" → null`);
        updateVariable(item.item_id, field, null);
      } else {
        const parsed = parseFormattedNumber(draft);
        if (parsed !== null) {
          const finalValue = field === "discount_rate" ? parsed / 100 : parsed;
          console.log(`[pricing:card] item=${item.item_id} blur field=${field} draft="${draft}" committed=${finalValue}`);
          updateVariable(item.item_id, field, finalValue);
        } else {
          console.warn(`[pricing:card] item=${item.item_id} blur field=${field} draft="${draft}" parse failed — upstream unchanged (upstream=${variables[field]})`);
        }
      }
    },
    [drafts, item.item_id, updateVariable, variables]
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
              data-field={field.key}
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
