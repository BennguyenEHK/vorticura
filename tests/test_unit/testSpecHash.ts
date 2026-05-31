import assert from 'assert';
import { specHash, normalizeSpec } from '@/lib/services/search/spec-hash';

// =============================================
// Spec hash — deterministic L0 key for the supplier-memory cache
// =============================================
// The hash MUST collapse formatting variants (case / punctuation / whitespace)
// of the SAME physical part onto one key, be independent of object key order,
// and return '' for an under-specified spec (caller skips the memory layer).

// --- Formatting variants of the same part collapse ---
assert.equal(
  specHash({ model: 'Z41H-16C' }),
  specHash({ model: 'z41h 16c' }),
  'case + hyphen vs space variants hash equal',
);
assert.equal(
  specHash({ model: 'Z41H.16C' }),
  specHash({ model: 'z41h16c' }),
  'dots collapse too',
);

// --- Object key order does not affect the hash ---
assert.equal(
  specHash({ manufacturer: 'Kitz', type: 'gate valve' }),
  specHash({ type: 'gate valve', manufacturer: 'Kitz' }),
  'key order is canonicalized away',
);

// --- Distinct specs hash differently ---
assert.notEqual(
  specHash({ model: 'abc123' }),
  specHash({ model: 'xyz789' }),
  'different specs produce different hashes',
);

// --- Under-specified specs return '' (caller must skip memory) ---
assert.equal(specHash({}), '', 'empty spec → empty hash');
assert.equal(specHash({ model: '   ' }), '', 'whitespace-only fields are dropped → empty hash');

// --- normalizeSpec drops empties and lowercases/strips ---
assert.deepEqual(
  normalizeSpec({ model: 'Z41H-16C', size: '', manufacturer: 'Kitz' }),
  { manufacturer: 'kitz', model: 'z41h16c' },
  'normalizeSpec strips punctuation, lowercases, drops empty fields',
);

// --- Determinism: same input always yields the same hash ---
assert.equal(
  specHash({ size: '2 inch', class: '150' }),
  specHash({ size: '2inch', class: '150' }),
  'stable + deterministic across formatting',
);

console.log('✓ testSpecHash passed');
