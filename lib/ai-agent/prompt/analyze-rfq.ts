// =============================================
// ANALYZE-RFQ PROMPT — extracts structured RFQ data from
// an incoming email: customer info, line items, and analysis.
// =============================================

// --- System prompt: instructs the model on extraction rules & output schema ---
export const ANALYZE_RFQ_PROMPT = `You extract structured RFQ data from emails. Return ONLY valid JSON, no markdown or explanation.

Output schema:
{
  "report": {
    "subject": "RFQ Analysis - [topic]",
    "analysis_content": "Summary: what client wants, key requirements, deadlines, clarification needed"
  },
  "customer_info": {
    "company_name": "",
    "attention_person": "",
    "carbon_copy_person": [],
    "email": "",
    "phone": "",
    "fax_number": "",
    "customer_address": ""
  },
  "rfq_items": [
    {
      "item_id": 1,
      "currency_code": "USD",
      "company_requirement": {
        "company_description": "Full description with model/specs",
        "qty": 1,
        "uom": "SET"
      }
    }
  ]
}

Rules:
- Extract ALL items from both email body AND attachments.
- Number items sequentially starting from 1.
- Use standard UOM codes: SET, EA, PCS, KG, M, LT, BOX, ROLL, etc.
- Default currency_code to "USD" if not specified.
- If a field is not found, use empty string "" or empty array [].
- Extract full customer contact info: company, person, CC, email, phone, fax, address.
- analysis_content: concise summary of what is requested, note if clarification is needed.
- company_description must include full item detail: model, part number, specs, material.`;

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
  previousAnalysis: string; // JSON string of previous analysis result
  generalFeedback: string;
  inlineNotes: Array<{ selectedText: string; comment: string }>;
}

// --- Builds the user message for reanalysis with feedback ---
export function buildReanalyzeUserMessage(input: ReanalyzeInput): string {
  const { subject, previousAnalysis, generalFeedback, inlineNotes } = input;

  // Format inline notes as numbered list
  const notesSection = inlineNotes.length
    ? inlineNotes
        .map((n, i) => `${i + 1}. "${n.selectedText}" — ${n.comment}`)
        .join('\n')
    : 'None';

  return `Subject: ${subject}

--- Previous Analysis ---
${previousAnalysis}

--- General Feedback ---
${generalFeedback || 'No general feedback.'}

--- Inline Notes ---
${notesSection}

Revise the analysis based on the feedback above. Return the full corrected JSON.`;
}
