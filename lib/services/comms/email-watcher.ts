// =============================================
// EMAIL WATCHER SERVICE - IMAP Real-Time Listener
// =============================================
// Long-running IMAP listener that watches a mailbox for incoming emails,
// extracts content + attachments, classifies each email, checks for
// duplicates, and forwards the payload to handleHTTPRequest().
//
// Singleton via globalThis (survives HMR in dev, same pattern as event-bus.ts)
//
// Dataflow:
//   IMAP Mailbox → fetchMessage → extractContent → extractAttachments
//   → classifyType → checkDuplicate → buildPayload → dispatchToProcessor
//   → mark \Seen on success → eventBus.emit('comms-update')

import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail, type Attachment } from 'mailparser';
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';

import { handleHTTPRequest } from '@/lib/data-processor';
import type { ProcessorInput, DataType, ActionType } from '@/lib/utils/validator';
import { eventBus } from '@/lib/event-bus';
import { getData, getCount } from '@/lib/db/queries';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

// =============================================
// 1. CONFIGURATION
// =============================================

/** IMAP + watcher runtime configuration */
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
// 2. INTERFACES
// =============================================

/** Parsed email content after mailparser extraction */
export interface ExtractedEmail {
  messageId: string;
  from: string;
  fromName: string;
  to: string[];
  cc: string[];
  subject: string;
  textBody: string;
  htmlBody: string;
  date: Date;
  rawAttachments: RawAttachment[];
}

/** Raw attachment from mailparser before content extraction */
export interface RawAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
}

/** Attachment after PDF/image content extraction */
export interface ProcessedAttachment {
  filename: string;
  contentType: string;
  size: number;
  extractedText: string;
  thumbnailBase64: string | null;
}

/** Result of email classification */
export interface ClassificationResult {
  dataType: DataType;
  actionType: ActionType;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/** Watcher runtime statistics */
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
// 3. extractEmailContent()
// =============================================

/**
 * Parse raw IMAP message buffer into structured ExtractedEmail.
 * Uses mailparser.simpleParser for MIME decoding.
 */
export async function extractEmailContent(rawMessage: Buffer): Promise<ExtractedEmail> {
  const parsed: ParsedMail = await simpleParser(rawMessage);

  const fromAddr = parsed.from?.value?.[0];
  const toAddrs = parsed.to
    ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
        .flatMap((addr) => addr.value.map((v) => v.address || ''))
    : [];
  const ccAddrs = parsed.cc
    ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
        .flatMap((addr) => addr.value.map((v) => v.address || ''))
    : [];

  const rawAttachments: RawAttachment[] = (parsed.attachments || []).map(
    (att: Attachment) => ({
      filename: att.filename || 'unnamed',
      contentType: att.contentType,
      size: att.size,
      content: att.content,
    })
  );

  return {
    messageId: parsed.messageId || `no-id-${Date.now()}`,
    from: fromAddr?.address || '',
    fromName: fromAddr?.name || '',
    to: toAddrs,
    cc: ccAddrs,
    subject: parsed.subject || '(no subject)',
    textBody: parsed.text || '',
    htmlBody: parsed.html || '',
    date: parsed.date || new Date(),
    rawAttachments,
  };
}

// =============================================
// 4. extractAttachmentContent()
// =============================================

/**
 * Extract text and thumbnail from attachments.
 * - PDF → text via pdfjs-dist, first-page thumbnail via sharp
 * - Images → resize thumbnail via sharp
 * - Others → skip content extraction
 *
 * Failures are isolated per-attachment (marked [extraction_failed]).
 */
export async function extractAttachmentContent(
  attachments: RawAttachment[]
): Promise<ProcessedAttachment[]> {
  const results: ProcessedAttachment[] = [];

  for (const att of attachments) {
    try {
      if (att.contentType === 'application/pdf') {
        results.push(await extractPdfContent(att));
      } else if (att.contentType.startsWith('image/')) {
        results.push(await extractImageContent(att));
      } else {
        results.push({
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          extractedText: '',
          thumbnailBase64: null,
        });
      }
    } catch (error) {
      console.error(`[email-watcher] Attachment extraction failed for ${att.filename}:`, error);
      results.push({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        extractedText: '[extraction_failed]',
        thumbnailBase64: null,
      });
    }
  }

  return results;
}

/** Extract text from PDF using pdfjs-dist */
async function extractPdfContent(att: RawAttachment): Promise<ProcessedAttachment> {
  const uint8 = new Uint8Array(att.content);
  const doc: PDFDocumentProxy = await getDocument({ data: uint8 }).promise;

  const textParts: string[] = [];
  const pageCount = Math.min(doc.numPages, 50); // cap at 50 pages

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');
    textParts.push(pageText);
  }

  return {
    filename: att.filename,
    contentType: att.contentType,
    size: att.size,
    extractedText: textParts.join('\n\n'),
    thumbnailBase64: null, // PDF thumbnail generation skipped for simplicity
  };
}

/** Resize image and encode as base64 thumbnail via sharp */
async function extractImageContent(att: RawAttachment): Promise<ProcessedAttachment> {
  const thumbnail = await sharp(att.content)
    .resize(200, 200, { fit: 'inside' })
    .jpeg({ quality: 70 })
    .toBuffer();

  return {
    filename: att.filename,
    contentType: att.contentType,
    size: att.size,
    extractedText: '',
    thumbnailBase64: thumbnail.toString('base64'),
  };
}

// =============================================
// 5. classifyEmailType()
// =============================================

/** RFQ indicator patterns (case-insensitive) */
const RFQ_SUBJECT_PATTERNS = [
  /\brfq\b/i,
  /\brequest\s+for\s+quotation\b/i,
  /\brequest\s+for\s+quote\b/i,
  /\bquotation\s+request\b/i,
  /\bprice\s+inquiry\b/i,
  /\binquiry\b/i,
  /\bbid\s+request\b/i,
  /\btender\b/i,
];

const RFQ_BODY_KEYWORDS = [
  /\bplease\s+quote\b/i,
  /\bprovide\s+(?:a\s+)?quotation\b/i,
  /\bunit\s+price\b/i,
  /\bdelivery\s+time\b/i,
  /\blead\s+time\b/i,
  /\bprocure\b/i,
  /\bprocurement\b/i,
  /\bspecification\b/i,
  /\bquantity\b/i,
];

const RFQ_ATTACHMENT_PATTERNS = [
  /rfq/i,
  /quotation/i,
  /specification/i,
  /requirement/i,
  /tender/i,
  /bid/i,
];

/**
 * Rule-based email classifier.
 * Priority: subject patterns → body keywords → attachment filenames → default 'email'
 */
export function classifyEmailType(email: ExtractedEmail, attachments: ProcessedAttachment[]): ClassificationResult {
  // Check subject lines
  for (const pattern of RFQ_SUBJECT_PATTERNS) {
    if (pattern.test(email.subject)) {
      return {
        dataType: 'rfq_analysis',
        actionType: 'analyze',
        confidence: 'high',
        reason: `Subject matches RFQ pattern: ${pattern.source}`,
      };
    }
  }

  // Check body content
  let bodyMatchCount = 0;
  for (const keyword of RFQ_BODY_KEYWORDS) {
    if (keyword.test(email.textBody) || keyword.test(email.htmlBody)) {
      bodyMatchCount++;
    }
  }
  if (bodyMatchCount >= 2) {
    return {
      dataType: 'rfq_analysis',
      actionType: 'analyze',
      confidence: 'medium',
      reason: `Body contains ${bodyMatchCount} RFQ keywords`,
    };
  }

  // Check attachment filenames
  const allFilenames = attachments.map((a) => a.filename).join(' ');
  for (const pattern of RFQ_ATTACHMENT_PATTERNS) {
    if (pattern.test(allFilenames)) {
      return {
        dataType: 'rfq_analysis',
        actionType: 'analyze',
        confidence: 'medium',
        reason: `Attachment filename matches RFQ pattern: ${pattern.source}`,
      };
    }
  }

  // Check if attachment text content has RFQ indicators
  const attachmentText = attachments.map((a) => a.extractedText).join(' ');
  let attachmentMatchCount = 0;
  for (const keyword of RFQ_BODY_KEYWORDS) {
    if (keyword.test(attachmentText)) {
      attachmentMatchCount++;
    }
  }
  if (attachmentMatchCount >= 3) {
    return {
      dataType: 'rfq_analysis',
      actionType: 'analyze',
      confidence: 'low',
      reason: `Attachment content contains ${attachmentMatchCount} RFQ keywords`,
    };
  }

  // Default: general email
  return {
    dataType: 'email',
    actionType: 'generate',
    confidence: 'low',
    reason: 'No RFQ indicators found, classified as general email',
  };
}

// =============================================
// 6. checkDuplicateInDB()
// =============================================

/**
 * Check if this email (by messageId) has already been processed.
 * Uses getCount() for efficient check without loading rows.
 */
export async function checkDuplicateInDB(
  messageId: string,
  workspace: WorkspaceContext
): Promise<boolean> {
  try {
    const count = await getCount(
      'emailTable',
      { message_id: messageId },
      workspace
    );
    return count > 0;
  } catch {
    // If the column doesn't exist yet or query fails, treat as non-duplicate
    // to avoid blocking email processing during schema evolution
    console.warn(`[email-watcher] Duplicate check failed for messageId: ${messageId}, treating as non-duplicate`);
    return false;
  }
}

// =============================================
// 7. buildProcessorPayload()
// =============================================

/**
 * Assemble a ProcessorInput payload from extracted email data.
 * Routes to either 'rfq_analysis' or 'email' processor pipeline.
 */
export function buildProcessorPayload(
  email: ExtractedEmail,
  attachments: ProcessedAttachment[],
  classification: ClassificationResult,
  workspace: WorkspaceContext
): ProcessorInput {
  const basePayload = {
    data_type: classification.dataType,
    action_type: classification.actionType,
    workspace,
    // Email metadata carried as extra fields (index signature allows this)
    email_message_id: email.messageId,
    email_from: email.from,
    email_from_name: email.fromName,
    email_to: email.to,
    email_cc: email.cc,
    email_date: email.date.toISOString(),
    email_subject: email.subject,
    classification_confidence: classification.confidence,
    classification_reason: classification.reason,
    attachment_count: attachments.length,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      extractedText: a.extractedText,
      hasThumbnail: !!a.thumbnailBase64,
    })),
  };

  if (classification.dataType === 'rfq_analysis') {
    return {
      ...basePayload,
      // rfq_analysis processor expects analysis object
      analysis: {
        subject: email.subject,
        analysis_content: buildAnalysisContent(email, attachments),
      },
      // Use subject as rfq_reference placeholder until analysis extracts the real one
      rfq_reference: extractRfqReference(email.subject) || `EMAIL-${Date.now()}`,
      quotation_id: 0, // Will be created by the analysis processor
    } as ProcessorInput;
  }

  // Default: email data_type
  return {
    ...basePayload,
    email: {
      recipient_email: email.from,
      subject: `RE: ${email.subject}`,
      email_content: email.textBody || email.htmlBody,
    },
    rfq_reference: extractRfqReference(email.subject) || `EMAIL-${Date.now()}`,
    quotation_id: 0,
  } as ProcessorInput;
}

/** Combine email body + attachment text for analysis */
function buildAnalysisContent(email: ExtractedEmail, attachments: ProcessedAttachment[]): string {
  const parts: string[] = [];

  if (email.textBody) {
    parts.push('--- EMAIL BODY ---');
    parts.push(email.textBody);
  }

  for (const att of attachments) {
    if (att.extractedText && att.extractedText !== '[extraction_failed]') {
      parts.push(`--- ATTACHMENT: ${att.filename} ---`);
      parts.push(att.extractedText);
    }
  }

  return parts.join('\n\n');
}

/** Try to extract an RFQ reference number from the subject line */
function extractRfqReference(subject: string): string | null {
  // Match patterns like RFQ-2024-001, RFQ#123, RFQ 456, Q-2024-001
  const match = subject.match(/(?:RFQ|Q|REF|PO|PR)[- #]?\d{1,}[-\d]*/i);
  return match ? match[0].toUpperCase() : null;
}

// =============================================
// 8. dispatchToProcessor()
// =============================================

/**
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
// 9. EmailWatcher CLASS (Singleton)
// =============================================

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
 * Check if the email watcher singleton exists without creating it.
 * Useful for status checks before configuration is available.
 */
export function hasEmailWatcher(): boolean {
  return !!globalForWatcher.emailWatcher;
}
