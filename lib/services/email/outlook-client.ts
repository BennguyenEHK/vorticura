// =============================================
// OUTLOOK CLIENT - Microsoft Graph API Wrapper
// =============================================
// Provides typed wrappers around Microsoft Graph v1.0 REST API
// for managing Outlook mail subscriptions, reading messages,
// fetching attachments, and updating read status.
//
// All functions accept a decrypted OAuth access token as the
// first argument and use native fetch (no SDK dependency).

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// =============================================
// TYPES
// =============================================

/** Response from creating or renewing a Graph subscription */
export interface GraphSubscription {
  id: string;
  expirationDateTime: string;
}

/** Simplified Outlook message shape returned by fetchOutlookMessage */
export interface OutlookMessage {
  id: string;
  subject: string;
  from: {
    emailAddress: { name: string; address: string };
  };
  toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  ccRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  body: { contentType: string; content: string };
  receivedDateTime: string;
  hasAttachments: boolean;
  internetMessageId: string;
}

/** Outlook attachment metadata returned by Graph API */
export interface OutlookAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes: string; // base64-encoded
}

// =============================================
// HELPER
// =============================================

/**
 * Execute a Graph API request with standard error handling.
 * Throws a descriptive error on non-2xx responses.
 */
async function graphFetch(
  accessToken: string,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => 'no body');
    throw new Error(
      `Graph API ${options.method || 'GET'} ${url} failed [${response.status}]: ${body}`
    );
  }

  return response;
}

// =============================================
// createOutlookSubscription()
// =============================================

/**
 * Create a change-notification subscription for the user's Inbox.
 * Microsoft Graph subscriptions have a maximum lifetime of 3 days
 * for mailFolder resources, so we set expiration to now + 3 days.
 *
 * @param accessToken - Decrypted OAuth access token
 * @param webhookUrl  - Publicly-reachable HTTPS URL that Graph will POST notifications to
 * @returns Subscription id and expiration timestamp
 */
export async function createOutlookSubscription(
  accessToken: string,
  webhookUrl: string
): Promise<GraphSubscription> {
  // Calculate expiration: now + 3 days (maximum for mail resources)
  const expirationDateTime = new Date(
    Date.now() + 3 * 24 * 60 * 60 * 1000
  ).toISOString();

  const response = await graphFetch(
    accessToken,
    `${GRAPH_BASE}/subscriptions`,
    {
      method: 'POST',
      body: JSON.stringify({
        changeType: 'created',
        notificationUrl: webhookUrl,
        resource: 'me/mailFolders/Inbox/messages',
        expirationDateTime,
        clientState: process.env.MICROSOFT_WEBHOOK_SECRET,
      }),
    }
  );

  const data = await response.json();
  return {
    id: data.id,
    expirationDateTime: data.expirationDateTime,
  };
}

// =============================================
// renewOutlookSubscription()
// =============================================

/**
 * Renew an existing Graph subscription before it expires.
 * Extends expiration by 3 days from the current time.
 *
 * @param accessToken    - Decrypted OAuth access token
 * @param subscriptionId - The subscription ID to renew
 * @returns Updated expiration timestamp
 */
export async function renewOutlookSubscription(
  accessToken: string,
  subscriptionId: string
): Promise<{ expirationDateTime: string }> {
  const expirationDateTime = new Date(
    Date.now() + 3 * 24 * 60 * 60 * 1000
  ).toISOString();

  const response = await graphFetch(
    accessToken,
    `${GRAPH_BASE}/subscriptions/${subscriptionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ expirationDateTime }),
    }
  );

  const data = await response.json();
  return { expirationDateTime: data.expirationDateTime };
}

// =============================================
// fetchOutlookMessage()
// =============================================

/**
 * Fetch a single message by ID as structured JSON.
 * Returns the full message object including from, subject, body, etc.
 *
 * @param accessToken - Decrypted OAuth access token
 * @param messageId   - The Graph message ID (from notification resourceData.id)
 * @returns Parsed message JSON
 */
export async function fetchOutlookMessage(
  accessToken: string,
  messageId: string
): Promise<OutlookMessage> {
  const response = await graphFetch(
    accessToken,
    `${GRAPH_BASE}/me/messages/${messageId}`
  );

  return response.json();
}

// =============================================
// fetchOutlookMessageRaw()
// =============================================

/**
 * Fetch the raw MIME content of a message (RFC 2822 format).
 * Uses the $value endpoint which returns the message as a raw byte stream.
 * This is the preferred format for the email pipeline (processEmailMessage).
 *
 * @param accessToken - Decrypted OAuth access token
 * @param messageId   - The Graph message ID
 * @returns Raw MIME message as Buffer
 */
export async function fetchOutlookMessageRaw(
  accessToken: string,
  messageId: string
): Promise<Buffer> {
  const response = await fetch(
    `${GRAPH_BASE}/me/messages/${messageId}/$value`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => 'no body');
    throw new Error(
      `Graph API GET message/$value failed [${response.status}]: ${body}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// =============================================
// fetchOutlookAttachment()
// =============================================

/**
 * Fetch a single attachment by ID and decode its content from base64.
 * Graph returns attachments with contentBytes as a base64-encoded string.
 *
 * @param accessToken  - Decrypted OAuth access token
 * @param messageId    - The parent message ID
 * @param attachmentId - The attachment ID to fetch
 * @returns Decoded attachment content as Buffer
 */
export async function fetchOutlookAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const response = await graphFetch(
    accessToken,
    `${GRAPH_BASE}/me/messages/${messageId}/attachments/${attachmentId}`
  );

  const data: OutlookAttachment = await response.json();

  // contentBytes is base64-encoded by Graph API — decode to raw Buffer
  return Buffer.from(data.contentBytes, 'base64');
}

// =============================================
// sendOutlookMessage()
// =============================================

/**
 * Send an email from the user's Outlook account via Microsoft Graph.
 *
 * @param accessToken - Decrypted OAuth access token
 * @param params      - Email fields (to, subject, body)
 * @returns The internet message ID of the sent message
 */
export async function sendOutlookMessage(
  accessToken: string,
  params: { to: string; subject: string; body: string },
): Promise<{ messageId: string }> {
  const response = await graphFetch(
    accessToken,
    `${GRAPH_BASE}/me/sendMail`,
    {
      method: 'POST',
      body: JSON.stringify({
        message: {
          subject: params.subject,
          body: {
            contentType: 'HTML',
            content: params.body,
          },
          toRecipients: [
            {
              emailAddress: { address: params.to },
            },
          ],
        },
        saveToSentItems: true,
      }),
    }
  );

  // sendMail returns 202 with no body on success
  if (response.status === 202 || response.status === 200) {
    return { messageId: `outlook-${Date.now()}` };
  }

  const data = await response.json().catch(() => ({}));
  return { messageId: (data as Record<string, string>).id || `outlook-${Date.now()}` };
}

// =============================================
// markOutlookRead()
// =============================================

/**
 * Mark a message as read in the user's mailbox.
 * Called as the onSuccess callback after the email pipeline
 * has successfully processed a message.
 *
 * @param accessToken - Decrypted OAuth access token
 * @param messageId   - The message ID to mark as read
 */
export async function markOutlookRead(
  accessToken: string,
  messageId: string
): Promise<void> {
  await graphFetch(
    accessToken,
    `${GRAPH_BASE}/me/messages/${messageId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ isRead: true }),
    }
  );
}
