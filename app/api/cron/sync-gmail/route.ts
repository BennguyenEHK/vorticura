// =============================================
// GMAIL INBOX POLL — Manual / Cron Sync
// =============================================
// POST /api/cron/sync-gmail
//
// Dual-mode authentication:
//   • Vercel Cron  → Authorization: Bearer {CRON_SECRET}  → syncs ALL active companies
//   • Browser call → auth_token cookie (Sync Inbox button) → syncs caller's company only
//
// WHY dual-mode? /api/cron is declared PUBLIC in middleware.ts so middleware exits
// early and never injects x-company-id. Instead of relying on that header, this
// route reads auth directly from its two legitimate callers.

import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { cookies } from 'next/headers'; // reads the auth_token cookie server-side

import { db } from '@/lib/db/client';
import { emailConnections } from '@/lib/db/schema';
import { getWorkspaceFromToken } from '@/lib/middleware/auth-helpers'; // verifies JWT + builds workspace
import { WorkspaceContext } from '@/lib/middleware/workspace-context';
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

export async function POST(request: NextRequest) {
  // ── Step 1: Authenticate the caller ─────────────────────────────────────
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; browser sends a cookie.
  const cronSecret = process.env.CRON_SECRET;

  // isCronCall is true only when CRON_SECRET is configured AND the header matches
  const isCronCall =
    !!cronSecret &&
    request.headers.get('authorization') === `Bearer ${cronSecret}`;

  // companyFilter: number → scope query to one company (browser mode)
  //               null   → query all companies (cron mode)
  let companyFilter: number | null = null;

  if (!isCronCall) {
    // Browser path: read and verify the auth_token cookie directly
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      // No cookie and not a valid cron call → unauthenticated
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const workspace = await getWorkspaceFromToken(token);
    if (!workspace) {
      // Cookie present but JWT invalid / expired
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    companyFilter = workspace.company_id; // restrict the DB query to this company
  }

  // ── Step 2: Fetch active Gmail connections ───────────────────────────────
  // Cron mode  → no companyId filter (process every company's connections)
  // Browser mode → filter by the authenticated user's company only
  const connections = await db
    .select()
    .from(emailConnections)
    .where(
      companyFilter !== null
        ? and(
            eq(emailConnections.provider, 'gmail'),
            eq(emailConnections.status, 'active'),
            eq(emailConnections.companyId, companyFilter), // browser: one company
          )
        : and(
            eq(emailConnections.provider, 'gmail'),
            eq(emailConnections.status, 'active'),
            // cron: all companies — no companyId condition
          ),
    );

  if (connections.length === 0) {
    return NextResponse.json({ message: 'No active Gmail connections', processed: 0 });
  }

  const results: Array<{ email: string; processed: number; errors: number }> = [];

  // ── Step 3: Process each connection ─────────────────────────────────────
  for (const conn of connections) {
    let accessToken: string;

    // Decrypt the stored token; refresh it if it expires within the next 60 s
    try {
      accessToken = decryptToken(conn.accessToken!);

      const isExpired =
        !conn.tokenExpiresAt || conn.tokenExpiresAt.getTime() < Date.now() + 60_000;

      if (isExpired) {
        const refreshToken = decryptToken(conn.refreshToken!);
        const refreshed    = await refreshGoogleToken(refreshToken);
        accessToken        = refreshed.access_token;

        // Persist the refreshed access token; only update refresh_token if Google rotated it
        const updateData: Record<string, unknown> = {
          accessToken:    encryptToken(accessToken),
          tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
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
      // Decryption or refresh failed → mark expired so the user knows to reconnect
      console.error(`[sync-gmail] Token error for ${conn.emailAddress}:`, err);
      await db
        .update(emailConnections)
        .set({ status: 'expired', lastError: String(err) })
        .where(eq(emailConnections.connectionId, conn.connectionId));
      continue; // move on to the next connection
    }

    // List unread INBOX messages (polling fallback for when Pub/Sub is unavailable)
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

    // Build workspace context per connection for pipeline tenant isolation
    const workspace = new WorkspaceContext({
      user_id:    conn.userId,
      company_id: conn.companyId,
    });

    let processed = 0;
    let errors    = 0;

    for (const msgId of messageIds) {
      try {
        // Fetch the raw MIME message as a Buffer (required by mailparser in email-pipeline)
        const rawBuffer = await fetchGmailMessage(accessToken, msgId, 'raw') as Buffer;

        await processEmailMessage(rawBuffer, workspace, {
          onSuccess: async () => {
            // Remove the UNREAD label so this message won't appear on the next poll
            // (requires the gmail.modify scope — added alongside this fix)
            await markGmailRead(accessToken, msgId);
          },
        });
        processed++;
      } catch (err) {
        console.error(`[sync-gmail] Failed to process message ${msgId}:`, err);
        errors++;
      }
    }

    // Record last successful sync time; clear any previous error state
    await db
      .update(emailConnections)
      .set({ lastSyncAt: new Date(), lastError: null, errorCount: 0 })
      .where(eq(emailConnections.connectionId, conn.connectionId));

    results.push({ email: conn.emailAddress ?? '', processed, errors });
  }

  const totalProcessed = results.reduce((s, r) => s + r.processed, 0);
  return NextResponse.json({ message: 'Sync complete', totalProcessed, results });
}
