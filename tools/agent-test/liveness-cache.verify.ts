/**
 * TDD-lite verification for checkLivenessCached + clearLivenessCache.
 *
 * Run with:  npx tsx tools/agent-test/liveness-cache.verify.ts
 *
 * Tests cache keying and mechanics by monkey-patching global fetch with a
 * counter-stub. No jest/vitest required. Non-zero exit on any failure.
 *
 * Cases:
 *   1. Same exact URL → only ONE underlying fetch.
 *   2. /product-a vs /product-b → TWO fetches, independent results.
 *   3. URLs differing only by #fragment → ONE fetch (same key).
 *   4. URLs differing by query string → TWO fetches (different keys).
 *   5. clearLivenessCache() forces a refetch.
 */

import { checkLivenessCached, clearLivenessCache, LivenessResult } from '../../lib/services/search/liveness.js';

// ---------------------------------------------------------------------------
// Fetch stub helpers
// ---------------------------------------------------------------------------

let fetchCallCount = 0;
/** Track which URL was fetched and how many times. */
const fetchUrlCounts = new Map<string, number>();

function makeStubFetch(resultsByUrl?: Map<string, Partial<LivenessResult>>) {
  fetchCallCount = 0;
  fetchUrlCounts.clear();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

    fetchCallCount++;
    fetchUrlCounts.set(url, (fetchUrlCounts.get(url) ?? 0) + 1);

    // Look up a custom partial result override.
    const override = resultsByUrl?.get(url);
    const status = override?.httpStatus ?? 200;
    const body = override?.html ?? '<html><body>stub</body></html>';

    const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
    return new Response(body, { status, headers });
  };
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS  ${message}`);
  } else {
    console.error(`  FAIL  ${message}`);
    failures++;
  }
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

async function test1_sameUrlOneFetch(): Promise<void> {
  console.log('\nTest 1: Same exact URL → only ONE underlying fetch');
  clearLivenessCache();
  makeStubFetch();

  await checkLivenessCached('https://example.com/product-a');
  await checkLivenessCached('https://example.com/product-a');

  assert(fetchCallCount === 1, `fetchCallCount should be 1, got ${fetchCallCount}`);
}

async function test2_differentPathsTwoFetches(): Promise<void> {
  console.log('\nTest 2: /product-a vs /product-b → TWO fetches, independent results');
  clearLivenessCache();

  // Give different bodies so we can confirm independent results.
  const overrides = new Map<string, Partial<LivenessResult>>([
    ['https://example.com/product-a', { httpStatus: 200, html: '<html>Product A</html>' }],
    ['https://example.com/product-b', { httpStatus: 200, html: '<html>Product B</html>' }],
  ]);
  makeStubFetch(overrides);

  const resultA = await checkLivenessCached('https://example.com/product-a');
  const resultB = await checkLivenessCached('https://example.com/product-b');

  assert(fetchCallCount === 2, `fetchCallCount should be 2, got ${fetchCallCount}`);
  assert(resultA.html?.includes('Product A') ?? false, 'result-a should contain "Product A"');
  assert(resultB.html?.includes('Product B') ?? false, 'result-b should contain "Product B"');
  assert(resultA.html !== resultB.html, 'product-a and product-b results must be independent');
}

async function test3_fragmentSharedOneFetch(): Promise<void> {
  console.log('\nTest 3: URLs differing only by #fragment → ONE fetch (same key)');
  clearLivenessCache();
  makeStubFetch();

  await checkLivenessCached('https://example.com/page');
  await checkLivenessCached('https://example.com/page#section');
  await checkLivenessCached('https://example.com/page#another');

  assert(fetchCallCount === 1, `fetchCallCount should be 1 (fragment stripped), got ${fetchCallCount}`);
}

async function test4_queryStringTwoFetches(): Promise<void> {
  console.log('\nTest 4: URLs differing by query string → TWO fetches (different keys)');
  clearLivenessCache();
  makeStubFetch();

  await checkLivenessCached('https://example.com/p?pn=HMPF150CFAM');
  await checkLivenessCached('https://example.com/p?pn=HMPF200CFAM');

  assert(fetchCallCount === 2, `fetchCallCount should be 2 (different query strings), got ${fetchCallCount}`);
}

async function test5_clearCacheForcesRefetch(): Promise<void> {
  console.log('\nTest 5: clearLivenessCache() forces a refetch');
  clearLivenessCache();
  makeStubFetch();

  await checkLivenessCached('https://example.com/product-a');
  assert(fetchCallCount === 1, `before clear: fetchCallCount should be 1, got ${fetchCallCount}`);

  clearLivenessCache();
  await checkLivenessCached('https://example.com/product-a');
  assert(fetchCallCount === 2, `after clear: fetchCallCount should be 2, got ${fetchCallCount}`);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== liveness-cache.verify.ts ===');

  await test1_sameUrlOneFetch();
  await test2_differentPathsTwoFetches();
  await test3_fragmentSharedOneFetch();
  await test4_queryStringTwoFetches();
  await test5_clearCacheForcesRefetch();

  console.log(`\n${'─'.repeat(40)}`);
  if (failures === 0) {
    console.log('ALL TESTS PASSED');
  } else {
    console.error(`${failures} TEST(S) FAILED`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
