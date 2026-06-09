// =============================================
// PLAN-QUERIES PROMPT — LLM-driven search-query planner
// =============================================
// Single concern: given a free-text RFQ item description, the LLM parses it
// into structured spec fields (ParsedSpec) and emits a RANKED list of up to
// 8 web search queries ordered narrow→broad.
// Output shape is locked by lib/ai-agent/schemas/query-plan.ts via vLLM
// xgrammar guided_json — this prompt only describes semantics.

export const PLAN_QUERIES_PROMPT = `You are a procurement search-query planner. Your task is to:

1. Parse the provided item text into structured specification fields:
   - type        — product/fitting type (e.g. "gate valve", "elbow")
   - size        — nominal size; normalize inch notations to "2 inch", "3 inch" etc.
   - class       — pressure class; normalize "150#" → "class 150", "300#" → "class 300"
   - connection  — end connection type (e.g. "flanged", "butt-weld", "threaded")
   - material    — body/trim material (e.g. "carbon steel", "stainless 316", "WCB")
   - bore        — bore designation (e.g. "full bore", "reduced bore")
   - standard    — applicable standard; normalize "ANSI B16-34" → "ANSI B16.34"
   - model       — model number or part number (distinct from manufacturer)
   - manufacturer — brand/maker name (distinct from model)
   Disambiguate manufacturer vs model: a brand/company name is manufacturer; a product code/series is model.

2. Emit a RANKED list of UP TO 8 web search queries ordered narrow→broad, following this strategy in order:
   1. Exact model in quotes (e.g. "Z41H-16C")
   2. Manufacturer + model + product type (e.g. "Neway Z41H-16C gate valve")
   3. Model + key specs (e.g. "Z41H-16C 2 inch class 150")
   4. Full technical description (e.g. "2 inch class 150 ANSI B16.34 carbon steel gate valve flanged")
   5. Model WITHOUT manufacturer (e.g. "Z41H-16C valve supplier")
   6. Spec-only, for equivalents (e.g. "2 inch class 150 carbon steel gate valve flanged")
   7. Model datasheet PDF (e.g. "Z41H-16C datasheet pdf")
   8. Manufacturer product-type catalog PDF (e.g. "Neway gate valve catalog pdf")

RULES:
- Quote exact model/part tokens in the query string.
- DO NOT append any country or geographic terms (no Vietnam, no Asia, no China, etc.).
- Skip any query variant whose required inputs are missing (e.g. if no manufacturer is parsed, skip queries that need a manufacturer).
- Return ONLY valid JSON matching {"parsed": {...}, "queries": [...]} — no markdown, no commentary.`;

/**
 * Build the user message for the query-planning call.
 * Wraps the raw item text so the model knows what to parse and plan.
 */
export function buildPlanUserMessage(searchText: string): string {
  return `Parse the following item text into spec fields and produce the ranked search queries:

${searchText}`;
}

/**
 * System prompt for the agentic pipeline's single-query planner.
 * Separate from PLAN_QUERIES_PROMPT (8-query batch) to avoid the "UP TO 8"
 * instruction conflicting when we need exactly 1 query.
 */
export const PLAN_SINGLE_QUERY_PROMPT = `You are a procurement price-search strategist.

Your task: generate EXACTLY 1 search query for finding the price of the described item.

## Query strategy
- If part/model identifiers are available: use the most specific one + a source-type keyword ("price buy", "supplier", "distributor")
- If only description is available: combine key technical terms + "price" or "buy"
- RE-SEARCH MODE: if prior queries are listed, pick a completely different angle (different terminology, different source type, different specificity)

## Hard rules
- DO NOT append country or region names
- Output EXACTLY 1 query — no more, no fewer
- Return ONLY valid JSON: {"queries": ["<single query string>"]}
- No markdown, no commentary outside the JSON`;

/**
 * Build the user message for the agentic shopping pipeline's single-query planner.
 * Receives structured item analysis from analysis-actions.ts (AgentItemSummary)
 * plus prior search context so Qwen avoids repeats and follows the reviewer's hint.
 */
export function buildPlanSingleQueryMessage(
  itemDescription: string,
  agentItemSummary: { identification?: string[]; features?: string[] } | null,
  ctx: { triedQueries: string[]; lastQueryHint: string | null },
): string {
  const identification = agentItemSummary?.identification ?? [];
  const features = agentItemSummary?.features ?? [];

  const base = `Generate exactly 1 price-search query for this procurement item.

Customer description: ${itemDescription}
${identification.length > 0 ? `Part/model identifiers: ${identification.join(', ')}` : ''}
${features.length > 0 ? `Technical specifications: ${features.slice(0, 3).join(', ')}` : ''}

Required query count: 1
Return JSON: {"queries": ["<single query string>"]}`;

  if (ctx.triedQueries.length === 0) return base;

  let message = `${base}

IMPORTANT — RE-SEARCH MODE: Previous queries returned insufficient price data. Generate a query that is genuinely different in angle or terminology from those already tried.

Queries already tried (do NOT repeat or rephrase):
${ctx.triedQueries.map(q => `- ${q}`).join('\n')}`;

  if (ctx.lastQueryHint) {
    message += `\n\nData-reviewer hint for this attempt: ${ctx.lastQueryHint}\nUse this hint to guide the query angle.`;
  }

  return message;
}
