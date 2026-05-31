// =============================================
// SEARCH WEB — single-query search with cache + relevance gate
// =============================================
// Public entrypoint for the RAG pipeline. Executes one Tavily query,
// applies a cache-first strategy, filters results through the product-page
// relevance gate, and deduplicates by URL.
//
// One searchOneQuery() call per composed query string. The supplier-search
// action is responsible for query construction and concurrency management.

import pLimit from 'p-limit';
import { tavilySearch, type TavilySnippet } from './tavily-client';
import { getCachedSearch, setCachedSearch } from './cache';
import { scoreProductPage, type ScorerSpec } from './product-page-scorer';

// Re-export ScorerSpec so the orchestrator can import it alongside searchOneQuery.
export type { ScorerSpec };

// ---------------------------------------------
// Global Tavily concurrency cap
// ---------------------------------------------
// The orchestrator runs items through pLimit(RAG_CONCURRENCY); within an item
// the density loop walks queries sequentially. This module-level limiter is the
// ABSOLUTE ceiling on simultaneous live Tavily calls across ALL items, so a
// burst of concurrent items can't overrun Tavily's (free-tier) rate limit.
// Cache hits bypass the limiter — only live round-trips are gated.
const SEARCH_QUERY_CONCURRENCY = Number(process.env.SEARCH_QUERY_CONCURRENCY ?? 6);
const tavilyLimit = pLimit(SEARCH_QUERY_CONCURRENCY);

// Re-export TavilySnippet for consumers that import it from this module.
export type { TavilySnippet };

// ---------------------------------------------
// QueryItem — local type (formerly re-exported from query-builder)
// ---------------------------------------------

/** One item from an RFQ line, used to drive query construction upstream. */
export interface QueryItem {
  description: string;
  qty?: number;
  uom?: string;
}

// ---------------------------------------------
// SearchResult — return type for searchOneQuery
// ---------------------------------------------

export interface SearchResult {
  /** Verified, deduplicated product-page snippets. */
  snippets: TavilySnippet[];
  /** Number of live Tavily API calls made (0 = cache hit, 1 = cache miss). */
  tavilyCalls: number;
}

// ---------------------------------------------
// Persist-gate URL guard — shared with the orchestrator
// ---------------------------------------------
// Candidate filtering at SEARCH time is now done by the weighted scorer
// (product-page-scorer.ts), which keeps ugly-slug product pages, PDFs and
// distributor listings that the old binary reject-list wrongly dropped.
//
// This function survives only as the lightweight PERSIST-time guard: after the
// LLM has extracted a row, it defends against a hallucinated source_url (empty
// string or a bare homepage). It deliberately stays loose — anything that
// already passed the scorer should pass here too.

// Editorial / account / transactional surfaces that are never a product source,
// even if the LLM emits them. Kept intentionally small (scorer is the real gate).
const HARD_JUNK_PREFIXES = [
  '/search', '/blog', '/news', '/about', '/about-us', '/contact',
  '/login', '/signin', '/account', '/cart', '/checkout',
  '/company', '/corporate', '/careers', '/press', '/investor', '/gazette',
];
const HARD_JUNK_INCLUDES = [
  '/company/', '/corporate/', '/about/', '/about-us/',
  '/careers/', '/press/', '/investor/', '/gazette/', '/locations/',
];

/**
 * True when the URL is structurally usable as a persisted product source:
 * a non-empty, parseable URL with a real path that isn't a bare homepage or an
 * obvious editorial/account surface. PDFs, distributor listings and ugly-slug
 * product pages (e.g. /kf941.html, /pid=12984) all pass — the scorer already
 * vetted relevance upstream.
 */
export function isProductPage(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    // Reject bare domains / homepages — a "/" pathname is never a product page.
    if (u.pathname.length <= 1) return false;

    const path = u.pathname.toLowerCase();
    if (HARD_JUNK_PREFIXES.some((seg) => path.startsWith(seg))) return false;
    if (HARD_JUNK_INCLUDES.some((sub) => path.includes(sub))) return false;

    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------
// Public API — single-query search
// ---------------------------------------------

/**
 * Execute one search query (cache-first), score each result with the weighted
 * product-page classifier, drop everything below KEEP_THRESHOLD, dedup by URL,
 * and return the survivors ranked best-first.
 *
 * @param query  Composed search string (LLM-planned upstream).
 * @param spec   Parsed RFQ specification (model/size/class/…) used by the scorer
 *               for exact-model + spec-density signals. Optional — an empty spec
 *               still scores via URL/keyword/schema signals.
 *
 * Cache hit  → tavilyCalls = 0.
 * Cache miss → tavilyCalls = 1 (even if the Tavily call throws).
 *
 * Never throws — a Tavily error returns an empty snippets array so the caller
 * can decide how to handle missing results.
 */
export async function searchOneQuery(query: string, spec: ScorerSpec = {}): Promise<SearchResult> {
  // (1) Cache-first lookup.
  let snippets = await getCachedSearch(query);
  let tavilyCalls = 0;

  if (!snippets) {
    // Cache miss — attempt a live Tavily call.
    tavilyCalls = 1;
    try {
      snippets = await tavilyLimit(() => tavilySearch(query));
    } catch (err) {
      console.warn(
        `[search] tavily error for "${query.slice(0, 60)}":`,
        err instanceof Error ? err.message : err,
      );
      return { snippets: [], tavilyCalls: 1 };
    }
    // Cache even empty arrays — saves Tavily quota on known-bad queries.
    await setCachedSearch(query, snippets);
  }

  // (2) Weighted relevance scoring + dedup.
  // Each candidate is scored across URL pattern / content keywords / exact-model
  // / spec density / schema.org / trusted-domain signals; only those at or above
  // KEEP_THRESHOLD survive. acc is keyed by URL so duplicates collapse, keeping
  // the highest-scoring occurrence.
  const acc = new Map<string, { snippet: TavilySnippet; score: number }>();

  for (const snippet of snippets) {
    if (!snippet.url) continue;

    const { score, kept } = scoreProductPage(snippet, spec);
    if (!kept) continue;

    const existing = acc.get(snippet.url);
    if (!existing || score > existing.score) {
      acc.set(snippet.url, { snippet, score });
    }
  }

  // (3) Rank best-first so the strongest product pages lead — this front-loads
  //     the LLM extractor's context and the density loop's TARGET_SOURCES cap.
  const ranked = Array.from(acc.values())
    .sort((a, b) => b.score - a.score)
    .map((e) => e.snippet);

  return { snippets: ranked, tavilyCalls };
}
