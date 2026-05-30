// =============================================
// QUERY PLANNER — LLM-driven search-query generation
// =============================================
// Replaces the regex query builder with an LLM-driven approach.
// Parses a free-text item description into structured spec fields, then emits
// a ranked list of up to 8 web search queries (narrow→broad) ready for Tavily.
//
// Graceful empty on any error — callers can fall back to a raw text search.

import { aiChatCompletion } from '@/lib/ai-agent/ai-router';
import { PLAN_QUERIES_PROMPT, buildPlanUserMessage } from '@/lib/ai-agent/prompt/plan-queries';
import { QUERY_PLAN_SCHEMA, normalizeQueryPlan } from '@/lib/ai-agent/schemas/query-plan';

/**
 * Generate a ranked list of web search queries for a procurement item description.
 * Uses the LLM to parse the item text into structured spec fields, then derives
 * up to 8 queries ordered narrow→broad.
 *
 * @param searchText  Free-text item description from the RFQ.
 * @returns           Ranked query strings (up to 8); empty array on error or blank input.
 */
export async function planQueries(searchText: string): Promise<string[]> {
  // Guard: empty / whitespace input — nothing to plan
  if (!searchText || !searchText.trim()) {
    return [];
  }

  try {
    const raw = await aiChatCompletion<unknown>(
      PLAN_QUERIES_PROMPT,
      buildPlanUserMessage(searchText),
      500,
      QUERY_PLAN_SCHEMA as object,
    );

    const plan = normalizeQueryPlan(raw);

    // Log parsed-spec presence + query count in the repo's '[module] ...' style
    const specFields = Object.keys(plan.parsed).filter(
      (k) => plan.parsed[k as keyof typeof plan.parsed],
    );
    console.log(
      `[query-planner] spec=${specFields.length ? specFields.join(',') : 'none'} queries=${plan.queries.length}`,
    );

    return plan.queries;
  } catch (err) {
    console.warn(
      '[query-planner] LLM query planning failed:',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
