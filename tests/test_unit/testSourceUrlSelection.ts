import assert from 'assert';
import { bestSourceUrl } from '@/lib/services/search/index';

// =============================================
// bestSourceUrl — supplier-search persist URL selection
// =============================================
// Regression for the empty-write / 0-of-N bug: Serper /shopping `link` is always
// a `google.com/search?ibp=oshop` redirect, which isProductPage rejects. The
// persist path must NOT drop such offers — it falls back to the redirect URL.

const GOOGLE_REDIRECT =
  'https://www.google.com/search?ibp=oshop&q=solenoid+valve&prds=localAnnotatedOfferId:1';

// Prefer a real merchant product page when Qwen extracted one.
assert.strictEqual(
  bestSourceUrl('https://grainger.com/product/solenoid-valve-5A140', GOOGLE_REDIRECT),
  'https://grainger.com/product/solenoid-valve-5A140',
  'a clean merchant product URL must be preferred over the shopping redirect',
);

// THE BUG: no merchant URL → must fall back to the (non-empty) shopping redirect,
// never produce an empty source_url that strands the offer out of the DB.
assert.strictEqual(
  bestSourceUrl(null, GOOGLE_REDIRECT),
  GOOGLE_REDIRECT,
  'with no product_page_url, the Serper shopping redirect must be kept (non-empty)',
);

// A homepage-shaped product_page_url is junk → fall back to the redirect.
assert.strictEqual(
  bestSourceUrl('https://acme-valves.com/', GOOGLE_REDIRECT),
  GOOGLE_REDIRECT,
  'a bare-homepage product_page_url must fall back to the shopping redirect',
);

// Only truly URL-less offers collapse to empty (these get filtered out downstream).
assert.strictEqual(bestSourceUrl(null, null), '', 'no URLs at all → empty string');
assert.strictEqual(bestSourceUrl(undefined, ''), '', 'undefined + empty → empty string');

// Whitespace is trimmed.
assert.strictEqual(
  bestSourceUrl(null, '  https://shop.example/p/1  '),
  'https://shop.example/p/1',
  'directUrl whitespace must be trimmed',
);

console.log('✓ testSourceUrlSelection passed');
