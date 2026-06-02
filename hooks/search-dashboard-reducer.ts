// =============================================
// SEARCH DASHBOARD REDUCER — pure metric fold
// =============================================
// Folds a BATCH of SearchProgressEvents (one rAF frame's worth) into the
// dashboard's scalar/metric state. Pure + side-effect-free so it stays trivially
// testable; the log ring buffer is handled OUTSIDE the reducer (in the hook) to
// keep the high-frequency log path off React's diffing.

import type { SearchProgressEvent, SearchDashboardState, LayerBudget } from '@/types/search-progress';
import { initialDashboardState } from '@/types/search-progress';

/** Mirrors the backend density floor (MIN_SOURCES) for the discovery progress term. */
const MIN_SOURCES_HINT = 3;

export type DashboardAction =
  | { type: 'batch'; events: SearchProgressEvent[] }
  | { type: 'reset' };

/** Shallow-clone the mutable sub-objects so the fold never mutates prior state. */
function cloneLayers(layers: LayerBudget): LayerBudget {
  return {
    1: { ...layers[1] },
    2: { ...layers[2] },
    3: { ...layers[3] },
    4: { ...layers[4] },
  };
}

/** Apply one event in place to a working-copy state. */
function applyEvent(s: SearchDashboardState, e: SearchProgressEvent): void {
  switch (e.kind) {
    case 'run-start': {
      // A new run wipes the slate; carry the fresh denominators for the bars.
      Object.assign(s, initialDashboardState());
      s.startedAt = e.t;
      s.itemsTotal = e.itemsTotal;
      s.layers = cloneLayers(s.layers);
      s.layers[3].cap = e.itemsTotal * e.llmCap; // global LLM-call ceiling
      s.layers[4].cap = e.visionCap;             // per-RFQ vision ceiling
      s.density = {};
      break;
    }
    case 'query-gen':
      s.queriesFired += 1;
      break;
    case 'raw-search':
      // candidate pages reaching the extractor — the L1/L2 normalization base.
      s.candidatesSeen += e.snippets;
      break;
    case 'layer': {
      const stat = s.layers[e.layer];
      stat.ticks += 1;
      if (e.layer === 3 || e.layer === 4) stat.used = (stat.used ?? 0) + 1;
      break;
    }
    case 'extract':
      s.sourcesExtracted += 1;
      break;
    case 'liveness':
      if (e.status === 'live') s.live += 1;
      else if (e.status === 'dead') s.dead += 1;
      else s.blocked += 1;
      break;
    case 'density':
      s.density[e.itemId] = { have: e.have, need: e.need };
      break;
    case 'run-summary':
      s.finished = true;
      if (e.itemsTotal > 0) s.itemsTotal = e.itemsTotal;
      break;
  }
}

/** Items that have reached (or exceeded) their density floor. */
function countItemsAtFloor(s: SearchDashboardState): number {
  let n = 0;
  for (const id of Object.keys(s.density)) {
    const d = s.density[Number(id)];
    if (d.need > 0 && d.have >= d.need) n += 1;
  }
  return n;
}

/**
 * Deterministic, MONOTONIC completion estimate (never decreases). Replaces the
 * old fake easing timer with a blend of real signals:
 *   discovery breadth · density-floor coverage · budget pressure · terminal.
 */
function computeProgress(s: SearchDashboardState, prevPct: number): number {
  if (s.finished) return 100;
  const items = s.itemsTotal || 1;
  const floorFrac = s.itemsDone / items;
  const discovery = Math.min(1, s.queriesFired / (items * MIN_SOURCES_HINT));
  const l3 = s.layers[3];
  const budgetFrac = l3.cap ? Math.min(1, (l3.used ?? 0) / l3.cap) : 0;
  const pct =
    100 * (0.15 * discovery + 0.55 * floorFrac + 0.2 * budgetFrac + 0.1 * (s.finished ? 1 : 0));
  return Math.max(prevPct, Math.min(100, Math.round(pct)));
}

export function dashboardReducer(
  state: SearchDashboardState,
  action: DashboardAction,
): SearchDashboardState {
  if (action.type === 'reset') return initialDashboardState();

  // Work on a shallow clone with cloned mutable sub-objects.
  const next: SearchDashboardState = {
    ...state,
    layers: cloneLayers(state.layers),
    density: { ...state.density },
  };

  for (const e of action.events) applyEvent(next, e);

  next.itemsDone = countItemsAtFloor(next);
  next.overallPct = computeProgress(next, state.overallPct);
  return next;
}
