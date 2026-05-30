import assert from 'assert';
import {
  gatherSourcesForItem,
  computeItemsBelowTarget,
  MIN_SOURCES,
  MAX_RETRIES,
  TARGET_SOURCES,
  type DensityExtractFn,
} from '@/lib/services/search/density-loop';
import { createBudget } from '@/lib/services/search/budget';

// =============================================
// Density-validation loop — the "missing validation loop" fix
// =============================================
// The orchestrator must keep mutating the query and re-searching until an item
// reaches MIN_SOURCES distinct supplier sources, bounded by the SearchBudget
// (LLM/wall-clock) AND a hard MAX_RETRIES ceiling. Sources are deduped by
// source_url so a vendor that re-appears across attempts counts once.

const baseItem = { itemId: 5, description: 'Stainless hex bolt M8x40', qty: 100, uom: 'EA' };
const row = (url: string, name = 'Vendor') => ({
  source_url: url, supplier_name: name,
});

// tsx emits cjs — top-level await is unsupported, so wrap the async assertions.
(async () => {
// --- Reaches MIN_SOURCES and stops early (one distinct row per attempt) ---
{
  let calls = 0;
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () => {
    calls += 1;
    return { rows: [row(`https://x.com/p/${calls}`)], tavilyCalls: 1, deadUrls: 0 };
  };
  const res = await gatherSourcesForItem(baseItem, createBudget(), extract);
  assert.equal(res.rows.length, MIN_SOURCES, 'stops as soon as MIN_SOURCES distinct sources collected');
  assert.equal(res.attempts, MIN_SOURCES, 'one attempt per distinct source until floor met');
  assert.equal(res.tavilyCalls, MIN_SOURCES, 'tavilyCalls accumulate across attempts');
}

// --- Dedups by source_url: same URL every attempt never passes the floor ---
{
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () =>
    ({ rows: [row('https://x.com/same')], tavilyCalls: 1, deadUrls: 2 });
  const res = await gatherSourcesForItem(baseItem, createBudget(), extract);
  assert.equal(res.rows.length, 1, 'duplicate source_url collapses to a single source');
  assert.equal(res.attempts, MAX_RETRIES, 'never met floor → loops up to MAX_RETRIES then stops');
  assert.equal(res.deadUrls, MAX_RETRIES * 2, 'deadUrls accumulate across attempts');
}

// --- TARGET_SOURCES inner cap: a single rich attempt is capped, not infinite ---
{
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () =>
    ({ rows: Array.from({ length: 8 }, (_, i) => row(`https://x.com/p/${i}`)), tavilyCalls: 1, deadUrls: 0 });
  const res = await gatherSourcesForItem(baseItem, createBudget(), extract);
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
  const res = await gatherSourcesForItem(baseItem, spent, extract);
  assert.equal(calls, 0, 'exhausted budget short-circuits the loop — no extractor calls');
  assert.equal(res.rows.length, 0, 'no rows gathered when budget is spent up front');
}

// --- null rows from extractor are tolerated (hard failure on an attempt) ---
{
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () =>
    ({ rows: null, tavilyCalls: 1, deadUrls: 0 });
  const res = await gatherSourcesForItem(baseItem, createBudget(), extract);
  assert.equal(res.rows.length, 0, 'all-null attempts yield zero sources without throwing');
  assert.equal(res.attempts, MAX_RETRIES, 'keeps retrying through MAX_RETRIES on empty results');
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
