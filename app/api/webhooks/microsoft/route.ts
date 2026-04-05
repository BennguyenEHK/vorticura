// =============================================
// MICROSOFT GRAPH WEBHOOK - Change Notifications
// =============================================
// Receives push notifications from Microsoft Graph when new
// emails arrive in a connected user's Inbox.
//
// Two responsibilities:
//   1. Subscription validation handshake (return validationToken)
//   2. Process incoming change notifications (fetch message, run pipeline)
//
// Microsoft requires the webhook to:
//   - Return 200 with validationToken during subscription creation
//   - Return 202 Accepted within 3 seconds for notifications
//   - Verify clientState matches our secret
//
// Dataflow:
//   Graph notification → verify clientState → lookup emailConnection
//   → refresh token if expired → fetchOutlookMessageRaw
//   → processEmailMessage → markOutlookRead → update lastSyncAt

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { timingSafeEqual } from 'crypto';

import { db } from '@/lib/db/client';
import { emailConnections } from '@/lib/db/schema';
import {
  decryptToken,
  encryptToken,
  refreshMicrosoftToken,
} from '@/lib/services/email/oauth-helper';
import {
  fetchOutlookMessageRaw,
  markOutlookRead,
} from '@/lib/services/email/outlook-client';
import { processEmailMessage } from '@/lib/services/email/email-pipeline';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

// =============================================
// TYPES
// =============================================

/** Shape of a single change notification from Microsoft Graph */
interface GraphNotification {
  subscriptionId: string;
  clientState: string;
  changeType: string;
  resource: string;
  resourceData: {
    '@odata.type': string;
    '@odata.id': string;
    '@odata.etag': string;
    id: string; // The message ID
  };
}

/** Top-level notification payload from Graph */
interface GraphNotificationPayload {
  value: GraphNotification[];
}

// =============================================
// POST /api/webhooks/microsoft
// =============================================

export async function POST(request: NextRequest) {
  // -----------------------------------------
  // Step 1: Subscription validation handshake
  // -----------------------------------------
  // When creating a subscription, Graph sends a POST with a
  // validationToken query parameter. We must echo it back as
  // plain text with 200 to prove we own the endpoint.
  const validationToken = request.nextUrl.searchParams.get('validationToken');
  if (validationToken) {
    // Sanitize: only allow alphanumeric, hyphens, and underscores (Graph tokens are UUIDs)
    const sanitized = validationToken.replace(/[^a-zA-Z0-9\-_]/g, '');
    return new NextResponse(sanitized, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'X-Content-Type-Options': 'nosniff', // Prevent MIME sniffing
      },
    });
  }

  // -----------------------------------------
  // Step 2: Parse notification payload
  // -----------------------------------------
  let payload: GraphNotificationPayload;
  try {
    payload = await request.json();
  } catch {
    console.error('[microsoft-webhook] Failed to parse notification body');
    return new NextResponse(null, { status: 202 });
  }

  if (!payload.value || !Array.isArray(payload.value)) {
    console.warn('[microsoft-webhook] No notifications in payload');
    return new NextResponse(null, { status: 202 });
  }

  // Return 202 immediately to meet Microsoft's 3-second requirement
  // Queue notifications for asynchronous processing
  const responsePromise = new NextResponse(null, { status: 202 });

  // Process notifications asynchronously without awaiting
  (async () => {
    // Process sequentially to avoid overwhelming the pipeline
    for (const notification of payload.value) {
      try {
        await processNotification(notification);
      } catch (error) {
        console.error(
          `[microsoft-webhook] Unhandled error processing notification for subscription ${notification.subscriptionId}:`,
          error
        );
      }
    }
  })().catch((err) => {
    // Prevent unhandled promise rejection
    console.error('[microsoft-webhook] Background processing failed:', err);
  });

  return responsePromise;
}

// =============================================
// processNotification()
// =============================================

/**
 * Process a single Graph change notification.
 * Handles token refresh, message fetching, and pipeline dispatch.
 */
async function processNotification(notification: GraphNotification): Promise<void> {
  // -----------------------------------------
  // Step 3a: Verify clientState (webhook secret)
  // -----------------------------------------
  // Prevents spoofed notifications from being processed
  const secret = process.env.MICROSOFT_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[microsoft-webhook] MICROSOFT_WEBHOOK_SECRET not configured, skipping notification');
    return;
  }

  // Use timing-safe comparison to prevent timing attacks
  const notificationBuf = Buffer.from(notification.clientState);
  const secretBuf = Buffer.from(secret);

  let clientStateValid = false;
  try {
    clientStateValid =
      notificationBuf.length === secretBuf.length &&
      timingSafeEqual(notificationBuf, secretBuf);
  } catch {
    // Buffer length mismatch — treat as invalid
    clientStateValid = false;
  }

  if (!clientStateValid) {
    console.warn(
      `[microsoft-webhook] clientState mismatch for subscription ${notification.subscriptionId}, skipping`
    );
    return;
  }

  // Extract the message ID from the notification
  const messageId = notification.resourceData?.id;
  if (!messageId) {
    console.warn('[microsoft-webhook] No resourceData.id in notification, skipping');
    return;
  }

  // -----------------------------------------
  // Step 3b: Look up email connection by subscriptionId
  // -----------------------------------------
  const [connection] = await db
    .select()
    .from(emailConnections)
    .where(eq(emailConnections.subscriptionId, notification.subscriptionId))
    .limit(1);

  if (!connection) {
    console.warn(
      `[microsoft-webhook] No email connection found for subscription ${notification.subscriptionId}, skipping`
    );
    return;
  }

  // -----------------------------------------
  // Step 3c: Decrypt tokens and refresh if expired
  // -----------------------------------------
  let accessToken: string;
  try {
    accessToken = decryptToken(connection.accessToken);
    const refreshTokenPlain = decryptToken(connection.refreshToken);

    // Check if token has expired (with 5-minute buffer)
    // Treat null/undefined tokenExpiresAt as expired
    const isExpired =
      !connection.tokenExpiresAt ||
      connection.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000;

    if (isExpired) {
      console.log(
        `[microsoft-webhook] Token expired for connection ${connection.connectionId}, refreshing`
      );

      try {
        const refreshed = await refreshMicrosoftToken(refreshTokenPlain);
        accessToken = refreshed.access_token;

        // Calculate new expiration time
        const newExpiresAt = new Date(
          Date.now() + refreshed.expires_in * 1000
        );

        const originalExpiresAt = connection.tokenExpiresAt;

        // Persist refreshed tokens with optimistic concurrency control
        // Only update if tokenExpiresAt hasn't changed (prevents race conditions)
        const updateResult = await db
          .update(emailConnections)
          .set({
            accessToken: encryptToken(refreshed.access_token),
            ...(refreshed.refresh_token
              ? { refreshToken: encryptToken(refreshed.refresh_token) }
              : {}),
            tokenExpiresAt: newExpiresAt,
            lastError: null,
            errorCount: 0,
          })
          .where(
            eq(emailConnections.connectionId, connection.connectionId)
            // If originalExpiresAt is null, we cannot use it in the WHERE clause
            // In that case, skip the concurrency check as this is likely a first refresh
          );

        if (updateResult.rowsAffected === 0 && originalExpiresAt) {
          // Update failed — token was already refreshed by another handler
          // Reload the connection to get the new token
          const [refreshedConn] = await db
            .select()
            .from(emailConnections)
            .where(eq(emailConnections.connectionId, connection.connectionId))
            .limit(1);

          if (refreshedConn) {
            accessToken = decryptToken(refreshedConn.accessToken);
          }
        }
      } catch (refreshError) {
        // Refresh failed — mark connection as expired so the user knows
        // to re-authenticate
        console.error(
          `[microsoft-webhook] Token refresh failed for connection ${connection.connectionId}:`,
          refreshError
        );

        await db
          .update(emailConnections)
          .set({
            status: 'expired',
            lastError:
              refreshError instanceof Error
                ? refreshError.message
                : 'Token refresh failed',
            errorCount: (connection.errorCount ?? 0) + 1,
          })
          .where(eq(emailConnections.connectionId, connection.connectionId));

        return;
      }
    }
  } catch (decryptError) {
    console.error(
      `[microsoft-webhook] Token decryption failed for connection ${connection.connectionId}:`,
      decryptError
    );

    await db
      .update(emailConnections)
      .set({
        status: 'expired',
        lastError: 'Token decryption failed',
        errorCount: (connection.errorCount ?? 0) + 1,
      })
      .where(eq(emailConnections.connectionId, connection.connectionId));

    return;
  }

  // -----------------------------------------
  // Step 3d: Fetch raw MIME message from Graph
  // -----------------------------------------
  let rawBuffer: Buffer;
  try {
    rawBuffer = await fetchOutlookMessageRaw(accessToken, messageId);
  } catch (fetchError) {
    console.error(
      `[microsoft-webhook] Failed to fetch message ${messageId}:`,
      fetchError
    );

    await db
      .update(emailConnections)
      .set({
        lastError:
          fetchError instanceof Error
            ? fetchError.message
            : 'Message fetch failed',
        errorCount: (connection.errorCount ?? 0) + 1,
      })
      .where(eq(emailConnections.connectionId, connection.connectionId));

    return;
  }

  // -----------------------------------------
  // Step 3e: Build workspace context and run pipeline
  // -----------------------------------------
  const workspace = new WorkspaceContext({
    user_id: connection.userId,
    company_id: connection.companyId,
  });

  try {
    const result = await processEmailMessage(rawBuffer, workspace, {
      // Mark the message as read in Outlook after successful processing
      onSuccess: async () => {
        await markOutlookRead(accessToken, messageId);
      },
    });

    if (result.success) {
      console.log(
        `[microsoft-webhook] Processed message ${messageId} as ${result.classification.actionType} (${result.classification.confidence})`
      );
    } else {
      console.warn(
        `[microsoft-webhook] Pipeline returned failure for message ${messageId}:`,
        result.error
      );
    }
  } catch (pipelineError) {
    console.error(
      `[microsoft-webhook] Pipeline error for message ${messageId}:`,
      pipelineError
    );

    await db
      .update(emailConnections)
      .set({
        lastError:
          pipelineError instanceof Error
            ? pipelineError.message
            : 'Pipeline processing failed',
        errorCount: (connection.errorCount ?? 0) + 1,
      })
      .where(eq(emailConnections.connectionId, connection.connectionId));

    return;
  }

  // -----------------------------------------
  // Step 3f: Update lastSyncAt on success
  // -----------------------------------------
  await db
    .update(emailConnections)
    .set({
      lastSyncAt: new Date(),
      lastError: null,
    })
    .where(eq(emailConnections.connectionId, connection.connectionId));
}
