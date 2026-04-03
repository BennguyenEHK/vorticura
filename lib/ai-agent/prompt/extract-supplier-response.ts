// =============================================
// EXTRACT-SUPPLIER-RESPONSE PROMPT — extracts structured
// pricing/availability data from a supplier's reply email.
// Aligned with Sequence 3.2 (supplier respond processing).
// =============================================

// --- System prompt: instructs the model on extraction rules & output format ---
export const EXTRACT_SUPPLIER_RESPONSE_PROMPT = `You extract structured data from supplier response emails. Return ONLY valid JSON, no markdown or explanation.

Output schema:
{"supplier_name":"string","items_updated":[{"item_id":number,"status":"available"|"unavailable","currency_code":"ISO 4217 3-letter","bidder_proposal":{"bidder_description":"string","bidder_unit_price":number,"delivery_time":"string","compliance_deviation":"string"}}],"confidence":0.0-1.0}

Rules:
- Extract ALL items referenced in the supplier's email and attachments.
- Match each item to the original RFQ items provided in context using item_id.
- status: "available" if supplier can supply, "unavailable" otherwise.
- If price is not mentioned, set bidder_unit_price to 0 and status to "unavailable".
- currency_code: 3-letter ISO code from the response, default "USD" if unspecified.
- bidder_description: supplier's own product description including model/specs.
- delivery_time: as stated by supplier (e.g. "8 weeks ARO"), empty string if unknown.
- compliance_deviation: note deviations from RFQ specs, or "Meets all specs" if none.
- confidence: 0.0-1.0 based on how clear/complete the supplier's response is.
- Items from the RFQ not addressed by the supplier should be omitted from items_updated.`;

// --- Input shape for the user message builder ---
interface ExtractInput {
  fromEmail: string;
  fromName: string;
  subject: string;
  emailBodyText: string;
  attachmentsText: string; // concatenated extracted text from attachments
  rfqReference: string;
  existingItems: Array<{
    // original RFQ items for matching
    itemId: number;
    description: string;
    qty: number;
    uom: string;
  }>;
}

// --- Builds the user message injecting dynamic email + RFQ context ---
export function buildExtractUserMessage(input: ExtractInput): string {
  const {
    fromEmail,
    fromName,
    subject,
    emailBodyText,
    attachmentsText,
    rfqReference,
    existingItems,
  } = input;

  // Format RFQ items as a compact table for context
  const itemsList = existingItems
    .map((i) => `  #${i.itemId}: ${i.description} | Qty: ${i.qty} ${i.uom}`)
    .join('\n');

  return `From: ${fromName} <${fromEmail}>
Subject: ${subject}
RFQ Reference: ${rfqReference}

--- Original RFQ Items ---
${itemsList}

--- Supplier Email Body ---
${emailBodyText}
${attachmentsText ? `\n--- Attachment Content ---\n${attachmentsText}` : ''}`;
}
