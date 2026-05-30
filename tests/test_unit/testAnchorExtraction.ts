import assert from 'assert';
import { extractAnchors } from '@/lib/services/search/tokenizer';
import { buildTier1Queries, GEO_QUALIFIERS } from '@/lib/services/search/query-builder';

// =============================================
// testAnchorExtraction — internal ref stripping + digit-gated part numbers
// =============================================
// Regression coverage for the live diagnosis where NULQ-SK (an all-letters
// project tag) and CCP-2898 (a drawing code) were extracted as part-number
// anchors, causing Tier 1 queries to search for "SK" (SK Group / Korean
// conglomerate) instead of Crane / Bettis — the real manufacturer anchors.
//
// Root causes:
//   (a) Part-number regex matched all-letter hyphenated codes (no digit requirement).
//   (b) Drawing/tag/order references were not stripped before pattern matching.
//   (c) GEO_QUALIFIERS[0] was site:.vn — too restrictive for obscure industrial parts.
//
// Run: npx tsx tests/test_unit/testAnchorExtraction.ts

// -----------------------------------------------
// Fixture strings (from live RFQ diagnosis)
// -----------------------------------------------

/** Item 1 — the polluted description that triggered the bug. */
const ITEM1 =
  'Check valve, swing, 2", 150#, RF (JVPC Spec A5R), CAPS order #155107, ' +
  'Crane 147XU 50NB Swing Check Valve. Tag: ACV1, ACV2 in drawing CCP-2898 for NULQ-SK-6111A/B';

/** Item 2 — the Bettis/Crane actuator valve (separate diagnosis scenario). */
const ITEM2 =
  'Valve, with Bettis CB415 actuator on Crane KF941, 2", 150#, RF, for NULQ-SK-6111A/B';

/** Item 3 — a genuine digit-bearing part number that must NOT be stripped. */
const ITEM3 = 'Filter element P/N AB-12345';

// -----------------------------------------------
// Test 1: partNumbers must NOT include all-letter codes or drawing references
// -----------------------------------------------
const anchors1 = extractAnchors(ITEM1);

assert.ok(
  !anchors1.partNumbers.includes('NULQ-SK'),
  `partNumbers must NOT contain "NULQ-SK" (got: [${anchors1.partNumbers.join(', ')}])`,
);
assert.ok(
  !anchors1.partNumbers.includes('SK'),
  `partNumbers must NOT contain bare "SK" (got: [${anchors1.partNumbers.join(', ')}])`,
);
assert.ok(
  !anchors1.partNumbers.includes('CCP-2898'),
  `partNumbers must NOT contain drawing code "CCP-2898" (got: [${anchors1.partNumbers.join(', ')}])`,
);

// -----------------------------------------------
// Test 2: brandHints SHOULD include 'Crane'
// -----------------------------------------------
assert.ok(
  anchors1.brandHints.includes('Crane'),
  `brandHints must contain "Crane" (got: [${anchors1.brandHints.join(', ')}])`,
);

// -----------------------------------------------
// Test 3: genuine digit-bearing part number still extracted
// -----------------------------------------------
const anchors3 = extractAnchors(ITEM3);
assert.ok(
  anchors3.partNumbers.includes('AB-12345'),
  `partNumbers must contain genuine part "AB-12345" (got: [${anchors3.partNumbers.join(', ')}])`,
);

// -----------------------------------------------
// Test 4: buildTier1Queries for ITEM2 (Bettis/Crane) must use brand anchor,
//         not NULQ-SK, as the primary query string
// -----------------------------------------------
const anchors2 = extractAnchors(ITEM2);
const tier1 = buildTier1Queries({ description: ITEM2 }, anchors2);

// There must be at least one query produced (brand hints should be present)
assert.ok(
  tier1.length > 0,
  'buildTier1Queries must produce at least one query for the Bettis/Crane item',
);

const primaryQuery = tier1[0];
const containsBrand =
  primaryQuery.toLowerCase().includes('bettis') ||
  primaryQuery.toLowerCase().includes('crane');
assert.ok(
  containsBrand,
  `Tier 1 primary query must contain "Bettis" or "Crane" (got: "${primaryQuery}")`,
);
assert.ok(
  !primaryQuery.includes('NULQ-SK'),
  `Tier 1 primary query must NOT contain "NULQ-SK" (got: "${primaryQuery}")`,
);

// -----------------------------------------------
// Test 5: GEO_QUALIFIERS[0] must NOT be domain-locked to site:.vn
// -----------------------------------------------
assert.ok(
  !GEO_QUALIFIERS[0].startsWith('site:.vn'),
  `GEO_QUALIFIERS[0] must not start with "site:.vn" (got: "${GEO_QUALIFIERS[0]}")`,
);

console.log('✓ testAnchorExtraction passed');
