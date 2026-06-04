/** HTML gate: fast regex product page detection and price extraction. */

export interface MicrodataPrice {
  value: number;
  currency?: string;
}

// Compiled at module scope. Bounded patterns, no g flag.
// Detects Schema.org Product itemtype (case-insensitive, http/https).
const productItemtypePattern = /itemtype\s*=\s*["']https?:\/\/schema\.org\/Product["']/i;

// Detects Open Graph product type.
const ogProductPattern = /<meta\s+property\s*=\s*["']og:type["']\s+content\s*=\s*["']product["']/i;

// Detects Schema.org price property.
const itempropPricePattern = /itemprop\s*=\s*["']price["']/i;

// Rejects title containing Home|Homepage|Welcome|Index.
const homepageTitlePattern = /<title[^>]{0,100}>(Home|Homepage|Welcome|Index)[^<]{0,100}<\/title>/i;

// Meta itemprop="price" with content attribute.
const metaIttempropPricePattern = /<meta\s+itemprop\s*=\s*["']price["']\s+content\s*=\s*["']([^"']{0,50})["']/i;

// Open Graph product:price:amount.
const ogPriceAmountPattern = /<meta\s+property\s*=\s*["']product:price:amount["']\s+content\s*=\s*["']([^"']{0,50})["']/i;

// Schema.org inline price in span.
const spanPricePattern = /<span[^>]{0,100}itemprop\s*=\s*["']price["'][^>]{0,100}>\s*([^<]{0,50})<\/span>/i;

// Currency from priceCurrency itemprop.
const priceCurrencyPattern = /itemprop\s*=\s*["']priceCurrency["']\s+content\s*=\s*["']([A-Z]{2,3})["']/i;

// Currency from Open Graph property.
const ogCurrencyPattern = /property\s*=\s*["']product:price:currency["']\s+content\s*=\s*["']([A-Z]{2,3})["']/i;

/**
 * Fast gate to reject non-product pages via regex.
 * Operates on first 16384 chars. Returns true if Product schema detected,
 * unless title looks like a homepage.
 */
export function isLikelyProductPage(html: string): boolean {
  const chunk = html.slice(0, 16384);

  // Reject if title looks like homepage, even with Product schema.
  if (homepageTitlePattern.test(chunk)) {
    return false;
  }

  // True if any product signal detected.
  return (
    productItemtypePattern.test(chunk) ||
    ogProductPattern.test(chunk) ||
    itempropPricePattern.test(chunk)
  );
}

/**
 * Extract price and currency from microdata patterns.
 * Operates on first 16384 chars. Tries meta itemprop, og:price, span inline.
 * Returns null if price is missing or invalid.
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

  if (!priceStr) {
    return null;
  }

  // Strip commas, then parse float.
  const cleanedPrice = priceStr.replace(/,/g, '');
  const value = parseFloat(cleanedPrice);

  // Reject invalid or non-positive prices.
  if (isNaN(value) || value <= 0) {
    return null;
  }

  // Attempt to find currency sibling.
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
