/* ========================================================================
   Search Telemetry — structured per-stage event emitter
   ======================================================================== */
// Builds and optionally logs a structured record for each named stage of the
// supplier-search pipeline. Kept as a pure builder + thin side-effecting
// wrapper so the builder is independently testable without console capture.
//
// Gate: when process.env.SEARCH_TELEMETRY === 'off' the emitter is silent;
// any other value (including unset) enables output.

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

/**
 * Emit a telemetry record to stdout via console.log, prefixed with
 * '[search-telemetry] ', unless process.env.SEARCH_TELEMETRY === 'off'.
 */
export function logSearchStage(
  stage: SearchStage,
  payload: Record<string, unknown>,
): void {
  if (process.env.SEARCH_TELEMETRY === 'off') return;
  console.log('[search-telemetry] ' + JSON.stringify(buildTelemetryRecord(stage, payload)));
}
