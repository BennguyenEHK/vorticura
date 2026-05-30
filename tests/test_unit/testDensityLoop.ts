import assert from 'assert';
import {
  gatherSourcesForItem,
  computeItemsBelowTarget,
  isUsableSourceRow,
  MIN_SOURCES,
  TARGET_SOURCES,
  type DensityExtractFn,
} from '@/lib/services/search/density-loop';
import { createBudget } from '@/lib/services/search/budget';

// =============================================
// Density-validation loop — walks a pre-ranked query list
// =============================================
// The orchestrator passes a pre-ranked list of search queries (from the LLM
// query planner). The loop walks this list until an item reaches MIN_SOURCES
// distinct supplier sources, bounded by the SearchBudget (LLM/wall-clock) AND
// the length of the pre-computed query list. Sources are deduped by source_url
// so a vendor that re-appears across attempts counts once.

const baseItem = { itemId: 5, description: 'Stainless hex bolt M8x40', qty: 100, uom: 'EA' };
const row = (url: string, name = 'Vendor') => ({
  source_url: url, supplier_name: name,
});

/** Build a query list of length n for testing. */
const Q = (n: number): string[] => Array.from({ length: n }, (_, i) => `query ${i}`);

// tsx emits cjs — top-level await is unsupported, so wrap the async assertions.
(async () => {
// --- Reaches MIN_SOURCES and stops early (one distinct row per attempt) ---
{
  let calls = 0;
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () => {
    calls += 1;
    return { rows: [row(`https://x.com/p/${calls}`)], tavilyCalls: 1, deadUrls: 0 };
  };
  const res = await gatherSourcesForItem(baseItem, Q(8), createBudget(), extract);
  assert.equal(res.rows.length, MIN_SOURCES, 'stops as soon as MIN_SOURCES distinct sources collected');
  assert.equal(res.attempts, MIN_SOURCES, 'one attempt per distinct source until floor met');
  assert.equal(res.tavilyCalls, MIN_SOURCES, 'tavilyCalls accumulate across attempts');
}

// --- Dedups by source_url: same URL every attempt never passes the floor ---
{
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () =>
    ({ rows: [row('https://x.com/same')], tavilyCalls: 1, deadUrls: 2 });
  const res = await gatherSourcesForItem(baseItem, Q(4), createBudget(), extract);
  assert.equal(res.rows.length, 1, 'duplicate source_url collapses to a single source');
  assert.equal(res.attempts, 4, 'never met floor → loops through the full query list then stops');
  assert.equal(res.deadUrls, 4 * 2, 'deadUrls accumulate across attempts');
}

// --- TARGET_SOURCES inner cap: a single rich attempt is capped, not infinite ---
{
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () =>
    ({ rows: Array.from({ length: 8 }, (_, i) => row(`https://x.com/p/${i}`)), tavilyCalls: 1, deadUrls: 0 });
  const res = await gatherSourcesForItem(baseItem, Q(8), createBudget(), extract);
  assert.equal(res.rows.length, TARGET_SOURCES, 'a single attempt is capped at TARGET_SOURCES');
  assert.equal(res.attempts, 1, 'floor met in the first attempt → no further retries');
}

// --- Budget already exhausted → loop body never runs ---
{
  let calls = 0;
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () => {
    calls += 1;
    return { rows: [row('https://x.com/never')], tavilyCalls: 1, deadUrls: 0 };
  };
  const spent = createBudget({ maxLlmCalls: 0 }); // isExhausted() true immediately
  const res = await gatherSourcesForItem(baseItem, Q(4), spent, extract);
  assert.equal(calls, 0, 'exhausted budget short-circuits the loop — no extractor calls');
  assert.equal(res.rows.length, 0, 'no rows gathered when budget is spent up front');
}

// --- null rows from extractor are tolerated (hard failure on an attempt) ---
{
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () =>
    ({ rows: null, tavilyCalls: 1, deadUrls: 0 });
  const res = await gatherSourcesForItem(baseItem, Q(4), createBudget(), extract);
  assert.equal(res.rows.length, 0, 'all-null attempts yield zero sources without throwing');
  assert.equal(res.attempts, 4, 'keeps trying through the full query list on empty results');
}

// --- Empty source_url rows are NOT usable → never counted toward the floor ---
// This is the persist-gate fix: a "No product page found" hallucination has an
// empty source_url and must not satisfy MIN_SOURCES or get collected at all.
{
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () =>
    ({ rows: [row(''), row('', 'Hallucinated Co')], tavilyCalls: 1, deadUrls: 0 });
  const res = await gatherSourcesForItem(baseItem, Q(4), createBudget(), extract);
  assert.equal(res.rows.length, 0, 'empty source_url rows are dropped, never collected');
  assert.equal(res.attempts, 4, 'empty rows do not meet the floor → loops through full query list');
}

// --- isUsableSourceRow: only a real, non-empty source_url is usable ---
{
  assert.equal(isUsableSourceRow({ source_url: '', supplier_name: 'X' }), false, 'empty url → not usable');
  assert.equal(isUsableSourceRow({ source_url: '   ', supplier_name: 'X' }), false, 'whitespace url → not usable');
  assert.equal(isUsableSourceRow({ source_url: 'https://x.com/p/1', supplier_name: '' }), true, 'real url → usable even without a name');
}

// --- computeItemsBelowTarget: zero-row AND under-floor items are both flagged ---
{
  const allIds = [1, 2, 3];
  const finalItems = [
    { item_id: 1 }, { item_id: 1 }, { item_id: 1 }, // item 1 → 3 sources (at floor)
    { item_id: 2 },                                  // item 2 → 1 source (below floor)
    // item 3 → 0 sources (absent from finalItems entirely)
  ];
  const below = computeItemsBelowTarget(allIds, finalItems, MIN_SOURCES);
  assert.deepEqual(below.sort(), [2, 3], 'below-target = under floor (2) AND zero-row (3); item 1 excluded');
}

console.log('✓ testDensityLoop passed');
})().catch((err) => { console.error(err); process.exit(1); });
