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
  currency_code: string;
}

/** Incoming email fields required for extraction */
export interface IncomingEmailFields {
  from_email: string;
  from_name: string;
  cc: string[];
  subject: string;
  email_body_text: string;
  attachments_parsed?: Array<{ filename: string; content_type: string; extracted_text: string }>;
}

/** Combined output from all deterministic extractors */
export interface ExtractionResult {
  rfq_reference: string | null;
  customer: PartialCustomer;
  rfq_items: ExtractedItem[];
  required_currency: string;
  deadline_period: string | null;
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
 * Deterministic — uses from_email, from_name, cc, and signature block parsing.
 */
export function extractCustomerFromHeaders(email: {
  from_email: string;
  from_name: string;
  cc: string[];
  email_body_text: string;
}): PartialCustomer {
  return {
    email: email.from_email || '',
    attention_person: extractAttentionPerson(email.from_name, email.email_body_text),
    carbon_copy_person: email.cc || [],
    phone: extractPhone(email.email_body_text),
    fax_number: extractFax(email.email_body_text),
  };
}

// =============================================
// Internal helpers
// =============================================

/** Suffixes that indicate a company name rather than a person name */
const COMPANY_SUFFIXES = /\b(ltd|corp|inc|co\.|company|group|llc|gmbh|s\.a\.|pte)\b/i;

/**
 * Extract attention person from from_name or email signature.
 * If from_name looks like a company, falls back to "Dear Mr./Ms." or signature block.
 */
function extractAttentionPerson(fromName: string, body: string): string {
  // If from_name doesn't look like a company, use it directly
  if (fromName && !COMPANY_SUFFIXES.test(fromName)) {
    return fromName;
  }

  // Fallback: look for "Dear Mr./Ms./Mrs. <Name>" in body
  const dearMatch = body.match(/Dear\s+(Mr\.|Ms\.|Mrs\.|Dr\.)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (dearMatch) {
    return dearMatch[0].replace(/^Dear\s+/, ''); // Return "Mr. Name" or just "Name"
  }

  // Fallback: look for name line after regards/sincerely signature
  const sigMatch = body.match(/(?:regards|sincerely|best)[,\s]*\n+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
  if (sigMatch) return sigMatch[1].trim();

  // Last resort: return from_name as-is (may be company name)
  return fromName || '';
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
 * Extract RFQ line items from tabular text (pipe-delimited format).
 * Handles: "No | Maximo# | Description | QTY (EA)" pipe-delimited rows.
 * Falls back gracefully — returns empty array if no table detected.
 */
export function extractRfqItems(body: string, defaultCurrency: string = 'USD'): ExtractedItem[] {
  const items: ExtractedItem[] = [];

  // Strategy: Pipe-delimited table rows starting with a number
  const pipeRows = body.match(/^\d+\s*\|.+$/gm);
  if (pipeRows && pipeRows.length > 0) {
    for (const row of pipeRows) {
      const cells = row.split('|').map(c => c.trim());
      if (cells.length < 3) continue; // Need at least: No | Desc | QTY

      const itemNum = parseInt(cells[0], 10);
      if (isNaN(itemNum)) continue; // Skip non-numeric first cells

      // Description: everything between item number and last cell (QTY)
      const description = cells.slice(1, -1).join(' | ').trim();
      const lastCell = cells[cells.length - 1];

      // Extract quantity from last cell (e.g., "4" or "QTY (EA)")
      const qtyMatch = lastCell.match(/(\d+)/);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

      // Extract UOM from header or last cell (e.g., "(EA)" → "EA")
      const uomMatch = lastCell.match(/\(([A-Z]+)\)/i);
      const uom = uomMatch ? uomMatch[1].toUpperCase() : 'EA';

      items.push({
        item_id: itemNum,
        company_description: description,
        qty,
        uom,
        currency_code: defaultCurrency,
      });
    }
  }

  return items;
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
 * Extract tender deadline/closing time from email body.
 * Patterns: "12:00 hours on 19-Jun-25", "deadline: June 19, 2025"
 * Returns ISO 8601 string or null if no deadline found.
 */
export function extractDeadline(body: string): string | null {
  // Pattern: "HH:MM hours on DD-Mon-YY" (e.g., "12:00 hours on 19-Jun-25")
  const closingMatch = body.match(
    /(\d{1,2}:\d{2})\s*hours?\s+on\s+(\d{1,2})[- ](\w{3})[- ](\d{2,4})/i
  );
  if (closingMatch) {
    const [, time, day, monthStr, yearStr] = closingMatch;
    const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
    const dateStr = `${day} ${monthStr} ${year} ${time}`;
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  // Pattern: "deadline/not later than <date>" (e.g., "not later than 12:00 hours on 7-Jun-25")
  const deadlineMatch = body.match(
    /(?:deadline|not later than|closing date)[:\s]+(\d{1,2}[:\s]\d{2}\s*hours?\s+on\s+)?(\d{1,2})[- /](\w{3,9})[- /](\d{2,4})/i
  );
  if (deadlineMatch) {
    const [, , day, monthStr, yearStr] = deadlineMatch;
    const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
    const parsed = new Date(`${day} ${monthStr} ${year}`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

// =============================================
// Orchestrator
// =============================================

/**
 * Run all deterministic extractors on an incoming email.
 * Single entry point — returns structured data ready to merge with AI output.
 */
export function extractAll(email: IncomingEmailFields): ExtractionResult {
  // Build text sources for multi-field search (priority: subject > body > attachments)
  const attachmentTexts = (email.attachments_parsed || [])
    .map(a => a.extracted_text)
    .filter(t => t && !t.startsWith('[')); // Skip placeholder texts like "[PDF – ...]"
  const allTexts = [email.subject, email.email_body_text, ...attachmentTexts];
  const bodyAndAttachments = [email.email_body_text, ...attachmentTexts].join('\n');

  // Extract currency first — needed as default for rfq_items
  const requiredCurrency = extractCurrency(email.email_body_text, email.subject);

  return {
    rfq_reference: extractRfqReference(allTexts),
    customer: extractCustomerFromHeaders(email),
    rfq_items: extractRfqItems(bodyAndAttachments, requiredCurrency),
    required_currency: requiredCurrency,
    deadline_period: extractDeadline(bodyAndAttachments),
  };
}
