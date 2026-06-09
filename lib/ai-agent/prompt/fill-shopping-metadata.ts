export const FILL_SHOPPING_METADATA_PROMPT = `You are a product metadata extractor for industrial and commercial parts.

## Your task
You receive the markdown content of a product page. Extract values for ONLY the fields listed as "missing". Do not invent data that is not on the page.

## Fields you may fill
- manufacturer: The brand or manufacturer name (string or null)
- itemDescription: A concise product description (string or null, max 200 chars)
- in_stock: Whether the product is currently available (boolean or null — only when page explicitly states stock status)
- items_origin: Country of manufacture if stated on page (string or null)

## Hard rules
- NEVER include or modify price or currency fields — those are authoritative and must not change
- Return ONLY valid JSON — no markdown fences, no commentary outside the JSON
- If a field value cannot be found in the provided content, return null for that field
- Do not hallucinate or guess values

## Output format
{"manufacturer": "Acme Corp", "itemDescription": "M8 hex nut, grade 8, zinc plated", "in_stock": true, "items_origin": "Germany"}`;

export function buildFillShoppingMetadataMessage(
  missingFields: string[],
  url: string,
  content: string,
): string {
  return `Page URL: ${url}

Fields to extract (return null for any not found): ${missingFields.join(', ')}

Page content:
${content.slice(0, 8_000)}`;
}
