// =============================================
// GMAIL API CLIENT - Native Fetch Wrapper
// =============================================
// Low-level Gmail API operations using native fetch.
// All functions take a decrypted OAuth access token as first argument.
// Used by: webhook handler (app/api/webhooks/gmail/route.ts)
//          and OAuth callback (app/api/auth/callback/google/route.ts)

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// =============================================
// HELPERS
// =============================================

/** Build Authorization header from access token */
function authHeader(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Decode base64url string (RFC 4648 section 5) to a Buffer.
 * Gmail API returns base64url-encoded data for raw messages and attachments.
 */
function decodeBase64Url(data: string): Buffer {
  // Replace URL-safe characters with standard base64, then decode
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

// =============================================
// setupGmailWatch()
// =============================================

/** Response from Gmail watch API */
export interface GmailWatchResponse {
  historyId: string;
  expiration: string; // Unix timestamp in milliseconds
}

/**
 * Start watching the user's INBOX for new messages via Google Cloud Pub/Sub.
 * Must be renewed every 7 days (Google enforced maximum).
 *
 * @param accessToken - Decrypted OAuth access token
 * @param topicName   - Fully qualified Pub/Sub topic (e.g., "projects/my-project/topics/gmail-push")
 * @returns historyId (starting point for sync) and expiration timestamp
 */
export async function setupGmailWatch(
  accessToken: string,
  topicName: string,
): Promise<GmailWatchResponse> {
  const response = await fetch(`${GMAIL_API}/watch`, {
    method: 'POST',
    headers: {
      ...authHeader(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topicName,
      labelIds: ['INBOX'],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gmail watch setup failed (${response.status}): ${error}`);
  }

  return response.json();
}

// =============================================
// fetchGmailHistory()
// =============================================

/**
 * Fetch incremental history since a given historyId.
 * Returns an array of new message IDs added to INBOX since startHistoryId.
 *
 * Handles 404 gracefully — this means the historyId is too old and Google
 * has purged it. In that case, returns an empty array (caller should do a
 * full sync or just skip).
 *
 * @param accessToken     - Decrypted OAuth access token
 * @param startHistoryId  - The historyId to start from (exclusive)
 * @returns Array of message IDs that were added since startHistoryId
 */
export async function fetchGmailHistory(
  accessToken: string,
  startHistoryId: string,
): Promise<string[]> {
  const params = new URLSearchParams({
    startHistoryId,
    historyTypes: 'messageAdded',
    labelId: 'INBOX',
  });

  const response = await fetch(`${GMAIL_API}/history?${params.toString()}`, {
    headers: authHeader(accessToken),
  });

  // 404 means historyId is too old — Google has purged it
  if (response.status === 404) {
    console.warn('[gmail-client] historyId too old, returning empty array');
    return [];
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gmail history fetch failed (${response.status}): ${error}`);
  }

  const data = await response.json();

  // Extract unique message IDs from history records
  // Each history record contains messagesAdded[] with message.id
  const messageIds = new Set<string>();
  if (data.history) {
    for (const record of data.history) {
      if (record.messagesAdded) {
        for (const added of record.messagesAdded) {
          messageIds.add(added.message.id);
        }
      }
    }
  }

  return Array.from(messageIds);
}

// =============================================
// fetchGmailMessage()
// =============================================

/**
 * Fetch a single Gmail message by ID.
 *
 * Two modes:
 * - 'raw': Returns the full MIME message as a Buffer (for mailparser processing)
 * - 'full': Returns the parsed JSON payload (headers, parts, etc.)
 *
 * @param accessToken - Decrypted OAuth access token
 * @param messageId   - Gmail message ID
 * @param format      - 'raw' for MIME Buffer, 'full' for JSON payload
 */
export async function fetchGmailMessage(
  accessToken: string,
  messageId: string,
  format: 'raw' | 'full',
): Promise<Buffer | Record<string, unknown>> {
  const params = new URLSearchParams({ format });

  const response = await fetch(`${GMAIL_API}/messages/${messageId}?${params.toString()}`, {
    headers: authHeader(accessToken),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gmail message fetch failed (${response.status}): ${error}`);
  }

  const data = await response.json();

  if (format === 'raw') {
    // Raw format: message.raw contains base64url-encoded MIME message
    if (!data.raw) {
      throw new Error(`Gmail message ${messageId} has no raw data`);
    }
    return decodeBase64Url(data.raw);
  }

  // Full format: return the entire JSON payload for structured processing
  return data;
}

// =============================================
// fetchGmailAttachment()
// =============================================

/**
 * Fetch a message attachment by ID.
 * Gmail stores large attachments separately; they must be fetched via this endpoint.
 *
 * @param accessToken  - Decrypted OAuth access token
 * @param messageId    - Gmail message ID that contains the attachment
 * @param attachmentId - Attachment ID from the message parts
 * @returns Decoded attachment content as a Buffer
 */
export async function fetchGmailAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const response = await fetch(
    `${GMAIL_API}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: authHeader(accessToken) },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gmail attachment fetch failed (${response.status}): ${error}`);
  }

  const data = await response.json();

  if (!data.data) {
    throw new Error(`Gmail attachment ${attachmentId} has no data field`);
  }

  return decodeBase64Url(data.data);
}

// =============================================
// sendGmailMessage()
// =============================================

/**
 * Build an RFC 2822 MIME message and encode it as base64url for the Gmail API.
 */
function buildMimeMessage(
  { to, subject, body, from }: { to: string; subject: string; body: string; from?: string }
): string {
  const lines = [
    ...(from ? [`From: ${from}`] : []),
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    body,
  ];
  const raw = lines.join('\r\n');
  return Buffer.from(raw, 'utf-8').toString('base64url');
}

/**
 * Send an email from the user's Gmail account.
 *
 * @param accessToken - Decrypted OAuth access token
 * @param params      - Email fields (to, subject, body, optional from)
 * @returns The Gmail message ID of the sent message
 */
export async function sendGmailMessage(
  accessToken: string,
  params: { to: string; subject: string; body: string; from?: string },
): Promise<{ messageId: string }> {
  const raw = buildMimeMessage(params);

  const response = await fetch(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    headers: {
      ...authHeader(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gmail send failed (${response.status}): ${error}`);
  }

  const data = await response.json();
  return { messageId: data.id };
}

// =============================================
// markGmailRead()
// =============================================

/**
 * Mark a Gmail message as read by removing the UNREAD label.
 * Called after successful email processing to prevent re-processing.
 *
 * @param accessToken - Decrypted OAuth access token
 * @param messageId   - Gmail message ID to mark as read
 */
export async function markGmailRead(
  accessToken: string,
  messageId: string,
): Promise<void> {
  const response = await fetch(`${GMAIL_API}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: {
      ...authHeader(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      removeLabelIds: ['UNREAD'],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    // Log but don't throw — marking read is non-critical
    console.error(`[gmail-client] Failed to mark message ${messageId} as read (${response.status}): ${error}`);
  }
}
