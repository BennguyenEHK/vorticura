// =============================================
// ITEM ROUTER — tiered effort classifier for RFQ items
// =============================================
// Decides how much machinery each item deserves BEFORE the LLM query planner
// runs. This implements the L2 vs L3 split of the memory-hierarchy framework
// introduced in the adaptive supplier-search redesign (2026-05-31 spec):
//
//   L0  Memory exact   — spec_hash lookup in supplier_memory          (Phase 2)
//   L1  Memory near    — local int8 embedding → pgvector cosine top-k (Phase 2)
//   L2  Deterministic direct (Tier 1 here) — item text already contains a
//         model/part token AND a qualifier → compose one query, skip planner.
//   L3  Full LLM plan  (Tier 3 here) — ambiguous text → existing planQueries.
//
// L0 / L1 memory tiers are wired in Phase 2 (requires DB schema). This module
// exposes only the L2 (tier 1) vs L3 (tier 3) split — no I/O, no LLM — so it
// stays trivially unit-testable in the same discipline as product-page-scorer.ts
// and density-loop.ts.
//
// Tier-1 detection logic (inverse of isBareCodeQuery in query-planner.ts):
//   A model/part token = a whitespace-delimited token matching the alphanumeric
//   extended pattern /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/ that ALSO contains at
//   least one digit (pure-alphabetic words are not model codes).
//   A qualifier = any token of length >= 3 that is purely alphabetic [A-Za-z]+.
//   BOTH must be present → Tier 1. A bare code with no qualifier stays Tier 3
//   (bare codes have the weakest signal; the planner's disambiguation earns its
//   cost there). Empty / whitespace input → Tier 3.

// ---------------------------------------------
// Public types
// ---------------------------------------------

/** Phase 1 exposes L2 (=tier 1, deterministic direct) and L3 (=tier 3, full
 *  LLM plan). L0 / L1 memory tiers are added in Phase 2. */
export type SearchTier = 1 | 3;

export interface RouteDecision {
  tier: SearchTier;
  /** Present only when tier === 1 — the ready-to-search composed query string.
   *  For Tier 1 this is simply the trimmed searchText; no mutation is applied
   *  because the text is already specific enough to resolve in one shot. */
  directQuery?: string;
}

// ---------------------------------------------
// Token-classification helpers (pure, no regex flags for performance)
// ---------------------------------------------

/**
 * True when the token looks like a model / part-number code:
 *   • matches the "extended alphanumeric" pattern (letters, digits, . _ / -)
 *   • starts with a letter or digit (no leading punctuation)
 *   • contains at LEAST one digit (pure-alphabetic words are not codes)
 */
function isModelToken(token: string): boolean {
  if (!token) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(token)) return false;
  // Must contain at least one digit — pure words like "gate" or "valve" are not codes.
  return /[0-9]/.test(token);
}

/**
 * True when the token is a qualifier (manufacturer name, product-type word, etc.):
 *   • length >= 3 (very short words carry no discriminative signal)
 *   • purely alphabetic — digits/punctuation disqualify it (those belong to codes)
 */
function isQualifierToken(token: string): boolean {
  return token.length >= 3 && /^[A-Za-z]+$/.test(token);
}

// ---------------------------------------------
// Main export
// ---------------------------------------------

/**
 * Decide how much machinery an RFQ item deserves BEFORE the planner runs.
 *
 * Tier 1 (deterministic direct): the text already contains a model/part token
 *   AND at least one qualifier (manufacturer or product-type word) — specific
 *   enough that one composed query will resolve it; skip the LLM planner.
 * Tier 3 (full plan): everything else — ambiguous text, bare codes, free-text
 *   descriptions with no identifiable code, or empty input.
 *
 * Deterministic and side-effect-free — same inputs always yield the same tier.
 */
export function classifyItem(searchText: string): RouteDecision {
  if (!searchText || !searchText.trim()) {
    return { tier: 3 };
  }

  const tokens = searchText.trim().split(/\s+/);

  let hasModelToken = false;
  let hasQualifier = false;

  for (const token of tokens) {
    if (isModelToken(token)) {
      hasModelToken = true;
    } else if (isQualifierToken(token)) {
      // A token that is a model token cannot also count as a qualifier.
      // isModelToken is checked first; if it didn't pass, check qualifier.
      hasQualifier = true;
    }
    // Early-exit: both signals found — no need to scan the rest of the list.
    if (hasModelToken && hasQualifier) break;
  }

  if (hasModelToken && hasQualifier) {
    return { tier: 1, directQuery: searchText.trim() };
  }

  return { tier: 3 };
}
