import assert from 'assert';
import {
  manualExtract,
  verifyAgainstContent,
  type DetectedFieldMap,
  type ManualExtractResult,
} from '@/lib/services/search/manual-extract';

// =============================================
// Manual Extract — regex-based supplier field extraction
// =============================================
// Tests cover: price + currency (symbols & ISO codes, comma-formatted numbers),
// email, phone, stock qty, delivery time normalization, the verify gate,
// detected-map suppression, and edge cases (empty content, nothing found).

const assertResult = (
  result: ManualExtractResult,
  expectedFields: Partial<typeof result.fields>,
  desc: string,
) => {
  for (const [key, val] of Object.entries(expectedFields)) {
    assert.equal(
      result.fields[key as keyof typeof result.fields],
      val,
      `${desc}: fields.${key}`,
    );
  }
};

// =============================================
// verifyAgainstContent: basic gate
// =============================================
{
  assert.equal(verifyAgainstContent('', 'some content'), false, 'empty value → false');
  assert.equal(verifyAgainstContent(0, 'some content'), false, 'zero value → false');
  assert.equal(verifyAgainstContent('USD', 'Price in USD: 100'), true, 'substring match');
  assert.equal(verifyAgainstContent('USD', 'Price in US Dollar'), true, 'USD is found in "US Dollar" after normalization');
  assert.equal(verifyAgainstContent(123, 'Item qty 123 units'), true, 'number digit match');
  assert.equal(verifyAgainstContent(123, 'Item qty 1234 units'), false, 'numeric value must match at a digit boundary — 123 inside 1234 is NOT a valid match (prevents price/qty false positives from part numbers)');
  assert.equal(
    verifyAgainstContent('john@example.com', 'Contact: john@example.com'),
    true,
    'email verification (strips punctuation)',
  );
  assert.equal(
    verifyAgainstContent('4 weeks', 'Delivery: 4 weeks'),
    true,
    'verify delivery time without range',
  );
  assert.equal(
    verifyAgainstContent('4-6 weeks', '4-6 weeks delivery'),
    true,
    'range with dashes matches if dashes present in content',
  );
}

// =============================================
// Price extraction: symbol forms
// =============================================
{
  const content = 'Unit price: $50.00';
  const result = manualExtract(content);
  assertResult(result, { bidder_unit_price: 50, currency_code: 'USD' }, 'dollar symbol');
  assert.equal(result.confidence.bidder_unit_price, 0.8);
  // Symbol-inferred code has lower confidence (0.6) since 'USD' text doesn't appear in content.
  assert.equal(result.confidence.currency_code, 0.6, 'symbol-inferred currency has lower confidence');
}

{
  const content = 'Price €125.99 per unit';
  const result = manualExtract(content);
  assertResult(result, { bidder_unit_price: 125.99, currency_code: 'EUR' }, 'euro symbol');
  assert.equal(result.confidence.currency_code, 0.6, 'symbol-inferred currency');
}

{
  const content = 'Cost: £250';
  const result = manualExtract(content);
  assertResult(result, { bidder_unit_price: 250, currency_code: 'GBP' }, 'pound symbol');
  assert.equal(result.confidence.currency_code, 0.6, 'symbol-inferred currency');
}

{
  const content = 'Price ¥10000 per item';
  const result = manualExtract(content);
  assertResult(result, { bidder_unit_price: 10000, currency_code: 'JPY' }, 'yen symbol');
  assert.equal(result.confidence.currency_code, 0.6, 'symbol-inferred currency');
}

// =============================================
// Price extraction: ISO code forms
// =============================================
{
  const content = 'Cost USD 150.50';
  const result = manualExtract(content);
  assertResult(result, { bidder_unit_price: 150.5, currency_code: 'USD' }, 'USD iso code');
}

{
  const content = 'Price VND 500,000';
  const result = manualExtract(content);
  assertResult(result, { bidder_unit_price: 500000, currency_code: 'VND' }, 'VND with comma separator');
}

{
  const content = 'Unit cost: 1,234.56 SGD';
  const result = manualExtract(content);
  assertResult(result, { bidder_unit_price: 1234.56, currency_code: 'SGD' }, 'comma-formatted number with trailing code');
}

// =============================================
// Email extraction
// =============================================
{
  const content = 'For inquiries, email sales@vendor.com';
  const result = manualExtract(content);
  assertResult(result, { contact_email: 'sales@vendor.com' }, 'standard email');
  assert.equal(result.confidence.contact_email, 0.95);
}

{
  const content = 'Contact: john.doe+tag@company.co.uk for quotes';
  const result = manualExtract(content);
  assertResult(result, { contact_email: 'john.doe+tag@company.co.uk' }, 'email with special chars');
}

{
  const content = 'No email here at all.';
  const result = manualExtract(content);
  assertResult(result, { contact_email: '' }, 'no email');
  assert.ok(result.missing.includes('contact_email'));
}

// =============================================
// Phone extraction
// =============================================
{
  const content = 'Call us: +1 234-567-8901';
  const result = manualExtract(content);
  assert.ok(result.fields.contact_phone.includes('1'), 'phone with country code');
  assert.equal(result.confidence.contact_phone, 0.8);
}

{
  const content = 'Phone: (555) 123-4567';
  const result = manualExtract(content);
  assert.ok(result.fields.contact_phone.includes('555'), 'phone with parens');
}

{
  const content = 'Contact +65 6123 4567 (Singapore)';
  const result = manualExtract(content);
  assert.ok(result.fields.contact_phone, 'phone with + and spaces');
}

{
  const content = 'Tel 12345 (too short)';
  const result = manualExtract(content);
  assertResult(result, { contact_phone: '' }, 'too few digits → rejected');
  assert.ok(result.missing.includes('contact_phone'));
}

// =============================================
// Stock quantity extraction
// =============================================
{
  const content = 'We have 500 in stock';
  const result = manualExtract(content);
  assertResult(result, { available_qty: 500 }, '"N in stock" pattern');
  assert.equal(result.confidence.available_qty, 0.85);
}

{
  const content = 'Stock: 1250 units available';
  const result = manualExtract(content);
  assertResult(result, { available_qty: 1250 }, '"stock: N" pattern');
}

{
  const content = 'Available: 75';
  const result = manualExtract(content);
  assertResult(result, { available_qty: 75 }, '"available: N" pattern');
}

{
  const content = '100 available immediately';
  const result = manualExtract(content);
  assertResult(result, { available_qty: 100 }, '"N available" pattern');
}

{
  const content = 'Out of stock currently';
  const result = manualExtract(content);
  assertResult(result, { available_qty: 0 }, 'no qty found');
  assert.ok(result.missing.includes('available_qty'));
}

// =============================================
// Delivery time extraction and normalization
// =============================================
{
  const content = 'Lead time 4-6 weeks';
  const result = manualExtract(content);
  assertResult(result, { delivery_time: '4-6 weeks' }, 'lead time range in weeks');
  assert.equal(result.confidence.delivery_time, 0.8);
}

{
  const content = 'Ships in 3 days';
  const result = manualExtract(content);
  // 3 days → ceil(3/7) = 1 week
  assert.ok(result.fields.delivery_time.includes('week'), 'days normalized to weeks');
}

{
  const content = 'Delivery 2 weeks';
  const result = manualExtract(content);
  assertResult(result, { delivery_time: '2-2 weeks' }, 'single number normalized to range');
}

{
  const content = 'Lead time 5-7 days';
  const result = manualExtract(content);
  // 5-7 days → ceil(5/7)=1, ceil(7/7)=1 → 1-1 weeks
  assert.ok(result.fields.delivery_time.includes('week'), 'day range normalized to weeks');
}

{
  const content = 'No delivery info here';
  const result = manualExtract(content);
  assertResult(result, { delivery_time: '' }, 'no delivery pattern');
  assert.ok(result.missing.includes('delivery_time'));
}

// =============================================
// Verify gate: value not in content → rejected
// =============================================
// Verify gate behavior is tested implicitly through other cases.

{
  // Extract a price but then verify gate checks it re-appears.
  const content = 'Product costs five dollars (spelled out, no number)';
  const result = manualExtract(content);
  // No price pattern found because "five dollars" is text, not numeric.
  assertResult(result, { bidder_unit_price: 0 }, 'no numeric price → missing');
}

// =============================================
// Detected map: suppress searching for absent fields
// =============================================
{
  const content = 'Contact: john@example.com';
  const detected: DetectedFieldMap = { has_contact_email: false };
  const result = manualExtract(content, detected);
  // Even though email is in content, detected map says skip searching.
  assertResult(result, { contact_email: '' }, 'detected.has_contact_email=false suppresses search');
  assert.ok(result.missing.includes('contact_email'));
}

{
  const content = 'Price $500 USD';
  const detected: DetectedFieldMap = { has_price: false };
  const result = manualExtract(content, detected);
  assertResult(
    result,
    { bidder_unit_price: 0, currency_code: '' },
    'detected.has_price=false suppresses price/currency search',
  );
  assert.ok(result.missing.includes('bidder_unit_price'));
  assert.ok(result.missing.includes('currency_code'));
}

// =============================================
// Empty/minimal content → all missing
// =============================================
{
  const content = '';
  const result = manualExtract(content);
  assert.deepEqual(
    result.missing.sort(),
    [
      'available_qty',
      'bidder_unit_price',
      'contact_email',
      'contact_phone',
      'currency_code',
      'delivery_time',
      'supplier_name',
    ].sort(),
    'empty content → all fields missing',
  );
  assert.equal(result.fields.supplier_name, '');
  assert.equal(result.fields.bidder_unit_price, 0);
  assert.equal(result.fields.available_qty, 0);
}

{
  const content = 'Just some random text with no fields';
  const result = manualExtract(content);
  assert.equal(result.missing.length, 7, 'no recognizable fields → all 7 missing');
  assert.equal(result.fields.available_qty, 0);
  assert.equal(result.fields.bidder_unit_price, 0);
}

// =============================================
// Full realistic blob
// =============================================
{
  const content = `
    Premium Stainless Steel Fasteners

    Price: $12.50 USD per unit

    In stock: 5000 units

    Contact us:
    Email: fasteners@steelsupply.com
    Phone: +65 6123 4567

    Lead time: 2-3 weeks
  `;
  const result = manualExtract(content);
  assertResult(
    result,
    {
      bidder_unit_price: 12.5,
      currency_code: 'USD',
      available_qty: 5000,
      contact_email: 'fasteners@steelsupply.com',
      delivery_time: '2-3 weeks',
    },
    'realistic full content',
  );
  // supplier_name is always left empty (LLM gap-fill).
  assert.equal(result.fields.supplier_name, '');
  // Phone verification: check if it's in the result (may be "+65 6123 4567" or similar).
  assert.ok(result.fields.contact_phone, 'phone extracted');
  // missing should exclude successfully verified fields.
  assert.ok(!result.missing.includes('bidder_unit_price'), 'price not in missing');
  assert.ok(!result.missing.includes('currency_code'), 'currency not in missing');
}

console.log('✓ testManualExtract passed');
