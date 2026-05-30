import assert from 'assert';
import { buildTelemetryRecord, logSearchStage } from '@/lib/services/search/telemetry';

// =============================================
// Unit tests: lib/services/search/telemetry.ts
// =============================================

// --- 1. buildTelemetryRecord sets stage and a non-empty ISO ts string ---
{
  const rec = buildTelemetryRecord('query-gen', { query: 'hex bolt M8' });
  assert.equal(rec.stage, 'query-gen', 'stage must equal the argument');
  assert.ok(typeof rec.ts === 'string' && rec.ts.length > 0, 'ts must be a non-empty string');
  // Rough ISO check: contains a 'T' separator and ends with 'Z'
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(rec.ts), 'ts must start with ISO date');
}

// --- 2. Caller payload fields are present on the record ---
{
  const rec = buildTelemetryRecord('raw-search', { hits: 3, engine: 'tavily' });
  assert.equal(rec.hits, 3, 'payload field "hits" must appear on the record');
  assert.equal(rec.engine, 'tavily', 'payload field "engine" must appear on the record');
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

// --- 4. An array of 8 elements is clamped to 6 entries (5 originals + marker) ---
{
  const arr = [10, 20, 30, 40, 50, 60, 70, 80];
  const rec = buildTelemetryRecord('persist', { items: arr });
  const clamped = rec.items as unknown[];
  assert.equal(clamped.length, 6, `expected 6 entries (5 + marker), got ${clamped.length}`);
  assert.deepEqual(clamped.slice(0, 5), [10, 20, 30, 40, 50], 'first 5 elements must be originals');
  assert.equal(clamped[5], '…(+3 more)', `marker must be '…(+3 more)', got '${clamped[5]}'`);
}

// --- 5a. logSearchStage with SEARCH_TELEMETRY='off' produces NO console output ---
{
  process.env.SEARCH_TELEMETRY = 'off';
  const calls: unknown[][] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { calls.push(args); };
  try {
    logSearchStage('density-check', { density: 0.4 });
  } finally {
    console.log = origLog;
    delete process.env.SEARCH_TELEMETRY;
  }
  assert.equal(calls.length, 0, 'SEARCH_TELEMETRY=off must produce no console.log calls');
}

// --- 5b. logSearchStage with env unset emits exactly one line starting with '[search-telemetry] ' ---
{
  delete process.env.SEARCH_TELEMETRY;
  const calls: unknown[][] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { calls.push(args); };
  try {
    logSearchStage('run-summary', { itemCount: 2 });
  } finally {
    console.log = origLog;
  }
  assert.equal(calls.length, 1, 'should emit exactly one console.log call when SEARCH_TELEMETRY is unset');
  const line = calls[0][0] as string;
  assert.ok(line.startsWith('[search-telemetry] '), `line must start with '[search-telemetry] ', got: ${line}`);
}

// --- 5c. logSearchStage with SEARCH_TELEMETRY set to any non-off value also emits ---
{
  process.env.SEARCH_TELEMETRY = 'verbose';
  const calls: unknown[][] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { calls.push(args); };
  try {
    logSearchStage('run-summary', { itemCount: 5 });
  } finally {
    console.log = origLog;
    delete process.env.SEARCH_TELEMETRY;
  }
  assert.equal(calls.length, 1, 'should emit when SEARCH_TELEMETRY is set to a non-off value');
}

console.log('✓ testSearchTelemetry passed');
