// =============================================
// 🔄 DATABASE MIGRATION RUNNER
// =============================================
// Purpose: Run Drizzle ORM migrations to update database schema

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '../client';

/**
 * Run database migrations
 * Applies all pending migrations from drizzle/migrations folder
 * @returns Promise that resolves when migrations complete
 */
export async function runMigrations() {
  try {
    console.log('🚀 Starting database migrations...');

    // Execute migrations from the migrations folder
    await migrate(db, { migrationsFolder: './drizzle/migrations' });

    console.log('✅ Database migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    // Always close the connection pool after migrations
    await pool.end();
  }
}

// Run migrations if this file is executed directly
// Usage: node lib/db/migrations/migrate.ts
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0)) // Exit with success code
    .catch(() => process.exit(1)); // Exit with error code
}
