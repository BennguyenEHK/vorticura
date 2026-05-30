import assert from 'assert';
import { isProductPage } from '@/lib/services/search/index';
import { hasProductSignals } from '@/lib/services/search/html-gate';

// =============================================
// Product-page guard regression tests
// =============================================
// Exercises the URL-structural gate (isProductPage) and the plain-text
// content signal helper (hasProductSignals) that backs the cleaned-text
// branch of runQueryAndDedup's structural verification.
//
// Each assertion documents a URL / text that was incorrectly accepted (or
// incorrectly rejected) in production and the expected correct outcome.

// ----- isProductPage: should be FALSE -----

// PDF document linked as a product URL
assert.strictEqual(
  isProductPage('https://x.gov.vn/files/report.pdf'),
  false,
  'PDF files must not pass as product pages',
);

// Company/locations page
assert.strictEqual(
  isProductPage('https://freudenberg.com/en/company/locations/freudenberg-in-southeast-asia'),
  false,
  'company sub-path must not pass as product page',
);

// Alibaba supplier-listing page
assert.strictEqual(
  isProductPage('https://www.alibaba.com/sk-suppliers.html'),
  false,
  '"-suppliers" path must not pass as product page',
);

// Made-in-china directory-listing
assert.strictEqual(
  isProductPage('https://www.made-in-china.com/products-search/hot-china-products/Valves.html'),
  false,
  '"products-search" path must not pass as product page',
);

// ----- isProductPage: should be TRUE -----

// Genuine product detail page
assert.strictEqual(
  isProductPage('https://valveshop.vn/product/ball-valve-2in-150'),
  true,
  'specific product path must pass as product page',
);

// ----- hasProductSignals: should be TRUE -----

assert.strictEqual(
  hasProductSignals('Ball valve 2" 150#, price $42.50, in stock, MOQ 10'),
  true,
  'text with price and procurement keywords must return true',
);

// ----- hasProductSignals: should be FALSE -----

assert.strictEqual(
  hasProductSignals(
    'Vietnam manufacturing supporting industry yearbook 2019-2020 regional overview',
  ),
  false,
  'yearbook/editorial text with no product signals must return false',
);

console.log('✓ testProductPageGuard passed');
