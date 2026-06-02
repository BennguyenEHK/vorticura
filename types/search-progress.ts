// =============================================
// SEARCH PROGRESS — shared contract (backend emits ↔ client reducer)
// =============================================
// Single source of truth for the Search Phase Dashboard data path. The backend
// telemetry tap (lib/services/search/telemetry.ts) emits SearchProgressEvent
// values onto the 'search-progress' event-bus channel; the client SSE hook
// (hooks/use-search-progress-sse.ts) folds them into SearchDashboardState.
//
// Keep this file dependency-free so BOTH server (Node) and client (browser)
// can import it without pulling in runtime-specific modules.

// ---------------------------------------------
// Wire events — one RFQ search run = one logical stream, keyed by rfqId.
// ---------------------------------------------

/** Which scraper layer an invocation tick belongs to (mirrors the L0–L4 cascade). */
export type LayerId = 1 | 2 | 3 | 4;

/** URL liveness classification (mirrors LivenessStatus in liveness.ts). */
export type SourceStatus = 'live' | 'dead' | 'blocked';

/** Page classification carried through from the search scorer. */
export type DashboardPageType = 'product' | 'tech_spec';

/**
 * Common envelope on every event:
 * - rfqId scopes the stream so a client only renders its own run.
 * - t is the server Date.now() so the client computes elapsed without clock drift.
 * - seq is monotonic per run; the client drops duplicates (Redis self-echo) and
 *   out-of-order frames.
 */
interface ProgressEnvelope {
  rfqId: number;
  t: number;
  seq: number;
}

/**
 * The kind-specific payloads, WITHOUT the envelope. Defined as a standalone
 * union (not an inline Omit of SearchProgressEvent) so the discriminated members
 * survive — `Omit` over an intersection-with-union collapses to the common keys.
 * The backend emit helper accepts this body and stamps the envelope on.
 */
export type SearchProgressBody =
  | { kind: 'run-start'; itemsTotal: number; llmCap: number; visionCap: number }
  | { kind: 'query-gen'; itemId: number; attempt: number; query: string; round?: number }
  | { kind: 'raw-search'; itemId: number; snippets: number; tavilyCalls: number }
  | { kind: 'layer'; itemId: number; layer: LayerId; track?: string }
  | {
      kind: 'extract';
      itemId: number;
      track: string;
      price: number;
      currency: string;
      sourceUrl: string;
      pageType: DashboardPageType | null;
    }
  | { kind: 'liveness'; itemId: number; status: SourceStatus; host: string }
  | { kind: 'density'; itemId: number; have: number; need: number; round?: number }
  | { kind: 'run-summary'; itemsTotal: number; dropped: number; exhausted: boolean };

export type SearchProgressEvent = ProgressEnvelope & SearchProgressBody;

/** Narrow `kind` discriminator helper for the reducer. */
export type SearchProgressKind = SearchProgressBody['kind'];

// ---------------------------------------------
// Reducer state — what the dashboard renders.
// ---------------------------------------------

/**
 * Per-layer accumulator. `ticks` = invocation count (always meaningful).
 * `used`/`cap` are the authoritative resource gauge for L3 (LLM) and L4 (vision);
 * L1/L2 leave them undefined and normalize against `candidatesSeen` instead.
 */
export interface LayerStat {
  ticks: number;
  used?: number;
  cap?: number;
}

export type LayerBudget = Record<LayerId, LayerStat>;

/** One rendered telemetry line (kept in a ref ring buffer, not React state). */
export interface LogLine {
  id: number; // = event.seq (stable key, dedupes)
  tag: string; // QUERY-GEN | RAW-SEARCH | EXTRACT | LIVENESS | DENSITY
  itemId?: number;
  text: string;
  tone: 'cyan' | 'sky' | 'emerald' | 'red' | 'amber' | 'violet' | 'muted';
}

export interface SearchDashboardState {
  // TEMPORAL (upper-right)
  startedAt: number | null;
  overallPct: number; // 0..100, monotonic
  itemsTotal: number;
  itemsDone: number; // items at/above the density floor
  finished: boolean;

  // LAYER BUDGET (upper-left, 4 bars)
  layers: LayerBudget;
  candidatesSeen: number; // L1/L2 normalization base

  // STATUS COUNTERS (lower header)
  sourcesExtracted: number;
  live: number;
  dead: number;
  blocked: number;

  // INTERNAL — not rendered directly
  queriesFired: number;
  density: Record<number, { have: number; need: number }>;
}

/** Fresh zeroed state — also the shape the reducer resets to on 'run-start'. */
export function initialDashboardState(): SearchDashboardState {
  return {
    startedAt: null,
    overallPct: 0,
    itemsTotal: 0,
    itemsDone: 0,
    finished: false,
    layers: {
      1: { ticks: 0 },
      2: { ticks: 0 },
      3: { ticks: 0, used: 0, cap: 0 },
      4: { ticks: 0, used: 0, cap: 0 },
    },
    candidatesSeen: 0,
    sourcesExtracted: 0,
    live: 0,
    dead: 0,
    blocked: 0,
    queriesFired: 0,
    density: {},
  };
}
