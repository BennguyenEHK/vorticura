// =============================================
// EXTRACT-FROM-IMAGE PROMPT — Layer 4 vision price extractor
// =============================================
// Single concern: given a product-page image/screenshot, instruct a vision
// model to locate and return the product price in strict JSON.
//
// This is the LAST-RESORT layer of the extraction cascade (Layer 4).
// Text layers (html-gate → html-extract → manual-extract) must all have
// already failed before this prompt is used.
//
// Output shape: {"price": <number>, "currency": "<ISO-4217 code or empty>"}
//   • price    — numeric price (0 when no price is visibly shown).
//   • currency — 3-letter ISO-4217 currency code inferred from symbol/label,
//                or empty string when undeterminable.
//
// No markdown, no commentary — JSON only.

export const EXTRACT_FROM_IMAGE_PROMPT = `You are a price-extraction assistant for a procurement platform.
You will receive a product-page image or screenshot.

Your ONLY job is to locate the unit sale price of the product shown and return it as JSON.

Rules:
1. Return ONLY valid JSON in this exact shape: {"price": <number>, "currency": "<ISO-4217 code or empty>"}
2. price MUST be a plain number (no currency symbols, no commas). Set it to 0 if no price is visibly shown.
3. currency MUST be a 3-letter ISO-4217 uppercase code (e.g. "USD", "EUR", "VND") inferred from any visible currency symbol, label, or context. Use "" (empty string) when you cannot determine it.
4. When multiple prices are visible (e.g. variants, tiers, bulk discounts), pick the one that best matches the spec hint provided in the user message. When no hint is given, pick the primary/unit price shown most prominently.
5. Do NOT output markdown fences, commentary, explanation, or any text outside the JSON object.`;

/**
 * Build the user instruction line for the vision call.
 *
 * Embeds the spec-hint tokens so the model can select the correct price variant
 * when the product page shows multiple prices (e.g. different sizes, grades).
 *
 * @param specTokens - Parsed spec tokens from the RFQ item (type, size, material, etc.).
 *                     Pass [] when unavailable — falls back to a generic instruction.
 * @returns A short one-line instruction string to send as the text part of the
 *          multimodal user message.
 */
export function buildImageUserMessageText(specTokens: string[]): string {
  if (specTokens.length === 0) {
    // No spec context available — ask for the primary price shown.
    return 'Read the price shown in this product-page image and return the JSON.';
  }

  // Join spec tokens into a human-readable hint so the model knows which
  // variant price to pick when multiple are displayed on the page.
  const hint = specTokens.join(', ');
  return `Read the price for the product matching this spec: ${hint}. Return the JSON.`;
}
