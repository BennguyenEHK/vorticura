// =============================================
// 🗄️ DRIZZLE DATABASE CLIENT (Neon Serverless)
// =============================================
// Purpose: Type-safe database client optimized for Neon Serverless
// Uses: @neondatabase/serverless for edge-compatible connections

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
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
const sql = neon(process.env.DATABASE_URL);

/**
 * Drizzle ORM database client instance
 * Provides type-safe query building and execution
 */
export const db = drizzle(sql, { schema });

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
    const result = await sql`SELECT NOW() as current_time, version() as pg_version`;

    return {
      status: 'connected',
      connected: true,
      timestamp: result[0].current_time,
      version: String(result[0].pg_version).split(' ')[0],
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
 * Raw SQL client for custom queries
 * Use when you need to execute raw SQL outside of Drizzle
 */
export { sql };
