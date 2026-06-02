// =============================================
// PLAN-CONTACT-QUERY PROMPT — LLM-driven contact-finder query planner
// =============================================
// Single concern: given a supplier/company name, produce up to 3 web search
// queries likely to surface that company's official contact email and phone
// (contact page, "get in touch", legal imprint, etc.).
//
// Output is a plain JSON object: { "queries": ["...", ...] }
// No schema arg is passed to aiChatCompletion — the LLM is trusted to return
// the shape directly (same pattern as planQueries for the contact loopback).

/**
 * System prompt for the contact-finder query planner.
 * Instructs the model to produce tightly-scoped contact-discovery queries
 * without geographic noise or markdown formatting.
 */
export const PLAN_CONTACT_QUERY_PROMPT =
  `You are a B2B contact-finder query planner. Given a supplier/company name, output up to 3 web search queries that would surface that company's official contact email and phone (e.g. their contact page, 'get in touch', imprint). Return ONLY valid JSON {"queries": ["...", ...]} — no markdown, no commentary. Quote the company name. Do NOT add geographic terms.`;

/**
 * Build the user message for a contact-query planning call.
 * Wraps the supplier name so the model knows which company to target.
 *
 * @param supplierName  The company/supplier name to find contacts for.
 * @returns             User-turn message string ready for aiChatCompletion.
 */
export function buildContactQueryUserMessage(supplierName: string): string {
  // Collapse whitespace/newlines and cap length (prompt-injection hardening), then
  // quote the name so the planner treats it as a single literal company token
  // (matches the system prompt's "Quote the company name" instruction).
  const clean = supplierName.replace(/\s+/g, ' ').trim().slice(0, 120);
  return `Find contact email and phone for this supplier: "${clean}"`;
}
