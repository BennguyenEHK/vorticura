/* ========================================================================
   HTML Extract: Structured-data (canonical price) layer — Layer 2 of
   the extraction cascade.

   Operates on real page HTML (not plain text). Parses three structured
   price sources — JSON-LD, Microdata, and OpenGraph — via cheerio so we
   read the DOM tree rather than guessing at raw markup with regex.

   Distinct from html-gate.ts, which runs fast regex passes on the raw
   HTML string. This module runs AFTER the gate passes and produces a
   single disambiguated price via the shared selectBestPrice util.
   ======================================================================== */

import * as cheerio from 'cheerio';
import { selectBestPrice, type PriceCandidate, type SpecTokenInput } from './price-select';

// =============================================
// Public API
// =============================================

/** Canonical price extracted from structured HTML metadata. */
export interface StructuredExtract {
  price: number;
  currency: string;
  /** optional: 0..1 confidence of the selected price variant match. */
  confidence?: number;
}

// Cap HTML input to avoid runaway cheerio parse on multi-megabyte pages.
const HTML_BYTE_CAP = 200_000;

// =============================================
// Helper: normalize a raw price token
// =============================================

/**
 * Parse a raw price token with European/US format disambiguation.
 * Returns NaN when the token is not a valid number.
 *
 * Heuristic (robust for 2-decimal currency values):
 *   - Token ends in comma + exactly 2 digits  → European decimal-comma format.
 *     Remove all dots (thousands separators), replace trailing comma with dot.
 *     e.g. "1.234,56" → "1234.56"; "1234,56" → "1234.56"
 *   - Otherwise → US/ISO format: comma is thousands separator, remove it.
 *     e.g. "1,234.56" → "1234.56"; "500,000" → "500000"
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

/**
 * Normalise a currency token: uppercase 3-letter ISO code or ''.
 */
function normCurrency(raw: string | undefined | null): string {
  if (!raw) return '';
  const upper = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(upper) ? upper : '';
}

// =============================================
// Source A: JSON-LD
// =============================================

/**
 * Walk a JSON-LD node (object or array) and collect PriceCandidates from
 * Product / Offer / AggregateOffer nodes. Handles nested @graph arrays.
 *
 * For Product nodes with hasVariant array: create one candidate per variant
 * using the variant's name/sku as context for matching.
 *
 * Called per <script type="application/ld+json"> block; wrapped in try/catch
 * by the caller so a malformed block doesn't abort the rest.
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

  // Build a context string from name / sku / description on this node.
  const contextParts: string[] = [];
  for (const key of ['name', 'sku', 'description'] as const) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) contextParts.push(v.trim());
  }
  const nodeContext = contextParts.join(' ').slice(0, 240);

  // For an Offer/AggregateOffer node, pull price directly from this node.
  if (isOffer) {
    // AggregateOffer may carry lowPrice and/or highPrice rather than (or alongside) price.
    // Include highPrice as a candidate so selectBestPrice can pick by spec-token match
    // rather than always defaulting to the lowest variant price.
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

  // For a Product node, handle variants and recurse into offers.
  if (isProduct) {
    // PER-VARIANT PAIRING: if the product has a hasVariant array,
    // create one candidate per variant using that variant's name/sku as context.
    const variants = obj['hasVariant'];
    if (Array.isArray(variants)) {
      for (const variant of variants) {
        if (typeof variant === 'object' && variant !== null) {
          const variantObj = variant as Record<string, unknown>;
          // Use variant name/sku as context for this variant candidate.
          const variantContext: string[] = [];
          for (const key of ['name', 'sku'] as const) {
            const v = variantObj[key];
            if (typeof v === 'string' && v.trim()) variantContext.push(v.trim());
          }
          const variantCtx = variantContext.join(' ').slice(0, 240);

          // If the variant has a price directly, use it.
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

    // Also handle offers array: each distinct offer could be a variant.
    const offers = obj['offers'];
    if (offers !== null && offers !== undefined) {
      if (Array.isArray(offers)) {
        // Multiple distinct offers: treat each as a potential variant.
        for (const offer of offers) {
          if (typeof offer === 'object' && offer !== null) {
            const offerObj = offer as Record<string, unknown>;
            // For each offer in an array, use offer name/sku as variant context.
            const offerContext: string[] = [];
            for (const key of ['name', 'sku'] as const) {
              const v = offerObj[key];
              if (typeof v === 'string' && v.trim()) offerContext.push(v.trim());
            }
            // If no name/sku on the offer itself, fall back to product context.
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
        // Single offer object: recurse normally.
        collectFromJsonLdNode(offers, candidates);
      }
    }
  }
}

/**
 * Source A — JSON-LD: parse every <script type="application/ld+json"> block
 * and collect price candidates from Product/Offer/AggregateOffer nodes.
 */
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
      // Malformed JSON-LD — skip this block, continue with remaining ones.
    }
  });
}

// =============================================
// Source B: Microdata
// =============================================

/**
 * Source B — Microdata: find [itemprop="price"] elements and pair them with a
 * nearby [itemprop="priceCurrency"]. Context = closest itemscope container text.
 */
function collectMicrodata(
  $: cheerio.CheerioAPI,
  candidates: PriceCandidate[],
): void {
  try {
    $('[itemprop="price"]').each((_i, el) => {
      try {
        const $el = $(el);

        // Value: prefer content attribute (meta/link elements), fall back to text.
        const rawPrice = $el.attr('content') ?? $el.text();
        if (!rawPrice) return;

        const value = parsePrice(rawPrice);
        if (isNaN(value) || value <= 0) return;

        // Currency: sibling or nearby [itemprop="priceCurrency"] within the closest itemscope.
        let currency = '';
        const $scope = $el.closest('[itemscope]');
        const $currencyEl = $scope.length
          ? $scope.find('[itemprop="priceCurrency"]').first()
          : $('[itemprop="priceCurrency"]').first();

        if ($currencyEl.length) {
          const rawCurrency = $currencyEl.attr('content') ?? $currencyEl.text();
          currency = normCurrency(rawCurrency);
        }

        // Context: closest itemscope container text, trimmed and capped.
        const context = ($scope.length ? $scope.text() : '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120);

        candidates.push({ value, currency, context });
      } catch {
        // One malformed itemprop node — skip it.
      }
    });
  } catch {
    // Microdata traversal failed entirely — not fatal.
  }
}

// =============================================
// Source C: OpenGraph
// =============================================

/**
 * Source C — OpenGraph: read product:price:amount + product:price:currency meta
 * tags. Context = document <title> text.
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

    // Use document title as context for disambiguation.
    const context = $('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 120);

    candidates.push({ value, currency, context });
  } catch {
    // OpenGraph extraction failed — not fatal.
  }
}

// =============================================
// Source D: data-price-amount (Firecrawl JS-rendered DOM)
// =============================================

/**
 * Source D — data-price-amount: Magento / WooCommerce rendered-DOM price
 * containers. Firecrawl returns JS-executed HTML where price nodes like
 * <span data-price-amount="5084.93" data-price-type="finalPrice"> are
 * directly accessible in the DOM. A plain fetch leaves these values inside
 * a <script> tag that Source A never sees.
 *
 * Priority: data-price-type="finalPrice" candidates are pushed first
 * (the customer-facing unit price); tier/special prices follow as secondary
 * candidates for selectBestPrice to compare against spec tokens.
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

        // Context: nearest Schema.org Offer scope or price-box container.
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

    // finalPrice candidates lead (most authoritative); tier/special prices follow.
    candidates.push(...final, ...other);
  } catch {
    // Source D failure is not fatal.
  }
}

// =============================================
// Structured metadata extraction (supplier name, description, etc.)
// =============================================

/**
 * Lightweight metadata fields extracted structurally from page HTML.
 * Used by the orchestrator to skip a per-page LLM call when all fields are present.
 *
 * - supplierName: best vendor/seller name available in structured data.
 * - description:  og:description → meta[name="description"] → JSON-LD Product.description → productName.
 * - siteName:     og:site_name → JSON-LD Organization/WebSite name → ''.
 * - productName:  JSON-LD Product.name → og:title → <title> → ''.
 */
export interface HtmlMeta {
  supplierName: string;
  description: string;
  siteName: string;
  productName: string;
}

/** Trim, collapse whitespace, and cap a string to ~300 chars. */
function normMeta(v: string | undefined | null): string {
  if (!v) return '';
  return v.trim().replace(/\s+/g, ' ').slice(0, 300);
}

/**
 * Walk a JSON-LD node tree and extract supplier/site-name and product metadata.
 * Returns a partial HtmlMeta with fields populated from the best candidates found.
 *
 * Precedence per field (resolved after the full walk, not eagerly):
 *   supplierName: Offer.seller.name → Product.brand.name → top-level Organization.name
 *   siteName:     Organization.name or WebSite.name (top-level or @graph)
 *   productName:  Product.name
 *   description:  Product.description
 *
 * Wrapped in try/catch; on any error returns the partial result accumulated so far.
 */
function extractMetaFromJsonLd(node: unknown): Partial<HtmlMeta> {
  // Collect candidates at each precedence tier before resolving.
  // Precedence tiers for supplierName (lower index = higher priority):
  //   0 = Offer.seller.name, 1 = Product.brand.name, 2 = Organization.name
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

      // Organization / WebSite — siteName candidates (tier 2 for supplierName).
      if (isOrg || isSite) {
        const name = obj['name'];
        if (typeof name === 'string' && name.trim()) {
          if (!siteName) siteName = normMeta(name);
          // Also fill tier-2 supplierName from org/site name.
          if (!supplierTiers[2]) supplierTiers[2] = normMeta(name);
        }
      }

      // Offer — seller.name is tier-0 (highest priority) for supplierName.
      if (isOffer) {
        const seller = obj['seller'];
        if (typeof seller === 'object' && seller !== null) {
          const sellerName = (seller as Record<string, unknown>)['name'];
          if (typeof sellerName === 'string' && sellerName.trim()) {
            if (!supplierTiers[0]) supplierTiers[0] = normMeta(sellerName);
          }
        }
      }

      // Product — productName, description, brand.name (tier-1 supplierName).
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
    // Malformed structure — return whatever was accumulated.
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
 * Extract supplier/product metadata structurally from page HTML using cheerio.
 *
 * Sources (in precedence order per field — see HtmlMeta for field rules):
 *   - OpenGraph meta tags (og:site_name, og:title, og:description).
 *   - Standard meta[name="description"].
 *   - JSON-LD (Product, Offer, Organization, WebSite nodes).
 *   - <title> element (productName fallback).
 *
 * Never throws — on any error or empty html all fields return ''.
 * Input is capped to HTML_BYTE_CAP before parsing (same as extractFromHtml).
 */
export function extractMetaFromHtml(html: string): HtmlMeta {
  const empty: HtmlMeta = { supplierName: '', description: '', siteName: '', productName: '' };

  if (!html) return empty;

  try {
    // Cap input to bound cheerio parse cost on very large pages.
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
        // Malformed JSON-LD block — skip and continue.
      }
    });

    // --- Resolve per-field with stated precedence ---

    // siteName: og:site_name → JSON-LD org/site name → ''.
    const siteName = ogSiteName || jsonLdMeta.siteName || '';

    // productName: JSON-LD Product.name → og:title → <title> → ''.
    const productName = jsonLdMeta.productName || ogTitle || titleText || '';

    // description: og:description → meta[name="description"] → JSON-LD Product.description → productName → ''.
    const description = ogDesc || metaDesc || jsonLdMeta.description || productName || '';

    // supplierName: JSON-LD Offer.seller.name → Product.brand.name → Org.name → og:site_name → ''.
    const supplierName = jsonLdMeta.supplierName || siteName || '';

    return { supplierName, description, siteName, productName };
  } catch {
    // Top-level guard: never throw.
    return empty;
  }
}

// =============================================
// Main: extractFromHtml
// =============================================

/**
 * Parse structured-data price signals out of real page HTML.
 *
 * Sources tried (each independently, in parallel within the same cheerio pass):
 *   A. JSON-LD  — most authoritative; preferred when present. Includes per-variant pairing.
 *   B. Microdata — Schema.org itemprop annotations in the DOM.
 *   C. OpenGraph — product:price:amount / product:price:currency meta tags.
 *
 * All candidates are passed to selectBestPrice for spec-token-aware
 * disambiguation. Returns { price: 0, currency: '', confidence?: number } on any error or when
 * no valid price is found.
 */
export function extractFromHtml(html: string, specTokens?: SpecTokenInput[]): StructuredExtract {
  // Guard: missing input.
  if (!html) return { price: 0, currency: '' };

  try {
    // Cap input to bound cheerio parse cost on very large pages.
    const htmlChunk = html.slice(0, HTML_BYTE_CAP);

    const $ = cheerio.load(htmlChunk);

    const candidates: PriceCandidate[] = [];

    // Source A: JSON-LD structured data.
    collectJsonLd($, candidates);

    // Source B: Microdata itemprop annotations.
    collectMicrodata($, candidates);

    // Source C: OpenGraph product price meta tags.
    collectOpenGraph($, candidates);

    // Source D: data-price-amount (Firecrawl JS-rendered DOM price containers).
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

// =============================================
// Firecrawl metadata extraction
// =============================================

/**
 * Extract supplier/product metadata from a Firecrawl DocumentMetadata object.
 *
 * Firecrawl strips <meta> and <script> tags from the rendered HTML but pre-parses
 * them into a metadata object. This function reads that object directly, covering
 * both the typed camelCase fields (ogTitle, ogSiteName) emitted by newer SDK
 * versions AND the colon-keyed strings (og:title, og:site_name) returned by the
 * live API (both forms observed in production; we check both to be safe).
 *
 * Field precedence mirrors extractMetaFromHtml:
 *   supplierName : og:site_name → ''
 *   description  : og:description → description → productName → ''
 *   siteName     : og:site_name → ''
 *   productName  : og:title → title → ''
 *
 * Never throws — on any error all fields return ''.
 */
export function extractMetaFromFirecrawl(metadata: Record<string, unknown>): HtmlMeta {
  const empty: HtmlMeta = { supplierName: '', description: '', siteName: '', productName: '' };
  if (!metadata || typeof metadata !== 'object') return empty;

  try {
    // Read a field trying camelCase first (typed SDK), then colon-key (live API).
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
