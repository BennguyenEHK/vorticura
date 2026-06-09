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
//
// Pipeline note: this mirrors the Serper → Jina → Qwen agentic-shopping flow.
// The legacy L1–L4 scraper cascade and URL-liveness probing are gone, so the
// old `layer` / `raw-search` / `liveness` events and the layer/liveness state
// they fed were removed in favour of the query → serper → extract → review
// narrative below.

// ---------------------------------------------
// Wire events — one RFQ search run = one logical stream, keyed by rfqId.
// ---------------------------------------------

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
  // Run boundary — resets the client dashboard.
  | { kind: 'run-start'; itemsTotal: number }
  // The AI-generated Google-Shopping query for one item attempt.
  | { kind: 'query'; itemId: number; attempt: number; query: string }
  // What Serper.dev returned for that query (count + the result hosts).
  | { kind: 'serper'; itemId: number; count: number; hosts: string[] }
  // One source enriched by Jina + Qwen gap-fill (price + provenance fields).
  | {
      kind: 'extract';
      itemId: number;
      host: string;
      price: number;
      currency: string;
      manufacturer: string | null;
      origin: string | null;
      inStock: boolean | null;
      pageType: DashboardPageType | null;
    }
  // A source thrown out because it did not match the requested item.
  | { kind: 'drop'; itemId: number; host: string; reason: string }
  // Dedup funnel after an attempt: new pages scraped → unique kept.
  | { kind: 'dedup'; itemId: number; newCount: number; totalCount: number }
  // The AI reviewer's verdict for an item: stop (sufficient) or retry.
  | { kind: 'review'; itemId: number; sufficient: boolean; reason?: string; kept: number }
  // Per-item density floor check (have vs need).
  | { kind: 'density'; itemId: number; have: number; need: number }
  // Run end summary.
  | { kind: 'run-summary'; itemsTotal: number; dropped: number; exhausted: boolean };

export type SearchProgressEvent = ProgressEnvelope & SearchProgressBody;

/** Narrow `kind` discriminator helper for the reducer. */
export type SearchProgressKind = SearchProgressBody['kind'];

// ---------------------------------------------
// Reducer state — what the dashboard renders.
// ---------------------------------------------

/** One rendered telemetry line (kept in a ref ring buffer, not React state). */
export interface LogLine {
  id: number; // = event.seq (stable key, dedupes)
  // RUN | QUERY | SERPER | EXTRACT | DROP | DEDUP | REVIEW | DENSITY | DONE
  tag: string;
  itemId?: number;
  text: string;
  tone: 'cyan' | 'sky' | 'emerald' | 'red' | 'amber' | 'violet' | 'muted';
}

export interface SearchDashboardState {
  // TEMPORAL (compact strip — progress ring + elapsed)
  startedAt: number | null;
  overallPct: number; // 0..100, monotonic
  itemsTotal: number;
  itemsDone: number; // items at/above the density floor
  finished: boolean;

  // FUNNEL counters (compact strip — replaces the old layer bars + liveness dots)
  sourcesFound: number;  // Σ serper result counts (raw results seen)
  sourcesKept: number;   // # extract events (sources that passed the spec-match filter)
  sourcesPriced: number; // # extract events carrying a real price (> 0)

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
    sourcesFound: 0,
    sourcesKept: 0,
    sourcesPriced: 0,
    queriesFired: 0,
    density: {},
  };
}
