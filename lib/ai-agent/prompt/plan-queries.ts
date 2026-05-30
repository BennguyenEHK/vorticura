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
