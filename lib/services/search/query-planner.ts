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
import { QUERY_PLAN_SCHEMA, normalizeQueryPlan, type QueryPlan } from '@/lib/ai-agent/schemas/query-plan';
// Contact-query planner prompt + user-message builder (Task 3/4: contact loopback).
import { PLAN_CONTACT_QUERY_PROMPT, buildContactQueryUserMessage } from '@/lib/ai-agent/prompt/plan-contact-query';

/**
 * A "bare code" query is a single standalone part/model number with no
 * qualifying words (no manufacturer, no product type). For obscure industrial
 * codes these collide with unrelated products, so they are the WEAKEST query
 * and must be tried LAST — never first, where the per-item budget can't afford
 * to waste an attempt on noise.
 */
function isBareCodeQuery(q: string): boolean {
  const cleaned = q.replace(/["']/g, '').trim();
  if (!cleaned) return false;
  // exactly one whitespace-delimited token, and that token is just code chars
  return !/\s/.test(cleaned) && /^[A-Za-z0-9][A-Za-z0-9./-]*$/.test(cleaned);
}

/**
 * Plan the supplier search for one procurement item: the LLM parses the item
 * text into structured spec fields (model/size/class/material/…) and emits a
 * ranked list of up to 8 web search queries ordered narrow→broad.
 *
 * Returns BOTH halves of the plan:
 *   - `parsed`  feeds the product-page scorer's exact-model + spec-density layers.
 *   - `queries` drives the density loop's search attempts.
 *
 * @param searchText  Free-text item description from the RFQ.
 * @returns           A QueryPlan; `{ parsed:{}, queries:[] }` on error or blank input.
 */
export async function planQueries(searchText: string): Promise<QueryPlan> {
  // Guard: empty / whitespace input — nothing to plan
  if (!searchText || !searchText.trim()) {
    return { parsed: {}, queries: [] };
  }

  try {
    const raw = await aiChatCompletion<unknown>(
      PLAN_QUERIES_PROMPT,
      buildPlanUserMessage(searchText),
      500,
      QUERY_PLAN_SCHEMA as object,
    );

    const plan = normalizeQueryPlan(raw);

    // Deterministic re-rank: qualified (manufacturer/type-bearing) queries first,
    // bare standalone codes last. Stable within each group to preserve the LLM's
    // intra-group ranking. Spends the budget-limited first attempts on disambiguated
    // queries instead of noisy bare part numbers.
    const qualified = plan.queries.filter((q) => !isBareCodeQuery(q));
    const bare = plan.queries.filter((q) => isBareCodeQuery(q));
    plan.queries = [...qualified, ...bare];

    // Log parsed-spec presence + query count in the repo's '[module] ...' style
    const specFields = Object.keys(plan.parsed).filter(
      (k) => plan.parsed[k as keyof typeof plan.parsed],
    );
    console.log(
      `[query-planner] spec=${specFields.length ? specFields.join(',') : 'none'} queries=${plan.queries.length}`,
    );

    return plan;
  } catch (err) {
    console.warn(
      '[query-planner] LLM query planning failed:',
      err instanceof Error ? err.message : err,
    );
    return { parsed: {}, queries: [] };
  }
}

/**
 * Plan contact-discovery search queries for a known supplier/company name.
 * Calls the LLM with the contact-finder prompt to get up to 3 web search
 * queries that will surface the company's official contact email and phone.
 *
 * Mirrors planQueries' fail-safe style — returns an empty array on any error
 * so callers can proceed without crashing the loopback recovery pass.
 *
 * @param supplierName  The company/supplier name to find contacts for.
 * @returns             Up to 3 query strings; [] on error or blank input.
 */
export async function planContactQueries(supplierName: string): Promise<string[]> {
  // Guard: empty / whitespace supplier name — nothing to plan.
  if (!supplierName || !supplierName.trim()) {
    return [];
  }

  try {
    // No schema arg: the contact prompt returns a simpler shape than QueryPlan,
    // so we let the LLM return free JSON and narrow it defensively below.
    const raw = await aiChatCompletion<unknown>(
      PLAN_CONTACT_QUERY_PROMPT,
      buildContactQueryUserMessage(supplierName),
      200,
    );

    // Defensively narrow raw to read a queries string[] without casting.
    // The LLM should return { queries: [...] }; anything else → empty list.
    let queries: string[] = [];
    if (
      raw !== null &&
      typeof raw === 'object' &&
      'queries' in raw &&
      Array.isArray((raw as Record<string, unknown>).queries)
    ) {
      // Filter to non-empty strings and cap at 3 results per spec.
      queries = ((raw as Record<string, unknown>).queries as unknown[])
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .slice(0, 3);
    }

    // Log in the repo's '[query-planner] ...' style for consistency.
    console.log(
      `[query-planner] contact-queries supplier="${supplierName.trim()}" count=${queries.length}`,
    );

    return queries;
  } catch (err) {
    // Fail-safe: log and return empty so the caller's loopback pass can proceed.
    console.warn(
      '[query-planner] contact-query planning failed:',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
