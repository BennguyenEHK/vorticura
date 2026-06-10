// =============================================
// SEARCH DASHBOARD REDUCER — pure metric fold
// =============================================
// Folds a BATCH of SearchProgressEvents (one rAF frame's worth) into the
// dashboard's scalar/metric state. Pure + side-effect-free so it stays trivially
// testable; the log ring buffer is handled OUTSIDE the reducer (in the hook) to
// keep the high-frequency log path off React's diffing.

import type { SearchProgressEvent, SearchDashboardState } from '@/types/search-progress';
import { initialDashboardState } from '@/types/search-progress';

export type DashboardAction =
  | { type: 'batch'; events: SearchProgressEvent[] }
  | { type: 'reset' };

/** Apply one event in place to a working-copy state. */
function applyEvent(s: SearchDashboardState, e: SearchProgressEvent): void {
  switch (e.kind) {
    case 'run-start':
      // A new run wipes the slate; carry the fresh denominators for the bars.
      Object.assign(s, initialDashboardState());
      s.startedAt = e.t;
      s.itemsTotal = e.itemsTotal;
      s.finished = false;
      s.density = {};
      s.reviewedDone = {};
      break;
    case 'query':
      s.queriesFired += 1;
      break;
    case 'serper':
      s.sourcesFound += e.count;
      break;
    case 'extract':
      s.sourcesKept += 1;
      if (e.price > 0) s.sourcesPriced += 1;
      break;
    case 'drop':
    case 'dedup':
      // No scalar state change — these drive the log narrative only.
      break;
    case 'review':
      // A "sufficient" verdict means the search loop finished this item. Record it
      // separately from density so the per-item density event (which carries the raw
      // source count for the bars) can never clobber the item's done status.
      if (e.sufficient) s.reviewedDone[e.itemId] = true;
      break;
    case 'density':
      s.density[e.itemId] = { have: e.have, need: e.need };
      break;
    case 'run-summary':
      s.finished = true;
      break;
  }
}

/**
 * Items considered done: those the reviewer deemed sufficient OR that reached
 * their density floor. Unioned so neither signal can undo the other.
 */
function countItemsDone(s: SearchDashboardState): number {
  const done = new Set<number>();
  for (const id of Object.keys(s.reviewedDone)) done.add(Number(id));
  for (const id of Object.keys(s.density)) {
    const d = s.density[Number(id)];
    if (d.have >= d.need) done.add(Number(id));
  }
  return done.size;
}

export function dashboardReducer(
  state: SearchDashboardState,
  action: DashboardAction,
): SearchDashboardState {
  if (action.type === 'reset') return initialDashboardState();

  // Work on a shallow clone with cloned mutable sub-objects.
  const next: SearchDashboardState = {
    ...state,
    density: { ...state.density },
    reviewedDone: { ...state.reviewedDone },
  };

  let sawSummary = false;
  for (const e of action.events) {
    applyEvent(next, e);
    if (e.kind === 'run-summary') sawSummary = true;
  }

  next.itemsDone = countItemsDone(next);
  // MONOTONIC completion: density-floor coverage, snapped to 100 on summary.
  const floorPct = next.itemsTotal > 0 ? Math.round((next.itemsDone / next.itemsTotal) * 100) : 0;
  next.overallPct = sawSummary ? 100 : Math.max(state.overallPct, floorPct);
  return next;
}
