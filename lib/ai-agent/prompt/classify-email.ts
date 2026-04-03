// =============================================
// CLASSIFY-EMAIL PROMPT — determines if an incoming email is
// a new RFQ request or a supplier reply to an existing RFQ.
// =============================================

// --- System prompt: instructs the model on classification rules & output format ---
export const CLASSIFY_EMAIL_PROMPT = `You classify incoming emails into exactly one type. Return ONLY valid JSON, no markdown or explanation.

Output schema:
{"type":"rfq_analysis"|"supplier_respond","confidence":0.0-1.0,"reasoning":"one-line reason"}

Rules:
- rfq_analysis: new RFQ, quotation inquiry, or pricing request from a potential customer.
- supplier_respond: reply from a supplier — typically has RE:/FW: referencing an existing RFQ, and contains pricing, availability, or quotation data.

If uncertain, pick the best match and lower confidence.`;

// --- Input shape for the user message builder ---
interface ClassifyInput {
  fromEmail: string;
  fromName: string;
  subject: string;
  emailBodyText: string;
  attachmentNames: string[]; // just filenames
}

// --- Builds the user message injecting dynamic email data ---
export function buildClassifyUserMessage(input: ClassifyInput): string {
  const { fromEmail, fromName, subject, emailBodyText, attachmentNames } =
    input;

  // Compact representation to minimize tokens
  return `From: ${fromName} <${fromEmail}>
Subject: ${subject}
Attachments: ${attachmentNames.length ? attachmentNames.join(', ') : 'none'}

Body:
${emailBodyText}`;
}
