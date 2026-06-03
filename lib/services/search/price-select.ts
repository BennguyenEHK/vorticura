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

// =============================================
// Synonym / unit normalization tables (A2)
// =============================================
// Conservative, table-driven equivalences applied to BOTH the spec token and
// the candidate context before matching. Only well-established, unambiguous
// equivalences are included. Risky or ambiguous mappings are omitted.
//
// Every mapping is documented with its source rationale and must be ADDITIVE:
// it can only create NEW true matches, never suppress an existing correct match.

/**
 * Inch-unit synonyms: all of these mean the same linear-dimension unit.
 * Source: ISO 6708 / ASME B16.5 – pipe sizes use " (double-prime), in, inch, inches interchangeably.
 *
 * Strategy: replace the unit marker (possibly preceded by whitespace or a digit
 * boundary) with a single canonical placeholder `_INCH_` before tokenising.
 * We apply this to raw text BEFORE calling norm(), so the mapping survives the
 * non-alphanumeric strip.
 *
 * Pattern matches (case-insensitive, bounded):
 *   - "  (double-quote or right double-quote used as inch mark)
 *   - inch / inches
 *   - in  — only when following a digit (prevents false match on words like "in stock")
 *
 * The canonical placeholder is intentionally a safe string that won't collide
 * with any real product spec text after normalization.
 */
const INCH_PATTERN = /(\d)\s*(?:"|″|inch(?:es)?|(?<=\d)\s*\bin\b)/gi;
const INCH_CANONICAL = '$1_INCH_';

/**
 * Pressure-class synonyms: # prefix, LB/LBS suffix, and the word "class" all
 * denote ASME/ANSI pressure ratings on flanges, valves, and fittings.
 * Source: ASME B16.5 – flanges rated in Class 150, Class 300, … Class 2500;
 *         industry shorthand #150, 150LB, 150# are all equivalent.
 *
 * Strategy: collapse each variant to a canonical `_CLASS_<digits>_` marker.
 *
 * Patterns matched (case-insensitive):
 *   - "Class 150" / "CLASS150" → _CLASS_150_
 *   - "#150"                   → _CLASS_150_
 *   - "150LB" / "150LBS"       → _CLASS_150_
 *   - "150#"                   → _CLASS_150_
 *
 * OMITTED deliberately: DN↔inch mapping (DN50 = 2") — too risky for false
 * unification across different nominal-bore standards; left out per spec.
 */
const CLASS_PATTERN =
  /(?:class\s*(\d+)|#(\d+)|(\d+)\s*lbs?|(\d+)\s*#(?!\d))/gi;

/** Replace a CLASS_PATTERN match with the canonical _CLASS_<N>_ marker. */
function classReplacement(_match: string, g1: string, g2: string, g3: string, g4: string): string {
  const digits = g1 ?? g2 ?? g3 ?? g4;
  return `_CLASS_${digits}_`;
}

/**
 * Apply synonym normalization to a raw string.
 * Returns a lowercase, non-alpha-stripped form suitable for boundary-aware
 * token comparison. Called on BOTH spec tokens and candidate contexts.
 *
 * Order matters:
 *   1. Class synonyms first (they may contain digits we want to keep together
 *      with their unit, e.g. "150LB" → "_CLASS_150_" not "150" + "lb").
 *   2. Inch synonyms second (handles `2"` → `2_INCH_`, `2 inch` → `2_INCH_`).
 *   3. Lowercase last (patterns above are case-insensitive).
 */
function applySynonyms(s: string): string {
  let out = s;
  // Step 1: collapse pressure-class variants.
  out = out.replace(CLASS_PATTERN, classReplacement);
  // Step 2: collapse inch-unit variants.
  // Using a function to preserve the leading digit capture group.
  out = out.replace(INCH_PATTERN, INCH_CANONICAL);
  return out.toLowerCase();
}

/**
 * Normalize for loose matching: lowercase + strip non-alphanumerics so
 * '1/2"' → '12' and 'Class 150' → 'class150' line up regardless of punctuation.
 *
 * This is kept for backward-compat reference; internal matching now goes through
 * applySynonyms → tokenizeCtx / isNumericToken pipeline for boundary awareness.
 * Exported as before so external callers can still import it.
 */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// =============================================
// Boundary-aware matching helpers (A1)
// =============================================

/**
 * Tokenize a context string (after synonym normalization and lowercase) into
 * a flat array of word/number segments for exact-boundary membership tests.
 *
 * Splitting on any run of non-alphanumeric characters (plus the special `_`
 * used by synonym placeholders) produces segments that are either:
 *   - purely numeric    e.g. "150", "2", "21500"
 *   - purely alphabetic e.g. "flange", "class"
 *   - alphanumeric mix  e.g. "dn50", "class150" (legacy pre-synonym text)
 *   - synonym markers   e.g. "_class_150_" becomes ["", "class", "150", ""]
 *                        — empty strings filtered out below.
 *
 * Using the token set for O(1) look-up of whole-segment membership avoids
 * the substring false-positive: "150" ∉ tokens of "21500" (which tokenises
 * to ["21500"]), but "150" ∈ tokens of "Class 150 flange" (["class","150","flange"]).
 */
function tokenizeCtx(synonymizedCtx: string): Set<string> {
  // Split on anything that is NOT a letter or digit.
  // This naturally handles spaces, hyphens, underscores, punctuation.
  const segments = synonymizedCtx.split(/[^a-z0-9]+/);
  const result = new Set<string>();
  for (const seg of segments) {
    if (seg.length > 0) result.add(seg);
  }
  return result;
}

// =============================================
// Core: synonym-aware, boundary-correct token match
// =============================================

/**
 * Test whether a single normalized spec token matches within a candidate context.
 *
 * The token and context are BOTH passed through applySynonyms before this call
 * (done once per (candidate, token) pair in selectBestPrice), so the synonym
 * canonicalization is already applied. This function works purely on the
 * synonymized, lowercased strings.
 *
 * Matching strategy:
 *
 *   1. Tokenize the context into word/number segments (boundary-correct).
 *   2. For each segment in the context-token-set:
 *        a. If the spec-token is purely numeric ("150", "2"):
 *           exact set-membership test on the context segments — "150" ∈ {..."150"...}
 *           but NOT ∈ {"21500"} or {"1150"}.
 *        b. If the spec-token is alphanumeric (contains letters):
 *           exact set-membership test — "dn50" ∈ {"dn50"} but NOT ∈ {"dn500"}.
 *
 *   Both cases are O(1) set look-ups after tokenizing, so this is cheap.
 *
 * Note: synonym placeholders (e.g. "_class_150_") are split by tokenizeCtx into
 * "class", "150" segments, so they match the corresponding extracted segments
 * from the context without any special casing.
 */
function tokenMatchesBoundary(normToken: string, ctxTokens: Set<string>): boolean {
  // Split the spec token itself into segments (handles compound tokens like
  // "_class_150_" after synonym expansion, or "dn50", "class150").
  const tokenSegments = normToken.split(/[^a-z0-9]+/).filter((s) => s.length > 0);

  if (tokenSegments.length === 0) return false;

  if (tokenSegments.length === 1) {
    // Simple single-segment token: direct set lookup (boundary-correct).
    return ctxTokens.has(tokenSegments[0]);
  }

  // Multi-segment token (e.g. from "_class_150_" → ["class","150"]):
  // ALL sub-segments must appear in the context token set.
  // This handles the canonical class marker: both "class" and "150" must be present.
  return tokenSegments.every((seg) => ctxTokens.has(seg));
}

/**
 * Pick the price whose context window best matches the spec tokens.
 *
 * Scoring: weighted match. For each candidate, sum the weights of all distinct
 * spec tokens whose (synonym-normalized, boundary-aware) form appears in the
 * candidate's tokenized context. Divide by maxWeight (sum of all token weights)
 * to get matchConfidence (0..1). Highest weightedScore wins; ties break to
 * LOWEST price (conservative).
 *
 * When no spec token matched anything, falls back to the lowest valid price
 * with matchConfidence 0.
 *
 * Returns null when there are no valid (positive) candidates.
 * A single valid candidate gets matchConfidence 1 and lowConfidence false.
 *
 * Changes vs. v1 (substring matching):
 *   A1 — Matching is now BOUNDARY-AWARE: purely numeric tokens like "150" and "2"
 *        match only as standalone number-segments in the context, not as digit-
 *        substrings ("150" no longer spuriously matches "21500" or "1150").
 *        Alphanumeric tokens ("dn50") match whole-segment too ("dn50" ≠ "dn500").
 *   A2 — SYNONYM NORMALIZATION (inch + class rating) is applied to BOTH the spec
 *        token and the context before matching, so "2 inch" ↔ `2"` ↔ "2in" and
 *        "Class 150" ↔ "#150" ↔ "150LB" ↔ "150#" all unify.
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
  // We store the SYNONYM-NORMALIZED form as the key (so "2 inch" and "2in" unify to the same key).
  const tokenMap = new Map<string, number>(); // synonymizedNormToken -> weight
  if (specTokens && specTokens.length > 0) {
    for (const input of specTokens) {
      const spec: SpecToken = typeof input === 'string' ? { token: input, weight: 1 } : input;
      // Apply synonym normalization first, then strip residual non-alphanumerics to get
      // the normalized form used for boundary comparison.
      const synonymized = applySynonyms(spec.token);
      // Use the full synonymized string (with underscores preserved temporarily)
      // because tokenMatchesBoundary splits on non-alphanumeric including underscores.
      if (synonymized.length > 0) {
        const existing = tokenMap.get(synonymized) ?? 0;
        tokenMap.set(synonymized, Math.max(existing, spec.weight));
      }
    }
  }

  const maxWeight = Array.from(tokenMap.values()).reduce((a, b) => a + b, 0);

  // Score each candidate by weighted sum of tokens that match.
  let best: PricePick | null = null;
  let bestWeightedScore = 0;  // 0 = no match
  for (const cand of valid) {
    // Synonym-normalize the context then tokenize once per candidate for O(1) lookups.
    const synonymizedCtx = applySynonyms(cand.context);
    const ctxTokens = tokenizeCtx(synonymizedCtx);

    let weightedScore = 0;
    for (const [token, weight] of Array.from(tokenMap.entries())) {
      if (tokenMatchesBoundary(token, ctxTokens)) {
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
