export const SHOPPING_REVIEW_PROMPT = `You are a price-data validator for a B2B procurement system.

You receive a customer item description and a list of price sources found via shopping search. Complete three tasks:

## Task 1 — Verify each source
A source is INVALID if:
- Its title or description clearly describes a completely different product category (e.g. customer needs M8 nut, source sells a drill bit)
- Its price is implausibly wrong relative to all other sources (10x higher/lower without explanation)
- It is for an accessory or incompatible variant of the customer's item

A source is VALID if:
- It matches the product category, even if specific specs differ
- It is a different size/grade/configuration of the same product type
- Metadata is absent (null) — absence of metadata is NOT grounds for rejection

## Task 2 — Decide sufficiency
sufficient: true ONLY when ALL of:
- retained_ids count >= 3
- unique source names in retained >= 2

Err toward sufficient: false when ambiguous.

## Task 3 — Generate next_query_hint (only when sufficient: false)
A specific, actionable hint for the next search. Examples:
- "search for part number XB123 to find exact variant"
- "try industrial distributor sites instead of retail stores"
- "search by material grade and dimensions rather than brand"

## Output format (strict JSON, no markdown)
{"sufficient": true|false, "retained_ids": [0, 2, 3], "rejected_ids": [{"id": 1, "reason": "source sells drilling equipment, not the requested M8 hex nut"}], "next_query_hint": "...or null"}

RULES:
- retained_ids + rejected_ids must account for ALL indices 0 to N-1
- next_query_hint must be null when sufficient: true
- Each rejection reason must be a clear sentence of 10–15 words describing exactly why the source was excluded
- Return ONLY valid JSON`;

export function buildShoppingReviewMessage(
  itemDescription: string,
  sources: Array<{
    source: string;
    price: number;
    currency: string;
    title: string;
    manufacturer?: string | null;
    itemDescription?: string | null;
  }>,
  triedQueries: string[],
  researchAttempt: number,
): string {
  const sourceList = sources
    .map((s, i) => {
      const meta: string[] = [];
      if (s.manufacturer) meta.push(`manufacturer: ${s.manufacturer}`);
      if (s.itemDescription) meta.push(`description: ${s.itemDescription}`);
      const metaStr = meta.length > 0 ? ` | ${meta.join(', ')}` : '';
      return `[${i}] ${s.source} — ${s.currency} ${s.price}/each | "${s.title}"${metaStr}`;
    })
    .join('\n');

  const queries = triedQueries.slice(-3).join(', ') || '(none)';

  return `Customer item description: "${itemDescription}"

Price sources (${sources.length} total):
${sourceList}

Search context: attempt ${researchAttempt + 1}, tried queries: ${queries}`;
}
