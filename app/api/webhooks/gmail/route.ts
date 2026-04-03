// =============================================
// GMAIL PUB/SUB WEBHOOK — Push Notification Handler
// =============================================
// Receives push notifications from Google Cloud Pub/Sub when new emails arrive.
// Verifies the Pub/Sub JWT, fetches new messages via Gmail API, and feeds them
// into the email processing pipeline.
//
// Flow:
//   Google Pub/Sub → POST /api/webhooks/gmail → verify JWT → fetch history
//   → fetch messages → processEmailMessage → mark read → 200 OK
//
// IMPORTANT: Always return 200 after auth passes to prevent Pub/Sub retries.
// Pub/Sub will exponentially back off and eventually drop the subscription
// if it receives too many non-2xx responses.

import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { eq, and, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { emailConnections, clientInfo, clientCompany } from '@/lib/db/schema';
import { decryptToken, encryptToken, refreshGoogleToken } from '@/lib/services/email/oauth-helper';
import { fetchGmailHistory, fetchGmailMessage, markGmailRead } from '@/lib/services/email/gmail-client';
import { processEmailMessage } from '@/lib/services/email/email-pipeline';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

// =============================================
// ENVIRONMENT
// =============================================

const GOOGLE_PUBSUB_AUDIENCE = process.env.GOOGLE_PUBSUB_AUDIENCE || '';
const GOOGLE_PUBSUB_SERVICE_ACCOUNT = process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT || '';

// Reuse a single OAuth2Client instance for JWT verification
const oauth2Client = new OAuth2Client();

// =============================================
// POST /api/webhooks/gmail
// =============================================

export async function POST(request: NextRequest) {
  // -----------------------------------------
  // Step 1: Verify Pub/Sub JWT from Authorization header
  // -----------------------------------------
  // Google Cloud Pub/Sub sends a Bearer token signed by Google.
  // We verify it to ensure the request is authentic.

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
  }

  const bearerToken = authHeader.slice(7);

  try {
    const ticket = await oauth2Client.verifyIdToken({
      idToken: bearerToken,
      audience: GOOGLE_PUBSUB_AUDIENCE,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token payload' }, { status: 401 });
    }

    // Verify the token was issued by the expected Pub/Sub service account
    if (payload.email !== GOOGLE_PUBSUB_SERVICE_ACCOUNT) {
      console.warn(`[gmail-webhook] Unexpected service account: ${payload.email}`);
      return NextResponse.json({ error: 'Unauthorized service account' }, { status: 401 });
    }
  } catch (error) {
    console.error('[gmail-webhook] JWT verification failed:', error);
    return NextResponse.json({ error: 'Token verification failed' }, { status: 401 });
  }

  // -----------------------------------------
  // After auth passes, always return 200 to prevent Pub/Sub retries.
  // All errors from here on are logged but acknowledged.
  // -----------------------------------------

  try {
    // -----------------------------------------
    // Step 2: Parse Pub/Sub message payload
    // -----------------------------------------
    // Pub/Sub wraps the data in { message: { data: base64, messageId, publishTime } }
    const body = await request.json();
    const messageData = body?.message?.data;

    if (!messageData) {
      console.warn('[gmail-webhook] No message data in request body');
      return NextResponse.json({ status: 'no_data' }, { status: 200 });
    }

    // Decode the base64 Pub/Sub message — contains { emailAddress, historyId }
    const decoded = JSON.parse(Buffer.from(messageData, 'base64').toString('utf-8'));
    const { emailAddress, historyId: newHistoryId } = decoded as {
      emailAddress: string;
      historyId: string;
    };

    if (!emailAddress || !newHistoryId) {
      console.warn('[gmail-webhook] Missing emailAddress or historyId in message');
      return NextResponse.json({ status: 'invalid_payload' }, { status: 200 });
    }

    // -----------------------------------------
    // Step 3: Look up the email connection
    // -----------------------------------------
    const [connection] = await db
      .select()
      .from(emailConnections)
      .where(
        and(
          eq(emailConnections.emailAddress, emailAddress),
          eq(emailConnections.status, 'active'),
        ),
      )
      .limit(1);

    if (!connection) {
      // No active connection for this email — acknowledge and ignore
      console.info(`[gmail-webhook] No active connection for ${emailAddress}`);
      return NextResponse.json({ status: 'no_connection' }, { status: 200 });
    }

    // -----------------------------------------
    // Step 4: Decrypt tokens and refresh if expired
    // -----------------------------------------
    let accessToken: string;
    try {
      accessToken = decryptToken(connection.accessToken);
      const refreshToken = decryptToken(connection.refreshToken);

      // Check if the access token is expired (with 60s buffer)
      // Treat null/undefined tokenExpiresAt as expired
      const isExpired = !connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() < Date.now() + 60_000;

      if (isExpired) {
        console.info(`[gmail-webhook] Refreshing expired token for ${emailAddress}`);
        const refreshed = await refreshGoogleToken(refreshToken);
        accessToken = refreshed.access_token;

        // Persist the new access token and expiration
        const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
        const updateData: Record<string, any> = {
          accessToken: encryptToken(accessToken),
          tokenExpiresAt: newExpiresAt,
        };

        // If Google rotated the refresh token, update it too
        if (refreshed.refresh_token) {
          updateData.refreshToken = encryptToken(refreshed.refresh_token);
        }

        await db
          .update(emailConnections)
          .set(updateData)
          .where(eq(emailConnections.connectionId, connection.connectionId));
      }
    } catch (tokenError) {
      // Token refresh failed — mark connection as expired so the user can re-authenticate
      console.error(`[gmail-webhook] Token refresh failed for ${emailAddress}:`, tokenError);
      await db
        .update(emailConnections)
        .set({
          status: 'expired',
          lastError: tokenError instanceof Error ? tokenError.message : 'Token refresh failed',
          errorCount: sql`${emailConnections.errorCount} + 1`,
        })
        .where(eq(emailConnections.connectionId, connection.connectionId));

      return NextResponse.json({ status: 'token_expired' }, { status: 200 });
    }

    // -----------------------------------------
    // Step 5: Atomic historyId claim
    // -----------------------------------------
    // Use an atomic UPDATE with a condition to prevent duplicate processing.
    // Only one webhook handler can "claim" this historyId range.
    // If historyId is NULL (first sync) or the new one is higher, we claim it.
    const previousHistoryId = connection.historyId;

    const claimResult = await db
      .update(emailConnections)
      .set({ historyId: newHistoryId })
      .where(
        and(
          eq(emailConnections.connectionId, connection.connectionId),
          sql`(${emailConnections.historyId} IS NULL OR CAST(${emailConnections.historyId} AS BIGINT) < CAST(${newHistoryId} AS BIGINT))`,
        ),
      )
      .returning({ connectionId: emailConnections.connectionId });

    if (claimResult.length === 0) {
      // Another handler already processed a higher historyId — skip
      console.info(`[gmail-webhook] historyId ${newHistoryId} already claimed for ${emailAddress}`);
      return NextResponse.json({ status: 'already_claimed' }, { status: 200 });
    }

    // -----------------------------------------
    // Step 6: Fetch new messages from Gmail history
    // -----------------------------------------
    // If this is the first notification (no previous historyId), we skip history
    // fetching since we don't have a baseline to diff from.
    if (!previousHistoryId) {
      console.info(`[gmail-webhook] First notification for ${emailAddress}, baseline set`);
      await db
        .update(emailConnections)
        .set({ lastSyncAt: new Date() })
        .where(eq(emailConnections.connectionId, connection.connectionId));
      return NextResponse.json({ status: 'baseline_set' }, { status: 200 });
    }

    const messageIds = await fetchGmailHistory(accessToken, previousHistoryId);

    if (messageIds.length === 0) {
      console.info(`[gmail-webhook] No new messages for ${emailAddress}`);
      await db
        .update(emailConnections)
        .set({ lastSyncAt: new Date() })
        .where(eq(emailConnections.connectionId, connection.connectionId));
      return NextResponse.json({ status: 'no_new_messages' }, { status: 200 });
    }

    // -----------------------------------------
    // Step 7: Build workspace context for pipeline
    // -----------------------------------------
    const workspace = new WorkspaceContext({
      client_id: connection.clientId,
      company_id: connection.companyId,
    });

    // -----------------------------------------
    // Step 8: Process each new message (limit to batch to avoid serverless timeout)
    // -----------------------------------------
    const BATCH_SIZE = 50;
    const messagesToProcess = messageIds.slice(0, BATCH_SIZE);
    const remainingCount = Math.max(0, messageIds.length - BATCH_SIZE);

    console.info(
      `[gmail-webhook] Processing ${messagesToProcess.length} of ${messageIds.length} messages for ${emailAddress}${
        remainingCount > 0 ? ` (${remainingCount} deferred for next sync)` : ''
      }`
    );

    for (const messageId of messagesToProcess) {
      try {
        // Fetch the raw MIME message for full parsing (attachments, etc.)
        const rawBuffer = await fetchGmailMessage(accessToken, messageId, 'raw') as Buffer;

        // Process through the email pipeline
        // On success, mark the message as read to prevent re-processing
        await processEmailMessage(rawBuffer, workspace, {
          onSuccess: async () => {
            await markGmailRead(accessToken, messageId);
          },
        });
      } catch (msgError) {
        // Log but continue processing remaining messages
        console.error(`[gmail-webhook] Failed to process message ${messageId}:`, msgError);
      }
    }

    // -----------------------------------------
    // Step 9: Update sync timestamp
    // -----------------------------------------
    await db
      .update(emailConnections)
      .set({
        lastSyncAt: new Date(),
        lastError: null,
        errorCount: 0,
      })
      .where(eq(emailConnections.connectionId, connection.connectionId));

    return NextResponse.json({ status: 'processed', count: messageIds.length }, { status: 200 });
  } catch (error) {
    // Catch-all: log the error but still return 200 to prevent Pub/Sub retries
    console.error('[gmail-webhook] Unexpected error:', error);
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}
