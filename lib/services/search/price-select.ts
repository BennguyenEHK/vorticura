// =============================================
// PRICE SELECT — multi-price disambiguation (shared spine util)
// =============================================
// A single product page can list several prices (e.g. the Amazon flanged-valve
// page that prices each size/class variant separately). This module picks the
// price whose surrounding text best matches the RFQ item's spec identification
// tokens, so we quote the RIGHT variant instead of the first/cheapest number.
//
// Pure + dependency-free so BOTH manual-extract (raw_content regex) and
// html-extract (structured HTML) share one disambiguation rule.

/** One detected price plus the text window it was found in (used for matching). */
export interface PriceCandidate {
  value: number;     // numeric price (must be > 0 to be considered)
  currency: string;  // ISO code or '' when unknown
  context: string;   // surrounding text window the price appeared in
}

/** Spec token with optional weight (weight >= 1; default 1). */
export interface SpecToken {
  token: string;
  weight: number;
}

/** Spec token input: either bare string (weight 1) or {token, weight} object. */
export type SpecTokenInput = string | SpecToken;

/** Price candidate with confidence metadata. */
export interface PricePick extends PriceCandidate {
  matchConfidence: number;  // 0..1 confidence score
  lowConfidence: boolean;   // true if matchConfidence < threshold
}

/** Confidence threshold for low-confidence flag (tunable). */
export const PRICE_CONF_THRESHOLD = 0.34;

/**
 * Normalize for loose matching: lowercase + strip non-alphanumerics so
 * '1/2"' → '12' and 'Class 150' → 'class150' line up regardless of punctuation.
 */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Pick the price whose context window best matches the spec tokens.
 *
 * Scoring: weighted match. For each candidate, sum the weights of all distinct
 * spec tokens whose normalized form appears in the candidate's normalized context.
 * Divide by maxWeight (sum of all token weights) to get matchConfidence (0..1).
 * Highest weightedScore wins; ties break to LOWEST price (conservative).
 *
 * When no spec token matched anything, falls back to the lowest valid price
 * with matchConfidence 0.
 *
 * Returns null when there are no valid (positive) candidates.
 * A single valid candidate gets matchConfidence 1 and lowConfidence false.
 */
export function selectBestPrice(
  candidates: PriceCandidate[],
  specTokens?: SpecTokenInput[],
  confThreshold?: number,
): PricePick | null {
  // Keep only real, positive prices.
  const valid = candidates.filter((c) => c.value > 0);
  if (valid.length === 0) return null;       // nothing usable

  // For a single valid candidate, no ambiguity: return with high confidence.
  if (valid.length === 1) {
    return {
      ...valid[0],
      matchConfidence: 1,
      lowConfidence: false,
    };
  }

  const threshold = confThreshold ?? PRICE_CONF_THRESHOLD;

  // Normalize spec tokens: convert bare strings to SpecToken, drop empties, dedupe by token.
  // When multiple SpecToken objects have the same normalized token, keep the MAX weight.
  const tokenMap = new Map<string, number>(); // normToken -> weight
  if (specTokens && specTokens.length > 0) {
    for (const input of specTokens) {
      const spec: SpecToken = typeof input === 'string' ? { token: input, weight: 1 } : input;
      const normToken = norm(spec.token);
      if (normToken.length > 0) {
        const existing = tokenMap.get(normToken) ?? 0;
        tokenMap.set(normToken, Math.max(existing, spec.weight));
      }
    }
  }

  const maxWeight = Array.from(tokenMap.values()).reduce((a, b) => a + b, 0);

  // Score each candidate by weighted sum of tokens that match.
  let best: PricePick | null = null;
  let bestWeightedScore = 0;  // 0 = no match
  for (const cand of valid) {
    const ctx = norm(cand.context);
    let weightedScore = 0;
    for (const [token, weight] of Array.from(tokenMap.entries())) {
      if (ctx.includes(token)) {
        weightedScore += weight;
      }
    }
    // Higher weightedScore wins; on a tie prefer the lower price (conservative).
    if (
      weightedScore > bestWeightedScore ||
      (weightedScore === bestWeightedScore && best !== null && cand.value < best.value)
    ) {
      best = {
        ...cand,
        matchConfidence: maxWeight > 0 ? weightedScore / maxWeight : 0,
        lowConfidence: false,
      };
      bestWeightedScore = weightedScore;
    }
  }

  // No spec token matched → fall back to lowest valid price with matchConfidence 0.
  if (bestWeightedScore === 0) {
    const fallback = valid.reduce((lo, c) => (c.value < lo.value ? c : lo));
    return {
      ...fallback,
      matchConfidence: 0,
      lowConfidence: true,
    };
  }

  // Set lowConfidence flag based on threshold.
  if (best && best.matchConfidence < threshold) {
    best.lowConfidence = true;
  }

  return best;
}
