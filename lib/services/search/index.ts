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
import { isLikelyProductPage, hasProductSignals } from './html-gate';

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
// URL guard — shared with the orchestrator
// ---------------------------------------------
// Lives here so the search layer and orchestrator apply the same guard when
// evaluating source_url. Single definition = no drift.

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
// Public API — single-query search
// ---------------------------------------------

/**
 * Execute one search query (cache-first), filter results to verified product
 * pages, and return deduplicated snippets.
 *
 * Cache hit  → tavilyCalls = 0.
 * Cache miss → tavilyCalls = 1 (even if the Tavily call throws).
 *
 * Never throws — a Tavily error returns an empty snippets array so the caller
 * can decide how to handle missing results.
 */
export async function searchOneQuery(query: string): Promise<SearchResult> {
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

  // (2) Relevance gate + dedup.
  // acc is keyed by URL so duplicates are collapsed automatically.
  const acc = new Map<string, TavilySnippet>();

  for (const snippet of snippets) {
    // (a) URL structural guard — specific page, not homepage / search / taxonomy.
    if (!isProductPage(snippet.url)) continue;

    // (b) Content verification gate — a candidate is only counted as verified
    //     when its content shows product signals. Two branches:
    //
    //   • Raw HTML (Tavily returned markup): require schema.org/OG/itemprop
    //     signals via isLikelyProductPage.
    //
    //   • Cleaned text (no '<' characters, the typical Tavily response): require
    //     at least one plain-text product signal (currency near a number, or a
    //     procurement keyword) via hasProductSignals.
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

  return { snippets: Array.from(acc.values()), tavilyCalls };
}
