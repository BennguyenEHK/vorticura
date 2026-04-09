'use server'

import { db } from '@/lib/db/client'
import { userSessions } from '@/lib/db/schema'
import { getServerActionWorkspace } from '@/lib/middleware/get-workspace'
import { sql } from 'drizzle-orm'

/**
 * Track the previous location in user session
 * Upserts to user_sessions table with INSERT ... ON CONFLICT ... DO UPDATE
 * Silent fail on error (background tracking action)
 *
 * @param pathname - The pathname to track (e.g., '/dashboard', '/rfqs/123')
 */
export async function upsertPrevLocation(pathname: string): Promise<void> {
  try {
    // Skip tracking for system paths
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      /\.(js|css|jpg|jpeg|png|gif|svg|ico|webp)$/i.test(pathname)
    ) {
      return;
    }

    // Get workspace context from auth cookie
    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      return; // Silently fail if not authenticated
    }

    // Upsert: INSERT ... ON CONFLICT ... DO UPDATE
    await db
      .insert(userSessions)
      .values({
        companyId: workspace.company_id,
        userId: workspace.user_id,
        prevLocation: pathname,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userSessions.companyId, userSessions.userId],
        set: {
          prevLocation: pathname,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    // Silent fail - this is a background tracking action
    // No logging or throwing
  }
}
