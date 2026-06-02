// =============================================
// TAVILY CLIENT — real internet search for the RAG pipeline
// =============================================
// Single concern: POST to Tavily and return typed snippets.
// No caching, no tier-walking, no cleanup — those live in cache.ts and index.ts.
//
// No geo bias is applied — results are ranked by Tavily's default relevance.
//
// Docs: https://docs.tavily.com/api-reference/endpoint/search

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

// One Tavily hit, normalized to the fields the LLM needs downstream.
export interface TavilySnippet {
  title: string;
  url: string;
  snippet: string;       // short Tavily-generated summary (≈ "content" field)
  content: string;       // raw page text as plain text when include_raw_content='text' (truncated by Tavily)
}

// Tunable bits exposed per call. Defaults pulled from env so the orchestrator
// can pass nothing and get production-correct behaviour.
export interface TavilyOptions {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  // Two-letter ISO country code Tavily uses to bias ranking
  country?: string;
}

// Raw Tavily response shape (only fields we use)
interface TavilyApiResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;       // Tavily snippet
    raw_content?: string;   // full-page text (when include_raw_content=true)
  }>;
}

// ---- Retry configuration ----
const MAX_ATTEMPTS = 3;
// Base delay in ms for exponential backoff (attempt 1→2: ~800ms, attempt 2→3: ~1600ms).
const BASE_BACKOFF_MS = 800;
// Cap Retry-After values so a misbehaving header can't blow the per-call budget.
const MAX_RETRY_AFTER_MS = 5_000;

/** Returns true for status codes that are worth retrying. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Sleep for `ms` milliseconds, with optional small jitter (±10%) to spread
 * concurrent retries away from each other.
 */
function backoffDelay(ms: number): Promise<void> {
  const jitter = ms * 0.1 * (Math.random() * 2 - 1); // ±10%
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms + jitter)));
}

/**
 * Run a single Tavily search. Throws on non-2xx so callers can route to a
 * fallback tier (the orchestrator never silently swallows API failures).
 *
 * Retries up to MAX_ATTEMPTS total on HTTP 429 / 5xx and on network/timeout
 * errors, with exponential backoff. Honors a Retry-After header (seconds)
 * on 429 responses (capped to MAX_RETRY_AFTER_MS).
 */
export async function tavilySearch(query: string, opts: TavilyOptions = {}): Promise<TavilySnippet[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    // Loud failure — easier to spot than a silent empty result on a misconfig
    throw new Error('[tavily] TAVILY_API_KEY is not set');
  }

  // Read env each call (cheap) so SEARCH_RESULTS_PER_QUERY changes are picked
  // up without a server restart in dev — production is set at boot anyway.
  const maxResults = opts.maxResults ?? Number(process.env.SEARCH_RESULTS_PER_QUERY ?? 5);
  const searchDepth = opts.searchDepth ?? 'advanced';

  const body = JSON.stringify({
    api_key: apiKey,
    query,
    max_results: maxResults,
    search_depth: searchDepth,
    // Pull full page text (raw_content as plain text) so regex/LLM extraction
    // sees clean prose, not markdown noise.
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
        // Hard cap so a hung Tavily can't park a server action against the Vercel
        // 60s function timeout. 12s is well above their p95 (~3-5s for advanced).
        signal: AbortSignal.timeout(12_000),
      });
    } catch (networkErr) {
      // Network or timeout error — retryable.
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

      // Normalize defensively — every field is optional in the wire format
      return results.map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.content ?? '',
        content: r.raw_content ?? r.content ?? '',
      }));
    }

    if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
      // Respect Retry-After header when the server sends one (429 rate-limit).
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

  // Should be unreachable, but TypeScript needs a throw path after the loop.
  throw lastError ?? new Error('[tavily] unexpected retry loop exit');
}
