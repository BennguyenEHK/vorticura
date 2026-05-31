// =============================================
// DENSITY-VALIDATION LOOP — the "missing validation loop" (search_mecha.md Stage 11+)
// =============================================
// The search cascade's tier thresholds are early-exit BONUSES, not floors — an
// item can legitimately exit with 0–1 verified sources. This module adds the
// floor: walk a pre-ranked LLM query list and re-search until an item reaches
// MIN_SOURCES distinct supplier sources.
//
// Termination contract (honours search_mecha.md): the loop is bounded by BOTH
// the per-item SearchBudget (LLM-call + wall-clock ceiling) AND the length of
// the pre-computed query list. Reaching MIN_SOURCES is the goal; the
// budget/list-length ceiling is the guarantee of termination — a hard-to-source
// item degrades to best-effort instead of looping forever.
//
// Dependency-injected extractor: the orchestrator passes extractSupplierForItem
// in. This keeps the loop free of the DB/LLM import graph so it stays a pure,
// unit-testable control structure (see tests/test_unit/testDensityLoop.ts).

import { isExhausted, type SearchBudget } from './budget';
import { logSearchStage } from './telemetry';

// ---------------------------------------------
// Tuning — source-count floor / ceiling / retry cap / fan-out width
// ---------------------------------------------

/** Floor: keep retrying until an item has at least this many distinct sources. */
export const MIN_SOURCES = 3;
/** Inner cap: stop accumulating within a single attempt once this many gathered. */
export const TARGET_SOURCES = 5;
/**
 * How many queries to fire concurrently in each round of the parallel fan-out
 * loop. Default 3 — env-overridable via SEARCH_FANOUT_WIDTH. Tavily rate-limit
 * safety is unchanged: the global tavilyLimit in search/index.ts already
 * serialises live web round-trips under the free-tier ceiling; fan-out only
 * overlaps the *waiting*, not the rate.
 */
export const FANOUT_WIDTH = Number(process.env.SEARCH_FANOUT_WIDTH ?? 3);

// ---------------------------------------------
// Types — minimal shapes so this module avoids the actions/db import graph
// ---------------------------------------------

/** What the loop needs to mutate + probe an item. Mirrors RfqItemInput. */
export interface DensityItem {
  itemId: number;
  description: string;
  qty: number;
  uom: string;
}

/** The loop dedups on source_url; supplier_name is the fallback key component. */
export interface MinimalRow {
  source_url: string;
  supplier_name: string;
}

/**
 * A row only counts as a real supplier source if it has a non-empty source_url.
 * Rows with an empty url are "No product page found" results (often hallucinated
 * names/contacts from a homepage or directory listing) — they must never count
 * toward MIN_SOURCES nor be persisted. This is the persist-gate guard shared with
 * the orchestrator's URL filter.
 */
export function isUsableSourceRow(row: MinimalRow): boolean {
  return typeof row.source_url === 'string' && row.source_url.trim() !== '';
}

/** One extractor pass result (mirrors the orchestrator's ExtractResult). */
export interface DensityExtractResult<R> {
  rows: R[] | null;
  tavilyCalls: number;
  deadUrls: number;
}

/** Injected extractor — runs one search+extract pass for the given query string. */
export type DensityExtractFn<R> = (
  query: string,
  budget: SearchBudget,
) => Promise<DensityExtractResult<R>>;

/** Accumulated outcome across all attempts for one item. */
export interface GatherResult<R> {
  rows: R[];
  tavilyCalls: number;
  deadUrls: number;
  attempts: number;
}

// ---------------------------------------------
// The loop
// ---------------------------------------------

/**
 * Gather distinct supplier sources for one item, walking a pre-ranked LLM query
 * list until MIN_SOURCES is met or the list / budget is exhausted. Sources are
 * deduped by source_url so a vendor re-found across attempts counts once.
 */
export async function gatherSourcesForItem<R extends MinimalRow>(
  item: DensityItem,
  queries: string[],
  budget: SearchBudget,
  extract: DensityExtractFn<R>,
): Promise<GatherResult<R>> {
  const collected = new Map<string, R>();
  let tavilyCalls = 0;
  let deadUrls = 0;
  let attempt = 0;

  while (
    collected.size < MIN_SOURCES &&  // floor not yet met
    !isExhausted(budget) &&          // circuit breaker still holds the leash
    attempt < queries.length         // list length is the natural attempt ceiling
  ) {
    const query = queries[attempt];

    logSearchStage('query-gen', {
      item_id: item.itemId,
      attempt,
      query,
      qty: item.qty,
      uom: item.uom,
    });

    const res = await extract(query, budget);
    tavilyCalls += res.tavilyCalls;
    deadUrls += res.deadUrls;

    // Only real sources count: drop empty-url "no product page" rows entirely so
    // they neither satisfy the floor nor stop the loop early. Dedup by source_url.
    for (const row of res.rows ?? []) {
      if (!isUsableSourceRow(row)) continue;
      const key = row.source_url;
      if (!collected.has(key)) collected.set(key, row);
      if (collected.size >= TARGET_SOURCES) break; // bonus early-exit within an attempt
    }

    logSearchStage('density-check', {
      item_id: item.itemId,
      attempt,
      query,
      have: collected.size,
      need: MIN_SOURCES,
      budgetLeft: budget.maxLlmCalls - budget.llmCallsUsed,
      exhausted: budget.exhausted,
      // Surface BOTH ceilings: budgetLeft is the LLM-call leash; msLeft + tripped reveal when the wall-clock (not the call count) is the real limiter.
      msLeft: Math.max(0, budget.deadline - Date.now()),
      tripped: budget.exhausted ? (budget.llmCallsUsed >= budget.maxLlmCalls ? 'calls' : 'wall') : null,
    });

    attempt++;
  }

  return { rows: [...collected.values()], tavilyCalls, deadUrls, attempts: attempt };
}

// ---------------------------------------------
// Parallel (speculative fan-out) variant
// ---------------------------------------------

/**
 * Parallel counterpart of gatherSourcesForItem.
 *
 * Walks the query list in ROUNDS of up to FANOUT_WIDTH queries, firing each
 * round concurrently via Promise.all on the injected `extract`. After every
 * round the survivors are deduped into `collected` by source_url (first
 * occurrence wins; rows failing isUsableSourceRow are skipped). Accumulates
 * tavilyCalls and deadUrls across all rounds.
 *
 * Stopping rules (checked BEFORE launching a new round):
 *   1. collected.size >= MIN_SOURCES — floor met, no more rounds needed.
 *   2. isExhausted(budget) — circuit-breaker tripped.
 *   3. Query list consumed — nothing left to fire.
 * Results from an overshooting final round are always merged — no waste.
 *
 * Telemetry: emits the same 'query-gen' + 'density-check' events as the
 * sequential loop, extended with a `round` field (0-based) so concurrent
 * attempts remain attributable in structured logs.
 */
export async function gatherSourcesForItemParallel<R extends MinimalRow>(
  item: DensityItem,
  queries: string[],
  budget: SearchBudget,
  extract: DensityExtractFn<R>,
): Promise<GatherResult<R>> {
  const collected = new Map<string, R>();
  let tavilyCalls = 0;
  let deadUrls = 0;
  let queryIndex = 0; // next query to consume from the list
  let round = 0;

  while (
    collected.size < MIN_SOURCES &&  // floor not yet met
    !isExhausted(budget) &&          // circuit breaker
    queryIndex < queries.length      // queries remain
  ) {
    // Slice the next batch — up to FANOUT_WIDTH queries.
    const batchEnd = Math.min(queryIndex + FANOUT_WIDTH, queries.length);
    const batch = queries.slice(queryIndex, batchEnd);

    // Emit query-gen telemetry for each query in the batch before firing.
    for (let bi = 0; bi < batch.length; bi++) {
      logSearchStage('query-gen', {
        item_id: item.itemId,
        attempt: queryIndex + bi,
        query: batch[bi],
        qty: item.qty,
        uom: item.uom,
        round,
      });
    }

    // Fire all queries in this round concurrently.
    const results = await Promise.all(batch.map((q) => extract(q, budget)));

    // Merge results from all concurrent extractions in this round. Tavily/dead
    // counts are accumulated for EVERY result (the work already ran), but once
    // the TARGET_SOURCES inner cap is hit we stop merging further rows.
    for (const res of results) {
      tavilyCalls += res.tavilyCalls;
      deadUrls += res.deadUrls;
      if (collected.size >= TARGET_SOURCES) continue; // cap reached — keep counting, stop merging
      for (const row of res.rows ?? []) {
        if (!isUsableSourceRow(row)) continue;
        const key = row.source_url;
        if (!collected.has(key)) collected.set(key, row);
        if (collected.size >= TARGET_SOURCES) break; // inner cap
      }
    }

    queryIndex = batchEnd;

    // Emit density-check telemetry once per round (after merging the batch).
    logSearchStage('density-check', {
      item_id: item.itemId,
      attempt: queryIndex - 1, // last attempt index in this round
      query: batch[batch.length - 1],
      have: collected.size,
      need: MIN_SOURCES,
      budgetLeft: budget.maxLlmCalls - budget.llmCallsUsed,
      exhausted: budget.exhausted,
      msLeft: Math.max(0, budget.deadline - Date.now()),
      tripped: budget.exhausted ? (budget.llmCallsUsed >= budget.maxLlmCalls ? 'calls' : 'wall') : null,
      round,
    });

    round++;
  }

  return {
    rows: [...collected.values()],
    tavilyCalls,
    deadUrls,
    attempts: queryIndex, // total queries actually launched
  };
}

// ---------------------------------------------
// Telemetry helper — floor-miss detection
// ---------------------------------------------

/**
 * Items whose final distinct-source count is below the floor — INCLUDING items
 * that produced zero rows (absent from finalItems entirely). This redefines the
 * old `items_below_target` (which only caught zero-row items) so telemetry
 * reports under-filled items too.
 */
export function computeItemsBelowTarget(
  allItemIds: number[],
  finalItems: { item_id: number }[],
  minSources: number = MIN_SOURCES,
): number[] {
  const counts = new Map<number, number>();
  for (const id of allItemIds) counts.set(id, 0);
  for (const r of finalItems) counts.set(r.item_id, (counts.get(r.item_id) ?? 0) + 1);
  return [...counts.entries()].filter(([, c]) => c < minSources).map(([id]) => id);
}
