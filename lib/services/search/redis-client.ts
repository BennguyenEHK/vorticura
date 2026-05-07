// =============================================
// SHARED REDIS CLIENT — search cache only
// =============================================
// A dedicated ioredis connection for the search-cache GET/SET path.
// We CANNOT reuse event-bus's subscriber (it is locked in psubscribe mode
// and ioredis forbids regular commands on a subscriber connection); reusing
// the publisher is technically possible but couples concerns and risks
// command-queue contention with event-bus PUBLISHes during high-traffic search.
//
// Singleton survives Next.js HMR via globalThis (same pattern as event-bus).

import Redis, { type Redis as RedisClient } from 'ioredis';

// Small helper to print only the message — avoids leaking raw error objects to logs
function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

// Lazily build the client so we can degrade gracefully when REDIS_URL is unset
// (e.g. solo dev with no Upstash creds — the cache layer just becomes a no-op).
function buildClient(): RedisClient | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[search-cache] REDIS_URL not set — search cache disabled (every query will hit Tavily)');
    return null;
  }
  // Standard short-lived command client; matches event-bus publisher settings
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,   // fail fast on individual GET/SETEX
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on('error', (e) => console.warn('[search-cache] redis error:', formatError(e)));
  client.on('ready', () => console.log('[search-cache] redis ready'));
  return client;
}

// HMR-safe singleton — without this, every dev reload spawns a new Redis socket
const globalForRedis = globalThis as unknown as { searchRedis?: RedisClient | null };

/** Returns the cache Redis client, or null when REDIS_URL is unset. */
export function getSearchRedis(): RedisClient | null {
  if (globalForRedis.searchRedis === undefined) {
    globalForRedis.searchRedis = buildClient();
  }
  return globalForRedis.searchRedis;
}
