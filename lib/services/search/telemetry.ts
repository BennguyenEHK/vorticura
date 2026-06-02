/* ========================================================================
   Search Telemetry — structured per-stage event emitter
   ======================================================================== */
// Builds and optionally logs a structured record for each named stage of the
// supplier-search pipeline. Kept as a pure builder + thin side-effecting
// wrapper so the builder is independently testable without console capture.
//
// Gate: when process.env.SEARCH_TELEMETRY === 'off' the emitter is silent;
// any other value (including unset) enables output.
//
// SEARCH PHASE DASHBOARD TAP: every logSearchStage call ALSO fans the record out
// to the 'search-progress' event-bus channel (mapped to a typed wire event), so
// the live UI dashboard receives the same signal the console logs. This sink is
// gated independently by SEARCH_PROGRESS_STREAM (only 'off' disables) and is fully
// fail-safe — it never throws into the search pipeline.

import { AsyncLocalStorage } from 'async_hooks';
import { eventBus } from '@/lib/event-bus';
import type {
  SearchProgressEvent,
  SearchProgressBody,
  LayerId,
  SourceStatus,
  DashboardPageType,
} from '@/types/search-progress';

/** The discrete stages of the supplier-search pipeline. */
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

/** Maximum character length for any top-level string payload value. */
const MAX_STRING_LEN = 300;

/** Maximum element count for any top-level array payload value. */
const MAX_ARRAY_LEN = 5;

/**
 * Clamp a single top-level payload value:
 * - strings longer than 300 chars are truncated to 300 + '…'
 * - arrays longer than 5 elements are trimmed to 5 + a '…(+N more)' marker
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
 *
 * - Always sets `ts` (new Date().toISOString()) and `stage`.
 * - Spreads the caller payload AFTER ts/stage so those two are always present.
 * - Clamps top-level string values to 300 chars and arrays to 5 elements.
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

/* ========================================================================
   Search Phase Dashboard — live progress stream (event-bus fan-out)
   ======================================================================== */
// The search pipeline runs items concurrently (Promise.all + pLimit) but always
// within ONE request's async-context tree, so an AsyncLocalStorage store set via
// enterWith() at the top of processSupplierSearch is inherited by every nested
// extract/density emit without threading rfqId through dozens of call sites.
// Concurrent requests get independent context trees, so two parallel runs never
// cross-contaminate each other's rfqId/seq.

interface SearchRunContext {
  rfqId: number;
  /** Monotonic sequence — boxed so increments are visible across async hops. */
  seqRef: { n: number };
}

const searchRunStore = new AsyncLocalStorage<SearchRunContext>();

/** True unless the stream is explicitly turned off (mirrors the console gate). */
function streamEnabled(): boolean {
  return process.env.SEARCH_PROGRESS_STREAM !== 'off';
}

/**
 * Open the progress-stream context for one RFQ search run. Call ONCE at the top
 * of processSupplierSearch (after rfq_id is known). enterWith() scopes the store
 * to the current async execution and everything it spawns afterwards.
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
 * Stamp the run envelope (rfqId/t/seq) onto a partial event and publish it.
 * No-ops when the stream is disabled OR no run context is active (an emit with
 * no rfqId can't be attributed to a dashboard, so it is dropped).
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

// Small coercion helpers — telemetry payloads are loosely typed Record<string,unknown>.
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Emit the run-open event (resets the client dashboard) and seed the context. */
export function emitRunStart(
  itemsTotal: number,
  llmCap: number,
  visionCap: number,
): void {
  emitWithCtx({ kind: 'run-start', itemsTotal, llmCap, visionCap });
}

/** Emit a URL-liveness classification (feeds the live/dead/blocked counters). */
export function emitLiveness(itemId: number, status: SourceStatus, host: string): void {
  emitWithCtx({ kind: 'liveness', itemId, status, host });
}

/** Emit a scraper-layer invocation tick (feeds the four left-hand budget bars). */
export function emitLayer(itemId: number, layer: LayerId, track?: string): void {
  emitWithCtx({ kind: 'layer', itemId, layer, track });
}

/**
 * Map a console telemetry record to its typed wire event and publish. Pure
 * side-channel: wrapped so a mapping error can never escape into logSearchStage.
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
      // 'persist' is folded into 'run-summary' — no dedicated UI event.
    }
  } catch {
    /* mapping failure must never break telemetry */
  }
}

/**
 * Emit a telemetry record to stdout via console.log, prefixed with
 * '[search-telemetry] ', unless process.env.SEARCH_TELEMETRY === 'off'.
 *
 * Always fans the record out to the live dashboard stream FIRST (independently
 * gated), so disabling the console logs does not disable the UI.
 */
export function logSearchStage(
  stage: SearchStage,
  payload: Record<string, unknown>,
): void {
  emitSearchProgress(stage, payload);
  if (process.env.SEARCH_TELEMETRY === 'off') return;
  console.log('[search-telemetry] ' + JSON.stringify(buildTelemetryRecord(stage, payload)));
}
