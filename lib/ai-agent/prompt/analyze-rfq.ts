// =============================================
// ANALYZE-RFQ PROMPT — extracts structured RFQ data from
// an incoming email: customer info, line items, and analysis.
// =============================================

// --- System prompt: instructs the model on extraction rules & output schema ---
export const ANALYZE_RFQ_PROMPT = `You analyze RFQ emails. Return ONLY valid JSON, no markdown.

Output schema:
{
  "rfq_analysis": {
    "subject": "RFQ Analysis - [topic]",
    "analysis_content": "Summary: what client wants, key requirements, deadlines, clarification needed",
    "analysis_status": "completed"
  },
  "customer_partial": {
    "company_name": "Full legal company name",
    "customer_address": "Full mailing address"
  }
}

Rules:
- rfq_analysis.subject: concise title for this RFQ.
- rfq_analysis.analysis_content: summarize scope, key requirements, deadlines, compliance notes, anything needing clarification.
- rfq_analysis.analysis_status: always "completed".
- customer_partial.company_name: extract the full legal company name of the SENDER (not the recipient).
- customer_partial.customer_address: extract full mailing address from email signature or body.
- If a field is not found, use empty string "".
- Do NOT extract: email, phone, fax, items, quantities — these are handled separately.`;

// --- Input shape for the analyze user message builder ---
interface AnalyzeInput {
  subject: string;
  emailBodyText: string;
  fromEmail: string;
  fromName: string;
  cc: string[];
  attachmentsText: string; // concatenated extracted text from all attachments
}

// --- Builds the user message injecting dynamic email data ---
export function buildAnalyzeUserMessage(input: AnalyzeInput): string {
  const { subject, emailBodyText, fromEmail, fromName, cc, attachmentsText } =
    input;

  // Labeled sections for clear context separation
  return `From: ${fromName} <${fromEmail}>
Subject: ${subject}
CC: ${cc.length ? cc.join(', ') : 'none'}

--- Email Body ---
${emailBodyText}

--- Attachments Text ---
${attachmentsText || 'No attachments or no text extracted.'}`;
}

// --- Input shape for the reanalyze user message builder ---
interface ReanalyzeInput {
  subject: string;
  previousAnalysis: string;       // JSON string of previous analysis result
  generalFeedback: string;
  inlineNotes: Array<{ selectedText: string; comment: string }>;
  customerInfo?: {                // Full customer info from DB (customers table)
    companyName?: string;
    attentionPerson?: string;
    email?: string;
    phone?: string;
    customerAddress?: string;
  };
  rfqItems?: Array<{             // All RFQ items from DB (quotation_items table)
    itemId: number;
    description: string;
    qty: number;
    uom: string;
  }>;
}

// --- Builds the user message for reanalysis with feedback + DB context ---
export function buildReanalyzeUserMessage(input: ReanalyzeInput): string {
  const { subject, previousAnalysis, generalFeedback, inlineNotes, customerInfo, rfqItems } = input;

  // Format inline notes as numbered list
  const notesSection = inlineNotes.length
    ? inlineNotes
        .map((n, i) => `${i + 1}. "${n.selectedText}" — ${n.comment}`)
        .join('\n')
    : 'None';

  // Format customer info section if available
  const customerSection = customerInfo
    ? `Company: ${customerInfo.companyName || 'N/A'}\nContact: ${customerInfo.attentionPerson || 'N/A'}\nEmail: ${customerInfo.email || 'N/A'}\nPhone: ${customerInfo.phone || 'N/A'}\nAddress: ${customerInfo.customerAddress || 'N/A'}`
    : 'Not available';

  // Format RFQ items section if available
  const itemsSection = rfqItems?.length
    ? rfqItems.map((i) => `- #${i.itemId}: ${i.description} | Qty: ${i.qty} ${i.uom}`).join('\n')
    : 'Not available';

  return `Subject: ${subject}

--- Customer Info ---
${customerSection}

--- Current RFQ Items ---
${itemsSection}

--- Previous Analysis ---
${previousAnalysis}

--- General Feedback ---
${generalFeedback || 'No general feedback.'}

--- Inline Notes ---
${notesSection}

Revise the analysis based on the feedback above. Return the full corrected JSON.`;
}
