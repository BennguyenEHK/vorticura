// =============================================
// SEARCH-SUPPLIERS PROMPTS — legacy single-shot + new RAG extraction
// =============================================
// Two distinct prompts live here:
//   - SEARCH_SUPPLIERS_PROMPT             → legacy single-shot path (kept until Phase 6 cleanup)
//   - EXTRACT_SUPPLIER_FROM_SNIPPETS_PROMPT → new RAG path: pick best Tavily snippet, extract one supplier
// =============================================

// --- System prompt: instructs the model on search rules & output format ---
export const SEARCH_SUPPLIERS_PROMPT = `You are a procurement research agent. Find suppliers for requested items. Return ONLY valid JSON, no markdown or explanation.

Output schema:
{"suppliers_search":{"subject":"Supplier Search Results - [topic]","search_content":"summary of findings","search_status":"completed"},"items_source":[{"item_id":1,"supplier_id":1,"supplier_name":"Supplier Co.","source_url":"https://...","status":"pending","delivery_time":"4-6 weeks","bidder_description":"Product description with specs","bidder_unit_price":0.00,"compliance_deviation":"Meets all specs","notes":"Key info","contact_email":"supplier@example.com","contact_phone":"+84-xxx"}]}

Rules:
- Find 1 suppliers per item.
- Priority: Vietnam > Southeast Asia > Asia > International.
- source_url must be a specific product page, NOT a homepage.
- status is always "pending".
- bidder_unit_price: best estimate in USD, 0 if unknown.
- delivery_time: estimated lead time string (e.g. "4-6 weeks").
- bidder_description: full product description with specs matching the RFQ item.
- compliance_deviation: note any deviations from RFQ specs, or "Meets all specs" if compliant.
- supplier_id: sequential number per unique supplier, starting from 1.
- notes: concise — key differentiators, MOQ, certifications.
- suppliers_search.search_content: brief summary of findings across all items , added <br> tags  apporiately to separate the distinct sections for better readability ( make sure no two <br> stand close together (exp. <br><br>text abc)).
- suppliers_search.search_status: always "completed".
- contact_email: supplier's contact email if found on their product page or contact page, empty string if not found.
- contact_phone: supplier's phone number if found, empty string if not found.`;

// --- Input shape for initial supplier search ---
interface SearchInput {
  rfqReference: string;
  subject: string;
  items: Array<{
    itemId: number;
    description: string;
    qty: number;
    uom: string;
  }>;
}

// --- Builds the user message for an initial supplier search ---
export function buildSearchUserMessage(input: SearchInput): string {
  const { rfqReference, subject, items } = input;

  // Format items as a compact list to minimize tokens
  const itemLines = items
    .map((i) => `- #${i.itemId}: ${i.description} | Qty: ${i.qty} ${i.uom}`)
    .join('\n');

  return `RFQ: ${rfqReference}
Subject: ${subject}

Items to source:
${itemLines}`;
}

// --- Input shape for re-search with user feedback ---
interface ResearchInput {
  rfqReference: string;
  previousSearch: string; // JSON string of previous search result
  generalFeedback: string;
  inlineNotes: Array<{ selectedText: string; comment: string }>;
}

// --- Builds the user message for a re-search incorporating feedback ---
export function buildResearchUserMessage(input: ResearchInput): string {
  const { rfqReference, previousSearch, generalFeedback, inlineNotes } = input;

  // Format inline notes as a compact list
  const notesSection = inlineNotes.length
    ? inlineNotes
        .map((n) => `- "${n.selectedText}" → ${n.comment}`)
        .join('\n')
    : 'none';

  return `RFQ: ${rfqReference}

Previous search result:
${previousSearch}

General feedback: ${generalFeedback}

Inline notes:
${notesSection}

Revise the supplier search based on the feedback above. Return the full updated JSON.`;
}

// =============================================
// RAG EXTRACTION PROMPT — picks ONE supplier from real Tavily snippets
// =============================================
// Two rule blocks: SELECTION (which snippet to use) + EXTRACTION (how to fill fields).
// Output shape is locked by lib/ai-agent/schemas/supplier.ts via vLLM guided_json,
// so the prompt only describes semantics, not JSON shape.

export const EXTRACT_SUPPLIER_FROM_SNIPPETS_PROMPT = `You are a procurement extraction agent. Given a single RFQ item and a list of real web search snippets, pick ONE best supplier and extract structured data from it. Return ONLY valid JSON — no markdown, no commentary.

SELECTION RULES (which snippet to pick):
- Region priority: Vietnam (.vn) > Southeast Asia (Thailand/Malaysia/Indonesia/Philippines/Singapore) > rest of Asia > International — if multiple snippets qualify at the same tier, prefer the one whose content best matches the RFQ specs.
- The chosen source_url MUST be a specific product, quote, or catalog page — NEVER a homepage, generic listing index, or social media profile.
- If only homepages or irrelevant pages exist, return source_url="" and put "No product page found" in notes.
- One supplier per item. Do not merge multiple suppliers.

EXTRACTION RULES (how to fill each field from the chosen page):
- supplier_name: company / brand name as shown on the page.
- bidder_description: full product description with specs that match the RFQ item.
- bidder_unit_price: best-estimate USD unit price from the page; 0 if not stated.
- delivery_time: normalize lead time to "X-Y weeks" format (e.g. "4-6 weeks"); use a single best estimate if the page only mentions one number ("4 weeks" → "4-4 weeks").
- compliance_deviation: reason explicitly vs RFQ specs; write "Meets all specs" if fully compliant.
- notes: concise — key differentiators, MOQ, certifications, anything notable; 1-2 short sentences max.
- contact_email: literal email from the page or contact section; "" if not present. Never invent.
- contact_phone: literal phone (with country code if shown); "" if not present. Never invent.
- Never invent a field. If the page does not state something, leave it empty / 0 per the rules above.`;

// --- Input shape for the RAG extraction step ---
interface ExtractInput {
  item: { itemId: number; description: string; qty: number; uom: string };
  snippets: Array<{ title: string; url: string; snippet: string; content: string }>;
}

/**
 * Build the user message for the RAG extraction call. Numbered snippet list
 * gives the model stable references and bounds the prompt size — we trim the
 * raw page content per snippet to keep total input < ~4k chars.
 */
export function buildExtractUserMessage(input: ExtractInput): string {
  const { item, snippets } = input;

  // Cap raw_content per snippet — Tavily can return 5-10k chars per page; we
  // only need the first chunk to find price/contact info and stay under vLLM
  // 16k context with headroom for the system prompt + output tokens.
  const MAX_CONTENT_CHARS = 1500;

  const snippetBlock = snippets.length
    ? snippets
        .map((s, idx) => {
          const trimmed = (s.content || s.snippet || '').slice(0, MAX_CONTENT_CHARS).trim();
          return `[${idx + 1}] ${s.title}\nURL: ${s.url}\n${trimmed}`;
        })
        .join('\n\n---\n\n')
    : '(no snippets returned)';

  return `RFQ item to source:
- #${item.itemId}: ${item.description} | Qty: ${item.qty} ${item.uom}

Search snippets (real results from Tavily):
${snippetBlock}

Pick the best snippet per the SELECTION RULES, then fill the supplier fields per the EXTRACTION RULES.`;
}
