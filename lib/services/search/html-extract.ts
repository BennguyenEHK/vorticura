// HTML Extract: structured-data price layer (Layer 2).

import * as cheerio from 'cheerio';
import { selectBestPrice, type PriceCandidate, type SpecTokenInput } from './price-select';

// --- Public API ---

/** Canonical price extracted from structured HTML metadata. */
export interface StructuredExtract {
  price: number;
  currency: string;
  /** 0..1 confidence of the selected price variant. */
  confidence?: number;
}

// Cap HTML input to avoid runaway cheerio parse.
const HTML_BYTE_CAP = 200_000;

// --- Helper: normalize a raw price token ---

/**
 * Parse a raw price token with European/US format disambiguation.
 * Returns NaN when the token is not a valid number.
 */
function parsePrice(raw: string): number {
  const t = raw.trim();
  if (/,\d{2}$/.test(t)) {
    // European format: comma is decimal separator.
    const normalized = t.replace(/\./g, '').replace(',', '.');
    return parseFloat(normalized);
  }
  // US/ISO format: comma is thousands separator.
  return parseFloat(t.replace(/,/g, ''));
}

/** Normalise currency: uppercase 3-letter ISO code or ''. */
function normCurrency(raw: string | undefined | null): string {
  if (!raw) return '';
  const upper = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(upper) ? upper : '';
}

// --- Source A: JSON-LD ---

/**
 * Walk a JSON-LD node and collect PriceCandidates from
 * Product/Offer/AggregateOffer nodes, including per-variant pairing.
 */
function collectFromJsonLdNode(node: unknown, candidates: PriceCandidate[]): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectFromJsonLdNode(item, candidates);
    }
    return;
  }

  if (typeof node !== 'object' || node === null) return;

  const obj = node as Record<string, unknown>;

  // Recurse into @graph arrays.
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      collectFromJsonLdNode(item, candidates);
    }
  }

  const type = obj['@type'];
  const typeStr = Array.isArray(type) ? type.join(' ') : String(type ?? '');
  const isProduct = /product/i.test(typeStr);
  const isOffer = /offer/i.test(typeStr);       // covers Offer + AggregateOffer

  // Build context from name/sku/description on this node.
  const contextParts: string[] = [];
  for (const key of ['name', 'sku', 'description'] as const) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) contextParts.push(v.trim());
  }
  const nodeContext = contextParts.join(' ').slice(0, 240);

  // Offer/AggregateOffer: pull price directly; include lowPrice/highPrice.
  if (isOffer) {
    for (const priceKey of ['price', 'lowPrice', 'highPrice']) {
      const rawPrice = obj[priceKey];
      if (rawPrice !== undefined && rawPrice !== null) {
        const value = parsePrice(String(rawPrice));
        if (!isNaN(value) && value > 0) {
          const currency = normCurrency(obj['priceCurrency'] as string | undefined);
          candidates.push({ value, currency, context: nodeContext });
        }
      }
    }
  }

  // Product: handle variants and recurse into offers.
  if (isProduct) {
    // Per-variant pairing: one candidate per hasVariant entry.
    const variants = obj['hasVariant'];
    if (Array.isArray(variants)) {
      for (const variant of variants) {
        if (typeof variant === 'object' && variant !== null) {
          const variantObj = variant as Record<string, unknown>;
          // Use variant name/sku as context.
          const variantContext: string[] = [];
          for (const key of ['name', 'sku'] as const) {
            const v = variantObj[key];
            if (typeof v === 'string' && v.trim()) variantContext.push(v.trim());
          }
          const variantCtx = variantContext.join(' ').slice(0, 240);

          for (const priceKey of ['price', 'lowPrice', 'highPrice']) {
            const rawPrice = variantObj[priceKey];
            if (rawPrice !== undefined && rawPrice !== null) {
              const value = parsePrice(String(rawPrice));
              if (!isNaN(value) && value > 0) {
                const currency = normCurrency(variantObj['priceCurrency'] as string | undefined);
                candidates.push({ value, currency, context: variantCtx });
              }
            }
          }
        }
      }
    }

    // Offers array: each offer as a potential variant.
    const offers = obj['offers'];
    if (offers !== null && offers !== undefined) {
      if (Array.isArray(offers)) {
        // Multiple offers: treat each as a variant candidate.
        for (const offer of offers) {
          if (typeof offer === 'object' && offer !== null) {
            const offerObj = offer as Record<string, unknown>;
            // Use offer name/sku as variant context.
            const offerContext: string[] = [];
            for (const key of ['name', 'sku'] as const) {
              const v = offerObj[key];
              if (typeof v === 'string' && v.trim()) offerContext.push(v.trim());
            }
            // Fall back to product context if offer has no name/sku.
            const ctx = offerContext.length > 0 ? offerContext.join(' ') : nodeContext;

            for (const priceKey of ['price', 'lowPrice', 'highPrice']) {
              const rawPrice = offerObj[priceKey];
              if (rawPrice !== undefined && rawPrice !== null) {
                const value = parsePrice(String(rawPrice));
                if (!isNaN(value) && value > 0) {
                  const currency = normCurrency(offerObj['priceCurrency'] as string | undefined);
                  candidates.push({ value, currency, context: ctx.slice(0, 240) });
                }
              }
            }
          }
        }
      } else {
        // Single offer: recurse normally.
        collectFromJsonLdNode(offers, candidates);
      }
    }
  }
}

/** Source A — JSON-LD: collect price candidates from all ld+json blocks. */
function collectJsonLd(
  $: cheerio.CheerioAPI,
  candidates: PriceCandidate[],
): void {
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const raw = $(el).html() ?? '';
      if (!raw.trim()) return;
      const parsed: unknown = JSON.parse(raw);
      collectFromJsonLdNode(parsed, candidates);
    } catch {
      // Malformed JSON-LD block — skip.
    }
  });
}

// --- Source B: Microdata ---

/**
 * Source B — Microdata: find [itemprop="price"] elements and
 * pair with nearby priceCurrency. Context = itemscope text.
 */
function collectMicrodata(
  $: cheerio.CheerioAPI,
  candidates: PriceCandidate[],
): void {
  try {
    $('[itemprop="price"]').each((_i, el) => {
      try {
        const $el = $(el);

        // Prefer content attribute; fall back to text.
        const rawPrice = $el.attr('content') ?? $el.text();
        if (!rawPrice) return;

        const value = parsePrice(rawPrice);
        if (isNaN(value) || value <= 0) return;

        // Currency from sibling or nearest itemscope.
        let currency = '';
        const $scope = $el.closest('[itemscope]');
        const $currencyEl = $scope.length
          ? $scope.find('[itemprop="priceCurrency"]').first()
          : $('[itemprop="priceCurrency"]').first();

        if ($currencyEl.length) {
          const rawCurrency = $currencyEl.attr('content') ?? $currencyEl.text();
          currency = normCurrency(rawCurrency);
        }

        // Context: nearest itemscope text, capped.
        const context = ($scope.length ? $scope.text() : '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120);

        candidates.push({ value, currency, context });
      } catch {
        // One malformed itemprop — skip it.
      }
    });
  } catch {
    // Microdata traversal failed — not fatal.
  }
}

// --- Source C: OpenGraph ---

/**
 * Source C — OpenGraph: read product:price:amount + currency.
 * Context = document <title>.
 */
function collectOpenGraph(
  $: cheerio.CheerioAPI,
  candidates: PriceCandidate[],
): void {
  try {
    const rawPrice = $('meta[property="product:price:amount"]').attr('content');
    if (!rawPrice) return;

    const value = parsePrice(rawPrice);
    if (isNaN(value) || value <= 0) return;

    const rawCurrency = $('meta[property="product:price:currency"]').attr('content');
    const currency = normCurrency(rawCurrency);

    // Use document title as context.
    const context = $('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 120);

    candidates.push({ value, currency, context });
  } catch {
    // OpenGraph extraction failed — not fatal.
  }
}

// --- Source D: data-price-amount (Firecrawl JS-rendered DOM) ---

/**
 * Source D — data-price-amount: Magento/WooCommerce rendered-DOM prices.
 * finalPrice candidates pushed first; tier/special prices follow.
 */
function collectDataPriceAmount(
  $: cheerio.CheerioAPI,
  candidates: PriceCandidate[],
): void {
  try {
    const final: PriceCandidate[] = [];
    const other: PriceCandidate[] = [];

    $('[data-price-amount]').each((_i, el) => {
      try {
        const $el = $(el);
        const rawPrice = $el.attr('data-price-amount');
        if (!rawPrice) return;

        const value = parsePrice(rawPrice);
        if (isNaN(value) || value <= 0) return;

        const priceType = $el.attr('data-price-type') ?? '';

        // Context: nearest Offer scope or price-box container.
        const $scope = $el.closest('[itemprop="offers"], .price-box, .product-info-price');
        const context = ($scope.length ? $scope.text() : $el.parent().text())
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120);

        const candidate: PriceCandidate = { value, currency: '', context };
        if (priceType === 'finalPrice') {
          final.push(candidate);
        } else {
          other.push(candidate);
        }
      } catch {
        // Skip malformed element.
      }
    });

    // finalPrice leads; tier/special prices follow.
    candidates.push(...final, ...other);
  } catch {
    // Source D failure is not fatal.
  }
}

// --- Structured metadata extraction ---

/**
 * Lightweight metadata extracted structurally from page HTML.
 * Used to skip per-page LLM calls when all fields are present.
 */
export interface HtmlMeta {
  supplierName: string;
  description: string;
  siteName: string;
  productName: string;
}

/** Trim, collapse whitespace, cap to ~300 chars. */
function normMeta(v: string | undefined | null): string {
  if (!v) return '';
  return v.trim().replace(/\s+/g, ' ').slice(0, 300);
}

/**
 * Walk a JSON-LD node tree; extract supplier/site/product metadata.
 * Precedence: Offer.seller > Product.brand > Organization for supplierName.
 */
function extractMetaFromJsonLd(node: unknown): Partial<HtmlMeta> {
  // supplierName precedence tiers: 0=seller, 1=brand, 2=org.
  const supplierTiers: [string, string, string] = ['', '', ''];
  let siteName    = '';
  let productName = '';
  let description = '';

  try {
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) {
        for (const item of n) walk(item);
        return;
      }
      if (typeof n !== 'object' || n === null) return;

      const obj = n as Record<string, unknown>;

      // Recurse into @graph arrays.
      if (Array.isArray(obj['@graph'])) {
        for (const item of obj['@graph']) walk(item);
      }

      const type = obj['@type'];
      const typeStr = (Array.isArray(type) ? type.join(' ') : String(type ?? '')).toLowerCase();

      const isProduct = typeStr.includes('product');
      const isOrg     = typeStr.includes('organization');
      const isSite    = typeStr.includes('website');
      const isOffer   = typeStr.includes('offer');

      // Organization/WebSite → siteName + tier-2 supplierName.
      if (isOrg || isSite) {
        const name = obj['name'];
        if (typeof name === 'string' && name.trim()) {
          if (!siteName) siteName = normMeta(name);
          if (!supplierTiers[2]) supplierTiers[2] = normMeta(name);
        }
      }

      // Offer → seller.name is tier-0 for supplierName.
      if (isOffer) {
        const seller = obj['seller'];
        if (typeof seller === 'object' && seller !== null) {
          const sellerName = (seller as Record<string, unknown>)['name'];
          if (typeof sellerName === 'string' && sellerName.trim()) {
            if (!supplierTiers[0]) supplierTiers[0] = normMeta(sellerName);
          }
        }
      }

      // Product → productName, description, brand.name (tier-1).
      if (isProduct) {
        const name = obj['name'];
        if (typeof name === 'string' && name.trim()) {
          if (!productName) productName = normMeta(name);
        }

        const desc = obj['description'];
        if (typeof desc === 'string' && desc.trim()) {
          if (!description) description = normMeta(desc);
        }

        // brand.name — tier-1 supplierName (seller beats brand).
        const brand = obj['brand'];
        if (typeof brand === 'object' && brand !== null) {
          const brandName = (brand as Record<string, unknown>)['name'];
          if (typeof brandName === 'string' && brandName.trim()) {
            if (!supplierTiers[1]) supplierTiers[1] = normMeta(brandName);
          }
        }

        // Recurse into offers (may carry seller).
        const offers = obj['offers'];
        if (offers !== null && offers !== undefined) {
          if (Array.isArray(offers)) {
            for (const offer of offers) walk(offer);
          } else {
            walk(offers);
          }
        }
      }
    };

    walk(node);
  } catch {
    // Malformed structure — return accumulated partial result.
  }

  // Resolve supplierName by precedence tier.
  const supplierName = supplierTiers[0] || supplierTiers[1] || supplierTiers[2] || '';

  const result: Partial<HtmlMeta> = {};
  if (supplierName) result.supplierName = supplierName;
  if (siteName)     result.siteName     = siteName;
  if (productName)  result.productName  = productName;
  if (description)  result.description  = description;
  return result;
}

/**
 * Extract supplier/product metadata structurally from page HTML.
 * Sources: OpenGraph → meta[name=description] → JSON-LD → <title>.
 * Never throws; all fields return '' on error.
 */
export function extractMetaFromHtml(html: string): HtmlMeta {
  const empty: HtmlMeta = { supplierName: '', description: '', siteName: '', productName: '' };

  if (!html) return empty;

  try {
    // Cap input to bound cheerio parse cost.
    const htmlChunk = html.slice(0, HTML_BYTE_CAP);
    const $ = cheerio.load(htmlChunk);

    // --- OpenGraph signals ---
    const ogSiteName   = normMeta($('meta[property="og:site_name"]').attr('content'));
    const ogTitle      = normMeta($('meta[property="og:title"]').attr('content'));
    const ogDesc       = normMeta($('meta[property="og:description"]').attr('content'));
    const metaDesc     = normMeta($('meta[name="description"]').attr('content'));
    const titleText    = normMeta($('title').first().text());

    // --- JSON-LD signals ---
    const jsonLdMeta: Partial<HtmlMeta> = {};
    $('script[type="application/ld+json"]').each((_i, el) => {
      try {
        const raw = $(el).html() ?? '';
        if (!raw.trim()) return;
        const parsed: unknown = JSON.parse(raw);
        const partial = extractMetaFromJsonLd(parsed);
        // Merge: first non-empty value per field wins.
        if (!jsonLdMeta.siteName    && partial.siteName)    jsonLdMeta.siteName    = partial.siteName;
        if (!jsonLdMeta.supplierName && partial.supplierName) jsonLdMeta.supplierName = partial.supplierName;
        if (!jsonLdMeta.productName  && partial.productName)  jsonLdMeta.productName  = partial.productName;
        if (!jsonLdMeta.description  && partial.description)  jsonLdMeta.description  = partial.description;
      } catch {
        // Malformed JSON-LD block — skip.
      }
    });

    // --- Resolve per-field with stated precedence ---

    // siteName: og:site_name → JSON-LD org/site → ''.
    const siteName = ogSiteName || jsonLdMeta.siteName || '';

    // productName: JSON-LD Product.name → og:title → <title> → ''.
    const productName = jsonLdMeta.productName || ogTitle || titleText || '';

    // description: og:description → meta description → JSON-LD → productName.
    const description = ogDesc || metaDesc || jsonLdMeta.description || productName || '';

    // supplierName: JSON-LD seller/brand/org → og:site_name → ''.
    const supplierName = jsonLdMeta.supplierName || siteName || '';

    return { supplierName, description, siteName, productName };
  } catch {
    // Top-level guard: never throw.
    return empty;
  }
}

// --- Main: extractFromHtml ---

/**
 * Parse structured-data price signals from page HTML.
 * Sources: A=JSON-LD, B=Microdata, C=OpenGraph, D=data-price-amount.
 * Returns { price: 0, currency: '' } on error or no price found.
 */
export function extractFromHtml(html: string, specTokens?: SpecTokenInput[]): StructuredExtract {
  if (!html) return { price: 0, currency: '' };

  try {
    // Cap input to bound cheerio parse cost.
    const htmlChunk = html.slice(0, HTML_BYTE_CAP);

    const $ = cheerio.load(htmlChunk);

    const candidates: PriceCandidate[] = [];

    // Source A: JSON-LD structured data.
    collectJsonLd($, candidates);

    // Source B: Microdata itemprop annotations.
    collectMicrodata($, candidates);

    // Source C: OpenGraph product price meta tags.
    collectOpenGraph($, candidates);

    // Source D: data-price-amount (Firecrawl JS-rendered DOM).
    collectDataPriceAmount($, candidates);

    const best = selectBestPrice(candidates, specTokens);
    const result: StructuredExtract = {
      price: best?.value ?? 0,
      currency: best?.currency ?? '',
    };
    if (best && specTokens && specTokens.length > 0) {
      result.confidence = best.matchConfidence;
    }
    return result;
  } catch {
    // Top-level guard: never throw.
    return { price: 0, currency: '' };
  }
}

// --- Firecrawl metadata extraction ---

/**
 * Extract metadata from a Firecrawl DocumentMetadata object.
 * Checks both camelCase (SDK) and colon-key (live API) forms.
 * Never throws; all fields return '' on error.
 */
export function extractMetaFromFirecrawl(metadata: Record<string, unknown>): HtmlMeta {
  const empty: HtmlMeta = { supplierName: '', description: '', siteName: '', productName: '' };
  if (!metadata || typeof metadata !== 'object') return empty;

  try {
    // Try camelCase (typed SDK) then colon-key (live API).
    const pick = (camel: string, colonKey: string): string =>
      normMeta(
        (metadata[camel] as string | undefined) ??
        (metadata[colonKey] as string | undefined),
      );

    const ogSiteName  = pick('ogSiteName',    'og:site_name');
    const ogTitle     = pick('ogTitle',       'og:title');
    const ogDesc      = pick('ogDescription', 'og:description');
    const metaDesc    = normMeta(metadata['description'] as string | undefined);
    const titleText   = normMeta(metadata['title'] as string | undefined);

    const siteName    = ogSiteName;
    const productName = ogTitle || titleText;
    const description = ogDesc || metaDesc || productName;
    const supplierName = siteName;

    return { supplierName, description, siteName, productName };
  } catch {
    return empty;
  }
}
