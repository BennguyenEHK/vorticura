import assert from 'assert';
import { isProductPage } from '@/lib/services/search/index';
import { hasProductSignals } from '@/lib/services/search/html-gate';

// =============================================
// Persist-gate URL guard regression tests
// =============================================
// isProductPage is now the lightweight PERSIST-time guard (candidate relevance
// filtering moved to the weighted scorer — see testProductPageScorer.ts). It
// only defends against a hallucinated source_url: empty, bare homepage, or an
// obvious editorial/account surface. PDFs, distributor listings and ugly-slug
// product pages now PASS — the scorer already vetted them upstream.

// ----- isProductPage: should be FALSE (structural junk) -----

// Bare homepage / root path
assert.strictEqual(
  isProductPage('https://acme-valves.com/'),
  false,
  'bare homepage must not pass as product page',
);

// Company/locations page (editorial surface)
assert.strictEqual(
  isProductPage('https://freudenberg.com/en/company/locations/freudenberg-in-southeast-asia'),
  false,
  'company sub-path must not pass as product page',
);

// Blog / editorial
assert.strictEqual(
  isProductPage('https://valveworld.com/blog/valve-maintenance'),
  false,
  'blog path must not pass as product page',
);

// Empty url
assert.strictEqual(isProductPage(''), false, 'empty url is not a product page');

// ----- isProductPage: should be TRUE (kept for persistence) -----

// Genuine product detail page
assert.strictEqual(
  isProductPage('https://valveshop.vn/product/ball-valve-2in-150'),
  true,
  'specific product path must pass as product page',
);

// PDF datasheet — now KEPT (was previously rejected by the binary gate)
assert.strictEqual(
  isProductPage('https://supplier.com/datasheets/kf941.pdf'),
  true,
  'PDF datasheets must pass — relevance is decided by the scorer',
);

// Distributor listing — now KEPT (valid supplier source per the KF941 example)
assert.strictEqual(
  isProductPage('https://www.alibaba.com/sk-suppliers.html'),
  true,
  'distributor/-suppliers listings must pass — scorer ranks them',
);

// Ugly-slug product page with no /product/ segment
assert.strictEqual(
  isProductPage('https://company.com/kf941.html'),
  true,
  'ugly-slug product page must pass (URL-pattern filtering alone would fail it)',
);

// ----- hasProductSignals (still exported helper) -----

assert.strictEqual(
  hasProductSignals('Ball valve 2" 150#, price $42.50, in stock, MOQ 10'),
  true,
  'text with price and procurement keywords must return true',
);

assert.strictEqual(
  hasProductSignals(
    'Vietnam manufacturing supporting industry yearbook 2019-2020 regional overview',
  ),
  false,
  'yearbook/editorial text with no product signals must return false',
);

console.log('✓ testProductPageGuard passed');
