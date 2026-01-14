// =============================================
// ⚙️ DRIZZLE CONFIGURATION
// =============================================
// Purpose: Configure Drizzle Kit for migrations and schema management

import type { Config } from 'drizzle-kit';

// Build database connection string from environment variables
// In production, require DATABASE_URL to be set to avoid unsafe hardcoded fallbacks
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set in production for drizzle configuration');
}

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || '1234'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'sse_data'}`;

export default {
  // Path to schema definitions
  schema: './lib/db/schema.ts',

  // Output directory for generated migrations
  out: './drizzle/migrations',

  // Database dialect (PostgreSQL)
  dialect: 'postgresql',

  // Database connection credentials
  dbCredentials: {
    url: connectionString,
  },

  // Enable verbose logging for migration operations
  verbose: true,

  // Enable strict mode for type checking
  strict: true,
} satisfies Config;
