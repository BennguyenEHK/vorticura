/** Search telemetry — structured per-stage event emitter. */
// Pure builder + thin side-effecting wrapper; builder is independently testable.
//
// Gate: SEARCH_TELEMETRY === 'off' silences console output.
// SEARCH_PROGRESS_STREAM === 'off' disables the dashboard fan-out.
// Both sinks are independent; dashboard fan-out is always fail-safe.

import { AsyncLocalStorage } from 'async_hooks';
import { eventBus } from '@/lib/event-bus';
import type {
  SearchProgressEvent,
  SearchProgressBody,
  LayerId,
  SourceStatus,
  DashboardPageType,
} from '@/types/search-progress';

/** Discrete stages of the supplier-search pipeline. */
export type SearchStage =
  | 'query-gen'
  | 'raw-search'
  | 'extract'
  | 'persist'
  | 'density-check'
  | 'run-summary';

/** Shape of every emitted telemetry record. */
export interface TelemetryRecord {
  ts: string;
  stage: SearchStage;
  [k: string]: unknown;
}

/** Max character length for any top-level string value. */
const MAX_STRING_LEN = 300;

/** Max element count for any top-level array value. */
const MAX_ARRAY_LEN = 5;

/**
 * Clamp one top-level payload value:
 * - strings > 300 chars truncated to 300 + '…'
 * - arrays > 5 elements trimmed + '…(+N more)' marker
 */
function clampValue(value: unknown): unknown {
  if (typeof value === 'string' && value.length > MAX_STRING_LEN) {
    return value.slice(0, MAX_STRING_LEN) + '…';
  }
  if (Array.isArray(value) && value.length > MAX_ARRAY_LEN) {
    const extra = value.length - MAX_ARRAY_LEN;
    return [...value.slice(0, MAX_ARRAY_LEN), `…(+${extra} more)`];
  }
  return value;
}

/**
 * Build a telemetry record for the given pipeline stage.
 * Always sets `ts` and `stage`; clamps strings to 300 and arrays to 5.
 */
export function buildTelemetryRecord(
  stage: SearchStage,
  payload: Record<string, unknown>,
): TelemetryRecord {
  const clamped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    clamped[k] = clampValue(v);
  }
  return {
    ts: new Date().toISOString(),
    stage,
    ...clamped,
  };
}

// --- Search phase dashboard (event-bus fan-out) ---
// Items run concurrently but within ONE request's async-context tree.
// AsyncLocalStorage inherits rfqId into nested calls without threading it.
// Concurrent requests get independent trees — no cross-contamination.

interface SearchRunContext {
  rfqId: number;
  /** Monotonic sequence counter — boxed so increments cross async hops. */
  seqRef: { n: number };
}

const searchRunStore = new AsyncLocalStorage<SearchRunContext>();

/** True unless stream is explicitly turned off. */
function streamEnabled(): boolean {
  return process.env.SEARCH_PROGRESS_STREAM !== 'off';
}

/**
 * Open progress-stream context for one RFQ run.
 * Call once at top of processSupplierSearch after rfq_id is known.
 */
export function enterSearchRun(rfqId: number): void {
  if (!streamEnabled()) return;
  searchRunStore.enterWith({ rfqId, seqRef: { n: 0 } });
}

/** Publish a fully-formed wire event. Fire-and-forget; never throws. */
function publish(evt: SearchProgressEvent): void {
  try {
    eventBus.emit('search-progress', evt);
  } catch {
    /* transport hiccup must never break the pipeline */
  }
}

/**
 * Stamp run envelope (rfqId/t/seq) onto a partial event and publish.
 * No-ops when stream disabled or no run context is active.
 */
function emitWithCtx(body: SearchProgressBody): void {
  if (!streamEnabled()) return;
  const ctx = searchRunStore.getStore();
  if (!ctx) return;
  const evt: SearchProgressEvent = {
    ...body,
    rfqId: ctx.rfqId,
    t: Date.now(),
    seq: ++ctx.seqRef.n,
  };
  publish(evt);
}

// Coercion helpers — payloads are loosely typed Record<string,unknown>.
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Emit run-open event; resets the client dashboard. */
export function emitRunStart(
  itemsTotal: number,
  llmCap: number,
  visionCap: number,
): void {
  emitWithCtx({ kind: 'run-start', itemsTotal, llmCap, visionCap });
}

/** Emit URL-liveness classification (feeds live/dead/blocked counters). */
export function emitLiveness(itemId: number, status: SourceStatus, host: string): void {
  emitWithCtx({ kind: 'liveness', itemId, status, host });
}

/** Emit scraper-layer invocation tick (feeds budget bars). */
export function emitLayer(itemId: number, layer: LayerId, track?: string): void {
  emitWithCtx({ kind: 'layer', itemId, layer, track });
}

/**
 * Map a telemetry record to a typed wire event and publish.
 * Mapping errors never escape into logSearchStage.
 */
function emitSearchProgress(stage: SearchStage, payload: Record<string, unknown>): void {
  if (!streamEnabled()) return;
  try {
    switch (stage) {
      case 'query-gen':
        emitWithCtx({
          kind: 'query-gen',
          itemId: num(payload.item_id),
          attempt: num(payload.attempt),
          query: str(payload.query),
          round: payload.round as number | undefined,
        });
        break;
      case 'raw-search':
        emitWithCtx({
          kind: 'raw-search',
          itemId: num(payload.item_id),
          snippets: num(payload.snippets),
          tavilyCalls: num(payload.tavilyCalls),
        });
        break;
      case 'extract':
        emitWithCtx({
          kind: 'extract',
          itemId: num(payload.item_id),
          track: str(payload.track),
          price: num(payload.bidder_unit_price),
          currency: str(payload.currency_code),
          sourceUrl: str(payload.source_url),
          pageType: (payload.page_type as DashboardPageType | null) ?? null,
        });
        break;
      case 'density-check':
        emitWithCtx({
          kind: 'density',
          itemId: num(payload.item_id),
          have: num(payload.have),
          need: num(payload.need),
          round: payload.round as number | undefined,
        });
        break;
      case 'run-summary':
        emitWithCtx({
          kind: 'run-summary',
          itemsTotal: num(payload.items_total),
          dropped: num(payload.dropped_count),
          exhausted: Boolean(payload.budget_exhausted),
        });
        break;
      // 'persist' folds into 'run-summary' — no dedicated UI event.
    }
  } catch {
    /* mapping failure must never break telemetry */
  }
}

/**
 * Emit a telemetry record to stdout via console.log.
 * Silenced when SEARCH_TELEMETRY === 'off'.
 * Always fans out to live dashboard first (independently gated).
 */
export function logSearchStage(
  stage: SearchStage,
  payload: Record<string, unknown>,
): void {
  emitSearchProgress(stage, payload);
  if (process.env.SEARCH_TELEMETRY === 'off') return;
  console.log('[search-telemetry] ' + JSON.stringify(buildTelemetryRecord(stage, payload)));
}
