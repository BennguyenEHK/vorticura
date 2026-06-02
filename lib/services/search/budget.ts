// =============================================
// SEARCH BUDGET — per-item circuit breaker + lexical relevance floor
// =============================================
// Stage 11 of the supplier-discovery pipeline: the convergence guard.
// The orchestrator threads ONE SearchBudget per RFQ item through the
// search → extract → alt-URL re-loop recursion. Termination is a RESOURCE
// ceiling (LLM-call count + wall-clock), NEVER a quality target — "enough
// sources" is an early-exit BONUS, not a stop condition. A hard-to-source
// item therefore degrades to best-effort instead of looping forever and
// burning the whole serverless function budget against the Vercel timeout.

/** Mutable budget state threaded (by reference) through one item's search. */
export interface SearchBudget {
  /** Hard ceiling on LLM extraction calls allowed for this item. */
  maxLlmCalls: number;
  /** Date.now() epoch-ms after which no further work may start. */
  deadline: number;
  /** Running count of LLM calls already spent (mutated as we go). */
  llmCallsUsed: number;
  /** Latched true once any ceiling is crossed — surfaced in telemetry. */
  exhausted: boolean;
}

/** Optional overrides; sensible production defaults applied when omitted. */
export interface BudgetOptions {
  maxLlmCalls?: number;
  maxWallMs?: number;
}

// Fan-out-aware ceiling: cost is NOT the constraint (wall-clock is the real
// leash via DEFAULT_MAX_WALL_MS). Raised from 6 → 12 to give FANOUT_WIDTH
// rounds headroom — with width=3 and up to ~4 rounds of concurrent queries the
// old ceiling of 6 would starve the parallel path before it could converge.
// Wall-clock budget (40 s) terminates any runaway item long before 12 LLM
// calls could accumulate at real HF latency (~5-7 s/call).
const DEFAULT_MAX_LLM_CALLS = 12;
// Sized for HF remote inference latency (~5-7s per LLM call): the deadline
// must accommodate a multi-attempt density loop (maxLlmCalls extractions at
// HF latency) while still bounding a runaway item. Starts AFTER query
// planning (see processSupplierSearch), so this is the search+extract budget
// only. Comfortably under the serverless function timeout.
const DEFAULT_MAX_WALL_MS = 40_000;

/** Create a fresh budget for one RFQ item. Call once at the top of the item. */
export function createBudget(opts: BudgetOptions = {}): SearchBudget {
  return {
    maxLlmCalls: opts.maxLlmCalls ?? DEFAULT_MAX_LLM_CALLS,
    deadline: Date.now() + (opts.maxWallMs ?? DEFAULT_MAX_WALL_MS),
    llmCallsUsed: 0,
    exhausted: false,
  };
}

/**
 * True when any ceiling has been crossed. Latches `exhausted` so a single
 * trip is remembered for telemetry even if checked again later.
 */
export function isExhausted(b: SearchBudget): boolean {
  if (b.exhausted) return true;
  if (b.llmCallsUsed >= b.maxLlmCalls || Date.now() > b.deadline) {
    b.exhausted = true;
  }
  return b.exhausted;
}

/**
 * Reserve one LLM call against the budget BEFORE invoking the model.
 * Returns false when the call must NOT proceed (budget already spent) — the
 * caller should skip the LLM and degrade gracefully. Returns true (and
 * increments the counter) when the call is allowed.
 */
export function consumeLlmCall(b: SearchBudget): boolean {
  if (isExhausted(b)) return false;
  b.llmCallsUsed += 1;
  return true;
}

// =============================================
// VISION BUDGET — per-RFQ cap on the costly vision/screenshot layer
// =============================================
// Layer 4 (vision-extract) makes a hosted-screenshot fetch + a VLM call — both
// billable and slow. Unlike SearchBudget (one per ITEM), this counter is created
// ONCE PER RFQ and shared across every item, so a single search run can never
// fire more than maxVisionCalls of these expensive calls regardless of how many
// items/pages came back price-unknown.

/** Shared RFQ-scoped counter for Layer-4 vision calls. */
export interface VisionBudget {
  /** Hard ceiling on vision/screenshot calls for the whole RFQ run. */
  maxVisionCalls: number;
  /** Running count of vision calls already spent (mutated as we go). */
  visionCallsUsed: number;
}

/** Default per-RFQ vision-call ceiling (override via SEARCH_VISION_CAP). */
const DEFAULT_MAX_VISION_CALLS = 5;

/**
 * Create the per-RFQ vision budget. Reads SEARCH_VISION_CAP defensively —
 * a missing/garbage value falls back to the default (never NaN, which would
 * make the >= comparison behave unpredictably).
 */
export function createVisionBudget(max?: number): VisionBudget {
  const envCap = Number(process.env.SEARCH_VISION_CAP);
  const fallback = Number.isFinite(envCap) && envCap >= 0 ? envCap : DEFAULT_MAX_VISION_CALLS;
  return { maxVisionCalls: max ?? fallback, visionCallsUsed: 0 };
}

/**
 * Reserve one vision call against the RFQ budget BEFORE invoking the layer.
 * Returns false when the cap is reached (caller must skip vision); returns true
 * (and increments) when a call is allowed.
 */
export function consumeVisionCall(b: VisionBudget): boolean {
  if (b.visionCallsUsed >= b.maxVisionCalls) return false;
  b.visionCallsUsed += 1;
  return true;
}

// =============================================
// LEXICAL RELEVANCE — alt-URL re-loop drift guard (Stage 10)
// =============================================
// Cheap, dependency-free Jaccard token overlap in [0,1]. We only follow an
// alternative-product link when its extracted description still resembles the
// RFQ item, so the loop can't drift into off-spec products that merely satisfy
// the source COUNT. Deliberately NOT embeddings: no extra model call, no
// network — the signal only needs to catch GROSS drift ("hex bolt" → "office
// chair"), not rank near-duplicates.

// Common words that carry no discriminative signal for procurement matching.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'with', 'in', 'on', 'at',
  'by', 'from', 'is', 'are', 'be', 'this', 'that', 'it', 'as', 'x',
]);

/** Lowercase, strip punctuation, drop stopwords/short tokens → unique token set. */
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ') // punctuation → space so "m8-1.25" splits cleanly
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/**
 * Jaccard similarity of the two strings' significant token sets, in [0,1].
 * Returns 0 when either side is empty (no grounds to claim relevance).
 */
export function lexicalRelevance(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection += 1;
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Minimum lexical relevance an alternative product must share with the RFQ
 * item before the orchestrator will follow its link. Tuned low — we only want
 * to reject GROSS drift, not impose strict matching (the LLM extractor does
 * the fine-grained compliance reasoning downstream).
 */
export const ALT_RELEVANCE_FLOOR = 0.12;
