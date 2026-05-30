import assert from 'assert';
import { normalizeSupplierExtraction } from '@/lib/ai-agent/schemas/supplier';

// =============================================
// normalizeSupplierExtraction — new dossier fields (selling_unit, pack_size, match_reasoning)
// =============================================
// The HF remote path is schema-less, so these fields can arrive aliased, as free
// text, or missing. Normalization must coerce them to the typed shape.

// --- selling_unit: free text → controlled 'per_unit' | 'per_pack' | '' ---
assert.equal(
  normalizeSupplierExtraction({ selling_unit: 'Sold per pack of 50' }).selling_unit,
  'per_pack',
  'text mentioning pack → per_pack',
);
assert.equal(
  normalizeSupplierExtraction({ selling_unit: 'each' }).selling_unit,
  'per_unit',
  '"each" → per_unit',
);
assert.equal(
  normalizeSupplierExtraction({ packaging: 'sold individually per piece' }).selling_unit,
  'per_unit',
  'alias "packaging" + "piece" → per_unit',
);
assert.equal(
  normalizeSupplierExtraction({ selling_unit: 'unclear' }).selling_unit,
  '',
  'unrecognized selling unit → empty',
);
assert.equal(
  normalizeSupplierExtraction({}).selling_unit,
  '',
  'missing selling_unit → empty',
);

// --- pack_size: numeric, alias-tolerant ---
assert.equal(
  normalizeSupplierExtraction({ pack_size: 50 }).pack_size,
  50,
  'pack_size number passes through',
);
assert.equal(
  normalizeSupplierExtraction({ units_per_pack: '24' }).pack_size,
  24,
  'alias units_per_pack as string → number',
);
assert.equal(
  normalizeSupplierExtraction({}).pack_size,
  0,
  'missing pack_size → 0',
);

// --- match_reasoning: string passthrough, alias-tolerant, default empty ---
assert.equal(
  normalizeSupplierExtraction({ match_reasoning: 'Same 50mm bore, Viton compound' }).match_reasoning,
  'Same 50mm bore, Viton compound',
  'match_reasoning passes through',
);
assert.equal(
  normalizeSupplierExtraction({ reasoning: 'compatible spec' }).match_reasoning,
  'compatible spec',
  'alias "reasoning" → match_reasoning',
);
assert.equal(
  normalizeSupplierExtraction({}).match_reasoning,
  '',
  'missing match_reasoning → empty',
);

// =============================================
// SANITIZER — no-product-page defense (source_url === '')
// =============================================
// When the LLM returns source_url="" (no real product page found) it must NOT
// preserve any extracted company metadata — those are hallucinations from a
// homepage/directory/PDF, not a real product listing.

// Case 1: source_url="" with populated metadata → sanitizer blanks them all
{
  const junk = normalizeSupplierExtraction({
    supplier_name: 'Rotac Vina',
    contact_phone: '+84 222 379 8553',
    bidder_unit_price: 5,
    source_url: '',
    contact_email: 'sales@rotac.vn',
    bidder_description: 'Slip ring for Samsung',
    compliance_deviation: 'Non-compliant material',
    delivery_time: '2-3 weeks',
    selling_unit: 'per_unit',
    pack_size: 0,
    available_qty: 10,
    notes: 'No product page found',
  });
  assert.equal(junk.supplier_name, '', 'empty source_url → supplier_name blanked');
  assert.equal(junk.contact_phone, '', 'empty source_url → contact_phone blanked');
  assert.equal(junk.bidder_unit_price, 0, 'empty source_url → bidder_unit_price zeroed');
  assert.equal(junk.contact_email, '', 'empty source_url → contact_email blanked');
  assert.equal(junk.bidder_description, '', 'empty source_url → bidder_description blanked');
  assert.equal(junk.compliance_deviation, '', 'empty source_url → compliance_deviation blanked');
  assert.equal(junk.delivery_time, '', 'empty source_url → delivery_time blanked');
  assert.equal(junk.selling_unit, '', 'empty source_url → selling_unit blanked');
  assert.equal(junk.pack_size, 0, 'empty source_url → pack_size zeroed');
  assert.equal(junk.available_qty, 0, 'empty source_url → available_qty zeroed');
  // notes is preserved (carries the "No product page found" reason)
  assert.equal(junk.notes, 'No product page found', 'empty source_url → notes preserved');
  // source_url itself remains empty (shape unchanged)
  assert.equal(junk.source_url, '', 'source_url remains empty string');
}

// Case 2: real source_url → sanitizer does NOT fire; all fields preserved
{
  const real = normalizeSupplierExtraction({
    supplier_name: 'ACME',
    source_url: 'https://shop.vn/p/valve',
    bidder_unit_price: 10,
    contact_phone: '+84 900 000 001',
    contact_email: 'info@acme.vn',
    bidder_description: 'Ball valve DN50',
    compliance_deviation: 'Meets all specs',
    delivery_time: '2-4 weeks',
    selling_unit: 'per_unit',
    pack_size: 0,
    available_qty: 50,
    notes: 'In stock',
  });
  assert.equal(real.supplier_name, 'ACME', 'real source_url → supplier_name preserved');
  assert.equal(real.contact_phone, '+84 900 000 001', 'real source_url → contact_phone preserved');
  assert.equal(real.bidder_unit_price, 10, 'real source_url → bidder_unit_price preserved');
  assert.equal(real.source_url, 'https://shop.vn/p/valve', 'real source_url → source_url preserved');
  assert.equal(real.bidder_description, 'Ball valve DN50', 'real source_url → bidder_description preserved');
  assert.equal(real.delivery_time, '2-4 weeks', 'real source_url → delivery_time preserved');
}

console.log('✓ testNormalizeSupplier passed');
