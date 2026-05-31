import assert from 'assert';
import {
  gatherSourcesForItem,
  gatherSourcesForItemParallel,
  computeItemsBelowTarget,
  isUsableSourceRow,
  MIN_SOURCES,
  TARGET_SOURCES,
  FANOUT_WIDTH,
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

// =============================================
// gatherSourcesForItemParallel — speculative fan-out variant
// =============================================
// These tests exercise the parallel path using the same fake extract pattern
// as the sequential tests above. The extract fn is injected so the tests
// never touch real LLM/Tavily/DB resources.

// --- (a) Reaches MIN_SOURCES and stops launching further rounds ---
// Each extract call returns one unique source. With FANOUT_WIDTH queries per
// round the parallel path should reach MIN_SOURCES within the first round
// (assuming FANOUT_WIDTH >= MIN_SOURCES), OR within at most ceil(MIN_SOURCES /
// FANOUT_WIDTH) rounds — in either case fewer round-trips than a sequential
// loop that would fire one query per attempt.
{
  let calls = 0;
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () => {
    // Each call returns a distinct URL so the collected map grows on every call.
    const callNum = ++calls;
    return { rows: [row(`https://p.com/item/${callNum}`)], tavilyCalls: 1, deadUrls: 0 };
  };
  // Provide more queries than needed so the stopping logic must cut it short.
  const res = await gatherSourcesForItemParallel(baseItem, Q(12), createBudget(), extract);
  assert.ok(res.rows.length >= MIN_SOURCES, 'parallel: reaches at least MIN_SOURCES distinct sources');
  // The parallel path fires FANOUT_WIDTH queries at once; it must stop after the
  // first round where collected.size >= MIN_SOURCES (not keep going for all 12).
  // Attempts (queryIndex) should not exceed the queries consumed by the first
  // round that crosses the floor. With width=3 and MIN_SOURCES=3 that is <= 3.
  assert.ok(
    res.attempts <= Math.ceil(MIN_SOURCES / Math.max(FANOUT_WIDTH, 1)) * FANOUT_WIDTH,
    'parallel: stops launching new rounds once MIN_SOURCES met — fewer queries than sequential would use',
  );
}

// --- (b) Dedupes identical source_url across concurrent results in one round ---
// All extractions in a round return the same URL. After deduplication the
// collected map should have exactly 1 entry regardless of how many concurrent
// extractions ran in the round.
{
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () =>
    ({ rows: [row('https://dup.com/same')], tavilyCalls: 1, deadUrls: 0 });
  // Use enough queries to fill multiple rounds but all return the same URL.
  const res = await gatherSourcesForItemParallel(baseItem, Q(6), createBudget(), extract);
  assert.equal(res.rows.length, 1, 'parallel: dedupes identical source_url across concurrent results');
  // All 6 queries are launched (never reaches MIN_SOURCES with 1 unique URL).
  assert.equal(res.attempts, 6, 'parallel: exhausts query list when floor never met after dedup');
}

// --- (c) Respects budget exhaustion — loop does not start when budget is spent ---
{
  let calls = 0;
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () => {
    calls += 1;
    return { rows: [row(`https://x.com/b/${calls}`)], tavilyCalls: 1, deadUrls: 0 };
  };
  const spent = createBudget({ maxLlmCalls: 0 }); // isExhausted() true immediately
  const res = await gatherSourcesForItemParallel(baseItem, Q(4), spent, extract);
  assert.equal(calls, 0, 'parallel: exhausted budget short-circuits — no extractor calls');
  assert.equal(res.rows.length, 0, 'parallel: no rows gathered when budget spent up front');
  assert.equal(res.attempts, 0, 'parallel: attempts is 0 when budget already exhausted');
}

// --- (d) Merges the overshooting final round without dropping rows ---
// The last round may fire FANOUT_WIDTH queries even though the floor is crossed
// mid-round (Promise.all completes all concurrent calls). Those extra rows must
// still be merged, not discarded. We simulate this by giving only one query
// (so there is only one round of width 1) that returns more than MIN_SOURCES
// rows — all should be collected up to TARGET_SOURCES.
{
  const manyRows = Array.from({ length: 8 }, (_, i) => row(`https://over.com/p/${i}`));
  const extract: DensityExtractFn<ReturnType<typeof row>> = async () =>
    ({ rows: manyRows, tavilyCalls: 1, deadUrls: 0 });
  const res = await gatherSourcesForItemParallel(baseItem, Q(1), createBudget(), extract);
  // Rows collected are capped at TARGET_SOURCES (inner cap still applies).
  assert.equal(
    res.rows.length, TARGET_SOURCES,
    'parallel: final-round rows merged and capped at TARGET_SOURCES, not discarded',
  );
  assert.equal(res.attempts, 1, 'parallel: single-query round consumed exactly one query');
}

console.log('✓ testDensityLoop passed');
})().catch((err) => { console.error(err); process.exit(1); });
