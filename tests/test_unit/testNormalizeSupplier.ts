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

console.log('✓ testNormalizeSupplier passed');
