// =============================================
// QUERY BUILDER — two-tier search cascade
// =============================================
// Consumes pre-extracted anchors from tokenizer.ts and builds focused
// supplier queries. Tier 1 targets exact part/brand matches in geographic
// regions; Tier 2 builds keyword combinations when Tier 1 finds no results.
//
// Pure functions, no I/O, no LLM. Each function returns a string array of
// Tavily-formatted search queries. Callers invoke them sequentially: if
// Tier 1 returns [], skip to Tier 2 (and then Tier 3, defined elsewhere).

import type { ExtractedAnchors } from './tokenizer';

// =============================================
// Types
// =============================================

export interface QueryItem {
  description: string;
  qty?: number;
  uom?: string;
}

// =============================================
// Module constants — geographic qualifier tiers
// =============================================
// Reused for every call; V8 compiles once at load. Order matters:
// narrowest geolocation first, broadest last.

const GEO_QUALIFIERS = [
  'site:.vn',                                          // Tier 1a: Vietnam-specific
  'Vietnam OR Thailand OR Malaysia OR Indonesia',      // Tier 1b: Southeast Asia
  'Asia manufacturer',                                 // Tier 1c: Broader Asia
];

// =============================================
// Tier 1: Exact Match (Part Number / Brand)
// =============================================

/**
 * Build Tier 1 (exact-match) queries for supplier search.
 *
 * Tier 1 activates ONLY when at least one part number or brand hint exists.
 * Strategy: wrap the primary anchor (highest-discriminating) in double quotes
 * to force Tavily into exact-string matching. Then widen geographically across
 * 3 tiers (Vietnam-specific → SE Asia → Broader Asia).
 *
 * Returns [] if no partNumbers and no brandHints → caller skips to Tier 2.
 *
 * WHY: Part numbers are the highest-discriminating signal for OEM/SKU matching.
 * If the RFQ gives us a part number, we should leverage it first before falling
 * back to fuzzy brand + keyword matching. Quotes force exact-match behavior
 * in Tavily's indexing.
 */
export function buildTier1Queries(item: QueryItem, anchors: ExtractedAnchors): string[] {
  // Activate only if at least one partNumber or brandHint exists.
  // Empty part numbers AND empty brand hints → return [] and skip to Tier 2.
  if (anchors.partNumbers.length === 0 && anchors.brandHints.length === 0) {
    return [];
  }

  // Pick the primary anchor: first part number (highest priority) or first brand hint (fallback).
  // This is the single most specific anchor we can use for this item.
  const primaryAnchor = anchors.partNumbers.length > 0
    ? anchors.partNumbers[0]
    : anchors.brandHints[0];

  // Wrap in double quotes so Tavily enforces exact-string matching.
  // Format: `"<primary>" supplier <geo_qualifier>`
  const quotedAnchor = `"${primaryAnchor}"`;

  // Build the 3 geographic tiers.
  const queries: string[] = [];
  for (const geoQualifier of GEO_QUALIFIERS) {
    queries.push(`${quotedAnchor} supplier ${geoQualifier}`);
  }

  return queries;
}

// =============================================
// Tier 2: Keyword Combination Engine
// =============================================

/**
 * Build Tier 2 (keyword combination) queries for supplier search.
 *
 * Tier 2 runs when Tier 1 returns no results (or when Tier 1 doesn't activate).
 * Strategy: pick one primary anchor (part number → brand hint → significant token
 * from cleaned description), combine it with 0–2 secondary anchors (certification,
 * rating, dimension, or second brand hint), and apply the same 3 geographic tiers.
 * Cartesian product capped at 6 queries total: more-specific (2 secondaries) first,
 * broader (0 secondaries) last.
 *
 * Returns [] if no primary anchor can be found → caller skips to Tier 3.
 *
 * WHY: When the RFQ lacks structured identifiers (part number, brand), we fall back
 * to keyword combinations. By carefully mixing primary + secondaries and ordering
 * from specific to broad, we avoid query bloat while still exploring the space
 * efficiently. Double-quoting is skipped here (unlike Tier 1) because we want
 * broader, fuzzy matching.
 */
export function buildTier2Queries(item: QueryItem, anchors: ExtractedAnchors): string[] {
  // ============================================
  // STEP 1: Pick the PRIMARY anchor
  // ============================================
  // Priority: first part number > first brand hint > first significant token
  // from cleaned description. If still nothing, return [] (Tier 3's job).

  let primaryAnchor = '';

  if (anchors.partNumbers.length > 0) {
    primaryAnchor = anchors.partNumbers[0];
  } else if (anchors.brandHints.length > 0) {
    primaryAnchor = anchors.brandHints[0];
  } else {
    // Extract the first token > 3 chars from cleaned description.
    const tokens = anchors.cleanedDescription.split(/\s+/);
    for (const token of tokens) {
      if (token.length > 3) {
        primaryAnchor = token;
        break;
      }
    }
  }

  // If still no primary, return [] — Tier 3 will handle full-text fallback.
  if (!primaryAnchor) {
    return [];
  }

  // ============================================
  // STEP 2: Build the secondary anchor pool
  // ============================================
  // Priority order: certifications > ratings > dimensions > second brand hint.
  // We may pick 0, 1, or 2 secondaries (deduplicated against primary).

  const secondaryPool: string[] = [];

  // Certifications (highest secondary priority).
  for (const cert of anchors.certifications) {
    if (cert !== primaryAnchor) {
      secondaryPool.push(cert);
    }
  }

  // Ratings.
  for (const rating of anchors.ratings) {
    if (rating !== primaryAnchor) {
      secondaryPool.push(rating);
    }
  }

  // Dimensions.
  for (const dim of anchors.dimensions) {
    if (dim !== primaryAnchor) {
      secondaryPool.push(dim);
    }
  }

  // Second brand hint (if exists and not already primary).
  if (anchors.brandHints.length > 1) {
    const secondBrand = anchors.brandHints[1];
    if (secondBrand !== primaryAnchor) {
      secondaryPool.push(secondBrand);
    }
  }

  // ============================================
  // STEP 3: Build queries as cartesian product
  // ============================================
  // Structure: {primary} {secondary_subset} × {3 geo tiers}
  // Capped at 6 queries total: order from more-specific (2 secondaries) to
  // broader (0 secondaries) to prioritize precision.

  const queries: string[] = [];

  // Variant 1: primary + top 2 secondaries (if available).
  if (secondaryPool.length >= 2) {
    const secondary1 = secondaryPool[0];
    const secondary2 = secondaryPool[1];
    for (const geoQualifier of GEO_QUALIFIERS) {
      queries.push(`${primaryAnchor} ${secondary1} ${secondary2} supplier ${geoQualifier}`);
      if (queries.length >= 6) return queries; // Cap at 6.
    }
  }

  // Variant 2: primary + top 1 secondary (if available).
  if (secondaryPool.length >= 1) {
    const secondary1 = secondaryPool[0];
    for (const geoQualifier of GEO_QUALIFIERS) {
      queries.push(`${primaryAnchor} ${secondary1} supplier ${geoQualifier}`);
      if (queries.length >= 6) return queries; // Cap at 6.
    }
  }

  // Variant 3: primary only (broadest).
  for (const geoQualifier of GEO_QUALIFIERS) {
    queries.push(`${primaryAnchor} supplier ${geoQualifier}`);
    if (queries.length >= 6) return queries; // Cap at 6.
  }

  return queries;
}
