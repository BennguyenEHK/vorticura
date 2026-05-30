// =============================================
// TOKENIZER — anchor extraction for semantic tier cascade
// =============================================
// Single concern: take a raw `company_description` string and pull out the
// high-signal anchors that the tier cascade will use to build focused
// queries. Pure function, no I/O, no LLM — RegEx only.
//
// Why this exists: the previous query-builder pasted the entire raw
// description into Tavily, so noise (Maximo IDs, dimensions in free text,
// boilerplate adjectives) dominated the query budget. The new cascade asks
// this module for *anchors* and then composes queries from them deliberately.
//
// Performance notes (all patterns are bounded, no catastrophic backtracking):
//   - Quantifiers are explicitly bounded ({1,4}, {2,12}, etc.) — never `.*`
//   - All `g`-flag patterns are used with .matchAll(), never .test()
//   - Patterns are module-scope constants so V8 compiles them once at load

// ---------------------------------------------
// Types
// ---------------------------------------------

/** Output shape — the tier cascade reads these to build queries. */
export interface ExtractedAnchors {
  /** OEM / SKU / model identifiers — highest discriminating power. */
  partNumbers: string[];
  /** Electrical or pressure ratings (e.g. "24V", "1.5kW"). */
  ratings: string[];
  /** Compliance certifications (e.g. "ATEX", "UL 508A"). */
  certifications: string[];
  /** Physical dimensions (e.g. "200mm", "12in"). */
  dimensions: string[];
  /** Probable brand / manufacturer names lifted from the description. */
  brandHints: string[];
  /** Whitespace-collapsed + stopword-stripped residue (used by Tier 2 keyword combos). */
  cleanedDescription: string;
}

// ---------------------------------------------
// Pre-compiled patterns — bounded, V8-safe
// ---------------------------------------------

/**
 * Maximo identifier — leading "## " or bare 5-9 digit codes that get prepended
 * to descriptions in the upstream RFQ extractor (precedent: commit ff8670b).
 * Strip these BEFORE everything else so they cannot be mistaken for part numbers.
 */
const MAXIMO_ID_RE = /^\s*#?\s*\d{5,9}\s*[-:]\s*/;

/**
 * Internal engineering references that must be removed before anchor extraction.
 * These are project/drawing/tag/order codes that have zero supplier-search value.
 *
 * Patterns stripped (in order, applied to a pre-normalized copy):
 *   1. "Tag:" or "Tags:" followed by a comma-separated list of tag codes — up to
 *      end-of-clause (semicolon, "in", or end of string).
 *   2. "drawing <CODE>" — a drawing reference keyword followed by its code.
 *   3. "order #<n>" or "order number <n>" — purchase/work-order numbers.
 *   4. All-caps hyphenated project codes: ≥3 uppercase letters, hyphen, then
 *      uppercase/digit continuation possibly including more hyphens and slashes
 *      (e.g. "NULQ-SK-6111A/B", "CCP-2898").  Matches only when ALL segments
 *      are uppercase/digit (no lowercase), to avoid clobbering real brands.
 *
 * All patterns are bounded — no catastrophic backtracking.
 */
const INTERNAL_REF_PATTERNS: RegExp[] = [
  // "Tag: ACV1, ACV2" or "Tags: XYZ" (up to "in ", ";", or end of string)
  /\bTags?\s*:\s*[A-Z0-9,/\s]{1,80}?(?=\s+in\b|\s*;|$)/gi,
  // "drawing CCP-2898" or "drawing no. ABC-123"
  /\bdrawing(?:\s+(?:no|number|#))?\s*[A-Z0-9][-A-Z0-9./]{1,20}\b/gi,
  // "order #155107" / "order number 155107" / "CAPS order #155107"
  /\b(?:[A-Z]+\s+)?order\s+(?:#|number\s*)?\d{4,12}\b/gi,
  // Hyphenated all-caps project/tag codes: [A-Z]{3,}-[A-Z0-9][-A-Z0-9/]{0,20}
  // e.g. "NULQ-SK-6111A/B", "CCP-2898"
  // Negative lookahead avoids matching patterns that already have a digit in
  // the left segment (those are likely genuine part numbers; the digit rule will
  // handle keeping them).
  /\b[A-Z]{3,}-[A-Z0-9][-A-Z0-9/]{0,20}\b/g,
];

/**
 * Part-number pattern. Word-boundary anchored to avoid catching mid-word
 * fragments. Allows letters then a separator (-, /, .) then alphanumeric.
 * Length capped at 16 chars total to avoid grabbing long URLs or codes.
 *
 * NOTE: matches are post-filtered to require AT LEAST ONE DIGIT. This alone
 * removes all-letter codes like "NULQ-SK" that slip through the internal-ref
 * stripper (e.g. when the code appears without a "Tag:" prefix).
 */
const PART_NUMBER_RE = /\b[A-Z]{1,4}[-/.][A-Z0-9]{2,12}\b/g;

/** Voltage / power / pressure ratings. Captures the numeric + unit together. */
const RATING_RE = /\b\d{1,5}(?:\.\d{1,3})?\s*(?:V|VAC|VDC|kV|kW|W|A|mA|psi|bar|Hz|kHz|MHz)\b/gi;

/**
 * Certifications — whitelist of common procurement standards. Whitelist beats
 * a free pattern here because false positives are expensive (they bloat queries).
 * Bounded alternation only; no nested groups.
 */
const CERTIFICATION_RE = /\b(?:ATEX|IECEx|UL\s?\d{0,4}|CSA|CE|RoHS|REACH|FDA|NSF|ISO\s?\d{4,5})\b/g;

/** Physical dimensions: 1-5 digit number, optional decimal, mm/cm/in/m/". */
const DIMENSION_RE = /\b\d{1,5}(?:\.\d{1,3})?\s*(?:mm|cm|in|m|")\b/gi;

/**
 * Brand hints — Title-Case word sequences (1-3 words) that don't include
 * common stopwords. Procurement descriptions often lead with the brand
 * ("Festo solenoid valve …") so this captures that signal. Bounded to 3 words.
 */
const BRAND_HINT_RE = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2}\b/g;

/**
 * Stopwords — words that have zero discriminating power for supplier search.
 * Kept short and procurement-specific; over-aggressive stripping would hurt
 * Tier 2 keyword combinations that genuinely need adjectives.
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'with', 'to', 'in', 'on', 'at',
  'item', 'unit', 'piece', 'pcs', 'each', 'ea', 'set', 'assembly', 'kit',
  'new', 'used', 'standard', 'generic', 'misc', 'miscellaneous',
]);

/**
 * Brand-hint blacklist — Title-Case sequences that look like brand names
 * but are actually generic procurement nouns or product-category words.
 * Prevents "Valve Assembly", "Pump", or "Stainless Steel" from being
 * misclassified as a brand.
 */
const BRAND_BLACKLIST = new Set([
  // Structural procurement nouns
  'Item', 'Unit', 'Assembly', 'Kit', 'Set', 'Part', 'Number',
  // Material descriptors
  'Stainless Steel', 'Carbon Steel', 'Cast Iron',
  // Pressure / duty class adjectives
  'High Pressure', 'Low Pressure', 'Heavy Duty',
  // Generic product-category nouns — should never be a brand anchor
  'Valve', 'Pump', 'Motor', 'Sensor', 'Filter', 'Bearing', 'Gasket',
  'Actuator', 'Controller', 'Switch', 'Relay', 'Gauge', 'Meter',
  'Fitting', 'Flange', 'Coupling', 'Hose', 'Pipe', 'Tube',
  'Check', 'Gate', 'Ball', 'Globe', 'Butterfly',
  'Swing', 'Solenoid', 'Pressure', 'Temperature', 'Flow',
  'Spec', 'Drawing', 'Order', 'Tag', 'Tags',
]);

// ---------------------------------------------
// Helpers
// ---------------------------------------------

/** Strip Maximo prefix, internal engineering references, collapse whitespace, trim. Always run first. */
function normalize(input: string): string {
  let s = input
    .replace(MAXIMO_ID_RE, '');   // (1) drop Maximo ID prefix if present

  // (2) Strip internal engineering references (project codes, drawing refs, etc.)
  for (const re of INTERNAL_REF_PATTERNS) {
    // Reset lastIndex — all patterns carry /g flag
    re.lastIndex = 0;
    s = s.replace(re, ' ');
  }

  return s
    .replace(/\s+/g, ' ')        // (3) collapse multi-space / newlines
    .trim();                     // (4) drop edge whitespace
}

/** Unique-preserving order. Small array sizes — O(n²) lookup is fine. */
function uniq(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    const key = v.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Apply a global RegEx and return distinct trimmed matches. */
function matchAllUnique(text: string, re: RegExp): string[] {
  // `matchAll` requires the `g` flag; all patterns above honour that.
  const matches = Array.from(text.matchAll(re), (m) => m[0]);
  return uniq(matches);
}

// ---------------------------------------------
// Public API
// ---------------------------------------------

/**
 * Pull anchors out of a raw company_description. Order of operations matters:
 * 1) Normalize (strip Maximo ID, collapse whitespace) — every downstream step
 *    assumes the input has no Maximo noise.
 * 2) Extract structured anchors with the bounded RegEx patterns above.
 * 3) Build the cleaned residue (stopwords + already-extracted anchors removed)
 *    so Tier 2's keyword combination engine has a low-noise term pool.
 *
 * Returns empty arrays — never throws — so callers can branch on `.length`
 * instead of try/catch wrapping every call.
 */
export function extractAnchors(rawDescription: string): ExtractedAnchors {
  const cleaned = normalize(rawDescription || '');
  if (!cleaned) {
    return {
      partNumbers: [],
      ratings: [],
      certifications: [],
      dimensions: [],
      brandHints: [],
      cleanedDescription: '',
    };
  }

  // (1) Structured anchor extraction — order is independent; no shared state.
  // Digit-gate: keep only matches that contain at least one digit.
  // This removes all-letter codes (e.g. "NULQ-SK") that survived the internal-ref
  // stripper (e.g. when the code appears without a recognizable prefix keyword).
  const partNumbers = matchAllUnique(cleaned, PART_NUMBER_RE)
    .filter((pn) => /\d/.test(pn));
  const ratings = matchAllUnique(cleaned, RATING_RE);
  const certifications = matchAllUnique(cleaned, CERTIFICATION_RE);
  const dimensions = matchAllUnique(cleaned, DIMENSION_RE);
  const brandHints = matchAllUnique(cleaned, BRAND_HINT_RE)
    .filter((hint) => !BRAND_BLACKLIST.has(hint))
    // Drop single-word hints that are too short to be a brand (≤ 3 chars).
    .filter((hint) => hint.length > 3);

  // (2) Build cleaned residue — strip stopwords + already-extracted spans so
  //     Tier 2 doesn't re-issue them as keyword combinations.
  const consumed = new Set<string>([
    ...partNumbers, ...ratings, ...certifications, ...dimensions,
  ]);
  const cleanedDescription = cleaned
    .split(/\s+/)
    .filter((tok) => {
      const lower = tok.toLowerCase();
      // Drop short tokens, stopwords, and tokens already captured as anchors.
      if (tok.length < 2) return false;
      if (STOPWORDS.has(lower)) return false;
      if (consumed.has(tok)) return false;
      return true;
    })
    .join(' ');

  return {
    partNumbers,
    ratings,
    certifications,
    dimensions,
    brandHints,
    cleanedDescription,
  };
}
