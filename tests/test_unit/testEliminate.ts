// =============================================
// ELIMINATE UNIT TESTS
// =============================================
// Tests the pre-extraction candidate filter in eliminate.ts.
// Covers: each elimination reason, unknown-qty bypass, qty boundary,
// comma numbers, empty content, custom buffer, and a clean survivor.

import { eliminatePage, type EliminateReason } from '../../lib/services/search/eliminate';

// ---------------------------------------------
// Minimal test harness (matches testProductPageScorer.ts conventions)
// ---------------------------------------------
let passed = 0;
let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.error(`  FAIL: ${name}`);
  }
}

function expect(
  name: string,
  content: string,
  requiredQty: number,
  expectedEliminated: boolean,
  expectedReason: EliminateReason | undefined,
  buffer?: number,
) {
  const r = eliminatePage({ url: 'https://example.com/p/1', title: '', content }, requiredQty, buffer);
  check(name, r.eliminated === expectedEliminated && r.reason === expectedReason);
}

// ---- Out of stock ----
expect('out of stock phrase', 'This valve is out of stock right now', 1, true, 'out_of_stock');
expect('sold out phrase', 'Sold out — product page', 1, true, 'out_of_stock');
expect('0 in stock phrase', 'Currently 0 in stock for this item', 1, true, 'out_of_stock');
expect('discontinued phrase', 'This model is discontinued, see catalog', 1, true, 'out_of_stock');

// ---- Qty below required ----
expect('qty below required', '3 in stock for this product', 10, true, 'qty_below_required');
expect('qty below required (comma)', '1,200 in stock product item', 5000, true, 'qty_below_required');
expect('stock: N below required', 'stock: 2 product item', 10, true, 'qty_below_required');

// ---- Qty boundary (requiredQty + buffer): exactly at floor is NOT eliminated ----
// required 10 + buffer 1 = 11; stated 11 → allowed (not < 11).
expect('qty exactly at floor survives', '11 in stock product item price', 10, false, undefined);
// stated 10 → eliminated (< 11).
expect('qty one below floor eliminated', '10 in stock product item', 10, true, 'qty_below_required');

// ---- Unknown qty bypass (no stated quantity → never eliminate on qty) ----
expect('unknown qty bypasses qty rule', 'Great product, buy now, add to cart', 9999, false, undefined);

// ---- Custom buffer ----
expect('custom buffer eliminates', '20 in stock product item', 10, true, 'qty_below_required', 15);
expect('custom buffer survives', '30 in stock product item price', 10, false, undefined, 15);

// ---- No product terms ----
expect('no product terms', 'Welcome to our corporate mission and values page', 1, true, 'no_product_terms');
expect('empty content → no_product_terms', '', 10, true, 'no_product_terms');
expect('whitespace content → no_product_terms', '   ', 10, true, 'no_product_terms');

// ---- Clean survivor ----
expect('clean product page survives', 'Industrial gate valve, price $120, in stock, add to cart, SKU 12345', 5, false, undefined);

// ---------------------------------------------
// Final summary
// ---------------------------------------------
console.log(`\nEliminate: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
export {};
