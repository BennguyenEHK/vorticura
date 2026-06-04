// Pre-filter bad supplier pages before LLM extraction.

export interface EliminateInput {
  url: string;
  title?: string;
  content: string;  // raw_content / cleaned text from Tavily
}

export type EliminateReason = 'out_of_stock' | 'qty_below_required' | 'no_product_terms';

export interface EliminateResult {
  eliminated: boolean;
  reason?: EliminateReason;  // present only when eliminated === true
}

// --- Out-of-stock patterns (case-insensitive) ---
// Word-boundary anchors prevent "0 in stock" matching "1,200 in stock".
const OUT_OF_STOCK_REGEX =
  /out[\s-]?of[\s-]?stock|sold out|no longer available|discontinued|currently unavailable|\b0\s+in\s+stock\b|\bstock:\s*0\b/i;

// --- Stock quantity extraction patterns ---
// Matches: "123 in stock", "stock: 123", "qty available: 123", etc.
// Handles comma-formatted numbers: "1,234 in stock" → 1234.
const QTY_PATTERNS = [
  /(\d{1,3}(?:,\d{3})*)\s+in\s+stock/i,
  /stock:\s*(\d{1,3}(?:,\d{3})*)/i,
  /(\d{1,3}(?:,\d{3})*)\s+available(?:\s+to\s+(?:ship|order|buy)|\s+(?:in\s+stock|now|immediately|for\s+(?:immediate\s+)?(?:shipment|delivery|order))|\s*[,\.;\r\n]|$)/i,
  /qty\s+available:\s*(\d{1,3}(?:,\d{3})*)/i,
  /in\s+stock:\s*(\d{1,3}(?:,\d{3})*)/i,
  /available\s*:\s*(\d{1,3}(?:,\d{3})*)/i,
];

// --- Product/commerce term keywords ---
const PRODUCT_TERMS = [
  'product',
  'item',
  'price',
  'buy',
  'add to cart',
  'sku',
  'part number',
  'model',
  'datasheet',
  'specification',
  'quote',
  'in stock',
  'catalog',
  'order',
];

// Single regex compiled from all product terms.
const PRODUCT_TERMS_REGEX = new RegExp(PRODUCT_TERMS.join('|'), 'i');

/**
 * Decide whether a candidate page should be dropped.
 * requiredQty = RFQ item's required quantity.
 * buffer defaults to 1 (small margin for low-qty items).
 *
 * Rules (first match wins):
 * 1. OUT OF STOCK phrase → eliminate('out_of_stock')
 * 2. Stock qty N found and N < requiredQty + buffer → eliminate('qty_below_required')
 *    No qty stated → treat as unknown, do NOT eliminate.
 * 3. No product/commerce terms → eliminate('no_product_terms')
 * 4. All checks passed → { eliminated: false }
 *
 * Empty content → eliminate('no_product_terms').
 */
export function eliminatePage(
  input: EliminateInput,
  requiredQty: number,
  buffer: number = 1,
): EliminateResult {
  const content = input.content || '';

  // Rule 1: out-of-stock phrase check.
  if (OUT_OF_STOCK_REGEX.test(content)) {
    return { eliminated: true, reason: 'out_of_stock' };
  }

  // Rule 2: stated stock qty vs requirement.
  for (const pattern of QTY_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      // Strip commas and parse.
      const qtyStr = match[1].replace(/,/g, '');
      const qty = parseInt(qtyStr, 10);
      if (!isNaN(qty) && qty < requiredQty + buffer) {
        return { eliminated: true, reason: 'qty_below_required' };
      }
      // Qty found and passes — stop checking patterns.
      break;
    }
  }
  // No qty pattern matched → unknown, do not eliminate.

  // Rule 3: at least one product/commerce term required.
  const hasProductTerms = PRODUCT_TERMS_REGEX.test(content);
  if (!hasProductTerms) {
    return { eliminated: true, reason: 'no_product_terms' };
  }

  // Rule 4: all checks passed.
  return { eliminated: false };
}
