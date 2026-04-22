// =============================================
// GMAIL INBOX POLL — Manual / Cron Sync
// =============================================
// POST /api/cron/sync-gmail
//
// Polling fallback for when Google Pub/Sub can't reach the webhook
// (local development, missing push subscription, first-time setup).
//
// Flow: fetch all active Gmail connections for the company → list unread
// INBOX messages → process each through the email pipeline → mark read.
//
// Auth: standard auth_token cookie / middleware (x-company-id header required).
// Returns JSON summary of processed message counts per connection.

import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { emailConnections } from '@/lib/db/schema';
import {
  decryptToken,
  encryptToken,
  refreshGoogleToken,
} from '@/lib/services/email/oauth-helper';
import {
  listGmailInbox,
  fetchGmailMessage,
  markGmailRead,
} from '@/lib/services/email/gmail-client';
import { processEmailMessage } from '@/lib/services/email/email-pipeline';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

export async function POST(request: NextRequest) {
  // company_id injected by middleware for authenticated requests
  const companyIdHeader = request.headers.get('x-company-id');
  const companyId = companyIdHeader ? parseInt(companyIdHeader, 10) : NaN;

  if (isNaN(companyId)) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Fetch all active Gmail connections for this company
  const connections = await db
    .select()
    .from(emailConnections)
    .where(
      and(
        eq(emailConnections.companyId, companyId),
        eq(emailConnections.provider, 'gmail'),
        eq(emailConnections.status, 'active'),
      ),
    );

  if (connections.length === 0) {
    return NextResponse.json({ message: 'No active Gmail connections', processed: 0 });
  }

  const results: Array<{ email: string; processed: number; errors: number }> = [];

  for (const conn of connections) {
    let accessToken: string;

    // Decrypt + refresh token if needed
    try {
      accessToken = decryptToken(conn.accessToken!);
      const isExpired =
        !conn.tokenExpiresAt || conn.tokenExpiresAt.getTime() < Date.now() + 60_000;

      if (isExpired) {
        const refreshToken = decryptToken(conn.refreshToken!);
        const refreshed    = await refreshGoogleToken(refreshToken);
        accessToken        = refreshed.access_token;

        const updateData: Record<string, unknown> = {
          accessToken:      encryptToken(accessToken),
          tokenExpiresAt:   new Date(Date.now() + refreshed.expires_in * 1000),
        };
        if (refreshed.refresh_token) {
          updateData.refreshToken = encryptToken(refreshed.refresh_token);
        }
        await db
          .update(emailConnections)
          .set(updateData)
          .where(eq(emailConnections.connectionId, conn.connectionId));
      }
    } catch (err) {
      console.error(`[sync-gmail] Token error for ${conn.emailAddress}:`, err);
      await db
        .update(emailConnections)
        .set({ status: 'expired', lastError: String(err) })
        .where(eq(emailConnections.connectionId, conn.connectionId));
      continue;
    }

    // List unread INBOX messages (up to 20 at a time)
    let messageIds: string[];
    try {
      messageIds = await listGmailInbox(accessToken, 20);
    } catch (err) {
      console.error(`[sync-gmail] List inbox failed for ${conn.emailAddress}:`, err);
      results.push({ email: conn.emailAddress ?? '', processed: 0, errors: 1 });
      continue;
    }

    if (messageIds.length === 0) {
      results.push({ email: conn.emailAddress ?? '', processed: 0, errors: 0 });
      continue;
    }

    const workspace = new WorkspaceContext({
      user_id:    conn.userId,
      company_id: conn.companyId,
    });

    let processed = 0;
    let errors    = 0;

    for (const msgId of messageIds) {
      try {
        const rawBuffer = await fetchGmailMessage(accessToken, msgId, 'raw') as Buffer;
        await processEmailMessage(rawBuffer, workspace, {
          onSuccess: async () => {
            await markGmailRead(accessToken, msgId);
          },
        });
        processed++;
      } catch (err) {
        console.error(`[sync-gmail] Failed to process message ${msgId}:`, err);
        errors++;
      }
    }

    // Update last sync timestamp
    await db
      .update(emailConnections)
      .set({ lastSyncAt: new Date(), lastError: null, errorCount: 0 })
      .where(eq(emailConnections.connectionId, conn.connectionId));

    results.push({ email: conn.emailAddress ?? '', processed, errors });
  }

  const totalProcessed = results.reduce((s, r) => s + r.processed, 0);
  return NextResponse.json({ message: 'Sync complete', totalProcessed, results });
}
