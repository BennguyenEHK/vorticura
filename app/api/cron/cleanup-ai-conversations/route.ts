// =============================================
// CLEANUP AI CONVERSATIONS CRON - Vercel Cron Job
// =============================================
// Deletes ai_conversations rows whose expires_at has passed.
// Runs every 6 hours via Vercel Cron (vercel.json).
//
// Schedule: 0 */6 * * *
// Auth: Vercel auto-sends CRON_SECRET as Authorization bearer token

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { aiConversations } from '@/lib/db/schema';
import { lt, sql } from 'drizzle-orm';

/**
 * GET /api/cron/cleanup-ai-conversations
 * Deletes expired ai_conversations rows (expires_at < now()).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await db
      .delete(aiConversations)
      .where(lt(aiConversations.expiresAt, sql`now()`));

    const deleted = result.rowCount ?? 0;
    console.log(`[cron/cleanup-ai-conversations] Deleted ${deleted} expired rows`);

    return NextResponse.json({ deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[cron/cleanup-ai-conversations] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
