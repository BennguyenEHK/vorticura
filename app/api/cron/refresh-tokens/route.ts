// =============================================
// TOKEN REFRESH CRON - Vercel Cron Job
// =============================================
// Runs every 45 minutes via Vercel Cron (vercel.json).
// Refreshes expiring OAuth tokens and renews push subscriptions.
//
// Schedule: */45 * * * *
// Auth: Vercel auto-sends CRON_SECRET as Authorization bearer token

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { emailConnections } from '@/lib/db/schema';
import { eq, and, lt, sql } from 'drizzle-orm';
import {
  refreshGoogleToken,
  refreshMicrosoftToken,
  encryptToken,
  decryptToken,
} from '@/lib/services/email/oauth-helper';
import { setupGmailWatch } from '@/lib/services/email/gmail-client';
import { renewOutlookSubscription } from '@/lib/services/email/outlook-client';

/**
 * GET /api/cron/refresh-tokens
 * Called by Vercel Cron every 45 minutes.
 * 1. Refresh tokens expiring within 15 minutes
 * 2. Renew Gmail watches expiring within 24 hours
 * 3. Renew Microsoft subscriptions expiring within 6 hours
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this automatically for cron invocations)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  // Reject if CRON_SECRET is not configured or doesn't match
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary = { refreshed: 0, expired: 0, gmailRenewed: 0, outlookRenewed: 0, errors: [] as string[] };

  // ---- Step 1: Refresh expiring tokens (within 15 minutes) ----
  try {
    const fifteenMinFromNow = new Date(Date.now() + 15 * 60 * 1000);
    const expiringConnections = await db
      .select()
      .from(emailConnections)
      .where(
        and(
          eq(emailConnections.status, 'active'),
          lt(emailConnections.tokenExpiresAt, fifteenMinFromNow)
        )
      );

    for (const conn of expiringConnections) {
      try {
        // Decrypt the stored refresh token
        const refreshToken = decryptToken(conn.refreshToken);

        let newAccessToken: string;
        let expiresIn: number;
        let newRefreshToken: string | undefined;

        // Call the appropriate provider's refresh endpoint
        if (conn.provider === 'gmail') {
          const result = await refreshGoogleToken(refreshToken);
          newAccessToken = result.access_token;
          expiresIn = result.expires_in;
        } else {
          const result = await refreshMicrosoftToken(refreshToken);
          newAccessToken = result.access_token;
          expiresIn = result.expires_in;
          newRefreshToken = result.refresh_token; // Microsoft may rotate refresh tokens
        }

        // Encrypt and store the new tokens
        const updateData: Record<string, any> = {
          accessToken: encryptToken(newAccessToken),
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          lastError: null,
          errorCount: 0,
        };

        // If Microsoft rotated the refresh token, update it too
        if (newRefreshToken) {
          updateData.refreshToken = encryptToken(newRefreshToken);
        }

        await db
          .update(emailConnections)
          .set(updateData)
          .where(eq(emailConnections.connectionId, conn.connectionId));

        summary.refreshed++;
      } catch (error) {
        // Token refresh failed — mark connection as expired
        const message = error instanceof Error ? error.message : 'Unknown refresh error';
        await db
          .update(emailConnections)
          .set({
            status: 'expired',
            lastError: message,
            errorCount: sql`${emailConnections.errorCount} + 1`,
          })
          .where(eq(emailConnections.connectionId, conn.connectionId));

        summary.expired++;
        summary.errors.push(`Connection ${conn.connectionId}: ${message}`);
      }
    }
  } catch (error) {
    summary.errors.push(`Token refresh query failed: ${error}`);
  }

  // ---- Step 2: Renew Gmail watches expiring within 24 hours ----
  try {
    const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expiringGmailWatches = await db
      .select()
      .from(emailConnections)
      .where(
        and(
          eq(emailConnections.provider, 'gmail'),
          eq(emailConnections.status, 'active'),
          lt(emailConnections.subscriptionExpires, twentyFourHoursFromNow)
        )
      );

    const topicName = process.env.GOOGLE_PUBSUB_TOPIC || '';

    for (const conn of expiringGmailWatches) {
      try {
        const accessToken = decryptToken(conn.accessToken);
        // setupGmailWatch is idempotent — safe to call again
        const watch = await setupGmailWatch(accessToken, topicName);

        await db
          .update(emailConnections)
          .set({
            historyId: watch.historyId,
            subscriptionExpires: new Date(Number(watch.expiration)),
          })
          .where(eq(emailConnections.connectionId, conn.connectionId));

        summary.gmailRenewed++;
      } catch (error) {
        summary.errors.push(`Gmail watch renewal ${conn.connectionId}: ${error}`);
      }
    }
  } catch (error) {
    summary.errors.push(`Gmail watch query failed: ${error}`);
  }

  // ---- Step 3: Renew Microsoft subscriptions expiring within 6 hours ----
  try {
    const sixHoursFromNow = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const expiringOutlookSubs = await db
      .select()
      .from(emailConnections)
      .where(
        and(
          eq(emailConnections.provider, 'outlook'),
          eq(emailConnections.status, 'active'),
          lt(emailConnections.subscriptionExpires, sixHoursFromNow)
        )
      );

    for (const conn of expiringOutlookSubs) {
      try {
        if (!conn.subscriptionId) continue; // No subscription to renew

        const accessToken = decryptToken(conn.accessToken);
        const result = await renewOutlookSubscription(accessToken, conn.subscriptionId);

        await db
          .update(emailConnections)
          .set({
            subscriptionExpires: new Date(result.expirationDateTime),
          })
          .where(eq(emailConnections.connectionId, conn.connectionId));

        summary.outlookRenewed++;
      } catch (error) {
        summary.errors.push(`Outlook renewal ${conn.connectionId}: ${error}`);
      }
    }
  } catch (error) {
    summary.errors.push(`Outlook subscription query failed: ${error}`);
  }

  console.log('[cron/refresh-tokens] Summary:', JSON.stringify(summary));

  return NextResponse.json(summary);
}
