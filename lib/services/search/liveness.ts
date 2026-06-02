/**
 * URL Liveness Pre-Gate (Layer 0)
 *
 * Performs a single fetch per URL to classify its state:
 * - 'live' (2xx): page is accessible, HTML body returned
 * - 'dead' (404/410): page is permanently gone, drop from candidates
 * - 'blocked' (other non-2xx, network error, timeout): bot-protected or transient,
 *   keep candidate but skip HTML enhancement; fall back to Tavily raw_content
 *
 * This module NEVER throws; all outcomes are classified into a LivenessResult.
 * Callers should handle 'blocked' by using alternative text sources (e.g., search engine snippets).
 */

export type LivenessStatus = 'live' | 'dead' | 'blocked';

export interface LivenessResult {
  /** Classification of URL state: 'live'=2xx, 'dead'=404/410, 'blocked'=other non-2xx/network/timeout */
  status: LivenessStatus;
  /** Numeric HTTP status code; 0 on network error or timeout */
  httpStatus: number;
  /** Response body when 2xx (capped to 500k chars), else null */
  html: string | null;
}

/**
 * Check liveness of a single URL.
 *
 * @param url - URL to check
 * @param timeoutMs - Fetch timeout in milliseconds; defaults to 8000ms
 * @returns LivenessResult classifying the URL state and body (if live)
 */
export async function checkLiveness(
  url: string,
  timeoutMs?: number
): Promise<LivenessResult> {
  const timeout = timeoutMs ?? 8000;

  try {
    // Perform fetch with timeout and bot-friendly User-Agent
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(timeout),
    });

    // Handle 2xx responses: only read the body when Content-Type signals HTML.
    // PDFs, images, zip datasheets, etc. produce a binary/non-HTML body that
    // cheerio can't parse — classify those as 'blocked' (no HTML) so the
    // caller falls back to Tavily raw_content instead of wasting work on an
    // empty DOM or misclassifying non-HTML resources as live pages.
    if (response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      const isHtml =
        contentType.startsWith('text/html') ||
        contentType.startsWith('application/xhtml+xml');

      if (!isHtml) {
        return {
          status: 'blocked',
          httpStatus: response.status,
          html: null,
        };
      }

      const body = await response.text();
      // Cap body to first 500k characters to avoid memory bloat
      const cappedHtml = body.slice(0, 500_000);
      return {
        status: 'live',
        httpStatus: response.status,
        html: cappedHtml,
      };
    }

    // Handle 404/410: page is permanently gone, drop from candidates
    if (response.status === 404 || response.status === 410) {
      return {
        status: 'dead',
        httpStatus: response.status,
        html: null,
      };
    }

    // Handle any other non-2xx (403, 429, 500, 503, etc.):
    // likely bot-protected or transient; keep candidate but skip HTML enhancement
    return {
      status: 'blocked',
      httpStatus: response.status,
      html: null,
    };
  } catch {
    // Network error, timeout, or other fetch failure:
    // treat as blocked (transient or bot-protected), not dead
    return {
      status: 'blocked',
      httpStatus: 0,
      html: null,
    };
  }
}
