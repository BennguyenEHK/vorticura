// =============================================
// 🗄️ DRIZZLE DATABASE CLIENT
// =============================================
// Purpose: Type-safe database client with connection pooling
// Replaces: utils/database/database.js (569 lines → 80 lines)

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// =============================================
// 📊 DATABASE CONFIGURATION
// =============================================

// Build connection string from environment variables with fallback defaults
const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || '1234'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'sse_data'}`;

// =============================================
// 🔌 CONNECTION POOL
// =============================================

/**
 * PostgreSQL connection pool with optimized settings
 * - max: Maximum number of clients in the pool
 * - idleTimeoutMillis: Close idle clients after specified time
 * - connectionTimeoutMillis: Return error if connection takes too long
 */
export const pool = new Pool({
  connectionString,
  max: 20, // Maximum pool connections
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return error after 10 seconds
});

// Setup connection pool event handlers for monitoring
pool.on('connect', () => {
  console.log('🔗 New database client connected');
});

pool.on('remove', () => {
  console.log('🔚 Database client removed from pool');
});

pool.on('error', (err) => {
  console.error('❌ Database pool error:', err.message);
});

// =============================================
// 🚀 DRIZZLE CLIENT
// =============================================

/**
 * Drizzle ORM database client instance
 * Provides type-safe query building and execution
 */
export const db = drizzle(pool, { schema });

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
// 🔚 GRACEFUL SHUTDOWN
// =============================================

/**
 * Close all database connections gracefully
 * Called during application shutdown
 */
export async function closeDatabase() {
  console.log('🔌 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed successfully');
}

// Handle process termination signals for graceful shutdown
process.on('SIGTERM', closeDatabase);
process.on('SIGINT', closeDatabase);
