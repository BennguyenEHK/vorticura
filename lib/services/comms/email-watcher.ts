// =============================================
// EMAIL WATCHER SERVICE - IMAP Real-Time Listener
// =============================================
// @deprecated Use lib/services/email/email-pipeline.ts + webhook handlers instead.
// This IMAP-based watcher is kept as fallback for self-hosted deployments
// that cannot use OAuth webhooks. Will be removed in v2.
//
// Pipeline functions (extractEmailContent, classifyEmailType, etc.) have been
// extracted to email-pipeline.ts — this file re-exports them for backward compat.
//
// Singleton via globalThis (survives HMR in dev, same pattern as event-bus.ts)
//
// Dataflow (DEPRECATED):
//   IMAP Mailbox → fetchMessage → extractContent → extractAttachments
//   → classifyType → checkDuplicate → buildPayload → dispatchToProcessor
//   → mark \Seen on success → eventBus.emit('comms-update')

import { ImapFlow } from 'imapflow';

import { handleHTTPRequest } from '@/lib/data-processor';
import type { ProcessorInput } from '@/lib/utils/validator';
import { eventBus } from '@/lib/event-bus';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

// Import pipeline functions for use by the IMAP EmailWatcher class
import {
  extractEmailContent,
  extractAttachmentContent,
  classifyEmailType,
  checkDuplicateInDB,
  buildProcessorPayload,
} from '@/lib/services/email/email-pipeline';

// =============================================
// RE-EXPORTS FROM EMAIL PIPELINE
// =============================================
// Pipeline functions extracted to email-pipeline.ts for reuse by webhook handlers.
// Re-exported here for backward compatibility with existing imports.
export {
  extractEmailContent,
  extractAttachmentContent,
  classifyEmailType,
  checkDuplicateInDB,
  buildProcessorPayload,
  buildAnalysisContent,
  extractRfqReference,
  processEmailMessage,
  processEmailFromJSON,
} from '@/lib/services/email/email-pipeline';

export type {
  ExtractedEmail,
  RawAttachment,
  ProcessedAttachment,
  ClassificationResult,
  EmailJSONInput,
  PipelineResult,
} from '@/lib/services/email/email-pipeline';

// =============================================
// 1. CONFIGURATION (IMAP-SPECIFIC, DEPRECATED)
// =============================================

/** @deprecated IMAP + watcher runtime configuration — use OAuth webhooks instead */
export interface EmailWatcherConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  mailbox: string;
  pollInterval: number;       // ms — fallback poll cycle after reconnect
  maxReconnectDelay: number;  // ms — exponential backoff cap
  companyId: number;          // system workspace company
  clientId: number;           // system workspace client
}

/**
 * @deprecated IMAP-specific config loader — use OAuth webhooks instead.
 * Load configuration from environment variables.
 * Throws if required IMAP credentials are missing.
 */
export function loadConfig(): EmailWatcherConfig {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      'Email watcher requires IMAP_HOST, IMAP_USER, and IMAP_PASS environment variables'
    );
  }

  return {
    host,
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    secure: process.env.IMAP_SECURE !== 'false',
    auth: { user, pass },
    mailbox: process.env.IMAP_MAILBOX || 'INBOX',
    pollInterval: parseInt(process.env.IMAP_POLL_INTERVAL || '60000', 10),
    maxReconnectDelay: parseInt(process.env.IMAP_MAX_RECONNECT_DELAY || '300000', 10),
    companyId: parseInt(process.env.EMAIL_WATCHER_COMPANY_ID || '1', 10),
    clientId: parseInt(process.env.EMAIL_WATCHER_CLIENT_ID || '1', 10),
  };
}

// =============================================
// 2. IMAP-SPECIFIC INTERFACES
// =============================================

/** Watcher runtime statistics (IMAP-specific) */
export interface WatcherStats {
  status: 'stopped' | 'connecting' | 'watching' | 'error';
  processedCount: number;
  errorCount: number;
  lastProcessedAt: Date | null;
  lastErrorMessage: string | null;
  startedAt: Date | null;
  uptime: number; // ms
}

// =============================================
// 3. IMAP dispatchToProcessor() — uses client.messageFlagsAdd()
// =============================================

/**
 * @deprecated IMAP-specific dispatch — webhook handlers use email-pipeline.ts dispatch instead.
 * Send assembled payload to handleHTTPRequest() and handle results.
 * On success: marks email \Seen, emits SSE event.
 * On failure: logs error, does NOT mark \Seen (email will be retried).
 */
async function dispatchToProcessor(
  payload: ProcessorInput,
  uid: number,
  client: ImapFlow,
  mailbox: string
): Promise<boolean> {
  try {
    const result = await handleHTTPRequest(payload);

    if (result.success) {
      // Mark the email as \Seen in IMAP
      try {
        await client.messageFlagsAdd({ uid: uid.toString() }, ['\\Seen'], { uid: true });
      } catch (flagError) {
        console.warn(`[email-watcher] Failed to mark uid ${uid} as Seen:`, flagError);
      }

      // Emit SSE event for real-time UI updates
      eventBus.emit('comms-update', {
        type: 'new-email-processed',
        dataType: payload.data_type,
        subject: payload.email_subject,
        from: payload.email_from,
        timestamp: new Date().toISOString(),
        processorResult: {
          success: result.success,
          sessionId: result.session_id,
          processingTime: result.processing_time_ms,
        },
      });

      return true;
    }

    console.error(`[email-watcher] Processor returned error for uid ${uid}:`, result.error);
    return false;
  } catch (error) {
    console.error(`[email-watcher] dispatchToProcessor failed for uid ${uid}:`, error);
    return false;
  }
}

// =============================================
// 9. EmailWatcher CLASS (Singleton) — DEPRECATED
// =============================================

/** @deprecated Use OAuth webhook handlers instead. Kept for self-hosted IMAP fallback. */
export class EmailWatcher {
  private client: ImapFlow | null = null;
  private config: EmailWatcherConfig;
  private workspace: WorkspaceContext;
  private running = false;
  private reconnectAttempts = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  // Stats
  private _stats: WatcherStats = {
    status: 'stopped',
    processedCount: 0,
    errorCount: 0,
    lastProcessedAt: null,
    lastErrorMessage: null,
    startedAt: null,
    uptime: 0,
  };

  constructor(config: EmailWatcherConfig) {
    this.config = config;
    this.workspace = new WorkspaceContext({
      client_id: config.clientId,
      company_id: config.companyId,
      username: 'email-watcher',
      role: 'admin',
    });
  }

  /** Get current watcher statistics */
  get stats(): WatcherStats {
    return {
      ...this._stats,
      uptime: this._stats.startedAt
        ? Date.now() - this._stats.startedAt.getTime()
        : 0,
    };
  }

  /** Start the IMAP watcher */
  async start(): Promise<void> {
    if (this.running) {
      console.log('[email-watcher] Already running, skipping start');
      return;
    }

    this.running = true;
    this._stats.status = 'connecting';
    this._stats.startedAt = new Date();
    this.reconnectAttempts = 0;

    console.log(`[email-watcher] Starting — connecting to ${this.config.host}:${this.config.port}`);
    await this.connectAndWatch();
  }

  /** Stop the IMAP watcher gracefully */
  async stop(): Promise<void> {
    this.running = false;
    this._stats.status = 'stopped';

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // Ignore logout errors during shutdown
      }
      this.client = null;
    }

    console.log('[email-watcher] Stopped');
  }

  /** Connect to IMAP server and enter IDLE loop */
  private async connectAndWatch(): Promise<void> {
    if (!this.running) return;

    try {
      this.client = new ImapFlow({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.auth,
        logger: false,
      });

      await this.client.connect();
      this._stats.status = 'watching';
      this.reconnectAttempts = 0;
      console.log(`[email-watcher] Connected, opening mailbox: ${this.config.mailbox}`);

      // Open the mailbox
      await this.client.mailboxOpen(this.config.mailbox);

      // Listen for new mail via IDLE
      this.client.on('exists', async (data: { count?: number; prevCount?: number }) => {
        if (!this.running) return;
        console.log(`[email-watcher] New mail event — mailbox count: ${data.count}`);
        await this.processNewMessages();
      });

      // Handle connection close for reconnect
      this.client.on('close', () => {
        if (this.running) {
          console.log('[email-watcher] Connection closed, scheduling reconnect...');
          this._stats.status = 'connecting';
          this.scheduleReconnect();
        }
      });

      this.client.on('error', (err: Error) => {
        console.error('[email-watcher] IMAP error:', err.message);
        this._stats.lastErrorMessage = err.message;
        this._stats.status = 'error';
      });

      // Process any unseen messages on initial connect
      await this.processNewMessages();

      // Enter IDLE mode — ImapFlow handles this natively
      // The 'exists' event fires when new mail arrives during IDLE

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown connection error';
      console.error(`[email-watcher] Connection failed:`, message);
      this._stats.status = 'error';
      this._stats.lastErrorMessage = message;

      if (this.running) {
        this.scheduleReconnect();
      }
    }
  }

  /** Process all unseen messages in the mailbox */
  private async processNewMessages(): Promise<void> {
    if (!this.client || !this.running) return;

    try {
      // Search for UNSEEN messages
      const lock = await this.client.getMailboxLock(this.config.mailbox);
      try {
        const uids: number[] = [];
        // Collect unseen UIDs
        for await (const msg of this.client.fetch({ seen: false }, { uid: true })) {
          uids.push(msg.uid);
        }

        // Process each message individually
        for (const uid of uids) {
          if (!this.running) break;
          await this.onNewMail(uid);
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      console.error('[email-watcher] processNewMessages failed:', error);
    }
  }

  /** Core handler for a single new mail message */
  private async onNewMail(uid: number): Promise<void> {
    console.log(`[email-watcher] Processing uid: ${uid}`);

    try {
      // Step 1: Fetch the raw message
      const rawMessage = await this.fetchMessage(uid);
      if (!rawMessage) {
        console.warn(`[email-watcher] Could not fetch uid ${uid}, skipping`);
        return;
      }

      // Step 2: Extract email content
      const email = await extractEmailContent(rawMessage);

      // Step 3: Check for duplicates
      const isDuplicate = await checkDuplicateInDB(email.messageId, this.workspace);
      if (isDuplicate) {
        console.log(`[email-watcher] Duplicate messageId: ${email.messageId}, marking seen`);
        try {
          await this.client!.messageFlagsAdd({ uid: uid.toString() }, ['\\Seen'], { uid: true });
        } catch {
          // Ignore flag errors for duplicates
        }
        return;
      }

      // Step 4: Extract attachment content
      const processedAttachments = await extractAttachmentContent(email.rawAttachments);

      // Step 5: Classify email type
      const classification = classifyEmailType(email, processedAttachments);
      console.log(`[email-watcher] Classified uid ${uid}: ${classification.dataType}/${classification.actionType} (${classification.confidence})`);

      // Step 6: Build processor payload
      const payload = buildProcessorPayload(email, processedAttachments, classification, this.workspace);

      // Step 7: Dispatch to processor pipeline
      const success = await dispatchToProcessor(payload, uid, this.client!, this.config.mailbox);

      if (success) {
        this._stats.processedCount++;
        this._stats.lastProcessedAt = new Date();
        console.log(`[email-watcher] Successfully processed uid ${uid}`);
      } else {
        this._stats.errorCount++;
        console.error(`[email-watcher] Failed to process uid ${uid}`);
      }
    } catch (error) {
      this._stats.errorCount++;
      this._stats.lastErrorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[email-watcher] onNewMail failed for uid ${uid}:`, error);
    }
  }

  /** Fetch raw message bytes by UID */
  private async fetchMessage(uid: number): Promise<Buffer | null> {
    if (!this.client) return null;

    try {
      const download = await this.client.download(uid.toString(), undefined, { uid: true });
      const chunks: Buffer[] = [];
      for await (const chunk of download.content) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      console.error(`[email-watcher] fetchMessage failed for uid ${uid}:`, error);
      return null;
    }
  }

  /** Schedule a reconnect with exponential backoff */
  private scheduleReconnect(): void {
    if (!this.running) return;

    this.reconnectAttempts++;
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelay
    );

    console.log(`[email-watcher] Reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.pollTimer = setTimeout(async () => {
      if (this.running) {
        await this.connectAndWatch();
      }
    }, delay);
  }
}

// =============================================
// SINGLETON VIA globalThis (survives HMR)
// =============================================

const globalForWatcher = globalThis as unknown as {
  emailWatcher: EmailWatcher | undefined;
};

/**
 * @deprecated Use OAuth webhook handlers instead.
 * Get the singleton EmailWatcher instance.
 * Creates a new instance on first call (lazy initialization).
 * Returns the existing instance on subsequent calls.
 */
export function getEmailWatcher(): EmailWatcher {
  if (!globalForWatcher.emailWatcher) {
    const config = loadConfig();
    globalForWatcher.emailWatcher = new EmailWatcher(config);
  }
  return globalForWatcher.emailWatcher;
}

/**
 * @deprecated Use OAuth webhook handlers instead.
 * Check if the email watcher singleton exists without creating it.
 * Useful for status checks before configuration is available.
 */
export function hasEmailWatcher(): boolean {
  return !!globalForWatcher.emailWatcher;
}
