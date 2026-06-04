// Search web — single-query search with cache + relevance gate.
// One searchOneQuery() call per composed query string.

import pLimit from 'p-limit';
import { tavilySearch, type TavilySnippet } from './tavily-client';
import { getCachedSearch, setCachedSearch } from './cache';
import {
  scoreProductPage,
  classifyPage,
  type ScorerSpec,
  type DetectedFieldMap,
  type PageType,
} from './product-page-scorer';
import { eliminatePage } from './eliminate';

// Re-export ScorerSpec so orchestrator can import alongside searchOneQuery.
export type { ScorerSpec, DetectedFieldMap, PageType };

// --- Global Tavily concurrency cap ---
// Module-level limiter: absolute ceiling on simultaneous live Tavily calls.
// Cache hits bypass the limiter — only live round-trips are gated.
const SEARCH_QUERY_CONCURRENCY = Number(process.env.SEARCH_QUERY_CONCURRENCY ?? 6);
const tavilyLimit = pLimit(SEARCH_QUERY_CONCURRENCY);

// Re-export TavilySnippet for consumers that import from this module.
export type { TavilySnippet };

// --- QueryItem ---

/** One RFQ line item, used to drive query construction upstream. */
export interface QueryItem {
  description: string;
  qty?: number;
  uom?: string;
}

// --- SearchResult ---

/**
 * One survivor candidate: snippet plus per-page signals for the extractor —
 * relevance score, detected-field map, and page classification.
 */
export interface ScoredCandidate {
  snippet: TavilySnippet;
  score: number;
  detected: DetectedFieldMap;
  pageType: PageType;
}

export interface SearchResult {
  /** Verified, deduplicated product-page snippets (ranked best-first). */
  snippets: TavilySnippet[];
  /** Survivors enriched with detected-map + pageType. */
  candidates: ScoredCandidate[];
  /** Live Tavily API calls made (0 = cache hit, 1 = cache miss). */
  tavilyCalls: number;
}

// --- Persist-gate URL guard ---
// Lightweight guard applied AFTER LLM extraction to reject hallucinated URLs.
// Stays deliberately loose — anything passing the scorer should pass here.

// Surfaces never a valid product source — kept intentionally small.
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
 * True when URL is usable as a persisted product source:
 * non-empty, parseable, real path, not a homepage or editorial surface.
 * PDFs, distributor listings, ugly-slug pages all pass.
 */
export function isProductPage(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    // Reject bare domains — "/" pathname is never a product page.
    if (u.pathname.length <= 1) return false;

    const path = u.pathname.toLowerCase();
    if (HARD_JUNK_PREFIXES.some((seg) => path.startsWith(seg))) return false;
    if (HARD_JUNK_INCLUDES.some((sub) => path.includes(sub))) return false;

    return true;
  } catch {
    return false;
  }
}

// --- Public API: single-query search ---

/**
 * Execute one search query (cache-first), score results, drop below threshold,
 * dedup by URL, and return survivors ranked best-first.
 *
 * @param query        Composed search string (LLM-planned upstream).
 * @param spec         Parsed RFQ spec for exact-model + spec-density signals.
 * @param requiredQty  RFQ item quantity — used to eliminate under-stocked pages.
 *
 * Pipeline per candidate: classify (2a) → eliminate (2b) → score (2c).
 * Cache hit → tavilyCalls = 0. Cache miss → tavilyCalls = 1.
 * Never throws — Tavily error returns empty result.
 */
export async function searchOneQuery(
  query: string,
  spec: ScorerSpec = {},
  requiredQty: number = 0,
  // rawCandidates: bypass product-page gate; return all deduped snippets ranked.
  // Used by contact-recovery loopback (needs supplier contact pages).
  opts: { rawCandidates?: boolean } = {},
): Promise<SearchResult> {
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
      return { snippets: [], candidates: [], tavilyCalls: 1 };
    }
    // Cache empty arrays too — saves quota on known-bad queries.
    await setCachedSearch(query, snippets);
  }

  // (2) Classify → eliminate → score → dedup. Keyed by URL; keep highest score.
  const acc = new Map<string, ScoredCandidate>();

  for (const snippet of snippets) {
    if (!snippet.url) continue;

    // 2a CLASSIFY — product page vs tech-spec document.
    const pageType = classifyPage(snippet);

    // 2b ELIMINATE — drop out-of-stock / unfulfillable / non-product pages.
    //    Skipped for rawCandidates (contact search ignores product gate).
    if (!opts.rawCandidates) {
      const elim = eliminatePage(
        { url: snippet.url, title: snippet.title, content: snippet.content || snippet.snippet || '' },
        requiredQty,
      );
      if (elim.eliminated) continue;
    }

    // 2c SCORE — keep at/above KEEP_THRESHOLD. Scorer emits detected-field map.
    //    rawCandidates keeps every page (still scored for ranking).
    const { score, kept, detected } = scoreProductPage(snippet, spec);
    if (!kept && !opts.rawCandidates) continue;

    const existing = acc.get(snippet.url);
    if (!existing || score > existing.score) {
      acc.set(snippet.url, { snippet, score, detected, pageType });
    }
  }

  // (3) Rank best-first to front-load extractor and density loop TARGET_SOURCES cap.
  const candidates = Array.from(acc.values()).sort((a, b) => b.score - a.score);
  const ranked = candidates.map((c) => c.snippet);

  return { snippets: ranked, candidates, tavilyCalls };
}
