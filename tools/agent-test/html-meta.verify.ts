/* ========================================================================
   TDD-lite verification for extractMetaFromHtml (html-extract.ts).

   Run with:  npx tsx tools/agent-test/html-meta.verify.ts

   Uses console.assert + a pass/fail summary.  Exits with a non-zero code
   when any assertion fails so CI can catch regressions.
   ======================================================================== */

import { extractMetaFromHtml, extractFromHtml } from '../../lib/services/search/html-extract';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test 1 — OpenGraph tags: og:site_name, og:title, og:description
// ---------------------------------------------------------------------------
console.log('\nTest 1: OpenGraph tags');
{
  const html = `
    <html>
      <head>
        <meta property="og:site_name" content="ACME Components" />
        <meta property="og:title" content="10mm Hex Bolt Grade 8" />
        <meta property="og:description" content="High-strength grade 8 hex bolts for industrial use." />
      </head>
      <body></body>
    </html>
  `;

  const meta = extractMetaFromHtml(html);
  assert('siteName = og:site_name',    meta.siteName    === 'ACME Components');
  assert('productName = og:title',     meta.productName === '10mm Hex Bolt Grade 8');
  assert('description = og:description', meta.description === 'High-strength grade 8 hex bolts for industrial use.');
}

// ---------------------------------------------------------------------------
// Test 2 — JSON-LD Product with brand, seller, offers
// ---------------------------------------------------------------------------
console.log('\nTest 2: JSON-LD Product node');
{
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'M6 Stainless Steel Bolt',
    description: 'Corrosion-resistant M6 bolt, pack of 100.',
    brand: {
      '@type': 'Brand',
      name: 'BoltMaster',
    },
    offers: {
      '@type': 'Offer',
      price: '9.99',
      priceCurrency: 'USD',
      seller: {
        '@type': 'Organization',
        name: 'FastenersPlus',
      },
    },
  });

  const html = `
    <html>
      <head>
        <script type="application/ld+json">${jsonLd}</script>
      </head>
      <body></body>
    </html>
  `;

  const meta = extractMetaFromHtml(html);
  assert('productName from JSON-LD Product.name',         meta.productName  === 'M6 Stainless Steel Bolt');
  assert('description from JSON-LD Product.description',  meta.description  === 'Corrosion-resistant M6 bolt, pack of 100.');
  assert('supplierName from Offer.seller.name',           meta.supplierName === 'FastenersPlus');
}

// ---------------------------------------------------------------------------
// Test 3 — Empty / malformed HTML returns all-empty strings and does not throw
// ---------------------------------------------------------------------------
console.log('\nTest 3: Empty and malformed HTML');
{
  let threw = false;
  let emptyMeta: ReturnType<typeof extractMetaFromHtml>;
  try {
    emptyMeta = extractMetaFromHtml('');
  } catch {
    threw = true;
    emptyMeta = { supplierName: '', description: '', siteName: '', productName: '' };
  }
  assert('empty string does not throw',        !threw);
  assert('empty string supplierName = ""',     emptyMeta.supplierName === '');
  assert('empty string description = ""',      emptyMeta.description  === '');
  assert('empty string siteName = ""',         emptyMeta.siteName     === '');
  assert('empty string productName = ""',      emptyMeta.productName  === '');

  let threw2 = false;
  let malformedMeta: ReturnType<typeof extractMetaFromHtml>;
  try {
    malformedMeta = extractMetaFromHtml('<<not valid html>>>{{{}}}');
  } catch {
    threw2 = true;
    malformedMeta = { supplierName: '', description: '', siteName: '', productName: '' };
  }
  assert('malformed HTML does not throw',          !threw2);
  // Malformed HTML with no meta/ld+json/title should return all empty.
  assert('malformed HTML supplierName = ""',       malformedMeta.supplierName === '');
  assert('malformed HTML siteName = ""',           malformedMeta.siteName     === '');
}

// ---------------------------------------------------------------------------
// Test 4 — Price regression: extractFromHtml still returns the correct price
//          on a JSON-LD priced sample (guard against unintended side-effects).
// ---------------------------------------------------------------------------
console.log('\nTest 4: extractFromHtml price-path regression guard');
{
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Test Resistor 10k',
    offers: {
      '@type': 'Offer',
      price: '4.50',
      priceCurrency: 'USD',
    },
  });

  const html = `
    <html>
      <head>
        <script type="application/ld+json">${jsonLd}</script>
      </head>
      <body></body>
    </html>
  `;

  const priceResult = extractFromHtml(html);
  assert('extractFromHtml price = 4.5',    priceResult.price    === 4.5);
  assert('extractFromHtml currency = USD', priceResult.currency === 'USD');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
