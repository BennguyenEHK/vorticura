/* ========================================================================
   Manual Extract: Regex-based supplier field extraction + verify gate
   ======================================================================== */

import { selectBestPrice, type PriceCandidate } from './price-select';

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
// GLOBAL flag (/g) so we can find ALL occurrences in the page for multi-price disambiguation.
const pricePattern =
  /(?:USD|EUR|GBP|VND|SGD|MYR|THB|IDR|CNY|JPY|AUD|[$€£¥])\s*[\d,.]{1,20}|[\d,.]{1,20}\s*(?:USD|EUR|GBP|VND|SGD|MYR|THB|IDR|CNY|JPY|AUD|[$€£¥])/gi;

// Labeled price: an explicit price-label phrase immediately precedes a bare number (no currency symbol needed).
// Captures "sales price 1,234.56", "unit price: 99.00", "MSRP 199", etc.
// Bare "price" and "now" are intentionally excluded — they match too broadly
// (e.g. "price list 2024" → 2024, "now 50 in stock" → 50).
// Group 1 = the raw number string.
const labeledPricePattern =
  /(?:sales\s+price|list\s+price|unit\s+price|price\s+each|our\s+price|msrp)\s*:?\s*([\d,.]{1,20})/gi;

// Email: standard pattern (alphanumeric, +, _, -, . before @, domain, TLD).
const emailPattern = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;

// Obfuscated email: catches forms like "name [at] domain [dot] com",
// "name(at)domain(dot)com", "name AT domain DOT com" used to evade scrapers.
// Group 1 = local-part, Group 2 = domain, Group 3 = TLD.
const obfuscatedEmailPattern =
  /([a-zA-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|(?<!\w)AT(?!\w))\s*([a-zA-Z0-9.-]+)\s*(?:\[dot\]|\(dot\)|(?<!\w)DOT(?!\w))\s*([a-zA-Z]{2,})/i;

/**
 * Reconstruct a plain email address from an obfuscated match.
 * e.g. "info [at] example [dot] com" → "info@example.com"
 */
function normalizeObfuscatedEmail(match: RegExpMatchArray): string {
  // Combine the three captured groups into a standard email address.
  return `${match[1].trim()}@${match[2].trim()}.${match[3].trim()}`;
}

// Phone: \+<country> <area> <number>, with spaces/dashes/parens as separators.
// Require + for international or (area) for US-style, to avoid matching bare numbers.
// Must total 7+ digits to be plausible.
const phonePattern = /(?:\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,5}|\(\d{2,4}\)[\s.-]?\d{2,4}[\s.-]?\d{2,5})/;

// Labeled-phone fallback: fires when a recognized contact-label word immediately
// precedes a bare number string that doesn't carry the + or (area) required by
// the strict phonePattern.  Vocabulary is intentionally broad to catch the many
// ways B2B pages label their contact numbers.
// Group 1 = the raw phone-number token (digits + separators) after the label.
const labeledPhonePattern =
  /(?:tel(?:ephone)?|phone|call(?:\s+us)?|contact|hotline|mobile|cell(?:phone)?|fax|whatsapp|wechat|direct(?:\s+line)?|ph)[\s:.-]*(\+?[\d][\d\s().+-]{5,20}\d)/i;

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
 * `specTokens` (optional) are RFQ spec identification tokens (e.g. part size,
 * class, model) forwarded to selectBestPrice to pick the correct variant price
 * when the page lists multiple prices for different configurations.
 *
 * Returns fields, per-field confidence [0..1], and a list of missing fields.
 * Fields that fail the verify gate are reset to their empty value, confidence 0, and included in missing.
 */
export function manualExtract(
  content: string,
  detected?: DetectedFieldMap,
  specTokens: string[] = [],
): ManualExtractResult {
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
  // Price + Currency — multi-price disambiguation
  // =============================================
  // Collect ALL price occurrences on the page (currency-tagged and label-tagged),
  // build a PriceCandidate per match, then use selectBestPrice to pick the one
  // whose surrounding context best matches the RFQ spec tokens (e.g. size, class).
  // This avoids blindly picking the first/cheapest price when a page lists several
  // variant prices (e.g. different flange sizes at different unit costs).
  if (!detected || detected.has_price !== false) {
    const candidates: PriceCandidate[] = [];

    // --- Pass 1: currency-tagged prices (symbol or ISO code adjacent to number) ---
    // Reset lastIndex before iterating (global regex retains state between calls).
    pricePattern.lastIndex = 0;
    let pm: RegExpExecArray | null;
    while ((pm = pricePattern.exec(content)) !== null) {
      const priceText = pm[0];
      const matchIndex = pm.index;

      // Parse numeric value (strip commas, e.g. "1,234.56" → 1234.56).
      const numericMatch = priceText.match(/[\d,.]+/);
      if (!numericMatch) continue;
      const value = parseFloat(numericMatch[0].replace(/,/g, ''));
      if (isNaN(value) || value <= 0) continue;

      // Derive currency: try ISO code first, then symbol → code map.
      let currency = '';
      const codeMatch = priceText.match(/(?:USD|EUR|GBP|VND|SGD|MYR|THB|IDR|CNY|JPY|AUD)/i);
      if (codeMatch && CURRENCY_CODES.has(codeMatch[0].toUpperCase())) {
        currency = codeMatch[0].toUpperCase();
      } else {
        for (const [symbol, code] of CURRENCY_SYMBOLS) {
          if (priceText.includes(symbol)) {
            currency = code;
            break;
          }
        }
      }

      // Capture ~±60 chars of surrounding text as context for spec-token matching.
      const ctxStart = Math.max(0, matchIndex - 60);
      const ctxEnd = Math.min(content.length, matchIndex + priceText.length + 60);
      candidates.push({ value, currency, context: content.slice(ctxStart, ctxEnd) });
    }

    // --- Pass 2: labeled prices (no currency symbol required) ---
    // Catches "Unit Price: 99.00", "MSRP 199", "now 29.99", etc.
    // These become candidates with currency '' if no currency info is adjacent.
    labeledPricePattern.lastIndex = 0;
    let lm: RegExpExecArray | null;
    while ((lm = labeledPricePattern.exec(content)) !== null) {
      const rawNum = lm[1]; // numeric string captured by the label pattern
      const matchIndex = lm.index;
      const value = parseFloat(rawNum.replace(/,/g, ''));
      if (isNaN(value) || value <= 0) continue;

      // Look for a currency code or symbol within ±15 chars of this match for context.
      const nearbyStart = Math.max(0, matchIndex - 15);
      const nearbyEnd = Math.min(content.length, matchIndex + lm[0].length + 15);
      const nearby = content.slice(nearbyStart, nearbyEnd);

      let currency = '';
      const nearCode = nearby.match(/(?:USD|EUR|GBP|VND|SGD|MYR|THB|IDR|CNY|JPY|AUD)/i);
      if (nearCode && CURRENCY_CODES.has(nearCode[0].toUpperCase())) {
        currency = nearCode[0].toUpperCase();
      } else {
        for (const [symbol, code] of CURRENCY_SYMBOLS) {
          if (nearby.includes(symbol)) {
            currency = code;
            break;
          }
        }
      }

      // Capture ±60 char context window for spec-token scoring.
      const ctxStart = Math.max(0, matchIndex - 60);
      const ctxEnd = Math.min(content.length, matchIndex + lm[0].length + 60);
      candidates.push({ value, currency, context: content.slice(ctxStart, ctxEnd) });
    }

    // --- Disambiguate: pick the candidate whose context best matches spec tokens ---
    const best = selectBestPrice(candidates, specTokens);
    if (best) {
      fields.bidder_unit_price = best.value;
      confidence.bidder_unit_price = 0.8;

      if (best.currency) {
        fields.currency_code = best.currency;
        // High confidence only if the ISO code literally appears in content (verifiable).
        // Otherwise it was inferred from a symbol ($/€/£/¥) and won't verify — skip the gate.
        // NOTE: cannot use CURRENCY_CODES.has() here — a symbol-inferred code like 'USD'/'GBP'
        // is also a valid ISO code, so that check would always be true and skipVerify would
        // never be set, causing the verify gate to fail on symbol-only pages (e.g. "£100").
        if (verifyAgainstContent(best.currency, content)) {
          confidence.currency_code = 0.9;
        } else {
          confidence.currency_code = 0.6;
          skipVerify.add('currency_code');
        }
      }
    }
    // No candidate → price stays 0, currency stays '', added to missing below.
  }

  // =============================================
  // Contact: Email
  // =============================================
  if (!detected || detected.has_contact_email !== false) {
    const emailMatch = content.match(emailPattern);
    if (emailMatch) {
      // Standard plain-text email found — use it directly.
      fields.contact_email = emailMatch[0];
      confidence.contact_email = 0.95;
    } else {
      // Fallback: try obfuscated form (e.g. "info [at] example [dot] com").
      const obfMatch = content.match(obfuscatedEmailPattern);
      if (obfMatch) {
        const reconstructed = normalizeObfuscatedEmail(obfMatch);
        fields.contact_email = reconstructed;
        confidence.contact_email = 0.85;
        // The reconstructed address (e.g. "info@example.com") will not appear
        // verbatim in content, so verifyAgainstContent would reject it.
        // Add to skipVerify — the same pattern the file uses for symbol-inferred
        // fields like currency_code and normalized delivery times.
        skipVerify.add('contact_email');
      }
    }
  }

  // =============================================
  // Contact: Phone
  // =============================================
  if (!detected || detected.has_contact_phone !== false) {
    const phoneMatch = content.match(phonePattern);
    if (phoneMatch) {
      // Strict match: verify 7+ digits for plausibility.
      const digitCount = (phoneMatch[0].match(/\d/g) || []).length;
      if (digitCount >= 7) {
        fields.contact_phone = phoneMatch[0];
        confidence.contact_phone = 0.8;
      }
    }

    if (!fields.contact_phone) {
      // Fallback: labeled-phone pattern (e.g. "Tel: 123 456 7890", "mobile 0123456789").
      const labeledMatch = content.match(labeledPhonePattern);
      if (labeledMatch && labeledMatch[1]) {
        // Count digits in the captured number token; require >= 7 for plausibility.
        const digitCount = (labeledMatch[1].match(/\d/g) || []).length;
        if (digitCount >= 7) {
          // Store the raw matched number group so verifyAgainstContent (which strips
          // non-alphanumerics before comparing) can still find the digit sequence.
          fields.contact_phone = labeledMatch[1].trim();
          confidence.contact_phone = 0.7;
        }
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

  if (skipVerify.has('contact_email')) {
    // Reconstructed from obfuscated form — not verbatim in content; keep without verification.
    if (fields.contact_email === '') {
      missing.push('contact_email');
    }
  } else if (fields.contact_email === '' || !verifyAgainstContent(fields.contact_email, content)) {
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
