// Budget circuit-breaker for LLM calls per search item.

/** Mutable budget state threaded through one item's search. */
export interface SearchBudget {
  /** Hard ceiling on LLM extraction calls for this item. */
  maxLlmCalls: number;
  /** epoch-ms deadline; no work starts after this. */
  deadline: number;
  /** Running count of LLM calls spent (mutated in place). */
  llmCallsUsed: number;
  /** Latched true once any ceiling is crossed. */
  exhausted: boolean;
}

/** Optional overrides; production defaults applied when omitted. */
export interface BudgetOptions {
  maxLlmCalls?: number;
  maxWallMs?: number;
}

// Raised 6→12 to give FANOUT_WIDTH rounds headroom.
// Wall-clock budget (40 s) terminates runaways before 12 calls accumulate.
const DEFAULT_MAX_LLM_CALLS = 12;
// Sized for HF remote latency (~5-7 s/call); search+extract budget only.
// Comfortably under the serverless function timeout.
const DEFAULT_MAX_WALL_MS = 40_000;

/** Create a fresh budget for one RFQ item. */
export function createBudget(opts: BudgetOptions = {}): SearchBudget {
  return {
    maxLlmCalls: opts.maxLlmCalls ?? DEFAULT_MAX_LLM_CALLS,
    deadline: Date.now() + (opts.maxWallMs ?? DEFAULT_MAX_WALL_MS),
    llmCallsUsed: 0,
    exhausted: false,
  };
}

/**
 * True when any ceiling is crossed. Latches `exhausted` for telemetry.
 */
export function isExhausted(b: SearchBudget): boolean {
  if (b.exhausted) return true;
  if (b.llmCallsUsed >= b.maxLlmCalls || Date.now() > b.deadline) {
    b.exhausted = true;
  }
  return b.exhausted;
}

/**
 * Reserve one LLM call before invoking the model.
 * Returns false when budget is spent; true and increments when allowed.
 */
export function consumeLlmCall(b: SearchBudget): boolean {
  if (isExhausted(b)) return false;
  b.llmCallsUsed += 1;
  return true;
}

// --- Vision budget ---
// Layer 4 makes a screenshot fetch + VLM call — both billable.
// One counter per RFQ caps total vision calls across all items.

/** Shared RFQ-scoped counter for Layer-4 vision calls. */
export interface VisionBudget {
  /** Hard ceiling on vision calls for the whole RFQ. */
  maxVisionCalls: number;
  /** Running count of vision calls spent (mutated in place). */
  visionCallsUsed: number;
}

/** Default per-RFQ vision-call ceiling (override via SEARCH_VISION_CAP). */
const DEFAULT_MAX_VISION_CALLS = 5;

/**
 * Create the per-RFQ vision budget. Reads SEARCH_VISION_CAP defensively;
 * missing/garbage value falls back to default (never NaN).
 */
export function createVisionBudget(max?: number): VisionBudget {
  const envCap = Number(process.env.SEARCH_VISION_CAP);
  const fallback = Number.isFinite(envCap) && envCap >= 0 ? envCap : DEFAULT_MAX_VISION_CALLS;
  return { maxVisionCalls: max ?? fallback, visionCallsUsed: 0 };
}

/**
 * Reserve one vision call before invoking the layer.
 * Returns false when cap is reached; true and increments when allowed.
 */
export function consumeVisionCall(b: VisionBudget): boolean {
  if (b.visionCallsUsed >= b.maxVisionCalls) return false;
  b.visionCallsUsed += 1;
  return true;
}

// --- Lexical relevance ---
// Jaccard token overlap [0,1] — catches gross drift in alt-URL re-loop.
// No embeddings: no extra model call, no network needed.

// Common words with no discriminative signal for procurement.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'with', 'in', 'on', 'at',
  'by', 'from', 'is', 'are', 'be', 'this', 'that', 'it', 'as', 'x',
]);

/** Lowercase, strip punctuation, drop stopwords → unique token set. */
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
 * Jaccard similarity of two strings' token sets, in [0,1].
 * Returns 0 when either side is empty.
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
 * Minimum relevance an alt-product must share with the RFQ item.
 * Tuned low — rejects gross drift only, not near-misses.
 */
export const ALT_RELEVANCE_FLOOR = 0.12;
