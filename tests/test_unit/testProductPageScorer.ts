import assert from 'assert';
import {
  scoreProductPage,
  classifyPage,
  KEEP_THRESHOLD,
  type ScorerSpec,
  type ScorableSnippet,
} from '@/lib/services/search/product-page-scorer';
import type { TavilySnippet } from '@/lib/services/search/tavily-client';

// =============================================
// Product-page scorer — weighted multi-layer classifier
// =============================================
// Verifies each scoring layer fires and the "balanced" keep policy: a page is
// kept on ANY one strong signal (schema.org alone, exact-model alone, or a
// product URL + one content keyword), while homepages / blogs are dropped.

function snippet(partial: Partial<TavilySnippet>): TavilySnippet {
  return { title: '', url: '', snippet: '', content: '', ...partial };
}

const KF941_SPEC: ScorerSpec = {
  type: 'gate valve',
  size: '2 inch',
  class: 'class 150',
  material: 'carbon steel',
  model: 'KF941',
  manufacturer: 'TVC',
};

// ---------------------------------------------------------------------------
// Empty / unparseable URL → score 0, dropped
// ---------------------------------------------------------------------------
assert.equal(scoreProductPage(snippet({ url: '' })).kept, false, 'empty url is dropped');
assert.equal(scoreProductPage(snippet({ url: 'not a url' })).kept, false, 'unparseable url is dropped');

// ---------------------------------------------------------------------------
// Homepage → strong negative → dropped even with a product keyword
// ---------------------------------------------------------------------------
{
  const r = scoreProductPage(
    snippet({ url: 'https://tvc.com/', content: 'request a quote for our valves' }),
    KF941_SPEC,
  );
  assert.equal(r.kept, false, 'homepage is dropped');
  assert.ok(r.signals.includes('url:homepage'), 'homepage signal fires');
}

// ---------------------------------------------------------------------------
// Blog → junk URL → dropped
// ---------------------------------------------------------------------------
assert.equal(
  scoreProductPage(snippet({ url: 'https://tvc.com/blog/how-to-pick-a-valve' }), KF941_SPEC).kept,
  false,
  'blog post is dropped',
);

// ---------------------------------------------------------------------------
// Layer 3 — exact model match alone clears the threshold (ugly-slug URL)
// ---------------------------------------------------------------------------
{
  const r = scoreProductPage(
    snippet({ url: 'https://company.com/pid=12984', content: 'Industrial gate valve model KF941 datasheet' }),
    KF941_SPEC,
  );
  assert.ok(r.score >= KEEP_THRESHOLD, 'exact model match clears threshold on an ugly URL');
  assert.ok(r.kept, 'kept on model match');
  assert.ok(r.signals.includes('model:exact'), 'model signal fires');
}

// Model match is separator-insensitive (KF-941 vs KF941)
{
  const r = scoreProductPage(
    snippet({ url: 'https://company.com/kf-941.html', content: 'KF 941 valve' }),
    { model: 'KF941' },
  );
  assert.ok(r.signals.includes('model:exact'), 'model match ignores separators/case');
}

// ---------------------------------------------------------------------------
// Layer 5 — schema.org Product alone clears the threshold (no spec needed)
// ---------------------------------------------------------------------------
{
  const html = '<html><head><meta itemtype="https://schema.org/Product"></head><body>x</body></html>';
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: html }));
  assert.ok(r.kept, 'schema.org Product alone is enough to keep');
  assert.ok(r.signals.includes('schema:product'), 'schema signal fires');
}

// ---------------------------------------------------------------------------
// Layer 1 + 2 — product URL pattern + one content keyword reaches threshold
// ---------------------------------------------------------------------------
{
  const r = scoreProductPage(
    snippet({ url: 'https://shop.com/product/ball-valve', content: 'add to cart' }),
  );
  assert.ok(r.kept, 'product url + one keyword clears the balanced threshold');
  assert.ok(r.signals.includes('url:product'), 'product url signal fires');
  assert.ok(r.signals.includes('terms:1'), 'one content keyword counted');
}

// A single product keyword with a neutral URL is NOT enough on its own
{
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: 'datasheet' }));
  assert.equal(r.kept, false, 'one keyword on a neutral URL stays below threshold');
}

// ---------------------------------------------------------------------------
// Layer 4 — spec density: two parsed specs present reaches threshold
// ---------------------------------------------------------------------------
{
  const r = scoreProductPage(
    snippet({ url: 'https://shop.com/x', content: 'carbon steel gate valve, class 150 rated' }),
    KF941_SPEC,
  );
  assert.ok(r.kept, 'two+ spec matches clear the threshold');
  assert.ok(r.signals.some((s) => s.startsWith('spec:')), 'spec-density signal fires');
}

// ---------------------------------------------------------------------------
// Layer 7 — trusted supplier domain boost
// ---------------------------------------------------------------------------
{
  const r = scoreProductPage(
    snippet({ url: 'https://www.emerson.com/products/kf941', content: 'KF941 valve' }),
    KF941_SPEC,
  );
  assert.ok(r.signals.includes('domain:trusted'), 'trusted domain boost fires');
}

// ---------------------------------------------------------------------------
// PDF datasheet — kept via PDF + model signals (valid per the spec)
// ---------------------------------------------------------------------------
{
  const r = scoreProductPage(
    snippet({ url: 'https://supplier.com/catalog/kf941.pdf', content: 'KF941 specification sheet' }),
    KF941_SPEC,
  );
  assert.ok(r.signals.includes('url:pdf'), 'pdf signal fires');
  assert.ok(r.kept, 'datasheet PDF is kept');
}

// ---------------------------------------------------------------------------
// Directory / aggregator — negative weight; dropped without a strong co-signal
// ---------------------------------------------------------------------------
{
  // Aggregator host + listing path, only a weak keyword → below threshold.
  const r = scoreProductPage(
    snippet({ url: 'https://www.alibaba.com/sk-suppliers.html', content: 'gate valve suppliers, request quote' }),
    KF941_SPEC,
  );
  assert.ok(r.signals.includes('url:directory'), 'directory signal fires');
  assert.equal(r.kept, false, 'bare directory listing is dropped');
}

// Directory path alone (non-aggregator host) is penalised
{
  const r = scoreProductPage(snippet({ url: 'https://x.com/manufacturers/valves' }));
  assert.ok(r.signals.includes('url:directory'), 'directory path penalised on any host');
}

// ...but a directory listing WITH an exact model match is recoverable
{
  const r = scoreProductPage(
    snippet({ url: 'https://www.indiamart.com/proddetail/kf941-gate-valve', content: 'KF941 gate valve' }),
    KF941_SPEC,
  );
  assert.ok(r.signals.includes('url:directory'), 'directory signal still fires');
  assert.ok(r.kept, 'exact model match pulls a directory listing back above threshold');
}

// ---------------------------------------------------------------------------
// Detected field map — commerce/procurement signals
// ---------------------------------------------------------------------------

// has_price: simple digit pattern
{
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: 'Price: $99.99 per unit' }));
  assert.ok(r.detected.has_price, 'has_price fires on numeric pattern');
}

// has_currency: currency symbol or ISO code near number
{
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: 'USD 150 per valve' }));
  assert.ok(r.detected.has_currency, 'has_currency fires on ISO code near number');
}

{
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: 'Price €50 - Premium' }));
  assert.ok(r.detected.has_currency, 'has_currency fires on currency symbol near number');
}

// has_contact_email: email pattern
{
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: 'sales@supplier.com' }));
  assert.ok(r.detected.has_contact_email, 'has_contact_email fires on valid email');
}

// has_contact_phone: phone pattern
{
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: 'Call +1-234-567-8900' }));
  assert.ok(r.detected.has_contact_phone, 'has_contact_phone fires on phone pattern');
}

// has_stock: in stock / available / stock: keywords
{
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: 'Currently in stock' }));
  assert.ok(r.detected.has_stock, 'has_stock fires on "in stock"');
}

{
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: 'Available for immediate shipment' }));
  assert.ok(r.detected.has_stock, 'has_stock fires on "available"');
}

// has_delivery: lead time / delivery / ships in / weeks keywords
{
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: 'Lead time: 4-6 weeks' }));
  assert.ok(r.detected.has_delivery, 'has_delivery fires on "lead time"');
}

{
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: 'Ships in 2-3 business days' }));
  assert.ok(r.detected.has_delivery, 'has_delivery fires on "ships in"');
}

// has_quote_request: request quote / get quote / contact for price / RFQ keywords
{
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: 'Click here to request a quote' }));
  assert.ok(r.detected.has_quote_request, 'has_quote_request fires on "request a quote"');
}

{
  const r = scoreProductPage(snippet({ url: 'https://shop.com/x', content: 'Contact for price / RFQ support' }));
  assert.ok(r.detected.has_quote_request, 'has_quote_request fires on "contact for price" or "rfq"');
}

// All flags false on a generic page
{
  const r = scoreProductPage(snippet({ url: 'https://blog.com/how-to', content: 'This is a blog post about valves' }));
  assert.equal(r.detected.has_price, false, 'has_price is false when no price present');
  assert.equal(r.detected.has_currency, false, 'has_currency is false when no currency present');
  assert.equal(r.detected.has_quote_request, false, 'has_quote_request is false when no quote keyword present');
}

// ---------------------------------------------------------------------------
// Page classifier — product vs tech_spec
// ---------------------------------------------------------------------------

// PDF URL → tech_spec
{
  const page: ScorableSnippet = { url: 'https://supplier.com/docs/valve-spec.pdf' };
  assert.equal(classifyPage(page), 'tech_spec', 'pdf url is classified as tech_spec');
}

// Normal product URL → product
{
  const page: ScorableSnippet = { url: 'https://shop.com/products/gate-valve-kf941' };
  assert.equal(classifyPage(page), 'product', 'product url is classified as product');
}

// Datasheet keyword in URL → tech_spec
{
  const page: ScorableSnippet = { url: 'https://supplier.com/datasheet-valve.html' };
  assert.equal(classifyPage(page), 'tech_spec', 'url with datasheet keyword is tech_spec');
}

// Catalog keyword in URL → tech_spec
{
  const page: ScorableSnippet = { url: 'https://supplier.com/catalog-2024.html' };
  assert.equal(classifyPage(page), 'tech_spec', 'url with catalog keyword is tech_spec');
}

// Datasheet keyword in content → tech_spec
{
  const page: ScorableSnippet = {
    url: 'https://supplier.com/gate-valve',
    content: 'Product Datasheet: specifications and dimensions',
  };
  assert.equal(classifyPage(page), 'tech_spec', 'content with datasheet keyword is tech_spec');
}

// Neutral page → product
{
  const page: ScorableSnippet = {
    url: 'https://shop.com/item/valve',
    title: 'Gate Valve',
    content: 'High quality industrial valve',
  };
  assert.equal(classifyPage(page), 'product', 'neutral page is classified as product');
}

console.log('✓ testProductPageScorer passed');
