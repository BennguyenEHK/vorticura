// LLM-driven search-query planner for supplier discovery.

import { aiChatCompletion } from '@/lib/ai-agent/ai-router';
import { PLAN_QUERIES_PROMPT, buildPlanUserMessage } from '@/lib/ai-agent/prompt/plan-queries';
import { QUERY_PLAN_SCHEMA, normalizeQueryPlan, type QueryPlan } from '@/lib/ai-agent/schemas/query-plan';
// Contact-query planner prompt + user-message builder.
import { PLAN_CONTACT_QUERY_PROMPT, buildContactQueryUserMessage } from '@/lib/ai-agent/prompt/plan-contact-query';

/**
 * A bare-code query is a single standalone part number.
 * These are weakest — must be tried last to avoid noise.
 */
function isBareCodeQuery(q: string): boolean {
  const cleaned = q.replace(/["']/g, '').trim();
  if (!cleaned) return false;
  // Single token of alphanumeric/punctuation code chars only.
  return !/\s/.test(cleaned) && /^[A-Za-z0-9][A-Za-z0-9./-]*$/.test(cleaned);
}

/**
 * Plan supplier search queries for one RFQ item.
 * LLM parses item text into spec fields and emits up to 8 queries (narrow→broad).
 *
 * Returns both halves:
 *   - `parsed`  feeds the product-page scorer.
 *   - `queries` drives the density loop.
 *
 * @param searchText  Free-text item description from the RFQ.
 * @returns           QueryPlan; `{ parsed:{}, queries:[] }` on error.
 */
export async function planQueries(searchText: string): Promise<QueryPlan> {
  // Guard: empty input — nothing to plan.
  if (!searchText || !searchText.trim()) {
    return { parsed: {}, queries: [] };
  }

  try {
    const raw = await aiChatCompletion<unknown>(
      PLAN_QUERIES_PROMPT,
      buildPlanUserMessage(searchText),
      // 1024 tokens: fits full {parsed + 8 queries} without truncation.
      1024,
      QUERY_PLAN_SCHEMA as object,
    );

    const plan = normalizeQueryPlan(raw);

    // Re-rank: qualified queries first, bare codes last.
    // Preserves LLM's intra-group order.
    const qualified = plan.queries.filter((q) => !isBareCodeQuery(q));
    const bare = plan.queries.filter((q) => isBareCodeQuery(q));
    plan.queries = [...qualified, ...bare];

    // Log spec fields + query count.
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
 * Plan contact-discovery queries for a known supplier name.
 * Returns up to 3 queries to surface company contact details.
 * Fail-safe — returns [] on any error.
 *
 * @param supplierName  Company/supplier name to find contacts for.
 * @returns             Up to 3 query strings; [] on error.
 */
export async function planContactQueries(supplierName: string): Promise<string[]> {
  // Guard: empty supplier name — nothing to plan.
  if (!supplierName || !supplierName.trim()) {
    return [];
  }

  try {
    // No schema: contact prompt returns simpler shape than QueryPlan.
    const raw = await aiChatCompletion<unknown>(
      PLAN_CONTACT_QUERY_PROMPT,
      buildContactQueryUserMessage(supplierName),
      200,
    );

    // Narrow raw to string[] without unsafe cast.
    // LLM should return { queries: [...] }; anything else → [].
    let queries: string[] = [];
    if (
      raw !== null &&
      typeof raw === 'object' &&
      'queries' in raw &&
      Array.isArray((raw as Record<string, unknown>).queries)
    ) {
      // Filter non-empty strings, cap at 3.
      queries = ((raw as Record<string, unknown>).queries as unknown[])
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .slice(0, 3);
    }

    console.log(
      `[query-planner] contact-queries supplier="${supplierName.trim()}" count=${queries.length}`,
    );

    return queries;
  } catch (err) {
    // Fail-safe: log and return [] so loopback pass can proceed.
    console.warn(
      '[query-planner] contact-query planning failed:',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
