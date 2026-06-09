import assert from 'assert';
import { buildTelemetryRecord, emitQuery } from '@/lib/services/search/telemetry';

// =============================================
// Unit tests: lib/services/search/telemetry.ts
// =============================================

// --- 1. buildTelemetryRecord sets stage and a non-empty ISO ts string ---
{
  const rec = buildTelemetryRecord('query', { query: 'hex bolt M8' });
  assert.equal(rec.stage, 'query', 'stage must equal the argument');
  assert.ok(typeof rec.ts === 'string' && rec.ts.length > 0, 'ts must be a non-empty string');
  // Rough ISO check: contains a 'T' separator
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(rec.ts), 'ts must start with ISO date');
}

// --- 2. Caller payload fields are present on the record ---
{
  const rec = buildTelemetryRecord('serper', { count: 3, hosts: ['grainger.com'] });
  assert.equal(rec.count, 3, 'payload field "count" must appear on the record');
  assert.deepEqual(rec.hosts, ['grainger.com'], 'payload field "hosts" must appear on the record');
}

// --- 3. A 400-char string value is clamped to 301 chars (300 + ellipsis char) ---
{
  const longStr = 'a'.repeat(400);
  const rec = buildTelemetryRecord('extract', { raw: longStr });
  const clamped = rec.raw as string;
  assert.equal(clamped.length, 301, `expected 301 chars (300 + ellipsis), got ${clamped.length}`);
  assert.ok(clamped.endsWith('…'), 'clamped string must end with the ellipsis character');
  assert.equal(clamped.slice(0, 300), 'a'.repeat(300), 'first 300 chars must be the original content');
}

// --- 4. An array of 10 elements is clamped to 9 entries (8 originals + marker) ---
{
  const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const rec = buildTelemetryRecord('serper', { hosts: arr });
  const clamped = rec.hosts as unknown[];
  assert.equal(clamped.length, 9, `expected 9 entries (8 + marker), got ${clamped.length}`);
  assert.deepEqual(clamped.slice(0, 8), [10, 20, 30, 40, 50, 60, 70, 80], 'first 8 elements must be originals');
  assert.equal(clamped[8], '…(+2 more)', `marker must be '…(+2 more)', got '${clamped[8]}'`);
}

// --- 5a. An emit helper with SEARCH_TELEMETRY='off' produces NO console output ---
{
  process.env.SEARCH_TELEMETRY = 'off';
  const calls: unknown[][] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { calls.push(args); };
  try {
    emitQuery(1, 1, 'hex bolt M8 price');
  } finally {
    console.log = origLog;
    delete process.env.SEARCH_TELEMETRY;
  }
  assert.equal(calls.length, 0, 'SEARCH_TELEMETRY=off must produce no console.log calls');
}

// --- 5b. An emit helper with env unset emits exactly one '[search-telemetry] ' line ---
{
  delete process.env.SEARCH_TELEMETRY;
  const calls: unknown[][] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { calls.push(args); };
  try {
    emitQuery(1, 2, 'swing check valve buy');
  } finally {
    console.log = origLog;
  }
  assert.equal(calls.length, 1, 'should emit exactly one console.log call when SEARCH_TELEMETRY is unset');
  const line = calls[0][0] as string;
  assert.ok(line.startsWith('[search-telemetry] '), `line must start with '[search-telemetry] ', got: ${line}`);
}

console.log('✓ testSearchTelemetry passed');
