// =============================================
// 🗄️ DRIZZLE DATABASE CLIENT (Neon Serverless)
// =============================================
// Purpose: Type-safe database client optimized for Neon Serverless
// Uses: @neondatabase/serverless for edge-compatible connections

import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

// =============================================
// 📊 DATABASE CONFIGURATION
// =============================================

// Validate DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// =============================================
// 🚀 NEON SERVERLESS CLIENT
// =============================================

/**
 * Neon HTTP client for serverless/edge environments
 * Automatically handles connection pooling via Neon's infrastructure
 */
neonConfig.webSocketConstructor = ws;  // Required for Node.js

/**
 * Build a resilient Neon WebSocket pool.
 *
 * Root cause of "Connection terminated unexpectedly": Neon's serverless proxy
 * closes idle WebSocket connections after a few minutes. A plain pool keeps the
 * now-dead client and hands it to the next query, which then fails. We:
 *  - reap idle clients BEFORE Neon does (idleTimeoutMillis),
 *  - fail fast on a dead socket instead of hanging (connectionTimeoutMillis),
 *  - recycle long-lived connections (maxUses),
 *  - attach an 'error' handler so an idle-client drop is logged and the client
 *    is evicted (otherwise it surfaces as an unhandled rejection on the next await).
 */
function createPool(): Pool {
  const newPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,                          // cap concurrent connections (Neon free-tier friendly)
    idleTimeoutMillis: 30_000,        // close idle clients before Neon's proxy kills them
    connectionTimeoutMillis: 10_000,  // fail fast rather than hang on a dead socket
    maxUses: 7_500,                   // recycle a connection after N uses (avoids stale long-lived sockets)
  });

  // Without this handler, an idle client that Neon closes emits an 'error' that
  // becomes an unhandled rejection. We log and let the pool evict it — the next
  // query transparently opens a fresh connection.
  newPool.on('error', (err: Error) => {
    console.error('[db] idle pool client error (recovered):', err.message);
  });

  return newPool;
}

// Reuse a single pool across Next.js dev hot-reloads. Without this, every reload
// spawns a new pool and leaks the previous one's live WebSocket connections —
// itself a source of connection churn and termination errors.
const globalForDb = globalThis as unknown as { __qfPool?: Pool };
const pool = globalForDb.__qfPool ?? createPool();
if (process.env.NODE_ENV !== 'production') globalForDb.__qfPool = pool;

/**
 * Drizzle ORM database client instance
 * Provides type-safe query building and execution
 */
export const db = drizzle(pool, { schema });

// =============================================
// 🔁 TRANSIENT-ERROR RETRY WRAPPER
// =============================================

/** Error messages that indicate a transient Neon WebSocket connection failure. */
const RETRYABLE_DB_MESSAGES = [
  'WebSocket was closed before the connection was established',
  'Connection terminated due to connection timeout',
  'Connection terminated unexpectedly',
  'read ECONNRESET',
];

/** True when the error (or its nested cause) looks like a transient Neon connection failure. */
function isRetryableDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = (err as { cause?: unknown }).cause;
  const causeMsg = cause instanceof Error ? cause.message
    : cause != null ? String(cause) : '';
  return RETRYABLE_DB_MESSAGES.some(
    (pattern) => msg.includes(pattern) || causeMsg.includes(pattern),
  );
}

/**
 * Execute `fn` and retry up to `maxAttempts` times on transient Neon WebSocket
 * errors. Non-retryable errors are rethrown immediately.
 *
 * @param fn           Async factory that runs one DB operation.
 * @param maxAttempts  Total attempts including the first (default 3).
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableDbError(err) || attempt === maxAttempts) throw err;
      // Back-off: 200 ms, 400 ms between retries.
      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 200));
      console.warn(
        `[db] transient connection error on attempt ${attempt}/${maxAttempts}, retrying —`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  throw lastErr;
}

// =============================================
// 🏥 HEALTH CHECK
// =============================================

/**
 * Check database connection health and return status
 * @returns Health status object with connection info
 */
export async function checkDatabaseHealth() {
  try {
    // Execute simple query to verify connection
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');

    return {
      status: 'connected',
      connected: true,
      timestamp: result.rows[0].current_time,
      version: result.rows[0].pg_version.split(' ')[0], // Extract PostgreSQL version number
      poolStatus: {
        totalCount: pool.totalCount, // Total number of clients in pool
        idleCount: pool.idleCount, // Number of idle clients
        waitingCount: pool.waitingCount, // Number of queued requests
      },
    };
  } catch (error) {
    return {
      status: 'error',
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================
// 🔧 UTILITY EXPORTS
// =============================================

/**
 * Raw pool client for custom queries
 * Use when you need to execute raw pool outside of Drizzle
 */
export { pool };
