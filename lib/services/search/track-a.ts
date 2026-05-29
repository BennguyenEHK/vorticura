// =============================================
// TRACK A — deterministic microdata supplier extraction (Stage 7)
// =============================================
// Pure, no I/O, no LLM. Given the live product-page snippets for one RFQ item,
// scan for the first page that exposes COMPLETE structured pricing (price AND
// currency) via schema.org / Open Graph microdata. When found, we can build a
// supplier row from structured ground truth and SKIP the LLM entirely
// (search_mecha.md stage 7: "if complete → skip the LLM, free + instant").
//
// "Complete" deliberately requires BOTH a price and a currency: a bare price
// with no currency is ambiguous, so we fall through to Track B (the LLM) rather
// than guess. isProductPage is injected (same param-passing pattern as
// runAgenticTier3) so this module stays free of the index.ts dependency graph
// and remains trivially unit-testable.

import type { TavilySnippet } from './tavily-client';
import { extractMicrodataPrice } from './html-gate';

/** Subset of a supplier row Track A can fill deterministically (no LLM). */
export interface DeterministicSupplier {
  supplier_name: string;
  source_url: string;
  bidder_description: string;
  bidder_unit_price: number;
  currency_code: string;
}

// Second-level-domain labels that are NOT the brand (so we skip past them when
// deriving a display name, e.g. "valveworld.com.vn" → "valveworld", not "com").
const SLD_LABELS = new Set(['com', 'co', 'net', 'org', 'gov', 'edu', 'biz']);

/**
 * Derive a human-readable supplier name from a URL host. Strips `www.`, skips
 * generic SLD labels, and title-cases the registrable brand label.
 *   https://www.valveworld.com/p/x   → "Valveworld"
 *   https://shop.valveworld.com.vn/x → "Valveworld"
 * Returns '' for an unparseable URL.
 */
export function supplierNameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '');
    const parts = host.split('.');
    let idx = parts.length - 2; // registrable label, by default
    if (parts.length >= 3 && SLD_LABELS.has(parts[idx])) idx = parts.length - 3;
    const core = parts[idx] || parts[0] || host;
    return core ? core.charAt(0).toUpperCase() + core.slice(1) : host;
  } catch {
    return '';
  }
}

/**
 * Track A: return the first live product-page snippet whose microdata yields a
 * complete price+currency, mapped to a DeterministicSupplier. Returns null when
 * no page is complete — the caller then falls back to Track B (LLM extraction).
 */
export function buildDeterministicSupplier(
  snippets: TavilySnippet[],
  isProductPage: (url: string) => boolean,
): DeterministicSupplier | null {
  for (const snippet of snippets) {
    if (!snippet.url || !isProductPage(snippet.url)) continue;

    const microdata = extractMicrodataPrice(snippet.content || '');
    // Require BOTH price and currency before short-circuiting the LLM.
    if (!microdata || !microdata.currency) continue;

    return {
      supplier_name: supplierNameFromUrl(snippet.url),
      source_url: snippet.url,
      bidder_description: snippet.title || snippet.snippet || '',
      bidder_unit_price: microdata.value,
      currency_code: microdata.currency,
    };
  }
  return null;
}
