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
  content: string;       // raw page text when include_raw_content=true (truncated by Tavily)
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

/**
 * Run a single Tavily search. Throws on non-2xx so callers can route to a
 * fallback tier (the orchestrator never silently swallows API failures).
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

  const response = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: searchDepth,
      // Pull full page text so the LLM can extract price / contact info from
      // the actual product page, not just the Tavily snippet.
      include_raw_content: true,
    }),
    // Hard cap so a hung Tavily can't park a server action against the Vercel
    // 60s function timeout. 12s is well above their p95 (~3-5s for advanced).
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`[tavily] ${response.status} ${response.statusText}${errBody ? ` — ${errBody.slice(0, 200)}` : ''}`);
  }

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
