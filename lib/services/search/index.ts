// =============================================
// SEARCH WEB — tier-walk orchestrator
// =============================================
// Public entrypoint for the RAG pipeline. Walks region-tiered queries from
// strongest (Vietnam-only) to weakest (international), short-circuits as
// soon as a tier returns enough hits, and caches the chosen tier's results.
//
// One searchWeb() call per RFQ item. The supplier-search action wraps these
// in p-limit(8) so we never overwhelm Tavily's free-tier rate limit.

import { tavilySearch, type TavilySnippet } from './tavily-client';
import { buildQueriesForItem, type QueryItem } from './query-builder';
import { getCachedSearch, setCachedSearch } from './cache';

// Threshold: a tier is considered "enough" when it returns at least this many
// snippets. 3 is the doc-spec minimum — fewer than that and we widen the net.
const MIN_RESULTS_PER_TIER = 3;

export interface SearchOutcome {
  query: string;          // the actual query string that produced the snippets
  tier: number;           // 1-indexed tier that succeeded
  cacheHit: boolean;      // whether the chosen query came from Redis
  snippets: TavilySnippet[];
}

/**
 * Run a tiered web search for one RFQ item. Returns the first tier that
 * yields ≥ MIN_RESULTS_PER_TIER snippets, or the last tier's results if all
 * fall short (callers handle empty / sparse results in the LLM prompt).
 *
 * Logging contract: one [search] line per item with tier, latency, hit/miss.
 */
export async function searchWeb(item: QueryItem): Promise<SearchOutcome> {
  const queries = buildQueriesForItem(item);
  const startTime = Date.now();

  // Track the last non-empty result so we have something to return if no tier hits the threshold
  let bestSoFar: SearchOutcome | null = null;

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const tier = i + 1;

    // (1) Cache lookup — keyed by exact query string (sha1 inside cache layer)
    const cached = await getCachedSearch(query);
    if (cached && cached.length > 0) {
      const elapsed = Date.now() - startTime;
      console.log(`[search] item="${item.description.slice(0, 40)}" tier=${tier} cache=HIT results=${cached.length} ${elapsed}ms`);
      // A cache hit at any tier is a strong signal — we still respect the threshold
      if (cached.length >= MIN_RESULTS_PER_TIER) {
        return { query, tier, cacheHit: true, snippets: cached };
      }
      bestSoFar = { query, tier, cacheHit: true, snippets: cached };
      continue;
    }

    // (2) Cache miss → call Tavily. Errors at one tier should NOT abort the
    // whole walk: log + try the next tier so a transient Tavily blip doesn't
    // wipe out the entire RFQ run.
    let snippets: TavilySnippet[] = [];
    try {
      snippets = await tavilySearch(query);
    } catch (err) {
      console.warn(`[search] tier=${tier} tavily error:`, err instanceof Error ? err.message : err);
      continue;
    }

    // (3) Cache the result — even small / empty arrays go in so we don't hammer
    // Tavily for known-bad queries during the same TTL window.
    await setCachedSearch(query, snippets);

    const elapsed = Date.now() - startTime;
    console.log(`[search] item="${item.description.slice(0, 40)}" tier=${tier} cache=MISS results=${snippets.length} ${elapsed}ms`);

    // (4) Threshold check — return immediately on a strong tier
    if (snippets.length >= MIN_RESULTS_PER_TIER) {
      return { query, tier, cacheHit: false, snippets };
    }
    // Otherwise remember it as a fallback before stepping to the next tier
    if (snippets.length > 0) {
      bestSoFar = { query, tier, cacheHit: false, snippets };
    }
  }

  // All tiers exhausted: return whatever we found, or an empty outcome
  return bestSoFar ?? {
    query: queries[queries.length - 1] ?? '',
    tier: queries.length,
    cacheHit: false,
    snippets: [],
  };
}
