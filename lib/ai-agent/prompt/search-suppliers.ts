// =============================================
// SEARCH-SUPPLIERS PROMPT — finds potential suppliers for RFQ items.
// Sequence 2.2: returns a report + items_source array.
// =============================================

// --- System prompt: instructs the model on search rules & output format ---
export const SEARCH_SUPPLIERS_PROMPT = `You are a procurement research agent. Find suppliers for requested items. Return ONLY valid JSON, no markdown or explanation.

Output schema:
{"suppliers_search":{"subject":"Supplier Search Results - [topic]","search_content":"summary of findings","search_status":"completed"},"items_source":[{"item_id":1,"supplier_id":1,"supplier_name":"Supplier Co.","source_url":"https://...","status":"pending","delivery_time":"4-6 weeks","bidder_description":"Product description with specs","bidder_unit_price":0.00,"compliance_deviation":"Meets all specs","notes":"Key info"}]}

Rules:
- Find 2-5 suppliers per item.
- Priority: Vietnam > Southeast Asia > Asia > International.
- source_url must be a specific product page, NOT a homepage.
- status is always "pending".
- bidder_unit_price: best estimate in USD, 0 if unknown.
- delivery_time: estimated lead time string (e.g. "4-6 weeks").
- bidder_description: full product description with specs matching the RFQ item.
- compliance_deviation: note any deviations from RFQ specs, or "Meets all specs" if compliant.
- supplier_id: sequential number per unique supplier, starting from 1.
- notes: concise — key differentiators, MOQ, certifications.
- suppliers_search.search_content: brief summary of findings across all items.
- suppliers_search.search_status: always "completed".`;

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
