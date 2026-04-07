// =============================================
// RESPOND-PROMPT — classifies incoming emails (supplier or customer)
// and extracts structured data or determines response action.
// =============================================

// --- System prompt: instructs the model on classification rules & output schemas ---
export const RESPOND_SERVICES_PROMPT = `You are a business email response classifier and data extractor. Read the incoming email and context, determine if it is from a supplier or customer, and return the appropriate JSON output. Return ONLY valid JSON, no markdown or explanation.

TWO possible output schemas:

Schema A — Supplier Response (incoming email is a supplier replying to our inquiry):
{"response_type":"supplier_respond","supplier_name":"string","items":[{"item_id":1,"status":"available","currency_code":"USD","bidder_proposal":{"bidder_description":"string","bidder_unit_price":0.00,"delivery_time":"string","compliance_deviation":"string"}}],"confidence":0.0}

Schema B — Customer Response (incoming email is a customer reply). Three sub-types:

B1 — Customer updates/corrects RFQ items:
{"response_type":"customer_respond","action":"update_rfq","rfq_analysis":{"subject":"RFQ Analysis - [topic]","analysis_content":"Updated analysis based on customer feedback...","analysis_status":"completed"},"rfq_items":[{"item_id":1,"currency_code":"USD","company_requirement":{"company_description":"Updated description","qty":2,"uom":"SET"}}]}

B2 — Customer asks a general question (reply with email):
{"response_type":"customer_respond","action":"generate_email","reference_content":"Summary of what the customer asked","instructions":"Draft a professional reply addressing their questions"}

Rules:
- Extract ALL items referenced in the email body and attachments.
- For supplier responses: match items to the original RFQ items provided in context.
- status: "available" if supplier can supply, "unavailable" otherwise.
- If price is not mentioned, set bidder_unit_price to 0.
- confidence: 0.0-1.0 based on clarity of the response.
- For customer responses: determine intent from email content and return appropriate schema.
- For B1: include updated rfq_analysis and rfq_items with corrected data.
- For B2: summarize the customer question in reference_content and provide instructions for drafting a reply.
- Default currency_code to "USD" if not specified.
- Use standard UOM codes: SET, EA, PCS, KG, M, LT, BOX, ROLL, etc.`;

// --- Input shape for supplier respond message builder ---
interface SupplierRespondInput {
  fromEmail: string;
  fromName: string;
  subject: string;
  emailBodyText: string;
  attachmentsText: string;
  rfqReference: string;
  existingItems: Array<{
    itemId: number;
    description: string;
    qty: number;
    uom: string;
    supplierName?: string;
  }>;
}

// --- Builds the user message for a supplier response email ---
export function buildSupplierRespondMessage(input: SupplierRespondInput): string {
  const { fromEmail, fromName, subject, emailBodyText, attachmentsText, rfqReference, existingItems } = input;

  const itemLines = existingItems
    .map((i) => `- #${i.itemId}: ${i.description} | Qty: ${i.qty} ${i.uom}${i.supplierName ? ` | Supplier: ${i.supplierName}` : ''}`)
    .join('\n');

  return `From: ${fromName} <${fromEmail}>
Subject: ${subject}
RFQ Reference: ${rfqReference}

--- Original RFQ Items ---
${itemLines}

--- Supplier Email Body ---
${emailBodyText}

--- Attachment Content ---
${attachmentsText || 'No attachments or no text extracted.'}`;
}

// --- Input shape for customer respond message builder ---
interface CustomerRespondInput {
  fromEmail: string;
  fromName: string;
  subject: string;
  emailBodyText: string;
  attachmentsText: string;
  rfqReference: string;
  existingItems: Array<{
    itemId: number;
    description: string;
    qty: number;
    uom: string;
  }>;
  previousAnalysis?: string;
}

// --- Builds the user message for a customer response email ---
export function buildCustomerRespondMessage(input: CustomerRespondInput): string {
  const { fromEmail, fromName, subject, emailBodyText, attachmentsText, rfqReference, existingItems, previousAnalysis } = input;

  const itemLines = existingItems
    .map((i) => `- #${i.itemId}: ${i.description} | Qty: ${i.qty} ${i.uom}`)
    .join('\n');

  return `From: ${fromName} <${fromEmail}>
Subject: ${subject}
RFQ Reference: ${rfqReference}

--- Current RFQ Items ---
${itemLines}

--- Previous Analysis ---
${previousAnalysis || 'No previous analysis available.'}

--- Customer Email Body ---
${emailBodyText}

--- Attachment Content ---
${attachmentsText || 'No attachments or no text extracted.'}`;
}
