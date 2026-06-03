// =============================================
// ENRICH-ITEMS PROMPT — per-item functional context for the RFQ analysis panel
// =============================================
// Dedicated enrichment pass (chosen over folding into analyze-rfq): given the
// RFQ analysis context + the extracted line items, the LLM returns a structured
// 4-axis summary per item that populates rfq_items.agent_item_summary (jsonb).
// Output shape mirrors types/preview.ts → AgentItemSummary.

export const ENRICH_ITEMS_PROMPT = `You are a procurement analyst. For EACH RFQ line item, produce a concise, structured functional summary. Return ONLY valid JSON — no markdown, no commentary.

Output schema:
{
  "items": [
    {
      "item_id": <number, echoed from the input item>,
      "identification": ["..."],   // exactly what this item is — precise product description
      "classification": ["..."],   // standalone asset/product OR sub-component/spare part of a larger system (name the system if it is a part)
      "application": ["..."],      // what it is used for AND where it is deployed
      "purpose": ["..."],          // core operational purpose
      "features": ["..."]          // key technical specifications / differentiators
    }
  ]
}

Rules:
- Return one object per input item, with the SAME item_id.
- Each axis is an array of short bullet strings (1-4 bullets). Keep bullets terse and factual.
- In "identification", ALWAYS preserve any manufacturer part number, model code, or SKU VERBATIM (exactly as written — same characters, punctuation, and case) whenever one appears in the item description. These codes are the primary supplier-matching identifiers and must never be paraphrased, normalized, or omitted.
- Base every statement on the item description and the RFQ context provided. Do NOT invent specifications that are not implied. If an axis cannot be determined, return an empty array [] for it.
- Do not add fields beyond the schema.`;

interface EnrichItem {
  item_id: number;
  description: string;
  qty: number;
  uom: string;
}

/** Build the user message: RFQ context + the line items to enrich. */
export function buildEnrichItemsUserMessage(analysisContent: string, items: EnrichItem[]): string {
  const itemBlock = items.length
    ? items.map((i) => `- item_id ${i.item_id}: ${i.description} | Qty: ${i.qty} ${i.uom}`).join('\n')
    : '(no items)';

  // analysis_content carries <br> tags from the analysis pass — strip them for the prompt.
  const context = (analysisContent || '').replace(/<br\s*\/?>/gi, '\n').trim() || '(no additional context)';

  return `RFQ context:
${context}

Line items to summarize:
${itemBlock}

Return the JSON object with one summary per item, echoing each item_id.`;
}
