// =============================================
// PRICE SELECT VERIFY — TDD-lite regression harness
// =============================================
// Runs a battery of assertions against selectBestPrice from price-select.ts.
// No jest/vitest — plain console.assert + a pass/fail summary, exits non-zero on failure.
//
// Run with:  npx tsx tools/agent-test/price-select.verify.ts

import { selectBestPrice } from '../../lib/services/search/price-select';
import type { PriceCandidate, SpecTokenInput } from '../../lib/services/search/price-select';

// =============================================
// Test infrastructure
// =============================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string): void {
  if (condition) {
    console.log(`  PASS: ${description}`);
    passed++;
  } else {
    console.error(`  FAIL: ${description}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n--- ${title} ---`);
}

// =============================================
// A1 — Boundary-aware numeric matching
// =============================================

section('A1-1: Token "150" must NOT match context "21500" or "1150"');
{
  // "21500" contains "150" as a digit-substring — must NOT match.
  const candidates: PriceCandidate[] = [
    { value: 500, currency: 'USD', context: 'Item code 21500 flanged valve price $500.00' },
    { value: 900, currency: 'USD', context: 'Standard item 1150 available qty 10 $900.00' },
  ];
  const tokens: SpecTokenInput[] = [{ token: '150', weight: 2 }];
  const pick = selectBestPrice(candidates, tokens);
  // Neither candidate should match token "150" — should fall back to lowest price.
  assert(pick !== null, 'returns a pick (fallback to lowest)');
  assert(pick?.matchConfidence === 0, 'matchConfidence is 0 (no genuine match)');
  assert(pick?.lowConfidence === true, 'lowConfidence is true (fallback)');
  assert(pick?.value === 500, 'falls back to lowest valid price ($500)');
}

section('A1-2: Token "150" MUST match context "Class 150 flange"');
{
  const candidates: PriceCandidate[] = [
    { value: 250, currency: 'USD', context: 'DN50 2 inch Class 150 flange $250.00' },
    { value: 180, currency: 'USD', context: 'DN50 2 inch Class 300 flange $180.00' },
  ];
  const tokens: SpecTokenInput[] = [{ token: '150', weight: 2 }];
  const pick = selectBestPrice(candidates, tokens);
  assert(pick !== null, 'returns a pick');
  assert(pick?.value === 250, 'picks the Class 150 candidate ($250)');
  assert((pick?.matchConfidence ?? 0) > 0, 'matchConfidence > 0 (genuine match)');
}

section('A1-3: Token "2" (inch) picks 2" variant over 12" variant');
{
  // "12" contains digit "2" as a substring — must NOT match token "2" via substring.
  const candidates: PriceCandidate[] = [
    { value: 120, currency: 'USD', context: '12 inch Class 150 flanged gate valve $120.00' },
    { value: 45,  currency: 'USD', context: '2 inch Class 150 flanged gate valve $45.00' },
  ];
  const tokens: SpecTokenInput[] = [{ token: '2', weight: 3 }];
  const pick = selectBestPrice(candidates, tokens);
  assert(pick !== null, 'returns a pick');
  assert(pick?.value === 45, 'picks the 2 inch variant ($45), not 12 inch ($120)');
}

// =============================================
// A2 — Synonym / unit normalization
// =============================================

section('A2-1: spec token "2 inch" matches candidate context written as 2"');
{
  const candidates: PriceCandidate[] = [
    { value: 55, currency: 'USD', context: '2" Class 150 gate valve $55.00' },
    { value: 80, currency: 'USD', context: '3" Class 150 gate valve $80.00' },
  ];
  const tokens: SpecTokenInput[] = [{ token: '2 inch', weight: 3 }];
  const pick = selectBestPrice(candidates, tokens);
  assert(pick !== null, 'returns a pick');
  assert(pick?.value === 55, 'picks the 2" variant ($55) when spec says "2 inch"');
  assert((pick?.matchConfidence ?? 0) > 0, 'matchConfidence > 0');
}

section('A2-2: spec token "2in" matches candidate context written as 2"');
{
  const candidates: PriceCandidate[] = [
    { value: 55, currency: 'USD', context: '2" Class 150 gate valve $55.00' },
    { value: 80, currency: 'USD', context: '3" Class 150 gate valve $80.00' },
  ];
  const tokens: SpecTokenInput[] = [{ token: '2in', weight: 3 }];
  const pick = selectBestPrice(candidates, tokens);
  assert(pick !== null, 'returns a pick');
  assert(pick?.value === 55, 'picks the 2" variant ($55) when spec says "2in"');
}

section('A2-3: spec token "Class 150" matches candidate context written as "#150"');
{
  const candidates: PriceCandidate[] = [
    { value: 95,  currency: 'USD', context: '#150 flanged valve 2 inch $95.00' },
    { value: 140, currency: 'USD', context: '#300 flanged valve 2 inch $140.00' },
  ];
  const tokens: SpecTokenInput[] = [{ token: 'Class 150', weight: 2 }];
  const pick = selectBestPrice(candidates, tokens);
  assert(pick !== null, 'returns a pick');
  assert(pick?.value === 95, 'picks the #150 variant ($95) when spec says "Class 150"');
  assert((pick?.matchConfidence ?? 0) > 0, 'matchConfidence > 0');
}

section('A2-4: spec token "Class 150" matches candidate context written as "150LB"');
{
  const candidates: PriceCandidate[] = [
    { value: 95,  currency: 'USD', context: '150LB flanged gate valve 2 inch $95.00' },
    { value: 140, currency: 'USD', context: '300LB flanged gate valve 2 inch $140.00' },
  ];
  const tokens: SpecTokenInput[] = [{ token: 'Class 150', weight: 2 }];
  const pick = selectBestPrice(candidates, tokens);
  assert(pick !== null, 'returns a pick');
  assert(pick?.value === 95, 'picks the 150LB variant ($95) when spec says "Class 150"');
}

section('A2-5: spec token "150LB" matches candidate context written as "Class 150"');
{
  const candidates: PriceCandidate[] = [
    { value: 95,  currency: 'USD', context: 'Class 150 flanged gate valve 2 inch $95.00' },
    { value: 140, currency: 'USD', context: 'Class 300 flanged gate valve 2 inch $140.00' },
  ];
  const tokens: SpecTokenInput[] = [{ token: '150LB', weight: 2 }];
  const pick = selectBestPrice(candidates, tokens);
  assert(pick !== null, 'returns a pick');
  assert(pick?.value === 95, 'picks the Class 150 variant ($95) when spec says "150LB"');
}

// =============================================
// Existing behavior preservation
// =============================================

section('Existing: single valid candidate → matchConfidence 1, lowConfidence false');
{
  const candidates: PriceCandidate[] = [
    { value: 75, currency: 'USD', context: '2 inch Class 150 gate valve $75.00' },
  ];
  const tokens: SpecTokenInput[] = [{ token: '2', weight: 1 }, { token: '150', weight: 2 }];
  const pick = selectBestPrice(candidates, tokens);
  assert(pick !== null, 'returns a pick');
  assert(pick?.matchConfidence === 1, 'matchConfidence is exactly 1');
  assert(pick?.lowConfidence === false, 'lowConfidence is false');
  assert(pick?.value === 75, 'value is 75');
}

section('Existing: zero-match → lowest price fallback with lowConfidence true');
{
  const candidates: PriceCandidate[] = [
    { value: 300, currency: 'USD', context: 'Product A $300.00' },
    { value: 150, currency: 'USD', context: 'Product B $150.00' },
    { value: 450, currency: 'USD', context: 'Product C $450.00' },
  ];
  const tokens: SpecTokenInput[] = [{ token: 'xyznotfound', weight: 1 }];
  const pick = selectBestPrice(candidates, tokens);
  assert(pick !== null, 'returns a pick (fallback)');
  assert(pick?.matchConfidence === 0, 'matchConfidence is 0');
  assert(pick?.lowConfidence === true, 'lowConfidence is true');
  assert(pick?.value === 150, 'falls back to lowest price ($150)');
}

section('Existing: tie breaks to LOWEST price');
{
  // Both candidates have the same tokens in context — tie must resolve to lowest price.
  const candidates: PriceCandidate[] = [
    { value: 200, currency: 'USD', context: 'Class 150 flanged gate valve 2 inch $200.00' },
    { value: 175, currency: 'USD', context: 'Class 150 flanged gate valve 2 inch $175.00' },
  ];
  const tokens: SpecTokenInput[] = [{ token: '2', weight: 1 }, { token: '150', weight: 2 }];
  const pick = selectBestPrice(candidates, tokens);
  assert(pick !== null, 'returns a pick');
  assert(pick?.value === 175, 'tie breaks to LOWEST price ($175)');
}

section('Existing: null returned when no valid (positive) candidates');
{
  const candidates: PriceCandidate[] = [
    { value: 0,   currency: 'USD', context: 'free item' },
    { value: -1,  currency: 'USD', context: 'invalid' },
  ];
  const pick = selectBestPrice(candidates, [{ token: '150', weight: 1 }]);
  assert(pick === null, 'returns null when all candidates are zero/negative');
}

section('Existing: no spec tokens → falls back to lowest price, lowConfidence true');
{
  const candidates: PriceCandidate[] = [
    { value: 500, currency: 'USD', context: 'Product A' },
    { value: 200, currency: 'USD', context: 'Product B' },
  ];
  const pick = selectBestPrice(candidates, []);
  assert(pick !== null, 'returns a pick');
  assert(pick?.matchConfidence === 0, 'matchConfidence is 0 with no tokens');
  assert(pick?.lowConfidence === true, 'lowConfidence true with no tokens');
  assert(pick?.value === 200, 'falls back to lowest price ($200)');
}

// =============================================
// Summary
// =============================================

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
if (failed > 0) {
  process.exit(1);
}
