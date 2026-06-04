/* ========================================================================
   Firecrawl Client — L2 HTML source for the structured extraction layer.

   Wraps Firecrawl scrape to return the JS-rendered HTML and parsed metadata
   for a single URL. Used in supplier-search-actions.ts after the L0 liveness
   check to provide a richer HTML source for L2 (extractFromHtml).

   Why Firecrawl for L2:
     • Bot-protected pages (403 on direct fetch) are accessible via Firecrawl.
     • JS-rendered price containers (data-price-amount) appear in the DOM after
       JS execution, which a basic fetch misses but Firecrawl captures.
     • <meta> tags are pre-parsed into a structured metadata object, usable
       directly by extractMetaFromFirecrawl() without cheerio.

   Env gate: FIRECRAWL_API_KEY — if absent, firecrawlFetch() returns null
   immediately so the caller falls back to live.html without any latency cost.
   ======================================================================== */

import { Firecrawl, type DocumentMetadata } from 'firecrawl';

// Re-export DocumentMetadata so callers don't depend on firecrawl directly.
export type { DocumentMetadata as FirecrawlMeta };

export interface FirecrawlResult {
  /** JS-rendered page HTML — passed to extractFromHtml (L2). */
  html: string;
  /** Pre-parsed OG / meta fields — passed to extractMetaFromFirecrawl. */
  meta: DocumentMetadata;
}

/** Timeout for Firecrawl scrape calls. Default 15 s — enough for a JS-heavy page. */
const FIRECRAWL_TIMEOUT_MS = Number(process.env.FIRECRAWL_TIMEOUT_MS ?? 15_000);

// Singleton client — instantiated once, reused across calls.
let _client: Firecrawl | null = null;

function getClient(): Firecrawl | null {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;
  if (!_client) _client = new Firecrawl({ apiKey });
  return _client;
}

function safeHost(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

/**
 * Scrape a URL via Firecrawl and return its rendered HTML + parsed metadata.
 *
 * Returns null when:
 *   - FIRECRAWL_API_KEY is not set (silently off, caller uses liveness html)
 *   - Firecrawl returns no html field
 *   - API error or timeout (FIRECRAWL_TIMEOUT_MS, default 15 s)
 *
 * Never throws — all errors are caught and logged at warn level.
 * The caller (supplier-search-actions.ts) falls back to live.html on null.
 */
export async function firecrawlFetch(url: string): Promise<FirecrawlResult | null> {
  const client = getClient();
  if (!client) return null;

  try {
    let timedOut = false;

    const timer = new Promise<null>((res) =>
      setTimeout(() => { timedOut = true; res(null); }, FIRECRAWL_TIMEOUT_MS),
    );

    const scrape = client
      .scrape(url, { formats: ['html'] })
      .then((doc) => {
        if (timedOut) return null;
        const html = doc.html;
        if (!html) return null;
        return { html, meta: doc.metadata ?? {} };
      })
      .catch((err: unknown) => {
        console.warn(
          `[firecrawl] scrape error for ${safeHost(url)}:`,
          err instanceof Error ? err.message : err,
        );
        return null;
      });

    const result = await Promise.race([scrape, timer]);
    if (!result) {
      console.warn(`[firecrawl] no html returned (timeout or empty) for ${safeHost(url)}`);
    }
    return result;
  } catch (err) {
    console.warn('[firecrawl] unexpected error:', err instanceof Error ? err.message : err);
    return null;
  }
}
