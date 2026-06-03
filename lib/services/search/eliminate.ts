// =============================================
// ELIMINATE — pre-filter bad supplier candidate pages
// =============================================
// Stage 0 of the supplier-discovery pipeline: quick elimination gates applied
// BEFORE the LLM extraction, to drop obviously unsuitable pages and save LLM budget.
//
// Pure, no I/O, no LLM, deterministic, never throws. Safe to apply in parallel
// or call repeatedly on the same page — the outcome is always the same.

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

// -----------
// Out-of-stock patterns (case-insensitive substring match)
// -----------
// Plain phrases (safe as substrings) + two numeric forms anchored with word
// boundaries so they do NOT match inside a larger number — e.g. "0 in stock"
// must not fire on "1,200 in stock", and "stock: 0" must not fire on "stock: 50".
const OUT_OF_STOCK_REGEX =
  /out[\s-]?of[\s-]?stock|sold out|no longer available|discontinued|currently unavailable|\b0\s+in\s+stock\b|\bstock:\s*0\b/i;

// -----------
// Stock quantity extraction patterns
// -----------
// Matches: "123 in stock", "stock: 123", "123 available to ship", "qty available: 123", "in stock: 123"
// Handles commas: "1,234 in stock" → 1234
// Note: "available" pattern requires stock-quantity context to avoid matching "2 available models"
const QTY_PATTERNS = [
  /(\d{1,3}(?:,\d{3})*)\s+in\s+stock/i,
  /stock:\s*(\d{1,3}(?:,\d{3})*)/i,
  /(\d{1,3}(?:,\d{3})*)\s+available(?:\s+to\s+(?:ship|order|buy)|\s+(?:in\s+stock|now|immediately|for\s+(?:immediate\s+)?(?:shipment|delivery|order))|\s*[,\.;\r\n]|$)/i,
  /qty\s+available:\s*(\d{1,3}(?:,\d{3})*)/i,
  /in\s+stock:\s*(\d{1,3}(?:,\d{3})*)/i,
  /available\s*:\s*(\d{1,3}(?:,\d{3})*)/i,
];

// -----------
// Product/commerce term keywords (for no_product_terms gate)
// -----------
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

// Compile the product terms into a single regex for efficient matching
const PRODUCT_TERMS_REGEX = new RegExp(PRODUCT_TERMS.join('|'), 'i');

/**
 * Decide whether a candidate page should be dropped before extraction.
 * requiredQty = the RFQ item's required quantity.
 * buffer defaults to 1 (small margin for small-qty items).
 *
 * Rules (apply in order; first match wins):
 * 1. OUT OF STOCK — if content contains out-of-stock phrase → eliminate('out_of_stock')
 * 2. QTY BELOW REQUIRED — if stock N found and N < requiredQty + buffer → eliminate('qty_below_required')
 *    If NO quantity stated → treat as UNKNOWN and DO NOT eliminate (never punish missing data)
 * 3. NO PRODUCT TERMS — if NONE of the product/commerce terms appear → eliminate('no_product_terms')
 * 4. Otherwise → { eliminated: false }
 *
 * Empty/whitespace content → eliminate('no_product_terms').
 * Numbers may contain commas ("1,200 in stock" → 1200).
 */
export function eliminatePage(
  input: EliminateInput,
  requiredQty: number,
  buffer: number = 1,
): EliminateResult {
  const content = input.content || '';

  // Rule 1: Check for out-of-stock phrases (case-insensitive)
  if (OUT_OF_STOCK_REGEX.test(content)) {
    return { eliminated: true, reason: 'out_of_stock' };
  }

  // Rule 2: Check for stated stock quantity and compare against requirement
  for (const pattern of QTY_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      // Remove commas from the captured number and parse as integer
      const qtyStr = match[1].replace(/,/g, '');
      const qty = parseInt(qtyStr, 10);
      if (!isNaN(qty) && qty < requiredQty + buffer) {
        return { eliminated: true, reason: 'qty_below_required' };
      }
      // If we found a quantity that passes the check, stop searching for other patterns
      break;
    }
  }
  // If NO quantity pattern matched → treat as unknown, do NOT eliminate on this rule

  // Rule 3: Check for at least one product/commerce term
  const hasProductTerms = PRODUCT_TERMS_REGEX.test(content);
  if (!hasProductTerms) {
    return { eliminated: true, reason: 'no_product_terms' };
  }

  // Rule 4: All checks passed
  return { eliminated: false };
}
