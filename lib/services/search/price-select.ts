// Price candidate selection with spec-token matching.

/** One detected price plus its text window. */
export interface PriceCandidate {
  value: number;     // numeric price (must be > 0)
  currency: string;  // ISO code or '' when unknown
  context: string;   // surrounding text window
}

/** Spec token with optional weight (default 1). */
export interface SpecToken {
  token: string;
  weight: number;
}

/** Spec token input: bare string or {token, weight}. */
export type SpecTokenInput = string | SpecToken;

/** Price candidate with confidence metadata. */
export interface PricePick extends PriceCandidate {
  matchConfidence: number;  // 0..1 confidence score
  lowConfidence: boolean;   // true if below threshold
}

/** Confidence threshold for low-confidence flag. */
export const PRICE_CONF_THRESHOLD = 0.34;

// --- Synonym / unit normalization tables ---

/**
 * Inch-unit synonyms: ", inch, inches, in (after digit).
 * Canonical placeholder: `_INCH_`.
 */
const INCH_PATTERN = /(\d)\s*(?:"|″|inch(?:es)?|(?<=\d)\s*\bin\b)/gi;
const INCH_CANONICAL = '$1_INCH_';

/**
 * Pressure-class synonyms: Class 150, #150, 150LB, 150#.
 * Canonical: `_CLASS_<digits>_`.
 */
const CLASS_PATTERN =
  /(?:class\s*(\d+)|#(\d+)|(\d+)\s*lbs?|(\d+)\s*#(?!\d))/gi;

/** Replace CLASS_PATTERN match with `_CLASS_<N>_`. */
function classReplacement(_match: string, g1: string, g2: string, g3: string, g4: string): string {
  const digits = g1 ?? g2 ?? g3 ?? g4;
  return `_CLASS_${digits}_`;
}

/**
 * Apply synonym normalization to a raw string.
 * Order: class synonyms → inch synonyms → lowercase.
 */
function applySynonyms(s: string): string {
  let out = s;
  // Step 1: collapse pressure-class variants.
  out = out.replace(CLASS_PATTERN, classReplacement);
  // Step 2: collapse inch-unit variants.
  out = out.replace(INCH_PATTERN, INCH_CANONICAL);
  return out.toLowerCase();
}

/**
 * Normalize: lowercase + strip non-alphanumerics.
 * Exported for backward compatibility.
 */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// --- Boundary-aware matching helpers ---

/**
 * Tokenize a synonymized context string into word/number segments.
 * Returns a Set for O(1) membership tests.
 */
function tokenizeCtx(synonymizedCtx: string): Set<string> {
  // Split on anything that is NOT a letter or digit.
  const segments = synonymizedCtx.split(/[^a-z0-9]+/);
  const result = new Set<string>();
  for (const seg of segments) {
    if (seg.length > 0) result.add(seg);
  }
  return result;
}

// --- Core: synonym-aware, boundary-correct token match ---

/**
 * Test whether a spec token matches within candidate context.
 * Both sides are pre-synonymized. Uses boundary-aware segment lookup.
 */
function tokenMatchesBoundary(normToken: string, ctxTokens: Set<string>): boolean {
  // Split spec token into segments (handles compound tokens).
  const tokenSegments = normToken.split(/[^a-z0-9]+/).filter((s) => s.length > 0);

  if (tokenSegments.length === 0) return false;

  if (tokenSegments.length === 1) {
    // Single-segment: direct set lookup.
    return ctxTokens.has(tokenSegments[0]);
  }

  // Multi-segment: ALL sub-segments must appear in context.
  return tokenSegments.every((seg) => ctxTokens.has(seg));
}

/**
 * Pick the price whose context best matches spec tokens.
 * Weighted match; ties break to lowest price. Falls back to
 * lowest price with confidence 0 when no token matches.
 */
export function selectBestPrice(
  candidates: PriceCandidate[],
  specTokens?: SpecTokenInput[],
  confThreshold?: number,
): PricePick | null {
  // Keep only real, positive prices.
  const valid = candidates.filter((c) => c.value > 0);
  if (valid.length === 0) return null;       // nothing usable

  // Single candidate: return with high confidence.
  if (valid.length === 1) {
    return {
      ...valid[0],
      matchConfidence: 1,
      lowConfidence: false,
    };
  }

  const threshold = confThreshold ?? PRICE_CONF_THRESHOLD;

  // Build synonym-normalized token map (token → max weight).
  const tokenMap = new Map<string, number>(); // synonymizedNormToken -> weight
  if (specTokens && specTokens.length > 0) {
    for (const input of specTokens) {
      const spec: SpecToken = typeof input === 'string' ? { token: input, weight: 1 } : input;
      // Synonym-normalize; tokenMatchesBoundary splits on non-alphanumeric.
      const synonymized = applySynonyms(spec.token);
      if (synonymized.length > 0) {
        const existing = tokenMap.get(synonymized) ?? 0;
        tokenMap.set(synonymized, Math.max(existing, spec.weight));
      }
    }
  }

  const maxWeight = Array.from(tokenMap.values()).reduce((a, b) => a + b, 0);

  // Score each candidate by weighted token matches.
  let best: PricePick | null = null;
  let bestWeightedScore = 0;  // 0 = no match
  for (const cand of valid) {
    // Synonym-normalize context; tokenize once per candidate.
    const synonymizedCtx = applySynonyms(cand.context);
    const ctxTokens = tokenizeCtx(synonymizedCtx);

    let weightedScore = 0;
    for (const [token, weight] of Array.from(tokenMap.entries())) {
      if (tokenMatchesBoundary(token, ctxTokens)) {
        weightedScore += weight;
      }
    }
    // Higher score wins; ties prefer lower price.
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

  // No match → fallback to lowest valid price.
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
