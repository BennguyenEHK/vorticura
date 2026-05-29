import assert from 'assert';
import {
  buildDeterministicSupplier,
  supplierNameFromUrl,
} from '@/lib/services/search/track-a';
import type { TavilySnippet } from '@/lib/services/search/tavily-client';

// Stub product-page guard: any URL with a non-root path is a "product page".
const isProductPage = (url: string): boolean => {
  try {
    return new URL(url).pathname.length > 1;
  } catch {
    return false;
  }
};

function snippet(partial: Partial<TavilySnippet>): TavilySnippet {
  return { title: '', url: '', snippet: '', content: '', ...partial };
}

// Microdata fixtures
const COMPLETE = `<html><head>
  <meta itemprop="price" content="1234.50">
  <meta itemprop="priceCurrency" content="USD">
</head><body>Ball Valve 2"</body></html>`;

const PRICE_ONLY = `<html><head>
  <meta itemprop="price" content="999.00">
</head><body>no currency here</body></html>`;

// ---------------------------------------------------------------------------
// supplierNameFromUrl
// ---------------------------------------------------------------------------
assert.equal(
  supplierNameFromUrl('https://www.valveworld.com/p/123'),
  'Valveworld',
  'strips www + TLD, title-cases brand',
);
assert.equal(
  supplierNameFromUrl('https://shop.valveworld.com.vn/item'),
  'Valveworld',
  'skips subdomain and .com.vn SLD to find the brand label',
);
assert.equal(supplierNameFromUrl('not a url'), '', 'unparseable URL → empty');

// ---------------------------------------------------------------------------
// buildDeterministicSupplier — complete microdata short-circuits the LLM
// ---------------------------------------------------------------------------
const complete = buildDeterministicSupplier(
  [snippet({ url: 'https://acme-valves.com/p/ball-2in', title: 'Ball Valve 2"', content: COMPLETE })],
  isProductPage,
);
assert.ok(complete, 'complete price+currency yields a deterministic row');
assert.equal(complete!.bidder_unit_price, 1234.5, 'price parsed from microdata');
assert.equal(complete!.currency_code, 'USD', 'currency parsed from microdata');
assert.equal(complete!.source_url, 'https://acme-valves.com/p/ball-2in', 'source_url is the snippet url');
assert.equal(complete!.supplier_name, 'Acme-valves', 'supplier_name derived from host');
assert.equal(complete!.bidder_description, 'Ball Valve 2"', 'description from snippet title');

// ---------------------------------------------------------------------------
// Incomplete microdata (price but no currency) → null → falls through to LLM
// ---------------------------------------------------------------------------
assert.equal(
  buildDeterministicSupplier(
    [snippet({ url: 'https://acme-valves.com/p/x', content: PRICE_ONLY })],
    isProductPage,
  ),
  null,
  'price without currency is NOT complete → Track B',
);

// ---------------------------------------------------------------------------
// Homepage / non-product URL is skipped even with complete microdata
// ---------------------------------------------------------------------------
assert.equal(
  buildDeterministicSupplier(
    [snippet({ url: 'https://acme-valves.com/', content: COMPLETE })],
    isProductPage,
  ),
  null,
  'non-product URL is skipped by the page-type guard',
);

// ---------------------------------------------------------------------------
// First complete page wins; earlier incomplete pages are skipped, not fatal
// ---------------------------------------------------------------------------
const mixed = buildDeterministicSupplier(
  [
    snippet({ url: 'https://a.com/p1', content: PRICE_ONLY }),       // incomplete → skip
    snippet({ url: 'https://b.com/', content: COMPLETE }),           // homepage → skip
    snippet({ url: 'https://c.com/p2', title: 'Valve', content: COMPLETE }), // ← winner
  ],
  isProductPage,
);
assert.ok(mixed, 'scans past incomplete/homepage snippets to the first complete one');
assert.equal(mixed!.source_url, 'https://c.com/p2', 'picks the first complete product page');

console.log('✓ testSupplierTrackA passed');
