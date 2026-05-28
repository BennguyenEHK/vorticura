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

import { extractAnchors } from './tokenizer';
import { buildTier1Queries, buildTier2Queries, type QueryItem } from './query-builder';
import { runAgenticTier3 } from './tier3-agent';
import { tavilySearch, type TavilySnippet } from './tavily-client';
import { getCachedSearch, setCachedSearch } from './cache';

// ---------------------------------------------
// Tier thresholds — verified product-page count
// ---------------------------------------------
// Tier 1 demands more verified sources (5) because exact-match queries that
// return < 5 product pages indicate the anchor is too narrow; widening helps.
// Tier 2 is the safety net at 3 — the lowest count we can still extract from.
const TIER1_VERIFIED_THRESHOLD = 5;
const TIER2_VERIFIED_THRESHOLD = 3;

export interface SearchOutcome {
  /** Tier that produced the final accumulator. 0 = nothing found. */
  tier: 0 | 1 | 2 | 3;
  /** Count of verified (product-page) URLs in `snippets`. */
  verifiedCount: number;
  /** Verified snippets, unique by URL, ordered by first-seen. */
  snippets: TavilySnippet[];
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
export function isProductPage(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.pathname.length > 1;
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
 */
async function runQueryAndDedup(
  query: string,
  acc: Map<string, TavilySnippet>,
): Promise<void> {
  // (1) Cache lookup — keyed by exact query string (sha1 inside cache layer).
  let snippets = await getCachedSearch(query);

  // (2) Cache miss → call Tavily. Errors are logged + swallowed: the next
  //     query in the tier (or the next tier itself) will pick up the slack.
  if (!snippets) {
    try {
      snippets = await tavilySearch(query);
    } catch (err) {
      console.warn(
        `[search] tavily error for "${query.slice(0, 60)}":`,
        err instanceof Error ? err.message : err,
      );
      return;
    }
    // Cache even empty arrays — saves Tavily quota on known-bad queries.
    await setCachedSearch(query, snippets);
  }

  // (3) Merge into accumulator, applying the product-page guard and URL dedup.
  for (const snippet of snippets) {
    if (!isProductPage(snippet.url)) continue;
    if (acc.has(snippet.url)) continue;
    acc.set(snippet.url, snippet);
  }
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
  const acc = new Map<string, TavilySnippet>();

  // ----- Tier 1 — exact match -----
  const tier1Queries = buildTier1Queries(item, anchors);
  for (const query of tier1Queries) {
    await runQueryAndDedup(query, acc);
    if (acc.size >= TIER1_VERIFIED_THRESHOLD) {
      console.log(
        `[search] item="${item.description.slice(0, 40)}" tier=1 verified=${acc.size} ${Date.now() - startTime}ms`,
      );
      return { tier: 1, verifiedCount: acc.size, snippets: Array.from(acc.values()) };
    }
  }

  // ----- Tier 2 — keyword combinations -----
  const tier2Queries = buildTier2Queries(item, anchors);
  for (const query of tier2Queries) {
    await runQueryAndDedup(query, acc);
    if (acc.size >= TIER2_VERIFIED_THRESHOLD) {
      console.log(
        `[search] item="${item.description.slice(0, 40)}" tier=2 verified=${acc.size} ${Date.now() - startTime}ms`,
      );
      return { tier: 2, verifiedCount: acc.size, snippets: Array.from(acc.values()) };
    }
  }

  // ----- Tier 3 — agentic mining fallback -----
  // Carry the accumulated snippets in as substrate. carryNotes is empty here
  // because the orchestrator owns notes — Tier 3 will be re-invoked from the
  // orchestrator with richer carry if/when an alt-URL re-loop fires.
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

  return { tier: terminalTier, verifiedCount: acc.size, snippets: finalSnippets };
}
