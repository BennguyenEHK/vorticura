// =============================================
// EMAIL PIPELINE - Reusable Email Processing
// =============================================
// Provider-agnostic email processing pipeline (extract → classify → dispatch)
// Provider-agnostic pipeline: MIME parse → dedup → classify → build payload → dispatch
// Used by both Gmail and Microsoft webhook handlers.
//
// Dataflow:
//   rawMessage (Buffer/JSON) → extractContent → checkDuplicate → extractAttachments
//   → classifyType → buildPayload → handleHTTPRequest → onSuccess → SSE emit
import './pdfjs-polyfill';
import { simpleParser, type ParsedMail, type Attachment } from 'mailparser';
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';

import { handleHTTPRequest } from '@/lib/data-processor';
import type { ProcessorInput, DataType, ActionType } from '@/lib/utils/validator';
import { modifyDatabase } from '@/lib/utils/databaseHandler';
import { eventBus } from '@/lib/event-bus';
import { getCount } from '@/lib/db/queries';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

// =============================================
// INTERFACES
// =============================================

/** Parsed email content after MIME extraction */
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

/** Raw attachment before content extraction */
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

/** Classification result for incoming_email routing — determines action_type */
export interface IncomingEmailClassification {
  actionType: 'handleRFQ' | 'handleSuppliersRespond' | 'handleUnknown'; // maps to incoming_email action_type
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/** Input shape for processEmailFromJSON() when provider returns structured JSON */
export interface EmailJSONInput {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  messageId: string;
  date: string; // ISO string
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
}

/** Pipeline result returned by processEmailMessage / processEmailFromJSON */
export interface PipelineResult {
  success: boolean;
  classification: IncomingEmailClassification;
  skipped?: boolean; // true if duplicate
  error?: string;
}

// =============================================
// extractEmailContent()
// =============================================

/**
 * Parse raw MIME message buffer into structured ExtractedEmail.
 * Uses mailparser.simpleParser for MIME decoding.
 */
export async function extractEmailContent(rawMessage: Buffer): Promise<ExtractedEmail> {
  const parsed: ParsedMail = await simpleParser(rawMessage);

  // Extract sender address and name
  const fromAddr = parsed.from?.value?.[0];

  // Flatten To addresses into string array
  const toAddrs = parsed.to
    ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
        .flatMap((addr) => addr.value.map((v) => v.address || ''))
    : [];

  // Flatten CC addresses into string array
  const ccAddrs = parsed.cc
    ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
        .flatMap((addr) => addr.value.map((v) => v.address || ''))
    : [];

  // Map raw attachments from mailparser format to our RawAttachment interface
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
// extractAttachmentContent()
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
        // Non-PDF, non-image: keep metadata, no text extraction
        results.push({
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          extractedText: '',
          thumbnailBase64: null,
        });
      }
    } catch (error) {
      console.error(`[email-pipeline] Attachment extraction failed for ${att.filename}:`, error);
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

/** Extract text from PDF using pdfjs-dist (capped at 50 pages) */
async function extractPdfContent(att: RawAttachment): Promise<ProcessedAttachment> {
  const uint8 = new Uint8Array(att.content);
  const doc: PDFDocumentProxy = await getDocument({ data: uint8 }).promise;

  const textParts: string[] = [];
  const pageCount = Math.min(doc.numPages, 50); // cap to prevent OOM

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
    thumbnailBase64: null, // PDF thumbnail skipped for simplicity
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
// classifyEmailType()
// =============================================

/** RFQ indicator patterns for subject lines (case-insensitive) */
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

/** RFQ indicator patterns for email body content */
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

/** RFQ indicator patterns for attachment filenames */
const RFQ_ATTACHMENT_PATTERNS = [
  /rfq/i,
  /quotation/i,
  /specification/i,
  /requirement/i,
  /tender/i,
  /bid/i,
];

/** Supplier response patterns for subject lines (typically replies to our inquiries) */
const SUPPLIER_RESPONSE_SUBJECT_PATTERNS = [
  /^(?:RE|FW|FWD):\s*.*/i,  // Reply/forward prefix (combined with body keywords)
];

/** Supplier response keywords in email body */
const SUPPLIER_RESPONSE_BODY_KEYWORDS = [
  /\bwe\s+(?:can|are\s+able\s+to)\s+(?:supply|provide|offer)\b/i,
  /\bunit\s+price\s*[:=]/i,
  /\blead\s+time\s*[:=]/i,
  /\bdelivery\s+(?:within|in)\s+\d+/i,
  /\bplease\s+find\s+(?:our|the|attached)\s+quotation\b/i,
  /\bin\s+stock\b/i,
  /\bout\s+of\s+stock\b/i,
  /\bavailab(?:le|ility)\b/i,
  /\bMOQ\b/i,
  /\bminimum\s+order\b/i,
];

/**
 * Rule-based email classifier.
 * Priority: RFQ patterns → supplier response patterns → default unknown
 *
 * Returns an IncomingEmailClassification with actionType for incoming_email routing.
 */
export function classifyEmailType(
  email: ExtractedEmail,
  attachments: ProcessedAttachment[]
): IncomingEmailClassification {
  // --- RFQ Detection ---

  // Check subject lines for RFQ patterns (highest confidence)
  for (const pattern of RFQ_SUBJECT_PATTERNS) {
    if (pattern.test(email.subject)) {
      return {
        actionType: 'handleRFQ',
        confidence: 'high',
        reason: `Subject matches RFQ pattern: ${pattern.source}`,
      };
    }
  }

  // Check body content for RFQ keywords (need 2+ matches for medium confidence)
  let rfqBodyMatchCount = 0;
  for (const keyword of RFQ_BODY_KEYWORDS) {
    if (keyword.test(email.textBody) || keyword.test(email.htmlBody)) {
      rfqBodyMatchCount++;
    }
  }
  if (rfqBodyMatchCount >= 2) {
    return {
      actionType: 'handleRFQ',
      confidence: 'medium',
      reason: `Body contains ${rfqBodyMatchCount} RFQ keywords`,
    };
  }

  // Check attachment filenames for RFQ patterns
  const allFilenames = attachments.map((a) => a.filename).join(' ');
  for (const pattern of RFQ_ATTACHMENT_PATTERNS) {
    if (pattern.test(allFilenames)) {
      return {
        actionType: 'handleRFQ',
        confidence: 'medium',
        reason: `Attachment filename matches RFQ pattern: ${pattern.source}`,
      };
    }
  }

  // Check attachment text content for RFQ keywords (need 3+ for low confidence)
  const attachmentText = attachments.map((a) => a.extractedText).join(' ');
  let attachmentMatchCount = 0;
  for (const keyword of RFQ_BODY_KEYWORDS) {
    if (keyword.test(attachmentText)) {
      attachmentMatchCount++;
    }
  }
  if (attachmentMatchCount >= 3) {
    return {
      actionType: 'handleRFQ',
      confidence: 'low',
      reason: `Attachment content contains ${attachmentMatchCount} RFQ keywords`,
    };
  }

  // --- Supplier Response Detection ---

  // Count supplier response keyword matches in body
  let supplierBodyMatchCount = 0;
  for (const keyword of SUPPLIER_RESPONSE_BODY_KEYWORDS) {
    if (keyword.test(email.textBody) || keyword.test(email.htmlBody)) {
      supplierBodyMatchCount++;
    }
  }

  // Subject has RE:/FW: prefix AND body has 2+ supplier keywords → high confidence
  const hasReplyPrefix = SUPPLIER_RESPONSE_SUBJECT_PATTERNS.some((p) => p.test(email.subject));
  if (hasReplyPrefix && supplierBodyMatchCount >= 2) {
    return {
      actionType: 'handleSuppliersRespond',
      confidence: 'high',
      reason: `Reply/forward subject with ${supplierBodyMatchCount} supplier response keywords in body`,
    };
  }

  // Body alone has 3+ supplier keywords → medium confidence
  if (supplierBodyMatchCount >= 3) {
    return {
      actionType: 'handleSuppliersRespond',
      confidence: 'medium',
      reason: `Body contains ${supplierBodyMatchCount} supplier response keywords (no reply prefix)`,
    };
  }

  // --- Default: Unknown ---
  return {
    actionType: 'handleUnknown',
    confidence: 'low',
    reason: 'No RFQ or supplier response indicators found',
  };
}

// =============================================
// checkDuplicateInDB()
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
    console.warn(`[email-pipeline] Duplicate check failed for messageId: ${messageId}, treating as non-duplicate`);
    return false;
  }
}

// =============================================
// buildIncomingEmailPayload()
// =============================================

/**
 * Build incoming_email ProcessorInput from extracted email data.
 * Always routes through incoming_email data_type — the processor handles downstream routing.
 * Follows JSON spec: value present → use value, absent → null
 */
export function buildIncomingEmailPayload(
  email: ExtractedEmail,
  attachments: ProcessedAttachment[],
  classification: IncomingEmailClassification,
  workspace: WorkspaceContext
): ProcessorInput {
  return {
    data_type: 'incoming_email',
    action_type: classification.actionType,
    workspace,
    incoming_email: {
      message_id: email.messageId,
      from_email: email.from || null,
      from_name: email.fromName || null,
      to: email.to.length > 0 ? email.to : [],
      cc: email.cc.length > 0 ? email.cc : [],
      subject: email.subject,
      email_body_text: email.textBody || email.htmlBody || '',
      attachments_parsed: attachments.map((a) => ({
        filename: a.filename,
        content_type: a.contentType,
        extracted_text: a.extractedText || '',
      })),
      received_at: email.date.toISOString(),
    },
    // Classification metadata (index signature allows extra fields)
    classification_confidence: classification.confidence,
    classification_reason: classification.reason,
  } as ProcessorInput;
}

/** Combine email body + attachment text into a single analysis string */
export function buildAnalysisContent(
  email: ExtractedEmail,
  attachments: ProcessedAttachment[]
): string {
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
export function extractRfqReference(subject: string): string | null {
  // Match patterns like RFQ-2024-001, RFQ#123, RFQ 456, Q-2024-001
  const match = subject.match(/(?:RFQ|Q|REF|PO|PR)[- #]?\d{1,}[-\d]*/i);
  return match ? match[0].toUpperCase() : null;
}

// =============================================
// dispatchToProcessor() — IMAP-free version
// =============================================

/**
 * Send assembled payload to handleHTTPRequest() and emit SSE event.
 * Unlike the IMAP version, this does NOT mark emails as read —
 * each webhook handler manages "mark as read" via its provider's API
 * through the onSuccess callback.
 */
async function dispatchToProcessor(
  payload: ProcessorInput,
): Promise<boolean> {
  try {
    const result = await handleHTTPRequest(payload);

    if (result.success) {
      // Emit SSE event for real-time UI updates
      eventBus.emit('comms-update', {
        type: 'new-email-processed',
        dataType: payload.data_type,
        actionType: payload.action_type,
        subject: (payload.incoming_email as any)?.subject ?? (payload as any).email_subject,
        from: (payload.incoming_email as any)?.from_email ?? (payload as any).email_from,
        timestamp: new Date().toISOString(),
        processorResult: {
          success: result.success,
          sessionId: result.session_id,
          processingTime: result.processing_time_ms,
        },
      });
      return true;
    }

    console.error(`[email-pipeline] Processor returned error:`, result.error);
    return false;
  } catch (error) {
    console.error(`[email-pipeline] dispatchToProcessor failed:`, error);
    return false;
  }
}

// =============================================
// PIPELINE ORCHESTRATORS
// =============================================

/**
 * Unified pipeline entry point for raw MIME messages.
 * Used by Gmail (raw format) and Microsoft (MIME $value format) webhook handlers.
 *
 * @param rawMessage - Raw MIME email as Buffer
 * @param workspace  - Tenant context for DB operations
 * @param options    - Optional callbacks (onSuccess called after successful processing)
 */
export async function processEmailMessage(
  rawMessage: Buffer,
  workspace: WorkspaceContext,
  options?: { onSuccess?: () => Promise<void> }
): Promise<PipelineResult> {
  try {
    // Step 1: Parse raw MIME into structured email
    const email = await extractEmailContent(rawMessage);

    // Step 2: Check for duplicates before doing expensive extraction
    const isDuplicate = await checkDuplicateInDB(email.messageId, workspace);
    if (isDuplicate) {
      console.log(`[email-pipeline] Duplicate messageId: ${email.messageId}, skipping`);
      return {
        success: true,
        skipped: true,
        classification: { actionType: 'handleUnknown', confidence: 'low', reason: 'duplicate' },
      };
    }

    // Step 3: Extract attachment content (PDF text, image thumbnails)
    const processedAttachments = await extractAttachmentContent(email.rawAttachments);

    // Step 4: Classify email type
    const classification = classifyEmailType(email, processedAttachments);
    console.log(`[email-pipeline] Classified: ${classification.actionType} (${classification.confidence})`);

    // Step 5: Build processor payload
    const payload = buildIncomingEmailPayload(email, processedAttachments, classification, workspace);

    // Step 5.5: Persist raw email to incoming_emails table (before dispatch)
    try {
      await modifyDatabase({
        data_type: 'incoming_email',
        incoming_email: {
          ...(payload.incoming_email as unknown as Record<string, unknown>),
          classification_type: classification.actionType,
          classification_confidence: classification.confidence,
          processed_at: new Date().toISOString(),
        },
      }, workspace);
    } catch (dbError) {
      // Log but continue — email data is still in the payload for processing
      console.error('[email-pipeline] Failed to persist incoming email:', dbError);
    }

    // Step 6: Dispatch to data processor (handleHTTPRequest)
    const success = await dispatchToProcessor(payload);

    // Step 7: Call provider-specific success callback (e.g., mark as read)
    if (success) {
      await options?.onSuccess?.();
    }

    return { success, classification };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown pipeline error';
    console.error(`[email-pipeline] processEmailMessage failed:`, message);
    return {
      success: false,
      classification: { actionType: 'handleUnknown', confidence: 'low', reason: 'pipeline_error' },
      error: message,
    };
  }
}

/**
 * Pipeline entry point for pre-parsed JSON email data.
 * Used by Gmail (full format) when raw MIME is not available.
 * Skips MIME parsing and builds ExtractedEmail directly from structured data.
 *
 * @param emailData - Structured email data from provider API
 * @param workspace - Tenant context for DB operations
 * @param options   - Optional callbacks (onSuccess called after successful processing)
 */
export async function processEmailFromJSON(
  emailData: EmailJSONInput,
  workspace: WorkspaceContext,
  options?: { onSuccess?: () => Promise<void> }
): Promise<PipelineResult> {
  try {
    // Build ExtractedEmail directly from JSON (no MIME parsing needed)
    const email: ExtractedEmail = {
      messageId: emailData.messageId,
      from: emailData.from,
      fromName: emailData.fromName || '',
      to: emailData.to,
      cc: emailData.cc || [],
      subject: emailData.subject,
      textBody: emailData.body,
      htmlBody: emailData.htmlBody || '',
      date: new Date(emailData.date),
      rawAttachments: (emailData.attachments || []).map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        content: a.content,
      })),
    };

    // Step 2: Check for duplicates
    const isDuplicate = await checkDuplicateInDB(email.messageId, workspace);
    if (isDuplicate) {
      console.log(`[email-pipeline] Duplicate messageId: ${email.messageId}, skipping`);
      return {
        success: true,
        skipped: true,
        classification: { actionType: 'handleUnknown', confidence: 'low', reason: 'duplicate' },
      };
    }

    // Step 3: Extract attachment content
    const processedAttachments = await extractAttachmentContent(email.rawAttachments);

    // Step 4: Classify email type
    const classification = classifyEmailType(email, processedAttachments);
    console.log(`[email-pipeline] Classified (JSON): ${classification.actionType} (${classification.confidence})`);

    // Step 5: Build processor payload
    const payload = buildIncomingEmailPayload(email, processedAttachments, classification, workspace);

    // Step 5.5: Persist raw email to incoming_emails table (before dispatch)
    try {
      await modifyDatabase({
        data_type: 'incoming_email',
        incoming_email: {
          ...(payload.incoming_email as unknown as Record<string, unknown>),
          classification_type: classification.actionType,
          classification_confidence: classification.confidence,
          processed_at: new Date().toISOString(),
        },
      }, workspace);
    } catch (dbError) {
      // Log but continue — email data is still in the payload for processing
      console.error('[email-pipeline] Failed to persist incoming email:', dbError);
    }

    // Step 6: Dispatch to data processor
    const success = await dispatchToProcessor(payload);

    // Step 7: Call provider-specific success callback
    if (success) {
      await options?.onSuccess?.();
    }

    return { success, classification };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown pipeline error';
    console.error(`[email-pipeline] processEmailFromJSON failed:`, message);
    return {
      success: false,
      classification: { actionType: 'handleUnknown', confidence: 'low', reason: 'pipeline_error' },
      error: message,
    };
  }
}
