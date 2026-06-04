// Firecrawl client — JS-rendered HTML for Layer 2 extraction.

import { Firecrawl, type DocumentMetadata } from 'firecrawl';

// Re-export so callers don't depend on firecrawl directly.
export type { DocumentMetadata as FirecrawlMeta };

export interface FirecrawlResult {
  /** JS-rendered HTML — passed to extractFromHtml (L2). */
  html: string;
  /** Pre-parsed OG / meta fields. */
  meta: DocumentMetadata;
}

/** Firecrawl scrape timeout (default 15 s). */
const FIRECRAWL_TIMEOUT_MS = Number(process.env.FIRECRAWL_TIMEOUT_MS ?? 15_000);

// Singleton client reused across calls.
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
 * Scrape URL via Firecrawl; return rendered HTML + metadata.
 * Returns null when key absent, no html, or on timeout/error.
 * Never throws.
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
