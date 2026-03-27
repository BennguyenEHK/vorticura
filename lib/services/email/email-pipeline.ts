// =============================================
// EMAIL PIPELINE - Reusable Email Processing
// =============================================
// Extracted from lib/services/comms/email-watcher.ts
// Provider-agnostic pipeline: MIME parse → dedup → classify → build payload → dispatch
// Used by both Gmail and Microsoft webhook handlers.
//
// Dataflow:
//   rawMessage (Buffer/JSON) → extractContent → checkDuplicate → extractAttachments
//   → classifyType → buildPayload → handleHTTPRequest → onSuccess → SSE emit

import { simpleParser, type ParsedMail, type Attachment } from 'mailparser';
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';

import { handleHTTPRequest } from '@/lib/data-processor';
import type { ProcessorInput, DataType, ActionType } from '@/lib/utils/validator';
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

/** Result of email classification */
export interface ClassificationResult {
  dataType: DataType;
  actionType: ActionType;
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
  classification: ClassificationResult;
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

/**
 * Rule-based email classifier.
 * Priority: subject patterns → body keywords → attachment filenames → default 'email'
 */
export function classifyEmailType(
  email: ExtractedEmail,
  attachments: ProcessedAttachment[]
): ClassificationResult {
  // Check subject lines for RFQ patterns (highest confidence)
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

  // Check body content for RFQ keywords (need 2+ matches for medium confidence)
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

  // Check attachment filenames for RFQ patterns
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
      dataType: 'rfq_analysis',
      actionType: 'analyze',
      confidence: 'low',
      reason: `Attachment content contains ${attachmentMatchCount} RFQ keywords`,
    };
  }

  // Default: classify as general email
  return {
    dataType: 'email',
    actionType: 'generate',
    confidence: 'low',
    reason: 'No RFQ indicators found, classified as general email',
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
// buildProcessorPayload()
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
      // rfq_analysis processor expects analysis object with content
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
        subject: (payload as any).email_subject,
        from: (payload as any).email_from,
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
        classification: { dataType: 'email', actionType: 'generate', confidence: 'low', reason: 'duplicate' },
      };
    }

    // Step 3: Extract attachment content (PDF text, image thumbnails)
    const processedAttachments = await extractAttachmentContent(email.rawAttachments);

    // Step 4: Classify email type (RFQ vs general)
    const classification = classifyEmailType(email, processedAttachments);
    console.log(`[email-pipeline] Classified: ${classification.dataType}/${classification.actionType} (${classification.confidence})`);

    // Step 5: Build processor payload
    const payload = buildProcessorPayload(email, processedAttachments, classification, workspace);

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
      classification: { dataType: 'email', actionType: 'generate', confidence: 'low', reason: 'pipeline_error' },
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
        classification: { dataType: 'email', actionType: 'generate', confidence: 'low', reason: 'duplicate' },
      };
    }

    // Step 3: Extract attachment content
    const processedAttachments = await extractAttachmentContent(email.rawAttachments);

    // Step 4: Classify email type
    const classification = classifyEmailType(email, processedAttachments);
    console.log(`[email-pipeline] Classified (JSON): ${classification.dataType}/${classification.actionType} (${classification.confidence})`);

    // Step 5: Build processor payload
    const payload = buildProcessorPayload(email, processedAttachments, classification, workspace);

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
      classification: { dataType: 'email', actionType: 'generate', confidence: 'low', reason: 'pipeline_error' },
      error: message,
    };
  }
}
