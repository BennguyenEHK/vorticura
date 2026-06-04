// Density-validation loop — walks a pre-ranked query list until MIN_SOURCES met.
// Bounded by both SearchBudget and query list length (guarantees termination).
// Extractor is dependency-injected for unit-testability.

import { isExhausted, type SearchBudget } from './budget';
import { logSearchStage } from './telemetry';

// --- Tuning: source-count floor / ceiling / fan-out width ---

/** Keep retrying until item has at least this many distinct sources. */
export const MIN_SOURCES = 3;
/** Stop accumulating within one attempt at this many sources. */
export const TARGET_SOURCES = 5;
/**
 * Queries fired concurrently per round. Default 3, env-overridable.
 * Global tavilyLimit in search/index.ts serialises live calls under rate limit.
 */
export const FANOUT_WIDTH = Number(process.env.SEARCH_FANOUT_WIDTH ?? 3);

// --- Types: minimal shapes, avoids actions/db import graph ---

/** What the loop needs to probe an item. Mirrors RfqItemInput. */
export interface DensityItem {
  itemId: number;
  description: string;
  qty: number;
  uom: string;
}

/** Loop dedups on source_url; supplier_name is fallback key component. */
export interface MinimalRow {
  source_url: string;
  supplier_name: string;
}

/**
 * A row counts as a real source only if source_url is non-empty.
 * Empty-url rows are "no product page found" — never count toward MIN_SOURCES.
 */
export function isUsableSourceRow(row: MinimalRow): boolean {
  return typeof row.source_url === 'string' && row.source_url.trim() !== '';
}

/** One extractor pass result (mirrors orchestrator's ExtractResult). */
export interface DensityExtractResult<R> {
  rows: R[] | null;
  tavilyCalls: number;
  deadUrls: number;
}

/** Injected extractor — one search+extract pass per query string. */
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

// --- The loop ---

/**
 * Gather distinct supplier sources for one item, walking a pre-ranked query list
 * until MIN_SOURCES met or list/budget exhausted. Deduped by source_url.
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
    !isExhausted(budget) &&          // circuit breaker still active
    attempt < queries.length         // list length is natural ceiling
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

    // Drop empty-url rows; dedup by source_url.
    for (const row of res.rows ?? []) {
      if (!isUsableSourceRow(row)) continue;
      const key = row.source_url;
      if (!collected.has(key)) collected.set(key, row);
      if (collected.size >= TARGET_SOURCES) break; // inner cap within attempt
    }

    logSearchStage('density-check', {
      item_id: item.itemId,
      attempt,
      query,
      have: collected.size,
      need: MIN_SOURCES,
      budgetLeft: budget.maxLlmCalls - budget.llmCallsUsed,
      exhausted: budget.exhausted,
      // budgetLeft = call leash; msLeft + tripped = wall-clock limiter.
      msLeft: Math.max(0, budget.deadline - Date.now()),
      tripped: budget.exhausted ? (budget.llmCallsUsed >= budget.maxLlmCalls ? 'calls' : 'wall') : null,
    });

    attempt++;
  }

  return { rows: [...collected.values()], tavilyCalls, deadUrls, attempts: attempt };
}

// --- Parallel (speculative fan-out) variant ---

/**
 * Parallel counterpart of gatherSourcesForItem.
 * Walks query list in rounds of up to FANOUT_WIDTH, fired via Promise.all.
 * After each round, survivors deduped into collected by source_url.
 *
 * Stopping rules (checked before each new round):
 *   1. collected.size >= MIN_SOURCES — floor met.
 *   2. isExhausted(budget) — circuit-breaker tripped.
 *   3. Query list consumed.
 * Results from an overshooting final round are always merged.
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
  let queryIndex = 0; // next query to consume
  let round = 0;

  while (
    collected.size < MIN_SOURCES &&  // floor not yet met
    !isExhausted(budget) &&          // circuit breaker
    queryIndex < queries.length      // queries remain
  ) {
    // Slice next batch — up to FANOUT_WIDTH queries.
    const batchEnd = Math.min(queryIndex + FANOUT_WIDTH, queries.length);
    const batch = queries.slice(queryIndex, batchEnd);

    // Emit query-gen telemetry for each query before firing.
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

    // Merge results; accumulate counts even after TARGET_SOURCES cap.
    for (const res of results) {
      tavilyCalls += res.tavilyCalls;
      deadUrls += res.deadUrls;
      if (collected.size >= TARGET_SOURCES) continue; // cap reached — stop merging rows
      for (const row of res.rows ?? []) {
        if (!isUsableSourceRow(row)) continue;
        const key = row.source_url;
        if (!collected.has(key)) collected.set(key, row);
        if (collected.size >= TARGET_SOURCES) break; // inner cap
      }
    }

    queryIndex = batchEnd;

    // Emit density-check telemetry once per round.
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
    attempts: queryIndex, // total queries launched
  };
}

// --- Telemetry helper: floor-miss detection ---

/**
 * Items whose final source count is below the floor, including zero-row items.
 * Redefines old items_below_target to catch under-filled items too.
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
