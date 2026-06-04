// Search cache backed by Upstash Redis (key: search:v3:<sha1(query)>).
// TTL configurable via SEARCH_CACHE_TTL_SECONDS (default 7 days).

import { createHash } from 'crypto';
import { getSearchRedis } from './redis-client';
import type { TavilySnippet } from './tavily-client';

// v3 bump: orphans stale low-quality v2 entries to TTL out naturally.
const CACHE_PREFIX = 'search:v3:';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// sha1 keeps key length predictable regardless of query length.
function cacheKey(query: string): string {
  return CACHE_PREFIX + createHash('sha1').update(query).digest('hex');
}

function ttlSeconds(): number {
  const raw = Number(process.env.SEARCH_CACHE_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_SECONDS;
}

/**
 * Returns cached Tavily snippets for `query`, or null on miss/outage.
 * Never throws — cache failures must not break the search pipeline.
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
 * Store snippets under the query key with configured TTL.
 * Fire-and-forget safe — orchestrator may ignore the returned promise.
 */
export async function setCachedSearch(query: string, results: TavilySnippet[]): Promise<void> {
  const redis = getSearchRedis();
  if (!redis) return;
  try {
    // SETEX sets key + TTL atomically; no window where key lacks expiry.
    await redis.setex(cacheKey(query), ttlSeconds(), JSON.stringify(results));
  } catch (err) {
    console.warn('[search-cache] SETEX failed:', err instanceof Error ? err.message : err);
  }
}
