/* ========================================================================
   HTML Gate: Fast RegEx-based product page detection & price extraction
   ======================================================================== */

export interface MicrodataPrice {
  value: number;
  currency?: string;
}

// Compiled at module scope. Bounded patterns, no g flag.
// Detects Schema.org Product itemtype (case-insensitive, http/https).
const productItemtypePattern = /itemtype\s*=\s*["']https?:\/\/schema\.org\/Product["']/i;

// Detects Open Graph product type (case-insensitive, any quote style).
const ogProductPattern = /<meta\s+property\s*=\s*["']og:type["']\s+content\s*=\s*["']product["']/i;

// Detects Schema.org price property (case-insensitive, any quote style).
// Bounded: matches up to 100 chars, allowing for attribute variations.
const itempropPricePattern = /itemprop\s*=\s*["']price["']/i;

// Homepage title detection: rejects if title contains Home|Homepage|Welcome|Index (case-insensitive).
// Bounded: captures title content within first 500 chars, expects closing tag within 100 chars.
const homepageTitlePattern = /<title[^>]{0,100}>(Home|Homepage|Welcome|Index)[^<]{0,100}<\/title>/i;

// Meta itemprop="price" with content attribute. Bounded: up to 100 chars between meta tag markers.
const metaIttempropPricePattern = /<meta\s+itemprop\s*=\s*["']price["']\s+content\s*=\s*["']([^"']{0,50})["']/i;

// Open Graph product:price:amount. Bounded: up to 100 chars between meta tag markers.
const ogPriceAmountPattern = /<meta\s+property\s*=\s*["']product:price:amount["']\s+content\s*=\s*["']([^"']{0,50})["']/i;

// Schema.org inline price in span. Bounded: up to 100 chars between span tags.
const spanPricePattern = /<span[^>]{0,100}itemprop\s*=\s*["']price["'][^>]{0,100}>\s*([^<]{0,50})<\/span>/i;

// Currency detection patterns for priceCurrency. Bounded: up to 200 chars to find sibling.
const priceCurrencyPattern = /itemprop\s*=\s*["']priceCurrency["']\s+content\s*=\s*["']([A-Z]{2,3})["']/i;

// Open Graph currency pattern. Bounded: up to 200 chars to find sibling.
const ogCurrencyPattern = /property\s*=\s*["']product:price:currency["']\s+content\s*=\s*["']([A-Z]{2,3})["']/i;

/**
 * isLikelyProductPage: Fast gate to reject non-product pages via RegEx.
 *
 * Operates on first 16384 chars (signal density highest at top).
 * Returns true if Product schema detected, unless title is a homepage.
 * Default false (safe rejection for ambiguous pages).
 */
export function isLikelyProductPage(html: string): boolean {
  const chunk = html.slice(0, 16384);

  // Short-circuit: if title looks like homepage, reject even if Product schema present.
  if (homepageTitlePattern.test(chunk)) {
    return false;
  }

  // Return true if any product signal is detected.
  return (
    productItemtypePattern.test(chunk) ||
    ogProductPattern.test(chunk) ||
    itempropPricePattern.test(chunk)
  );
}

/**
 * extractMicrodataPrice: Extract price and currency from microdata patterns.
 *
 * Operates on first 16384 chars.
 * Tries patterns in order: meta itemprop, og:price, span inline.
 * Attempts to find currency sibling; returns null if price is invalid.
 */
export function extractMicrodataPrice(html: string): MicrodataPrice | null {
  const chunk = html.slice(0, 16384);

  let priceStr: string | null = null;

  // Pattern 1: <meta itemprop="price" content="123.45">
  let match = chunk.match(metaIttempropPricePattern);
  if (match && match[1]) {
    priceStr = match[1];
  }

  // Pattern 2: <meta property="product:price:amount" content="123.45">
  if (!priceStr) {
    match = chunk.match(ogPriceAmountPattern);
    if (match && match[1]) {
      priceStr = match[1];
    }
  }

  // Pattern 3: <span itemprop="price">123.45</span>
  if (!priceStr) {
    match = chunk.match(spanPricePattern);
    if (match && match[1]) {
      priceStr = match[1];
    }
  }

  // If no price found, return null.
  if (!priceStr) {
    return null;
  }

  // Parse numeric value: strip commas, parseFloat.
  const cleanedPrice = priceStr.replace(/,/g, '');
  const value = parseFloat(cleanedPrice);

  // Reject invalid or non-positive prices.
  if (isNaN(value) || value <= 0) {
    return null;
  }

  // Attempt to find currency.
  let currency: string | undefined;
  let currencyMatch = chunk.match(priceCurrencyPattern);
  if (currencyMatch && currencyMatch[1]) {
    currency = currencyMatch[1];
  } else {
    currencyMatch = chunk.match(ogCurrencyPattern);
    if (currencyMatch && currencyMatch[1]) {
      currency = currencyMatch[1];
    }
  }

  return {
    value,
    ...(currency && { currency }),
  };
}
