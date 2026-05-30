// =============================================
// SEARCH WEB — three-tier semantic cascade
// =============================================
// Public entrypoint for the RAG pipeline. Replaces the old single-query
// full-text Tavily lookup with a deliberate three-tier cascade:
//   Tier 1 — exact-match queries built from extracted anchors (verified ≥ 5)
//   Tier 2 — keyword combination engine                       (verified ≥ 3)
//   Tier 3 — agentic AI loop mining carry-forward snippets/notes
//
// "Verified" means: the URL passes isProductPage (specific page, not a bare
// domain). We threshold on verified URLs, not raw snippet counts, because
// homepage / generic-listing hits are useless to the downstream extractor.
//
// One searchWeb() call per RFQ item. The supplier-search action wraps these
// in p-limit(8) so we never overwhelm Tavily's free-tier rate limit.

import pLimit from 'p-limit';
import { extractAnchors } from './tokenizer';
import { buildTier1Queries, buildTier2Queries, type QueryItem } from './query-builder';
import { runAgenticTier3 } from './tier3-agent';
import { tavilySearch, type TavilySnippet } from './tavily-client';
import { getCachedSearch, setCachedSearch } from './cache';
import { isLikelyProductPage, hasProductSignals } from './html-gate';

// ---------------------------------------------
// Tier thresholds — verified product-page count
// ---------------------------------------------
// Tier 1 demands more verified sources (5) because exact-match queries that
// return < 5 product pages indicate the anchor is too narrow; widening helps.
// Tier 2 is the safety net at 3 — the lowest count we can still extract from.
const TIER1_VERIFIED_THRESHOLD = 5;
const TIER2_VERIFIED_THRESHOLD = 3;

// ---------------------------------------------
// Query concurrency — global Tavily call cap
// ---------------------------------------------
// GLOBAL cap shared across all concurrent RFQ items. The orchestrator already
// wraps items in pLimit(8), so peak in-flight Tavily calls = 8 * 6 worst-case,
// but in practice tiers resolve quickly and the cap prevents burst overruns.
const QUERY_CONCURRENCY = 6;
const queryLimit = pLimit(QUERY_CONCURRENCY);

export interface SearchOutcome {
  /** Tier that produced the final accumulator. 0 = nothing found. */
  tier: 0 | 1 | 2 | 3;
  /** Count of verified (product-page) URLs in `snippets`. */
  verifiedCount: number;
  /** Verified snippets, unique by URL, ordered by first-seen. */
  snippets: TavilySnippet[];
  /** Telemetry: number of live Tavily API calls this search consumed (cache
   *  hits excluded). Aggregated by the orchestrator into search_telemetry. */
  tavilyCalls: number;
}

export type { QueryItem };

// ---------------------------------------------
// URL guard — shared with the orchestrator
// ---------------------------------------------
// Lives here (not in supplier-search-actions) so the search cascade can apply
// the same guard at the tier-verification stage that the orchestrator applies
// to the LLM's chosen source_url. Single definition = no drift.

/**
 * True only when the URL points at a specific page (not a bare domain).
 * Defensive net behind the LLM prompt's "no homepage" rule — the model is
 * good at this but we never fully trust it.
 */
// Document/asset extensions that are never product pages.
const DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.ppt', '.pptx', '.csv', '.zip', '.rar', '.txt',
]);

export function isProductPage(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    // Reject bare domains / homepages — a "/" pathname is never a product page.
    if (u.pathname.length <= 1) return false;

    const path = u.pathname.toLowerCase();

    // Reject document/asset URLs by file extension.
    const lastSegment = path.slice(path.lastIndexOf('/'));
    const dotIdx = lastSegment.lastIndexOf('.');
    if (dotIdx !== -1) {
      const ext = lastSegment.slice(dotIdx);
      if (DOCUMENT_EXTENSIONS.has(ext)) return false;
    }

    // Reject non-product surfaces that DO carry a path but never represent a
    // single sourceable product (search results, taxonomy, editorial, account,
    // checkout, company/corporate info, directory listings, government gazettes).
    // Previously this guard was `pathname.length > 1` alone, which
    // passed every one of these — the root cause of Tier 1's false-positive
    // "verified" count that suppressed the Tier 2/3 fallback.
    //
    // startsWith — segments that always appear at the path root:
    const NON_PRODUCT_PREFIXES = [
      '/search', '/s/', '/category', '/categories', '/collections',
      '/tag', '/tags', '/blog', '/news', '/about', '/about-us', '/contact',
      '/login', '/signin', '/account', '/cart', '/checkout',
      '/company', '/corporate', '/locations', '/gazette',
      '/media', '/press', '/investor', '/careers',
      '/products-search',
    ];
    if (NON_PRODUCT_PREFIXES.some((seg) => path.startsWith(seg))) return false;

    // includes — segments that may appear after a locale prefix (e.g. /en/company/).
    // These are wrapped in slashes to avoid false-positives on legitimate slugs
    // (e.g. "/recruitment" is not caught by "/careers", "/media-valve" is not
    // caught by "/media"). "/products-search" also checked here for mid-path form.
    const NON_PRODUCT_INCLUDES = [
      '/company/', '/corporate/', '/locations/', '/gazette/',
      '/about/', '/about-us/', '/media/', '/press/', '/investor/', '/careers/',
      '/products-search/',
    ];
    if (NON_PRODUCT_INCLUDES.some((sub) => path.includes(sub))) return false;

    // Reject directory-listing shapes that contain these substrings anywhere
    // in the path (e.g. alibaba.com/sk-suppliers.html, /suppliers/valves).
    const NON_PRODUCT_SUBSTRINGS = ['-suppliers', '/suppliers'];
    if (NON_PRODUCT_SUBSTRINGS.some((sub) => path.includes(sub))) return false;

    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------
// Per-query runner — cache lookup + dedup
// ---------------------------------------------

/**
 * Execute one query (cache-first), filter to product pages, and merge into
 * the running accumulator. Never throws — a single bad query must not abort
 * the whole tier walk. The accumulator is keyed by URL so duplicates across
 * queries / tiers are collapsed automatically.
 *
 * Returns 1 if a live Tavily API call was made (cache miss), 0 if served from
 * cache. A call that throws still counts as 1 — we attempted the round-trip.
 */
async function runQueryAndDedup(
  query: string,
  acc: Map<string, TavilySnippet>,
): Promise<number> {
  // (1) Cache lookup — keyed by exact query string (sha1 inside cache layer).
  let snippets = await getCachedSearch(query);

  // (2) Cache miss → call Tavily. We mark isLiveCall=true before the try so
  //     that a thrown error (e.g. 429) still counts as an attempted live call.
  //     Errors are logged + swallowed: the next query in the tier (or the next
  //     tier itself) will pick up the slack.
  let isLiveCall = false;
  if (!snippets) {
    isLiveCall = true; // mark before try — a 429/network error still counts
    try {
      snippets = await tavilySearch(query);
    } catch (err) {
      console.warn(
        `[search] tavily error for "${query.slice(0, 60)}":`,
        err instanceof Error ? err.message : err,
      );
      return 1; // live call was attempted even though it threw
    }
    // Cache even empty arrays — saves Tavily quota on known-bad queries.
    await setCachedSearch(query, snippets);
  }

  // (3) Merge into accumulator. Verification runs BEFORE the caller counts the
  //     accumulator against a tier threshold, so acc.size only ever reflects
  //     genuinely-verified product pages — that is what drives the < 5 / < 3
  //     fallback decisions in searchWeb().
  for (const snippet of snippets) {
    // (a) URL structural guard — specific page, not homepage / search / taxonomy.
    if (!isProductPage(snippet.url)) continue;
    // (b) Content verification gate — a candidate is only counted as verified
    //     when its content shows product signals. Two branches:
    //
    //   • Raw HTML (Tavily returned markup): require schema.org/OG/itemprop
    //     signals via isLikelyProductPage. This branch was always correct but
    //     fires rarely because Tavily strips tags before returning.
    //
    //   • Cleaned text (no '<' characters, the typical Tavily response): require
    //     at least one plain-text product signal (currency near a number, or a
    //     procurement keyword) via hasProductSignals. This replaces the old
    //     "URL guard alone" posture that allowed trade yearbooks, company pages,
    //     and government gazettes to pass because they have plausible paths but
    //     carry no commerce content.
    const rawContent = snippet.content || '';
    if (rawContent.includes('<')) {
      if (!isLikelyProductPage(rawContent)) continue;
    } else {
      const snippetText = (snippet.snippet || '') + ' ' + rawContent;
      if (!hasProductSignals(snippetText)) continue;
    }
    // (c) Dedup by URL.
    if (acc.has(snippet.url)) continue;
    acc.set(snippet.url, snippet);
  }

  // Return 1 if a live Tavily call was made (cache miss), 0 for a cache hit.
  return isLiveCall ? 1 : 0;
}

// ---------------------------------------------
// Public API — three-tier cascade
// ---------------------------------------------

/**
 * Run a tier-cascaded web search for one RFQ item.
 *
 * Flow:
 *   1. Extract anchors from `item.description` (part numbers, certs, etc).
 *   2. Tier 1 queries until verified-URL count ≥ 5 (early-exit on threshold).
 *   3. Tier 2 queries until combined verified ≥ 3.
 *   4. Tier 3 agentic loop fills the rest (uses Tier 1/2 carry as substrate).
 *
 * Returns whatever was accumulated — empty `snippets` is a legitimate "no
 * matches found" signal the orchestrator handles by skipping the item.
 *
 * Logging contract: one [search] line per terminal tier with the tier index,
 * verified count, and total latency.
 */
export async function searchWeb(item: QueryItem): Promise<SearchOutcome> {
  const startTime = Date.now();

  // (1) Tokenize once — anchors feed BOTH Tier 1 and Tier 2 query builders.
  const anchors = extractAnchors(item.description);

  // (2) Single shared accumulator across all tiers — carries verified hits
  //     forward so a sparse Tier 1 still contributes to the Tier 2 threshold.
  //     Node is single-threaded; Map mutations inside Promise.all are safe
  //     because all synchronous operations between awaits are atomic.
  const acc = new Map<string, TavilySnippet>();

  // Running count of live Tavily API calls (cache misses only).
  let tavilyCalls = 0;

  // ----- Tier 1 — exact match (parallel wave) -----
  // Fire ALL tier-1 queries concurrently through queryLimit, then check the
  // threshold once after the wave settles. This replaces the old sequential
  // for-of-await which serialized ~5 Tavily round-trips unnecessarily.
  const tier1Queries = buildTier1Queries(item, anchors);
  const tier1Results = await Promise.all(
    tier1Queries.map((query) => queryLimit(() => runQueryAndDedup(query, acc))),
  );
  // Accumulate live-call count from the tier-1 wave.
  tavilyCalls += tier1Results.reduce((sum, n) => sum + n, 0);

  if (acc.size >= TIER1_VERIFIED_THRESHOLD) {
    console.log(
      `[search] item="${item.description.slice(0, 40)}" tier=1 verified=${acc.size} ${Date.now() - startTime}ms`,
    );
    return { tier: 1, verifiedCount: acc.size, snippets: Array.from(acc.values()), tavilyCalls };
  }

  // ----- Tier 2 — keyword combinations (parallel wave) -----
  // Same wave pattern: fire all queries, await, then check threshold once.
  // Early-exit above ensures we only reach here when Tier 1 fell short.
  const tier2Queries = buildTier2Queries(item, anchors);
  const tier2Results = await Promise.all(
    tier2Queries.map((query) => queryLimit(() => runQueryAndDedup(query, acc))),
  );
  // Accumulate live-call count from the tier-2 wave.
  tavilyCalls += tier2Results.reduce((sum, n) => sum + n, 0);

  if (acc.size >= TIER2_VERIFIED_THRESHOLD) {
    console.log(
      `[search] item="${item.description.slice(0, 40)}" tier=2 verified=${acc.size} ${Date.now() - startTime}ms`,
    );
    return { tier: 2, verifiedCount: acc.size, snippets: Array.from(acc.values()), tavilyCalls };
  }

  // ----- Tier 3 — agentic mining fallback -----
  // Carry the accumulated snippets in as substrate. carryNotes is empty here
  // because the orchestrator owns notes — Tier 3 will be re-invoked from the
  // orchestrator with richer carry if/when an alt-URL re-loop fires.
  // NOTE: tier-3 internal Tavily calls are not counted in tavilyCalls (separate module)
  const tier3 = await runAgenticTier3({
    description: item.description,
    qty: item.qty,
    uom: item.uom,
    carrySnippets: Array.from(acc.values()),
    carryNotes: [],
    isProductPage,
  });
  for (const snippet of tier3.snippets) {
    if (acc.has(snippet.url)) continue;
    acc.set(snippet.url, snippet);
  }

  const finalSnippets = Array.from(acc.values());
  const terminalTier: 0 | 3 = finalSnippets.length > 0 ? 3 : 0;
  console.log(
    `[search] item="${item.description.slice(0, 40)}" tier=${terminalTier} verified=${acc.size} t3iters=${tier3.iterations} ${Date.now() - startTime}ms`,
  );

  return { tier: terminalTier, verifiedCount: acc.size, snippets: finalSnippets, tavilyCalls };
}
