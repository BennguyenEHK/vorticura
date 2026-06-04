// Manual Extract: regex-based supplier field extraction + verify gate.

import { selectBestPrice, type PriceCandidate, type SpecTokenInput } from './price-select';

/** Scorer's detected-field map; absent fields skip regex search. */
export interface DetectedFieldMap {
  has_price?: boolean;
  has_currency?: boolean;
  has_contact_email?: boolean;
  has_contact_phone?: boolean;
  has_stock?: boolean;
  has_delivery?: boolean;
  has_quote_request?: boolean;
}

/** Extracted supplier fields via regex. Empty = not found. */
export interface ManualFields {
  supplier_name: string;
  bidder_unit_price: number;
  currency_code: string;
  delivery_time: string;
  contact_email: string;
  contact_phone: string;
  available_qty: number;
}

/** Manual extraction result with confidence and missing-field list. */
export interface ManualExtractResult {
  fields: ManualFields;
  /** 0..1 confidence per field; 0 = not found or failed verify. */
  confidence: Record<keyof ManualFields, number>;
  /** Fields that are missing, zero, or failed verification. */
  missing: (keyof ManualFields)[];
  /** optional: 0..1 confidence of the selected price variant match. */
  priceConfidence?: number;
}

// --- Compiled regexes (module scope, bounded) ---

// Currency symbols and ISO codes.
const CURRENCY_CODES = new Set(['USD', 'EUR', 'GBP', 'VND', 'SGD', 'MYR', 'THB', 'IDR', 'CNY', 'JPY', 'AUD']);
const CURRENCY_SYMBOLS = new Map<string, string>([
  ['$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['¥', 'JPY'],
]);

// Price: symbol/code + number; /g to find all occurrences.
const pricePattern =
  /(?:USD|EUR|GBP|VND|SGD|MYR|THB|IDR|CNY|JPY|AUD|[$€£¥])\s*[\d,.]{1,20}|[\d,.]{1,20}\s*(?:USD|EUR|GBP|VND|SGD|MYR|THB|IDR|CNY|JPY|AUD|[$€£¥])/gi;

// Labeled price: explicit label before bare number (no symbol needed).
// Group 1 = raw number. "price"/"now" excluded (too broad).
const labeledPricePattern =
  /(?:sales\s+price|list\s+price|unit\s+price|price\s+each|our\s+price|msrp)\s*:?\s*([\d,.]{1,20})/gi;

// Standard email pattern.
const emailPattern = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;

// Obfuscated email: "name [at] domain [dot] com" etc.
// Groups: 1=local-part, 2=domain, 3=TLD.
const obfuscatedEmailPattern =
  /([a-zA-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|(?<!\w)AT(?!\w))\s*([a-zA-Z0-9.-]+)\s*(?:\[dot\]|\(dot\)|(?<!\w)DOT(?!\w))\s*([a-zA-Z]{2,})/i;

/** Reconstruct plain email from obfuscated match groups. */
function normalizeObfuscatedEmail(match: RegExpMatchArray): string {
  return `${match[1].trim()}@${match[2].trim()}.${match[3].trim()}`;
}

// Phone: requires + or (area) to avoid bare-number false positives; 7+ digits.
const phonePattern = /(?:\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,5}|\(\d{2,4}\)[\s.-]?\d{2,4}[\s.-]?\d{2,5})/;

// Labeled-phone fallback: label word before bare number.
// Group 1 = raw phone token after the label.
const labeledPhonePattern =
  /(?:tel(?:ephone)?|phone|call(?:\s+us)?|contact|hotline|mobile|cell(?:phone)?|fax|whatsapp|wechat|direct(?:\s+line)?|ph)[\s:.-]*(\+?[\d][\d\s().+-]{5,20}\d)/i;

// Stock patterns: "stock: N", "N in stock", "N available", etc.
const stockPatterns = [
  /stock\s*:\s*(\d+)/i,
  /(\d+)\s+in\s+stock\b/i,
  /available\s*:\s*(\d+)/i,
  /(\d+)\s+available\b/i,
];

// Delivery patterns: "4-6 weeks", "ships in 3 days", "lead time 4 weeks".
const deliveryPatterns = [
  /lead\s+time\s*:\s*(\d+)(?:\s*-\s*(\d+))?\s*(?:weeks?|days?)/i,
  /(?:ships?|delivery)\s+in\s+(\d+)(?:\s*-\s*(\d+))?\s*(?:weeks?|days?)/i,
  /(\d+)(?:\s*-\s*(\d+))?\s*(?:weeks?|days?)\s*(?:delivery|lead\s+time)/i,
  /(\d+)(?:\s*-\s*(\d+))?\s*(?:weeks?|days?)/i,
];

// --- Helper: parse numeric token (European/US format) ---

/**
 * Parse a raw numeric token; handles European decimal-comma
 * ("1.234,56") and US/ISO ("1,234.56") formats.
 * Returns NaN on non-finite result.
 */
function parseNumeric(token: string): number {
  const t = token.trim();
  if (/,\d{2}$/.test(t)) {
    // European: comma is decimal separator.
    const normalized = t.replace(/\./g, '').replace(',', '.');
    return parseFloat(normalized);
  }
  // US/ISO: comma is thousands separator.
  return parseFloat(t.replace(/,/g, ''));
}

// --- Helper: expand context window to line/sentence boundaries ---

/**
 * Expand ±60 char context to full line/cell boundaries.
 * Caps expansion to ~240 chars.
 */
function expandContextWindow(content: string, matchIndex: number, priceText: string, baseWindow: string): string {
  // Delimiters: \n, |, •, ►, . Use matchIndex directly (not indexOf).
  const windowStart = Math.max(0, matchIndex - 60);
  const windowEnd = matchIndex + priceText.length + 60;

  // Expand backward to nearest delimiter.
  let expandStart = Math.max(0, windowStart - 120);
  const delimBefore = Math.max(
    content.lastIndexOf('\n', expandStart),
    content.lastIndexOf('|', expandStart),
    content.lastIndexOf('•', expandStart),
    content.lastIndexOf('►', expandStart),
    content.lastIndexOf('.', expandStart),
  );
  if (delimBefore > 0) expandStart = delimBefore;

  // Expand forward to nearest delimiter.
  let expandEnd = Math.min(content.length, windowEnd + 120);
  const delimAfter = Math.min(
    content.indexOf('\n', expandEnd),
    content.indexOf('|', expandEnd),
    content.indexOf('•', expandEnd),
    content.indexOf('►', expandEnd),
    content.indexOf('.', expandEnd),
  );
  if (delimAfter > 0) expandEnd = delimAfter;

  // Cap to ~240 chars total.
  const expanded = content.slice(expandStart, Math.min(expandEnd, expandStart + 240));
  return expanded.length > baseWindow.length ? expanded : baseWindow;
}

// --- Helper: normalize delivery to "X-Y weeks" ---

/** Normalize days/weeks range to "X-Y weeks"; round up from days. */
function normalizeDelivery(value1: string | undefined, value2: string | undefined, unit: string | undefined): string {
  if (!value1) return '';

  const num1 = parseInt(value1, 10);
  const num2 = value2 ? parseInt(value2, 10) : num1;

  const isWeeks = !unit || /weeks?/i.test(unit);

  // Convert days to weeks (ceiling) if needed.
  let weeks1 = isWeeks ? num1 : Math.ceil(num1 / 7);
  let weeks2 = isWeeks ? num2 : Math.ceil(num2 / 7);

  if (weeks1 > weeks2) {
    [weeks1, weeks2] = [weeks2, weeks1];
  }

  return weeks1 === weeks2 ? `${weeks1}-${weeks1} weeks` : `${weeks1}-${weeks2} weeks`;
}

// --- Helper: verify value against content ---

/**
 * True when value re-appears in content.
 * Numeric: digit-boundary token scan (prevents "50" matching "5012").
 * Non-numeric: alphanumeric substring.
 */
export function verifyAgainstContent(value: string | number, content: string): boolean {
  if (value === '' || value === 0) return false;

  const valueStr = String(value);

  // Numeric: digits/dots/commas only.
  const isNumeric = /^[\d.,]+$/.test(valueStr.trim());

  if (isNumeric) {
    // Scan every number token in content; accept if any equals target.
    // Handles thousands separators and decimal commas.
    const target = typeof value === 'number' ? value : parseNumeric(valueStr);
    if (!Number.isFinite(target) || target === 0) return false;
    const tokenRe = /\d[\d.,]*/g;
    let tok: RegExpExecArray | null;
    while ((tok = tokenRe.exec(content)) !== null) {
      const parsed = parseNumeric(tok[0]);
      if (Number.isFinite(parsed) && Math.abs(parsed - target) < 0.005) return true;
    }
    return false;
  }

  // Non-numeric: alphanumeric substring.
  const normalized = valueStr.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normalized) return false;
  const contentNormalized = content.toLowerCase().replace(/[^a-z0-9]/g, '');
  return contentNormalized.includes(normalized);
}

// --- Main: manualExtract ---

/**
 * Extract supplier fields via regex. detected skips absent fields.
 * specTokens forwarded to selectBestPrice for variant disambiguation.
 * Returns fields, per-field confidence, missing list, priceConfidence.
 */
export function manualExtract(
  content: string,
  detected?: DetectedFieldMap,
  specTokens?: SpecTokenInput[],
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

  // Skip verify for symbol-inferred fields (not literal in content).
  const skipVerify = new Set<keyof ManualFields>();

  let priceConfidence: number | undefined;

  // supplier_name: left empty; LLM gap-fill handles it.
  confidence.supplier_name = 0;

  // --- Price + Currency: multi-price disambiguation ---
  // Collect all prices, build candidates, selectBestPrice picks best.
  if (!detected || detected.has_price !== false) {
    const candidates: PriceCandidate[] = [];

    // Pass 1: currency-tagged prices (symbol or ISO adjacent to number).
    pricePattern.lastIndex = 0;
    let pm: RegExpExecArray | null;
    while ((pm = pricePattern.exec(content)) !== null) {
      const priceText = pm[0];
      const matchIndex = pm.index;

      // Parse with European/US disambiguation.
      const numericMatch = priceText.match(/[\d,.]+/);
      if (!numericMatch) continue;
      const value = parseNumeric(numericMatch[0]);
      if (isNaN(value) || value <= 0) continue;

      // Derive currency: ISO code first, then symbol map.
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

      // ±60 char context; expand to line/sentence boundaries.
      const ctxStart = Math.max(0, matchIndex - 60);
      const ctxEnd = Math.min(content.length, matchIndex + priceText.length + 60);
      const baseWindow = content.slice(ctxStart, ctxEnd);
      const context = specTokens && specTokens.length > 0
        ? expandContextWindow(content, matchIndex, priceText, baseWindow)
        : baseWindow;
      candidates.push({ value, currency, context });
    }

    // Pass 2: labeled prices (no currency symbol required).
    labeledPricePattern.lastIndex = 0;
    let lm: RegExpExecArray | null;
    while ((lm = labeledPricePattern.exec(content)) !== null) {
      const rawNum = lm[1]; // numeric string from label pattern
      const matchIndex = lm.index;
      const value = parseNumeric(rawNum);
      if (isNaN(value) || value <= 0) continue;

      // Look for currency within ±15 chars.
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

      // ±60 char context; expand to line/sentence boundaries.
      const ctxStart = Math.max(0, matchIndex - 60);
      const ctxEnd = Math.min(content.length, matchIndex + lm[0].length + 60);
      const baseWindow = content.slice(ctxStart, ctxEnd);
      const context = specTokens && specTokens.length > 0
        ? expandContextWindow(content, matchIndex, lm[0], baseWindow)
        : baseWindow;
      candidates.push({ value, currency, context });
    }

    // Disambiguate: pick candidate best matching spec tokens.
    const best = selectBestPrice(candidates, specTokens);
    if (best) {
      fields.bidder_unit_price = best.value;
      confidence.bidder_unit_price = 0.8;
      if (specTokens && specTokens.length > 0) {
        priceConfidence = best.matchConfidence;
      }

      if (best.currency) {
        fields.currency_code = best.currency;
        // High confidence if ISO code appears literally in content.
        // Symbol-inferred codes ($/€/£) won't verify — skip the gate.
        if (verifyAgainstContent(best.currency, content)) {
          confidence.currency_code = 0.9;
        } else {
          confidence.currency_code = 0.6;
          skipVerify.add('currency_code');
        }
      }
    }
    // No candidate: price/currency stay empty, added to missing below.
  }

  // --- Contact: Email ---
  if (!detected || detected.has_contact_email !== false) {
    const emailMatch = content.match(emailPattern);
    if (emailMatch) {
      fields.contact_email = emailMatch[0];
      confidence.contact_email = 0.95;
    } else {
      // Fallback: obfuscated form "info [at] example [dot] com".
      const obfMatch = content.match(obfuscatedEmailPattern);
      if (obfMatch) {
        const reconstructed = normalizeObfuscatedEmail(obfMatch);
        fields.contact_email = reconstructed;
        confidence.contact_email = 0.85;
        // Reconstructed address won't appear verbatim; skip verify.
        skipVerify.add('contact_email');
      }
    }
  }

  // --- Contact: Phone ---
  if (!detected || detected.has_contact_phone !== false) {
    const phoneMatch = content.match(phonePattern);
    if (phoneMatch) {
      // Require 7+ digits for plausibility.
      const digitCount = (phoneMatch[0].match(/\d/g) || []).length;
      if (digitCount >= 7) {
        fields.contact_phone = phoneMatch[0];
        confidence.contact_phone = 0.8;
      }
    }

    if (!fields.contact_phone) {
      // Fallback: labeled-phone pattern.
      const labeledMatch = content.match(labeledPhonePattern);
      if (labeledMatch && labeledMatch[1]) {
        const digitCount = (labeledMatch[1].match(/\d/g) || []).length;
        if (digitCount >= 7) {
          fields.contact_phone = labeledMatch[1].trim();
          confidence.contact_phone = 0.7;
        }
      }
    }
  }

  // --- Stock: available_qty ---
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

  // --- Delivery: delivery_time ---
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
            // Normalized time won't verify verbatim; skip verify gate.
            skipVerify.add('delivery_time');
            break;
          }
        }
      }
    }
  }

  // --- Verify gate: re-check each field against content ---
  // skipVerify fields (symbol-inferred) accepted without verification.
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
    // Symbol-inferred: keep without verifying.
    if (fields.currency_code === '') {
      missing.push('currency_code');
    }
  } else if (fields.currency_code === '' || !verifyAgainstContent(fields.currency_code, content)) {
    fields.currency_code = '';
    confidence.currency_code = 0;
    missing.push('currency_code');
  }

  if (skipVerify.has('delivery_time')) {
    // Normalized delivery: keep without verifying.
    if (fields.delivery_time === '') {
      missing.push('delivery_time');
    }
  } else if (fields.delivery_time === '' || !verifyAgainstContent(fields.delivery_time, content)) {
    fields.delivery_time = '';
    confidence.delivery_time = 0;
    missing.push('delivery_time');
  }

  if (skipVerify.has('contact_email')) {
    // Reconstructed from obfuscated form; not verbatim in content.
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

  const result: ManualExtractResult = { fields, confidence, missing };
  if (priceConfidence !== undefined) {
    result.priceConfidence = priceConfidence;
  }
  return result;
}
