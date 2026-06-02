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
 * Scoring: +1 per DISTINCT spec token whose normalized form appears in the
 * candidate's normalized context. Highest score wins; ties break to the LOWEST
 * price (conservative — never over-quote on an ambiguous match).
 *
 * Returns null when there are no valid (positive) candidates. When specTokens is
 * empty, or no token matches any context, the lowest valid price is returned so
 * the caller always gets a deterministic, conservative result.
 */
export function selectBestPrice(
  candidates: PriceCandidate[],
  specTokens: string[] = [],
): PriceCandidate | null {
  // Keep only real, positive prices.
  const valid = candidates.filter((c) => c.value > 0);
  if (valid.length === 0) return null;       // nothing usable
  if (valid.length === 1) return valid[0];   // no ambiguity to resolve

  // Pre-normalize spec tokens once (drop empties + dupes).
  const tokens = Array.from(
    new Set(specTokens.map(norm).filter((t) => t.length > 0)),
  );

  // Score each candidate by how many distinct spec tokens its context contains.
  let best: PriceCandidate | null = null;
  let bestScore = -1;
  for (const cand of valid) {
    const ctx = norm(cand.context);
    const score = tokens.reduce((n, t) => (ctx.includes(t) ? n + 1 : n), 0);
    // Higher score wins; on a tie prefer the lower price (conservative).
    if (score > bestScore || (score === bestScore && best !== null && cand.value < best.value)) {
      best = cand;
      bestScore = score;
    }
  }

  // No spec token matched any context → fall back to the lowest valid price.
  if (bestScore <= 0) {
    return valid.reduce((lo, c) => (c.value < lo.value ? c : lo));
  }
  return best;
}
