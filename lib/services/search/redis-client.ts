// Dedicated ioredis connection for search-cache GET/SET.
// Cannot reuse event-bus subscriber (locked in psubscribe mode).
// Singleton survives Next.js HMR via globalThis.

import Redis, { type Redis as RedisClient } from 'ioredis';

// Print only the message — avoids leaking raw error objects.
function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

// Lazily build client; degrades gracefully when REDIS_URL unset.
function buildClient(): RedisClient | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[search-cache] REDIS_URL not set — search cache disabled (every query will hit Tavily)');
    return null;
  }
  // Short-lived command client; matches event-bus publisher settings.
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,   // fail fast on individual GET/SETEX
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on('error', (e) => console.warn('[search-cache] redis error:', formatError(e)));
  client.on('ready', () => console.log('[search-cache] redis ready'));
  return client;
}

// HMR-safe singleton — prevents new Redis socket on each reload.
const globalForRedis = globalThis as unknown as { searchRedis?: RedisClient | null };

/** Returns the cache Redis client, or null when REDIS_URL is unset. */
export function getSearchRedis(): RedisClient | null {
  if (globalForRedis.searchRedis === undefined) {
    globalForRedis.searchRedis = buildClient();
  }
  return globalForRedis.searchRedis;
}
