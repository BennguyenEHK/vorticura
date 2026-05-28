// =============================================
// TIER 3 AGENT — agentic fallback for semantic search
// =============================================
// When Tiers 1 & 2 (geographically tiered Tavily searches) fail to reach the
// verified-source threshold, Tier 3 inspects residual snippets and supplier
// notes with an LLM to mine fresh candidate part-numbers or distinctive product
// identifiers, then issues new targeted Tavily queries for each candidate.
//
// Max 3 iterations, hard cap at VERIFIED_TARGET=3 unique product-page URLs.
// On any LLM or search error, logs and degrades gracefully to accumulated results.

import { tavilySearch, type TavilySnippet } from './tavily-client';
import { aiChatCompletion } from '@/lib/ai-agent/ai-router';

// Hard limit: the agent will stop if it accumulates 3 verified product-page URLs
const VERIFIED_TARGET = 3;
// Hard limit: the LLM will iterate at most this many times to extract candidates
const MAX_ITERATIONS = 3;

export interface Tier3Input {
  /** RFQ item being sourced — passed through for query construction. */
  description: string;
  qty?: number;
  uom?: string;
  /** Snippets that survived from Tiers 1/2 but did not meet the verified-source threshold. Used as the LLM's mining substrate. */
  carrySnippets: TavilySnippet[];
  /** Any partial supplier extractions already made (notes + bidder_description). The LLM mines these for hidden part numbers. */
  carryNotes: string[];
  /** URL guard injected by the caller — true when the URL points at a specific page, not a homepage. */
  isProductPage: (url: string) => boolean;
}

export interface Tier3Output {
  snippets: TavilySnippet[];
  iterations: number; // how many LLM iterations actually ran (1..MAX_ITERATIONS)
  candidatesTried: string[]; // for logging — the candidate keys the agent extracted
}

/**
 * Run the agentic Tier 3 fallback: mine candidates from carry-forward snippets,
 * issue targeted Tavily queries, accumulate product-page hits until we reach
 * the verified-source threshold or exhaust iterations.
 */
export async function runAgenticTier3(input: Tier3Input): Promise<Tier3Output> {
  // (1) Guard: if there's nothing to mine, return immediately
  if (input.carrySnippets.length === 0 && input.carryNotes.length === 0) {
    return {
      snippets: [],
      iterations: 0,
      candidatesTried: [],
    };
  }

  // (2) State: accumulator for unique product-page URLs + snippet dedup
  const urlSet = new Set<string>();
  const accumulatedSnippets: TavilySnippet[] = [];
  const candidatesTried = new Set<string>();

  // (3) Iterate up to MAX_ITERATIONS, mining for candidates and issuing new queries
  for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
    // (4) Build the LLM prompt: instruction to extract 1-3 candidate identifiers
    const systemPrompt =
      'Read the following web snippets and supplier notes for a procurement item. ' +
      'Return ONLY a JSON array of 1-3 candidate part numbers, model numbers, or distinctive product identifiers ' +
      'that could be searched as exact-match queries. No commentary. ' +
      'Format: {"candidates":["string1",...]}';

    // (5) Build the user message: item description + snippet content + carry notes
    const snippetContent = input.carrySnippets
      .slice(0, 5) // cap at 5 snippets to avoid token bloat
      .map((s) => s.content.slice(0, 1000)) // first 1000 chars per snippet
      .join('\n---\n');

    const notesContent = input.carryNotes.join('\n');

    const userMessage = [
      `Item: ${input.description}${input.qty ? ` (qty: ${input.qty}${input.uom ? ` ${input.uom}` : ''})` : ''}`,
      snippetContent && `Web snippets:\n${snippetContent}`,
      notesContent && `Supplier notes:\n${notesContent}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    // (6) Call the LLM with strict JSON schema to extract candidates
    let candidates: string[] = [];
    try {
      const response = await aiChatCompletion<{ candidates: string[] }>(
        systemPrompt,
        userMessage,
        200, // low maxTokens for a tight JSON response
        {
          type: 'object',
          additionalProperties: false,
          required: ['candidates'],
          properties: {
            candidates: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      );
      candidates = response.candidates ?? [];
    } catch (err) {
      // (7) LLM error: log and exit loop gracefully
      console.warn(
        `[tier3] iteration ${iter} LLM error:`,
        err instanceof Error ? err.message : err,
      );
      break;
    }

    // (8) For each new candidate, issue a targeted Tavily query
    for (const candidate of candidates) {
      if (candidatesTried.has(candidate)) {
        // Skip if we already tried this one
        continue;
      }
      candidatesTried.add(candidate);

      // (9) Issue a focused query: "<candidate>" supplier
      const query = `"${candidate}" supplier`;

      let newSnippets: TavilySnippet[] = [];
      try {
        newSnippets = await tavilySearch(query);
      } catch (err) {
        // (10) Tavily error: log and move to next candidate
        console.warn(
          `[tier3] tavily query error for candidate="${candidate}":`,
          err instanceof Error ? err.message : err,
        );
        continue;
      }

      // (11) Filter snippets: keep only product pages not yet seen
      for (const snippet of newSnippets) {
        if (!input.isProductPage(snippet.url)) {
          // Skip non-product URLs
          continue;
        }
        if (urlSet.has(snippet.url)) {
          // Skip duplicates
          continue;
        }

        // (12) New verified product page: add to accumulators
        urlSet.add(snippet.url);
        accumulatedSnippets.push(snippet);

        // (13) Early exit: if we've hit the target, stop iterating
        if (urlSet.size >= VERIFIED_TARGET) {
          break;
        }
      }

      // (14) Break outer loop if target reached
      if (urlSet.size >= VERIFIED_TARGET) {
        break;
      }
    }

    // (15) Check threshold: if we've accumulated enough, exit early
    if (urlSet.size >= VERIFIED_TARGET) {
      return {
        snippets: accumulatedSnippets,
        iterations: iter,
        candidatesTried: Array.from(candidatesTried),
      };
    }
  }

  // (16) Loop exhausted: return whatever was accumulated
  return {
    snippets: accumulatedSnippets,
    iterations: MAX_ITERATIONS,
    candidatesTried: Array.from(candidatesTried),
  };
}
