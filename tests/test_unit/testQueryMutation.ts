import assert from 'assert';
import { mutateQueryItem } from '@/lib/services/search/query-builder';
import type { QueryItem } from '@/lib/services/search/query-builder';

// =============================================
// mutateQueryItem — density-loop retry helper
// =============================================
// Verifies that the four mutation levels behave correctly:
//   attempt 0 → 'exact'    description unchanged
//   attempt 1 → 'relaxed'  dimension/rating tokens stripped
//   attempt 2 → 'synonyms' known procurement synonym substituted
//   attempt 3 → 'category' reduced to first brand + up-to-3 clean tokens

const baseItem: QueryItem = {
  description: 'Stainless hex bolt 200mm 24V grade A2',
  qty: 10,
  uom: 'each',
};

// -----------------------------------------------
// attempt 0 → 'exact' : description IDENTICAL
// -----------------------------------------------
const res0 = mutateQueryItem(baseItem, 0);
assert.strictEqual(
  res0.mutation,
  'exact',
  'attempt 0 must yield mutation===exact',
);
assert.strictEqual(
  res0.item.description,
  baseItem.description,
  'attempt 0 must leave description unchanged',
);
assert.strictEqual(res0.item.qty, baseItem.qty, 'qty must be preserved (attempt 0)');
assert.strictEqual(res0.item.uom, baseItem.uom, 'uom must be preserved (attempt 0)');

// -----------------------------------------------
// attempt 1 → 'relaxed' : drop dimension & rating tokens
// -----------------------------------------------
const res1 = mutateQueryItem(baseItem, 1);
assert.strictEqual(
  res1.mutation,
  'relaxed',
  'attempt 1 must yield mutation===relaxed',
);
assert.ok(
  !res1.item.description.includes('200mm'),
  'attempt 1 must remove dimension token "200mm"',
);
assert.ok(
  !res1.item.description.includes('24V'),
  'attempt 1 must remove rating token "24V"',
);
assert.ok(
  res1.item.description.trim().length > 0,
  'attempt 1 must not produce empty description',
);
// No double-spaces should remain
assert.ok(
  !res1.item.description.includes('  '),
  'attempt 1 must collapse double-spaces',
);

// -----------------------------------------------
// attempt 2 → 'synonyms' : substitute 'bolt' → 'fastener'
// -----------------------------------------------
const res2 = mutateQueryItem(baseItem, 2);
assert.strictEqual(
  res2.mutation,
  'synonyms',
  'attempt 2 must yield mutation===synonyms',
);
assert.ok(
  res2.item.description.includes('fastener'),
  'attempt 2 must replace "bolt" with "fastener"',
);
// Standalone word 'bolt' must no longer appear
assert.ok(
  !/\bbolt\b/i.test(res2.item.description),
  'attempt 2 must not leave standalone word "bolt"',
);

// -----------------------------------------------
// attempt 3 → 'category' : shorter + never empty
// -----------------------------------------------
const res3 = mutateQueryItem(baseItem, 3);
assert.strictEqual(
  res3.mutation,
  'category',
  'attempt 3 must yield mutation===category',
);
const inputTokens = baseItem.description.split(/\s+/).filter(Boolean);
const outputTokens = res3.item.description.split(/\s+/).filter(Boolean);
assert.ok(
  outputTokens.length <= inputTokens.length,
  `attempt 3 must produce shorter or equal token count (got ${outputTokens.length}, input had ${inputTokens.length})`,
);
assert.ok(
  res3.item.description.trim().length > 0,
  'attempt 3 must never return empty description',
);

// -----------------------------------------------
// Edge: attempt >= 4 → 'category' (same branch)
// -----------------------------------------------
const res4 = mutateQueryItem(baseItem, 4);
assert.strictEqual(res4.mutation, 'category', 'attempt >=4 must yield mutation===category');
assert.ok(res4.item.description.trim().length > 0, 'attempt >=4 must never return empty');

// -----------------------------------------------
// Preserve qty/uom through all mutations
// -----------------------------------------------
for (const attempt of [1, 2, 3]) {
  const res = mutateQueryItem(baseItem, attempt);
  assert.strictEqual(res.item.qty, baseItem.qty, `qty must be preserved (attempt ${attempt})`);
  assert.strictEqual(res.item.uom, baseItem.uom, `uom must be preserved (attempt ${attempt})`);
}

console.log('✓ testQueryMutation passed');
