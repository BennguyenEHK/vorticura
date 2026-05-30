// =============================================
// DENSITY-VALIDATION LOOP — the "missing validation loop" (search_mecha.md Stage 11+)
// =============================================
// The search cascade's tier thresholds are early-exit BONUSES, not floors — an
// item can legitimately exit with 0–1 verified sources. This module adds the
// floor: keep mutating the query and re-searching until an item reaches
// MIN_SOURCES distinct supplier sources.
//
// Termination contract (honours search_mecha.md): the loop is bounded by BOTH
// the per-item SearchBudget (LLM-call + wall-clock ceiling) AND a hard
// MAX_RETRIES cap. Reaching MIN_SOURCES is the goal; the budget/retry ceiling is
// the guarantee of termination — a hard-to-source item degrades to best-effort
// instead of looping forever.
//
// Dependency-injected extractor: the orchestrator passes extractSupplierForItem
// in. This keeps the loop free of the DB/LLM import graph so it stays a pure,
// unit-testable control structure (see tests/test_unit/testDensityLoop.ts).

import { isExhausted, type SearchBudget } from './budget';
import { mutateQueryItem } from './query-builder';
import { logSearchStage } from './telemetry';

// ---------------------------------------------
// Tuning — source-count floor / ceiling / retry cap
// ---------------------------------------------

/** Floor: keep retrying until an item has at least this many distinct sources. */
export const MIN_SOURCES = 3;
/** Inner cap: stop accumulating within a single attempt once this many gathered. */
export const TARGET_SOURCES = 5;
/** Hard ceiling on query-mutation attempts, independent of the budget. */
export const MAX_RETRIES = 4;

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

/** One extractor pass result (mirrors the orchestrator's ExtractResult). */
export interface DensityExtractResult<R> {
  rows: R[] | null;
  tavilyCalls: number;
  deadUrls: number;
}

/** Injected extractor — runs one search+extract pass for the (mutated) probe. */
export type DensityExtractFn<R> = (
  item: DensityItem,
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
 * Gather distinct supplier sources for one item, mutating the query each retry
 * until MIN_SOURCES is met or the budget / retry ceiling stops us. Sources are
 * deduped by source_url so a vendor re-found across attempts counts once.
 */
export async function gatherSourcesForItem<R extends MinimalRow>(
  item: DensityItem,
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
    attempt < MAX_RETRIES            // independent safety ceiling
  ) {
    // Stage 3 — Query Generation: mutate the base item for this attempt.
    const mutated = mutateQueryItem(
      { description: item.description, qty: item.qty, uom: item.uom },
      attempt,
    );
    const probe: DensityItem = { ...item, description: mutated.item.description };

    logSearchStage('query-gen', {
      item_id: item.itemId,
      attempt,
      mutation: mutated.mutation,
      description: probe.description,
      qty: item.qty,
      uom: item.uom,
    });

    const res = await extract(probe, budget);
    tavilyCalls += res.tavilyCalls;
    deadUrls += res.deadUrls;

    // Dedup by source_url; rows with no URL keep a synthetic per-attempt key so
    // multiple "no product page" markers don't collapse into one another.
    let i = 0;
    for (const row of res.rows ?? []) {
      const key = row.source_url || `__nourl__:${row.supplier_name}:${attempt}:${i++}`;
      if (!collected.has(key)) collected.set(key, row);
      if (collected.size >= TARGET_SOURCES) break; // bonus early-exit within an attempt
    }

    logSearchStage('density-check', {
      item_id: item.itemId,
      attempt,
      mutation: mutated.mutation,
      have: collected.size,
      need: MIN_SOURCES,
      budgetLeft: budget.maxLlmCalls - budget.llmCallsUsed,
      exhausted: budget.exhausted,
    });

    attempt++;
  }

  return { rows: [...collected.values()], tavilyCalls, deadUrls, attempts: attempt };
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
