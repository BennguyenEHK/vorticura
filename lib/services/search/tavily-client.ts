// Tavily search client with retry logic.

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

// One Tavily hit, normalized for downstream LLM use.
export interface TavilySnippet {
  title: string;
  url: string;
  snippet: string;       // short Tavily-generated summary
  content: string;       // raw page text (truncated by Tavily)
}

// Tunable options per call; defaults pulled from env.
export interface TavilyOptions {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  // Two-letter ISO country code for ranking bias.
  country?: string;
}

// Raw Tavily response shape (only fields we use)
interface TavilyApiResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;       // Tavily snippet
    raw_content?: string;   // full-page text
  }>;
}

// --- Retry config ---
const MAX_ATTEMPTS = 3;
// Base delay ms; attempt 1→2: ~800ms, 2→3: ~1600ms.
const BASE_BACKOFF_MS = 800;
// Cap Retry-After to avoid blowing call budget.
const MAX_RETRY_AFTER_MS = 5_000;

/** Returns true for status codes worth retrying. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/** Sleep ms with ±10% jitter to spread concurrent retries. */
function backoffDelay(ms: number): Promise<void> {
  const jitter = ms * 0.1 * (Math.random() * 2 - 1); // ±10%
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms + jitter)));
}

/**
 * Run one Tavily search. Throws on non-2xx.
 * Retries up to MAX_ATTEMPTS on 429/5xx and network errors.
 * Honors Retry-After header on 429 (capped to MAX_RETRY_AFTER_MS).
 */
export async function tavilySearch(query: string, opts: TavilyOptions = {}): Promise<TavilySnippet[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    // Loud failure — easier to spot than silent empty result.
    throw new Error('[tavily] TAVILY_API_KEY is not set');
  }

  // Read env each call so changes are picked up in dev.
  const maxResults = opts.maxResults ?? Number(process.env.SEARCH_RESULTS_PER_QUERY ?? 5);
  const searchDepth = opts.searchDepth ?? 'advanced';

  const body = JSON.stringify({
    api_key: apiKey,
    query,
    max_results: maxResults,
    search_depth: searchDepth,
    // Plain text avoids markdown noise in extraction.
    include_raw_content: 'text',
  });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(TAVILY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        // 12s cap; well above Tavily p95 (~3-5s for advanced).
        signal: AbortSignal.timeout(12_000),
      });
    } catch (networkErr) {
      // Network or timeout — retryable.
      lastError = networkErr instanceof Error ? networkErr : new Error(String(networkErr));
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[tavily] network/timeout error on attempt ${attempt}/${MAX_ATTEMPTS}, retrying —`, lastError.message);
        await backoffDelay(BASE_BACKOFF_MS * Math.pow(2, attempt - 1));
        continue;
      }
      throw lastError;
    }

    if (response.ok) {
      const data = (await response.json()) as TavilyApiResponse;
      const results = data.results ?? [];

      // Normalize — every field is optional in wire format.
      return results.map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.content ?? '',
        content: r.raw_content ?? r.content ?? '',
      }));
    }

    if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
      // Respect Retry-After header on 429 rate-limit.
      let delayMs = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
      const retryAfterHeader = response.headers.get('Retry-After');
      if (retryAfterHeader) {
        const retryAfterSec = parseFloat(retryAfterHeader);
        if (isFinite(retryAfterSec) && retryAfterSec > 0) {
          delayMs = Math.min(retryAfterSec * 1_000, MAX_RETRY_AFTER_MS);
        }
      }
      console.warn(`[tavily] ${response.status} ${response.statusText} on attempt ${attempt}/${MAX_ATTEMPTS}, retrying in ${Math.round(delayMs)}ms`);
      await backoffDelay(delayMs);
      continue;
    }

    // Non-retryable or final attempt — throw with full context.
    const errBody = await response.text().catch(() => '');
    throw new Error(`[tavily] ${response.status} ${response.statusText}${errBody ? ` — ${errBody.slice(0, 200)}` : ''}`);
  }

  // Unreachable; TypeScript needs a throw after the loop.
  throw lastError ?? new Error('[tavily] unexpected retry loop exit');
}
