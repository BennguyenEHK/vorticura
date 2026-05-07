// =============================================
// SEARCH CACHE — Upstash Redis (key: search:<sha1(query)>)
// =============================================
// Reuses the existing Upstash DB. The 'search:' prefix prevents collision
// with event-bus's 'qfa:' channel namespace.
//
// TTL is configurable via SEARCH_CACHE_TTL_SECONDS (default 7 days). Tavily
// answers are stable for our use-case (supplier pages don't change hourly),
// so a long TTL drops API spend dramatically without harming freshness.

import { createHash } from 'crypto';
import { getSearchRedis } from './redis-client';
import type { TavilySnippet } from './tavily-client';

const CACHE_PREFIX = 'search:';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days — matches the doc spec

// Stable, short cache key — sha1 keeps the key length predictable regardless
// of query length (URL-encoded queries can run hundreds of chars otherwise).
function cacheKey(query: string): string {
  return CACHE_PREFIX + createHash('sha1').update(query).digest('hex');
}

function ttlSeconds(): number {
  const raw = Number(process.env.SEARCH_CACHE_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_SECONDS;
}

/**
 * Returns cached Tavily snippets for `query`, or null on miss / cache outage.
 * Never throws — cache failures must NOT break the search pipeline.
 */
export async function getCachedSearch(query: string): Promise<TavilySnippet[] | null> {
  const redis = getSearchRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(cacheKey(query));
    if (!raw) return null;
    return JSON.parse(raw) as TavilySnippet[];
  } catch (err) {
    console.warn('[search-cache] GET failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Store snippets under the query key with the configured TTL. Fire-and-forget
 * — caller should not await this on the critical path (we still await here
 * so errors are caught, but the orchestrator can choose to ignore the result).
 */
export async function setCachedSearch(query: string, results: TavilySnippet[]): Promise<void> {
  const redis = getSearchRedis();
  if (!redis) return;
  try {
    // SETEX = SET with TTL atomically; no race window where the key sits without an expiry.
    await redis.setex(cacheKey(query), ttlSeconds(), JSON.stringify(results));
  } catch (err) {
    console.warn('[search-cache] SETEX failed:', err instanceof Error ? err.message : err);
  }
}
