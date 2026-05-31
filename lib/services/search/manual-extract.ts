/* ========================================================================
   Manual Extract: Regex-based supplier field extraction + verify gate
   ======================================================================== */

/**
 * Structural shape of the scorer's detected-field map.
 * Used to skip searching for fields the scorer already said are absent.
 */
export interface DetectedFieldMap {
  has_price?: boolean;
  has_currency?: boolean;
  has_contact_email?: boolean;
  has_contact_phone?: boolean;
  has_stock?: boolean;
  has_delivery?: boolean;
  has_quote_request?: boolean;
}

/**
 * Extracted supplier fields via regex. Empty values (0, '') indicate not found.
 */
export interface ManualFields {
  supplier_name: string;
  bidder_unit_price: number;
  currency_code: string;
  delivery_time: string;
  contact_email: string;
  contact_phone: string;
  available_qty: number;
}

/**
 * Result of manual extraction with confidence scores and missing-field list.
 */
export interface ManualExtractResult {
  fields: ManualFields;
  /** 0..1 confidence per field. 0 = not found / failed verify. */
  confidence: Record<keyof ManualFields, number>;
  /** fields that are missing, zero, or failed verification. */
  missing: (keyof ManualFields)[];
}

// =============================================
// Compiled regexes (module scope, bounded)
// =============================================

// Currency symbols and ISO codes. Reused from html-gate patterns.
const CURRENCY_CODES = new Set(['USD', 'EUR', 'GBP', 'VND', 'SGD', 'MYR', 'THB', 'IDR', 'CNY', 'JPY', 'AUD']);
const CURRENCY_SYMBOLS = new Map<string, string>([
  ['$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['¥', 'JPY'],
]);

// Price: currency symbol/code + number (with optional commas/dots).
// Pattern: currency near a numeric value (up to 20 chars of digits/commas/dots).
const pricePattern =
  /(?:USD|EUR|GBP|VND|SGD|MYR|THB|IDR|CNY|JPY|AUD|[$€£¥])\s*[\d,.]{1,20}|[\d,.]{1,20}\s*(?:USD|EUR|GBP|VND|SGD|MYR|THB|IDR|CNY|JPY|AUD|[$€£¥])/i;

// Email: standard pattern (alphanumeric, +, _, -, . before @, domain, TLD).
const emailPattern = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;

// Phone: \+<country> <area> <number>, with spaces/dashes/parens as separators.
// Require + for international or (area) for US-style, to avoid matching bare numbers.
// Must total 7+ digits to be plausible.
const phonePattern = /(?:\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,5}|\(\d{2,4}\)[\s.-]?\d{2,4}[\s.-]?\d{2,5})/;

// Stock patterns: "<N> in stock", "stock: <N>", "<N> available", etc.
// Bounded: up to 50 chars to catch "stock: 1234".
const stockPatterns = [
  /stock\s*:\s*(\d+)/i,
  /(\d+)\s+in\s+stock\b/i,
  /available\s*:\s*(\d+)/i,
  /(\d+)\s+available\b/i,
];

// Delivery/lead-time patterns: "4-6 weeks", "ships in 3 days", "lead time 4 weeks", etc.
// Extract number or range; normalize to "X-Y weeks".
const deliveryPatterns = [
  /lead\s+time\s*:\s*(\d+)(?:\s*-\s*(\d+))?\s*(?:weeks?|days?)/i,
  /(?:ships?|delivery)\s+in\s+(\d+)(?:\s*-\s*(\d+))?\s*(?:weeks?|days?)/i,
  /(\d+)(?:\s*-\s*(\d+))?\s*(?:weeks?|days?)\s*(?:delivery|lead\s+time)/i,
  /(\d+)(?:\s*-\s*(\d+))?\s*(?:weeks?|days?)/i,
];

// =============================================
// Helper: normalize delivery to "X-Y weeks"
// =============================================

/**
 * Normalize a delivery match (number or range, days or weeks) to "X-Y weeks" format.
 * If input is in days, convert to weeks (round up). If single number, duplicate.
 */
function normalizeDelivery(value1: string | undefined, value2: string | undefined, unit: string | undefined): string {
  if (!value1) return '';

  const num1 = parseInt(value1, 10);
  const num2 = value2 ? parseInt(value2, 10) : num1;

  // Determine the unit (default to weeks if not specified).
  const isWeeks = !unit || /weeks?/i.test(unit);

  // If in days, convert to weeks (ceiling).
  let weeks1 = isWeeks ? num1 : Math.ceil(num1 / 7);
  let weeks2 = isWeeks ? num2 : Math.ceil(num2 / 7);

  // Ensure weeks1 <= weeks2.
  if (weeks1 > weeks2) {
    [weeks1, weeks2] = [weeks2, weeks1];
  }

  return weeks1 === weeks2 ? `${weeks1}-${weeks1} weeks` : `${weeks1}-${weeks2} weeks`;
}

// =============================================
// Helper: verify value against content
// =============================================

/**
 * True when the (normalized) value re-appears in content.
 * Normalize both sides: lowercase, strip non-alphanumeric.
 * Numbers: compare digit sequences.
 */
export function verifyAgainstContent(value: string | number, content: string): boolean {
  if (value === '' || value === 0) return false;

  const valueStr = String(value);
  const normalized = valueStr.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!normalized) return false;

  const contentNormalized = content.toLowerCase().replace(/[^a-z0-9]/g, '');
  return contentNormalized.includes(normalized);
}

// =============================================
// Main: manualExtract
// =============================================

/**
 * Extract supplier fields from page content via regex patterns.
 * `detected` (optional) lets the caller skip searching for fields
 * the scorer already said are absent (cheaper, fewer false positives).
 *
 * Returns fields, per-field confidence [0..1], and a list of missing fields.
 * Fields that fail the verify gate are reset to their empty value, confidence 0, and included in missing.
 */
export function manualExtract(content: string, detected?: DetectedFieldMap): ManualExtractResult {
  const fields: ManualFields = {
    supplier_name: '',
    bidder_unit_price: 0,
    currency_code: '',
    delivery_time: '',
    contact_email: '',
    contact_phone: '',
    available_qty: 0,
  };

  const confidence: Record<keyof ManualFields, number> = {
    supplier_name: 0,
    bidder_unit_price: 0,
    currency_code: 0,
    delivery_time: 0,
    contact_email: 0,
    contact_phone: 0,
    available_qty: 0,
  };

  // Track fields that should NOT be verified (inferred from symbols, not literal text).
  const skipVerify = new Set<keyof ManualFields>();

  // supplier_name: left empty (unreliable; LLM gap-fill handles it).
  confidence.supplier_name = 0;

  // =============================================
  // Price + Currency
  // =============================================
  if (!detected || detected.has_price !== false) {
    const priceMatch = content.match(pricePattern);
    if (priceMatch) {
      const priceText = priceMatch[0];

      // Extract the numeric part.
      const numericMatch = priceText.match(/[\d,.]+/);
      if (numericMatch) {
        const cleanedPrice = numericMatch[0].replace(/,/g, '');
        const price = parseFloat(cleanedPrice);
        if (!isNaN(price) && price > 0) {
          fields.bidder_unit_price = price;
          confidence.bidder_unit_price = 0.8;
        }
      }

      // Extract the currency symbol or code.
      // Try ISO codes first (higher confidence because they appear in text).
      const codeMatch = priceText.match(/(?:USD|EUR|GBP|VND|SGD|MYR|THB|IDR|CNY|JPY|AUD)/i);
      if (codeMatch) {
        const currencyFound = codeMatch[0].toUpperCase();
        if (CURRENCY_CODES.has(currencyFound)) {
          fields.currency_code = currencyFound;
          confidence.currency_code = 0.9;
        }
      } else {
        // Fall back to symbol → code mapping (lower confidence, inferred not verifiable).
        for (const [symbol, code] of CURRENCY_SYMBOLS) {
          if (priceText.includes(symbol)) {
            fields.currency_code = code;
            // Lower confidence: symbol was inferred, code won't verify against content.
            confidence.currency_code = 0.6;
            // Skip verification for inferred codes (they won't appear as ISO text).
            skipVerify.add('currency_code');
            break;
          }
        }
      }
    }
  }

  // =============================================
  // Contact: Email
  // =============================================
  if (!detected || detected.has_contact_email !== false) {
    const emailMatch = content.match(emailPattern);
    if (emailMatch) {
      fields.contact_email = emailMatch[0];
      confidence.contact_email = 0.95;
    }
  }

  // =============================================
  // Contact: Phone
  // =============================================
  if (!detected || detected.has_contact_phone !== false) {
    const phoneMatch = content.match(phonePattern);
    if (phoneMatch) {
      // Check if the matched phone has at least 7 digits (minimal plausibility).
      const digitCount = (phoneMatch[0].match(/\d/g) || []).length;
      if (digitCount >= 7) {
        fields.contact_phone = phoneMatch[0];
        confidence.contact_phone = 0.8;
      }
    }
  }

  // =============================================
  // Stock: available_qty
  // =============================================
  if (!detected || detected.has_stock !== false) {
    for (const pattern of stockPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const qty = parseInt(match[1], 10);
        if (!isNaN(qty) && qty > 0) {
          fields.available_qty = qty;
          confidence.available_qty = 0.85;
          break;
        }
      }
    }
  }

  // =============================================
  // Delivery: delivery_time
  // =============================================
  if (!detected || detected.has_delivery !== false) {
    for (const pattern of deliveryPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const value1: string | undefined = match[1];
        const value2: string | undefined = match[2];
        const unit: string | undefined = match[0];

        if (value1) {
          const normalized = normalizeDelivery(value1, value2, unit);
          if (normalized) {
            fields.delivery_time = normalized;
            confidence.delivery_time = 0.8;
            // Normalized delivery time won't verify against original content (e.g., "3 days" → "1-1 weeks").
            skipVerify.add('delivery_time');
            break;
          }
        }
      }
    }
  }

  // =============================================
  // Verify gate: re-check each non-empty field against content
  // Fields in skipVerify (inferred from symbols) are accepted without verification.
  // =============================================
  const missing: (keyof ManualFields)[] = [];

  if (fields.supplier_name === '' || !verifyAgainstContent(fields.supplier_name, content)) {
    fields.supplier_name = '';
    confidence.supplier_name = 0;
    missing.push('supplier_name');
  }

  if (fields.bidder_unit_price === 0 || !verifyAgainstContent(fields.bidder_unit_price, content)) {
    fields.bidder_unit_price = 0;
    confidence.bidder_unit_price = 0;
    missing.push('bidder_unit_price');
  }

  if (skipVerify.has('currency_code')) {
    // Inferred code: keep it, don't verify.
    if (fields.currency_code === '') {
      missing.push('currency_code');
    }
  } else if (fields.currency_code === '' || !verifyAgainstContent(fields.currency_code, content)) {
    fields.currency_code = '';
    confidence.currency_code = 0;
    missing.push('currency_code');
  }

  if (skipVerify.has('delivery_time')) {
    // Normalized delivery time: keep it, don't verify.
    if (fields.delivery_time === '') {
      missing.push('delivery_time');
    }
  } else if (fields.delivery_time === '' || !verifyAgainstContent(fields.delivery_time, content)) {
    fields.delivery_time = '';
    confidence.delivery_time = 0;
    missing.push('delivery_time');
  }

  if (fields.contact_email === '' || !verifyAgainstContent(fields.contact_email, content)) {
    fields.contact_email = '';
    confidence.contact_email = 0;
    missing.push('contact_email');
  }

  if (fields.contact_phone === '' || !verifyAgainstContent(fields.contact_phone, content)) {
    fields.contact_phone = '';
    confidence.contact_phone = 0;
    missing.push('contact_phone');
  }

  if (fields.available_qty === 0 || !verifyAgainstContent(fields.available_qty, content)) {
    fields.available_qty = 0;
    confidence.available_qty = 0;
    missing.push('available_qty');
  }

  return { fields, confidence, missing };
}
