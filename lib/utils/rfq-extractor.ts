// =============================================
// RFQ EXTRACTOR — Deterministic pattern-based extraction
// =============================================
// Pure functions, no side effects. Extracts structured fields from incoming
// emails using regex patterns — no AI needed for these deterministic fields.
// Used by: analysis-actions.ts (Pass 1 of two-pass extraction)

// =============================================
// Types
// =============================================

/** Fields extracted from email headers (zero-ambiguity contact data) */
export interface PartialCustomer {
  email: string;
  attention_person: string;
  carbon_copy_person: string[];
  phone: string;
  fax_number: string;
  // company_name and customer_address left to AI (unstructured)
}

/** Single extracted RFQ line item from tabular text */
export interface ExtractedItem {
  item_id: number;
  company_description: string;
  qty: number;
  uom: string;
}

/** Incoming email fields required for extraction */
export interface IncomingEmailFields {
  from_email: string;
  from_name: string;
  cc: string[];
  subject: string;
  email_body_text: string;
  attachments_parsed?: Array<{ filename: string; content_type: string; extracted_text: string }>;
  user_full_name?: string;   // For Attn: self-exclusion
}

/** Structured deadline result — period string + ISO closing timestamp */
export interface DeadlineResult {
  deadline_period: string | null;   // Validity period: "45 days"
  closing_time: string | null;      // ISO timestamp: "2025-06-19T12:00:00.000Z"
}

/** Combined output from all deterministic extractors */
export interface ExtractionResult {
  rfq_reference: string | null;
  customer: PartialCustomer;
  rfq_items: ExtractedItem[];
  required_currency: string;
  deadline_period: string | null;
  closing_time: string | null;
}

// =============================================
// Attachment Ranking
// =============================================

/**
 * Rank attachments and return their texts in priority order.
 *
 * Priority 1: Filename matches "RFQ to" pattern (the formal cover letter PDF)
 * Priority 2: Content contains RFQ-identifying keywords (Attn:, C.c:, PR-, Inquiry No.)
 * Priority 3: Remaining attachments with real extracted text
 *
 * Filters out placeholder texts (starting with '[') that indicate
 * the PDF content was not actually OCR'd/extracted yet.
 *
 * @returns Array of attachment texts sorted by priority (best first), empty if none usable
 */
export function rankAttachmentTexts(
  attachments: Array<{ filename: string; content_type: string; extracted_text: string }> | undefined
): string[] {
  if (!attachments?.length) return [];

  // Filter out placeholder texts ("[PDF – ... Not auto-extracted ...]")
  const usable = attachments.filter(
    a => a.extracted_text && !a.extracted_text.startsWith('[')
  );

  // Score each attachment
  const scored = usable.map(a => {
    let score = 0;

    // Priority 1: Filename matches "RFQ to" pattern (formal RFQ cover letter)
    if (/RFQ\s+to\b/i.test(a.filename)) score += 100;

    // Priority 2: Content contains RFQ-identifying fields
    const text = a.extracted_text;
    if (/\bAttn[:\s]/i.test(text))       score += 10;
    if (/\bC\.?c[:\s]/i.test(text))      score += 10;
    if (/PR[\s\-]*\d/i.test(text))       score += 10;
    if (/Inquiry\s+No/i.test(text))      score += 5;
    if (/Closing\s+Time/i.test(text))    score += 5;

    return { text, score };
  });

  // Sort by score descending, return texts only
  return scored
    .sort((a, b) => b.score - a.score)
    .map(s => s.text);
}

// =============================================
// Extractors
// =============================================

/**
 * Extract RFQ reference from text sources (priority: first match wins).
 * Covers: "PR-25-10337", "PR 25-10337", "PR25-10337", "PR-25 10337"
 * Returns normalized format: "RFQ PR-25-10337" or null if no match.
 */
export function extractRfqReference(texts: string[]): string | null {
  // Pattern: "PR" followed by optional separator, then digits with internal hyphens
  const PATTERN = /PR[\s\-]*(\d[\d\-]+\d)/i;

  for (const text of texts) {
    if (!text) continue;
    const match = text.match(PATTERN);
    if (match) {
      const code = match[1].trim(); // Normalize: strip extra whitespace
      return `RFQ PR-${code}`;
    }
  }
  return null;
}

/**
 * Extract customer contact info from email headers.
 * Attachment-first priority for phone/fax/attn/cc.
 */
export function extractCustomerFromHeaders(email: {
  from_email: string;
  from_name: string;
  cc: string[];
  email_body_text: string;
  attachment_text?: string;    // Best-ranked attachment extracted text
  user_full_name?: string;     // Logged-in user's full name (for Attn: exclusion)
}): PartialCustomer {
  // Attachment-first combined text for phone/fax search
  const searchText = email.attachment_text
    ? [email.attachment_text, email.email_body_text].join('\n')
    : email.email_body_text;

  return {
    email: email.from_email || '',
    attention_person: extractAttentionPerson(
      email.email_body_text,
      email.attachment_text || '',
      email.user_full_name || '',
    ),
    carbon_copy_person: extractCarbonCopy(
      email.cc,
      email.attachment_text || '',
      email.email_body_text,
    ),
    phone: extractPhone(searchText),
    fax_number: extractFax(searchText),
  };
}

// =============================================
// Internal helpers
// =============================================

/**
 * Extract attention person from attachment text or email body.
 *
 * Priority:
 *   1. Attachment "Attn:" field (formal RFQ document)
 *   2. Email body signature block (name after "Sincerely" / "Thank you" / "Regards")
 *   3. Email body "Dear Mr./Ms." line
 *
 * Excludes matches that equal the logged-in user's full name
 * (the RFQ is addressed TO the user, we want the SENDER's contact).
 */
function extractAttentionPerson(
  bodyText: string,
  attachmentText: string,
  userFullName: string,
): string {
  const candidates: string[] = [];

  // ── Source 1: Attachment "Attn:" lines ──
  const attnRegex = /Attn[:\s]+\n*([A-Z][^\n,;]{2,})/gi;
  const sources = [attachmentText, bodyText];
  for (const src of sources) {
    let m: RegExpExecArray | null;
    while ((m = attnRegex.exec(src)) !== null) {
      const raw = m[1].trim().replace(/^(?:Mr\.?|Ms\.?|Mrs\.?|Dr\.?)\s*/i, '');
      const name = raw.replace(/,\s*.*$/, '').trim();
      if (name.length >= 3) candidates.push(name);
    }
  }

  // ── Source 2: Signature block — name line after closing phrase ──
  const sigMatch = bodyText.match(
    /(?:Sincerely|Thank\s+you|Regards|Best)[,\s]*\n+(?:\d{4}[\-/]\d{2}[\-/]\d{2}\n+(?:\d{2}:\d{2}:\d{2}\n+)?)?(?:_+\n+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i
  );
  if (sigMatch) candidates.push(sigMatch[1].trim());

  // ── Filter: exclude self (logged-in user) ──
  const normalizedUser = userFullName.toLowerCase().trim();
  const filtered = normalizedUser
    ? candidates.filter(c => c.toLowerCase().trim() !== normalizedUser)
    : candidates;

  return filtered[0] || '';
}

/**
 * Extract carbon copy persons from attachment text or email CC header.
 *
 * Priority:
 *   1. Attachment "C.c:" / "Cc:" lines (formal RFQ document)
 *   2. Email CC header (already an array of email addresses)
 */
function extractCarbonCopy(
  ccHeader: string[],
  attachmentText: string,
  _bodyText: string,
): string[] {
  const result: string[] = [];

  // ── Source 1: Attachment "C.c:" / "Cc:" lines ──
  const ccBlockMatch = attachmentText.match(
    /C\.?c[:\s]+\n*((?:[^\n]*[A-Z][a-z]+[^\n]*\n?)+)/i
  );
  if (ccBlockMatch) {
    const lines = ccBlockMatch[1].split('\n').filter(l => l.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length >= 3 && /[A-Z]/.test(trimmed)) {
        result.push(trimmed);
      }
    }
  }

  // ── Source 2: Email CC header (fallback) ──
  if (result.length === 0 && ccHeader.length > 0) {
    result.push(...ccHeader);
  }

  return result;
}

/**
 * Extract phone number from email signature.
 * Patterns: "T 84-254-3856937", "Tel: +84...", "Phone: ...", "HP 84-..."
 */
function extractPhone(body: string): string {
  const m = body.match(/(?:T|Tel|Phone|Telephone|HP)[\s:]+([+\d\s\-().]+\d)/i);
  return m ? m[1].trim() : '';
}

/**
 * Extract fax number from email signature.
 * Patterns: "Fax: 84-254-856.942", "F 84-254-..."
 */
function extractFax(body: string): string {
  const m = body.match(/(?:Fax|F)[\s:]+([+\d\s\-().]+\d)/i);
  return m ? m[1].trim() : '';
}

/**
 * Extract RFQ line items from text.
 * Strategy 1: Pipe-delimited table (email body format)
 * Strategy 2: PDF-extracted structured text (item number, maximo, description on separate lines, QTY block)
 */
export function extractRfqItems(text: string): ExtractedItem[] {
  // Strategy 1: Pipe-delimited tables (existing logic)
  const pipeItems = extractPipeDelimitedItems(text);
  if (pipeItems.length > 0) return pipeItems;

  // Strategy 2: PDF-extracted structured text
  const pdfItems = extractPdfStructuredItems(text);
  if (pdfItems.length > 0) return pdfItems;

  return [];
}

/** Strategy 1: Pipe-delimited table rows */
function extractPipeDelimitedItems(body: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  const pipeRows = body.match(/^\d+\s*\|.+$/gm);
  if (!pipeRows?.length) return items;

  for (const row of pipeRows) {
    const cells = row.split('|').map(c => c.trim());
    if (cells.length < 3) continue;

    const itemNum = parseInt(cells[0], 10);
    if (isNaN(itemNum)) continue;

    const description = cells.slice(1, -1).join(' | ').trim();
    const lastCell = cells[cells.length - 1];

    const qtyMatch = lastCell.match(/(\d+)/);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

    const uomMatch = lastCell.match(/\(([A-Z]+)\)/i);
    const uom = uomMatch ? uomMatch[1].toUpperCase() : 'EA';

    items.push({ item_id: itemNum, company_description: description, qty, uom });
  }
  return items;
}

/** Strategy 2: PDF-extracted text where items and QTY are in separate blocks */
function extractPdfStructuredItems(text: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];

  // Locate the "Scope of Requirement" section (or "Description of Goods/Services")
  const scopeStart = text.search(/(?:Scope\s+of\s+Requirement|Description\s+of\s+Goods)/i);
  if (scopeStart === -1) return items;

  // Locate the end marker (next numbered section: "2. Price Terms" or similar)
  const afterScope = text.slice(scopeStart);
  const scopeEnd = afterScope.search(/^\d+\.\s+(?:Price|Payment|Delivery|Warranty|Special)/im);
  const scopeText = scopeEnd > 0 ? afterScope.slice(0, scopeEnd) : afterScope;

  const lines = scopeText.split(/\r?\n/);
  let currentItem: { num: number; maximo: string; descLines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (/^\d{1,2}$/.test(line)) {
      const num = parseInt(line, 10);
      if (currentItem) items.push(buildItemFromBlock(currentItem));
      currentItem = { num, maximo: '', descLines: [] };
      continue;
    }

    if (!currentItem) continue;

    if (/^\d{5,7}$/.test(line) && !currentItem.maximo) {
      currentItem.maximo = line;
      continue;
    }

    if (/^QTY\b/i.test(line) || /^Page\s+\d/i.test(line)) break;
    currentItem.descLines.push(line);
  }
  if (currentItem) items.push(buildItemFromBlock(currentItem));

  // ── Parse QTY block ──
  const qtyBlockMatch = text.match(
    /(?:QTY\s*(?:\([A-Z]+\))?\s*\n+)((?:\s*\d+\s*\n)+)/im
  );
  if (qtyBlockMatch) {
    const qtyLines = qtyBlockMatch[1].trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < Math.min(qtyLines.length, items.length); i++) {
      const qty = parseInt(qtyLines[i], 10);
      if (!isNaN(qty)) items[i].qty = qty;
    }
  }

  return items;
}

/** Build ExtractedItem from a parsed block */
function buildItemFromBlock(
  block: { num: number; maximo: string; descLines: string[] }
): ExtractedItem {
  const desc = block.descLines.join(' ').trim();
  const fullDesc = block.maximo ? `${block.maximo} | ${desc}` : desc;
  return {
    item_id: block.num,
    company_description: fullDesc,
    qty: 1,  // Default — will be overwritten by QTY block parsing
    uom: 'EA',
  };
}

/**
 * Extract required currency from email text.
 * Patterns: explicit codes (USD, VND, EUR), natural language ("Vietnam currency" → VND).
 * Defaults to USD if no currency detected.
 */
export function extractCurrency(body: string, subject: string): string {
  const combined = `${subject}\n${body}`;

  // Explicit ISO 4217 currency code mentions
  const codeMatch = combined.match(/\b(USD|EUR|VND|GBP|JPY|SGD|AUD|CNY)\b/i);
  if (codeMatch) return codeMatch[1].toUpperCase();

  // Natural language currency mappings
  if (/vietnam(?:ese)?\s+(?:currency|dong)/i.test(combined)) return 'VND';
  if (/(?:us\s+dollar|american\s+dollar)/i.test(combined)) return 'USD';
  if (/(?:euro\b)/i.test(combined)) return 'EUR';

  return 'USD'; // Default fallback
}

/**
 * Extract tender deadline/closing time and validity period from email body.
 * Returns structured DeadlineResult with both closing_time (ISO) and deadline_period (string).
 */
export function extractDeadline(body: string): DeadlineResult {
  let closing_time: string | null = null;
  let deadline_period: string | null = null;

  // ── Extract closing_time ──
  // Pattern: "HH:MM hours on DD-Mon-YY"
  const closingMatch = body.match(
    /(\d{1,2}:\d{2})\s*hours?\s+on\s+(\d{1,2})[- ](\w{3})[- ](\d{2,4})/i
  );
  if (closingMatch) {
    const [, time, day, monthStr, yearStr] = closingMatch;
    const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
    const parsed = new Date(`${day} ${monthStr} ${year} ${time}`);
    if (!isNaN(parsed.getTime())) closing_time = parsed.toISOString();
  }

  // Fallback closing_time: "deadline|not later than <date>"
  if (!closing_time) {
    const deadlineMatch = body.match(
      /(?:deadline|not later than|closing date)[:\s]+(\d{1,2}[:\s]\d{2}\s*hours?\s+on\s+)?(\d{1,2})[- /](\w{3,9})[- /](\d{2,4})/i
    );
    if (deadlineMatch) {
      const [, , day, monthStr, yearStr] = deadlineMatch;
      const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
      const parsed = new Date(`${day} ${monthStr} ${year}`);
      if (!isNaN(parsed.getTime())) closing_time = parsed.toISOString();
    }
  }

  // ── Extract deadline_period (validity period) ──
  // Handles: "forty-five (45) days", "sixty (60) days", "45 days", "90 calendar days"
  const periodMatch = body.match(
    /(?:valid(?:ity)?|no\s+lesser\s+than)\s+.*?(\d{1,3})\s*\)?\s*(calendar\s+)?days/i
  );
  if (periodMatch) {
    deadline_period = `${periodMatch[1]} days`;
  }

  return { deadline_period, closing_time };
}

/** Helper: try extractDeadline on attachment first, fall back to body */
function fallbackDeadline(attachmentText: string, bodyText: string): DeadlineResult {
  const fromAtt = extractDeadline(attachmentText);
  if (fromAtt.deadline_period || fromAtt.closing_time) return fromAtt;
  return extractDeadline(bodyText);
}

// =============================================
// Orchestrator
// =============================================

/**
 * Run all deterministic extractors on an incoming email.
 * Single entry point — returns structured data ready to merge with AI output.
 * Uses attachment-first priority for all extractors.
 */
export function extractAll(email: IncomingEmailFields): ExtractionResult {
  // ── Rank attachment texts by priority ──
  const rankedAttTexts = rankAttachmentTexts(email.attachments_parsed);
  const hasAttachmentText = rankedAttTexts.length > 0;
  const bestAttachmentText = rankedAttTexts[0] || '';
  const allAttachmentText = rankedAttTexts.join('\n');

  // ── Build source texts with attachment-first priority ──
  const bodyText = email.email_body_text || '';
  const subjectText = email.subject || '';

  // Layer 1 (attachment) + Layer 2 (body) combined
  const attachmentThenBody = hasAttachmentText
    ? [allAttachmentText, bodyText].join('\n')
    : bodyText;

  // For reference extraction: subject > attachment > body
  const allTexts = [subjectText, ...rankedAttTexts, bodyText];

  // ── Extract currency (attachment first, then body + subject) ──
  const requiredCurrency = hasAttachmentText
    ? (extractCurrency(allAttachmentText, subjectText) !== 'USD'
        ? extractCurrency(allAttachmentText, subjectText)
        : extractCurrency(bodyText, subjectText))
    : extractCurrency(bodyText, subjectText);

  // ── Extract deadline (attachment first, then body) ──
  const deadlineResult = hasAttachmentText
    ? fallbackDeadline(allAttachmentText, bodyText)
    : extractDeadline(bodyText);

  // ── Extract items (attachment first, then body) ──
  const rfqItems = extractRfqItems(attachmentThenBody);

  // ── Extract customer contact (attachment-first for phone/fax/attn/cc) ──
  const customer = extractCustomerFromHeaders({
    from_email: email.from_email,
    from_name: email.from_name,
    cc: email.cc,
    email_body_text: bodyText,
    attachment_text: bestAttachmentText,
    user_full_name: email.user_full_name || '',
  });

  return {
    rfq_reference: extractRfqReference(allTexts),
    customer,
    rfq_items: rfqItems,
    required_currency: requiredCurrency,
    deadline_period: deadlineResult.deadline_period,
    closing_time: deadlineResult.closing_time,
  };
}
