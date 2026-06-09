/** Search telemetry — structured per-stage event emitter. */
// Pure builder + thin side-effecting wrapper; builder is independently testable.
//
// Gate: SEARCH_TELEMETRY === 'off' silences console output.
// SEARCH_PROGRESS_STREAM === 'off' disables the dashboard fan-out.
// Both sinks are independent; dashboard fan-out is always fail-safe.
//
// Mirrors the Serper → Jina → Qwen agentic-shopping flow. Each emit* helper
// publishes one typed wire event to the dashboard AND (unless silenced) writes a
// structured console record. The legacy layer/liveness emitters were removed
// with the L1–L4 cascade.

import { AsyncLocalStorage } from 'async_hooks';
import { eventBus } from '@/lib/event-bus';
import type {
  SearchProgressEvent,
  SearchProgressBody,
  DashboardPageType,
} from '@/types/search-progress';

/** Discrete stages of the supplier-search pipeline (console-record tag). */
export type SearchStage =
  | 'run-start'
  | 'query'
  | 'serper'
  | 'extract'
  | 'drop'
  | 'dedup'
  | 'review'
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
const MAX_ARRAY_LEN = 8;

/**
 * Clamp one top-level payload value:
 * - strings > 300 chars truncated to 300 + '…'
 * - arrays > 8 elements trimmed + '…(+N more)' marker
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
 * Always sets `ts` and `stage`; clamps strings to 300 and arrays to 8.
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

/** Console sink — structured record, silenced by SEARCH_TELEMETRY=off. */
function logConsole(stage: SearchStage, payload: Record<string, unknown>): void {
  if (process.env.SEARCH_TELEMETRY === 'off') return;
  console.log('[search-telemetry] ' + JSON.stringify(buildTelemetryRecord(stage, payload)));
}

// ---------------------------------------------
// Public emit helpers — one per dashboard event.
// Each fans out to the live dashboard AND the console (independently gated).
// ---------------------------------------------

/** Run-open — resets the client dashboard. */
export function emitRunStart(itemsTotal: number): void {
  emitWithCtx({ kind: 'run-start', itemsTotal });
  logConsole('run-start', { itemsTotal });
}

/** AI-generated Google-Shopping query for one item attempt. */
export function emitQuery(itemId: number, attempt: number, query: string): void {
  emitWithCtx({ kind: 'query', itemId, attempt, query });
  logConsole('query', { item_id: itemId, attempt, query });
}

/** What Serper.dev returned: count + the result hosts. */
export function emitSerper(itemId: number, count: number, hosts: string[]): void {
  emitWithCtx({ kind: 'serper', itemId, count, hosts });
  logConsole('serper', { item_id: itemId, count, hosts });
}

/** One source enriched by Jina + Qwen gap-fill. */
export function emitExtract(
  itemId: number,
  host: string,
  price: number,
  currency: string,
  manufacturer: string | null,
  origin: string | null,
  inStock: boolean | null,
  pageType: DashboardPageType | null = null,
): void {
  emitWithCtx({ kind: 'extract', itemId, host, price, currency, manufacturer, origin, inStock, pageType });
  logConsole('extract', { item_id: itemId, host, price, currency, manufacturer, origin, in_stock: inStock });
}

/** A source discarded because it did not match the requested item. */
export function emitDrop(itemId: number, host: string, reason: string): void {
  emitWithCtx({ kind: 'drop', itemId, host, reason });
  logConsole('drop', { item_id: itemId, host, reason });
}

/** Dedup funnel after an attempt: new pages scraped → unique kept. */
export function emitDedup(itemId: number, newCount: number, totalCount: number): void {
  emitWithCtx({ kind: 'dedup', itemId, newCount, totalCount });
  logConsole('dedup', { item_id: itemId, newCount, totalCount });
}

/** AI reviewer verdict for an item: stop (sufficient) or retry. */
export function emitReview(itemId: number, sufficient: boolean, kept: number, reason?: string): void {
  emitWithCtx({ kind: 'review', itemId, sufficient, kept, reason });
  logConsole('review', { item_id: itemId, sufficient, kept, reason });
}

/** Per-item density floor check (have vs need). */
export function emitDensity(itemId: number, have: number, need: number): void {
  emitWithCtx({ kind: 'density', itemId, have, need });
  logConsole('density-check', { item_id: itemId, have, need });
}

/** Run end summary. */
export function emitRunSummary(itemsTotal: number, dropped: number, exhausted: boolean): void {
  emitWithCtx({ kind: 'run-summary', itemsTotal, dropped, exhausted });
  logConsole('run-summary', { items_total: itemsTotal, dropped_count: dropped, budget_exhausted: exhausted });
}
