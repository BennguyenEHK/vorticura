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
import { selectBestPrice, type PriceCandidate } from './price-select';

// =============================================
// Public API
// =============================================

/** Canonical price extracted from structured HTML metadata. */
export interface StructuredExtract {
  price: number;
  currency: string;
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

  // For a Product node, recurse into offers (object OR array).
  if (isProduct) {
    const offers = obj['offers'];
    if (offers !== null && offers !== undefined) {
      if (Array.isArray(offers)) {
        for (const offer of offers) {
          collectFromJsonLdNode(offer, candidates);
        }
      } else {
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
// Main: extractFromHtml
// =============================================

/**
 * Parse structured-data price signals out of real page HTML.
 *
 * Sources tried (each independently, in parallel within the same cheerio pass):
 *   A. JSON-LD  — most authoritative; preferred when present.
 *   B. Microdata — Schema.org itemprop annotations in the DOM.
 *   C. OpenGraph — product:price:amount / product:price:currency meta tags.
 *
 * All candidates are passed to selectBestPrice for spec-token-aware
 * disambiguation. Returns { price: 0, currency: '' } on any error or when
 * no valid price is found.
 */
export function extractFromHtml(html: string, specTokens?: string[]): StructuredExtract {
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

    const best = selectBestPrice(candidates, specTokens ?? []);
    return {
      price: best?.value ?? 0,
      currency: best?.currency ?? '',
    };
  } catch {
    // Top-level guard: never throw.
    return { price: 0, currency: '' };
  }
}
