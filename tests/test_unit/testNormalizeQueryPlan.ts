import assert from 'assert';
import { normalizeQueryPlan } from '@/lib/ai-agent/schemas/query-plan';

// =============================================
// normalizeQueryPlan — defensive coercion of raw LLM output → QueryPlan
// =============================================
// The local vLLM path is schema-enforced (guided_json) but the HuggingFace
// remote path is not. normalizeQueryPlan() coerces arbitrary raw JSON into a
// valid { parsed: ParsedSpec; queries: string[] } regardless of the provider.

// --- Plain object: passes through unchanged ---
{
  const plan = normalizeQueryPlan({ parsed: { type: 'gate valve', size: 'DN50' }, queries: ['q1', 'q2'] });
  assert.deepEqual(plan.queries, ['q1', 'q2'], 'queries preserved in order');
  assert.equal(plan.parsed.type, 'gate valve', 'parsed.type passes through');
  assert.equal(plan.parsed.size, 'DN50', 'parsed.size passes through');
}

// --- Wrapper unwrap: { plan: { ... } } ---
{
  const plan = normalizeQueryPlan({ plan: { parsed: {}, queries: ['a', 'b', 'c'] } });
  assert.deepEqual(plan.queries, ['a', 'b', 'c'], 'queries unwrapped from { plan: {...} }');
}

// --- Wrapper unwrap: { result: { ... } } ---
{
  const plan = normalizeQueryPlan({ result: { parsed: { type: 'elbow' }, queries: ['r1'] } });
  assert.deepEqual(plan.queries, ['r1'], 'queries unwrapped from { result: {...} }');
  assert.equal(plan.parsed.type, 'elbow', 'parsed.type unwrapped from { result: {...} }');
}

// --- Wrapper unwrap: single-element array ---
{
  const plan = normalizeQueryPlan([{ parsed: { material: 'carbon steel' }, queries: ['x1', 'x2'] }]);
  assert.deepEqual(plan.queries, ['x1', 'x2'], 'queries unwrapped from single-element array');
  assert.equal(plan.parsed.material, 'carbon steel', 'parsed.material unwrapped from array');
}

// --- Alias key: searchQueries ---
{
  const plan = normalizeQueryPlan({ parsed: {}, searchQueries: ['sq1', 'sq2'] });
  assert.deepEqual(plan.queries, ['sq1', 'sq2'], 'searchQueries alias populates queries');
}

// --- Alias key: query_list ---
{
  const plan = normalizeQueryPlan({ parsed: {}, query_list: ['ql1', 'ql2', 'ql3'] });
  assert.deepEqual(plan.queries, ['ql1', 'ql2', 'ql3'], 'query_list alias populates queries');
}

// --- Coercion: non-string entries coerced to strings ---
{
  const plan = normalizeQueryPlan({ parsed: {}, queries: [42, true, 'real query', null, undefined, '  ', 'another'] });
  // null/undefined/blank coerce to '' or whitespace and are dropped; 42 → '42', true → 'true'
  assert.ok(plan.queries.includes('42'), 'numeric entry coerced to string "42"');
  assert.ok(plan.queries.includes('true'), 'boolean entry coerced to string "true"');
  assert.ok(plan.queries.includes('real query'), '"real query" kept');
  assert.ok(plan.queries.includes('another'), '"another" kept');
  // empty/whitespace entries dropped
  assert.ok(!plan.queries.includes(''), 'empty string dropped');
  assert.ok(!plan.queries.some(q => q.trim() === ''), 'whitespace-only entries dropped');
}

// --- Deduplication: duplicates removed, order preserved ---
{
  const plan = normalizeQueryPlan({ parsed: {}, queries: ['a', 'b', 'a', 'c', 'b'] });
  assert.deepEqual(plan.queries, ['a', 'b', 'c'], 'duplicates removed, original order preserved');
}

// --- Cap at 8: 12 input queries → exactly 8 output ---
{
  const twelve = Array.from({ length: 12 }, (_, i) => `query ${i}`);
  const plan = normalizeQueryPlan({ parsed: {}, queries: twelve });
  assert.equal(plan.queries.length, 8, '12 input queries capped to 8');
  assert.equal(plan.queries[0], 'query 0', 'first query preserved after cap');
  assert.equal(plan.queries[7], 'query 7', 'last query is index 7 after cap');
}

// --- parsed best-effort: canonical keys ---
{
  const plan = normalizeQueryPlan({
    parsed: {
      type: 'butterfly valve',
      size: '2 inch',
      class: 'class 150',
      connection: 'flanged',
      material: 'stainless 316',
      bore: 'full bore',
      standard: 'API 600',
      model: 'Z41H-16C',
      manufacturer: 'Kitz',
    },
    queries: [],
  });
  assert.equal(plan.parsed.type, 'butterfly valve', 'parsed.type');
  assert.equal(plan.parsed.size, '2 inch', 'parsed.size');
  assert.equal(plan.parsed.class, 'class 150', 'parsed.class');
  assert.equal(plan.parsed.connection, 'flanged', 'parsed.connection');
  assert.equal(plan.parsed.material, 'stainless 316', 'parsed.material');
  assert.equal(plan.parsed.bore, 'full bore', 'parsed.bore');
  assert.equal(plan.parsed.standard, 'API 600', 'parsed.standard');
  assert.equal(plan.parsed.model, 'Z41H-16C', 'parsed.model');
  assert.equal(plan.parsed.manufacturer, 'Kitz', 'parsed.manufacturer');
}

// --- parsed alias keys: partNumber → model, brand → manufacturer ---
{
  const plan = normalizeQueryPlan({
    parsed: { partNumber: 'OS&Y', brand: 'Crane' },
    queries: [],
  });
  assert.equal(plan.parsed.model, 'OS&Y', 'partNumber alias maps to model');
  assert.equal(plan.parsed.manufacturer, 'Crane', 'brand alias maps to manufacturer');
}

// --- Garbage / missing inputs: never throw, return safe defaults ---
{
  const empty = { parsed: {}, queries: [] };

  const fromNull = normalizeQueryPlan(null);
  assert.deepEqual(fromNull, empty, 'null → { parsed:{}, queries:[] }');

  const fromUndefined = normalizeQueryPlan(undefined);
  assert.deepEqual(fromUndefined, empty, 'undefined → { parsed:{}, queries:[] }');

  const fromString = normalizeQueryPlan('some string');
  assert.deepEqual(fromString, empty, 'string input → { parsed:{}, queries:[] }');

  const fromNumber = normalizeQueryPlan(123);
  assert.deepEqual(fromNumber, empty, 'number input → { parsed:{}, queries:[] }');
}

console.log('✓ testNormalizeQueryPlan passed');
