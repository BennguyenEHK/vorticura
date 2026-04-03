// =============================================
// GENERATE-EMAIL PROMPT — generates professional business
// emails for RFQ pipeline: clarification, supplier inquiry, quotation.
// =============================================

// --- System prompt: instructs the model on email generation rules & output schema ---
export const GENERATE_EMAIL_PROMPT = `You generate professional business emails. Return ONLY valid JSON, no markdown or explanation.

Output schema:
{
  "subject": "Email subject line",
  "email_body": "Full email body with \\n for line breaks"
}

Rules:
- Use standard email format: greeting, body, closing, signature placeholder "[Your Name]".
- Keep emails concise (150-300 words).
- Use \\n for line breaks, \\n\\n for paragraph spacing.
- email_type determines tone and content:
  - "clarification": Thank customer for RFQ, list numbered clarification questions.
  - "supplier_inquiry": Professional supplier inquiry, include item details and quantities.
  - "quotation": Formal quotation cover email, reference attached quotation.
- No markdown formatting in email_body, plain text only.`;

// --- Input shape for the email generation user message builder ---
interface EmailInput {
  emailType: 'clarification' | 'supplier_inquiry' | 'quotation';
  rfqReference: string;
  recipientName: string;
  recipientCompany: string;
  senderCompany: string;
  context: string; // relevant analysis/search/quotation data as text
}

// --- Builds the user message injecting dynamic email data ---
export function buildEmailUserMessage(input: EmailInput): string {
  const {
    emailType,
    rfqReference,
    recipientName,
    recipientCompany,
    senderCompany,
    context,
  } = input;

  // Labeled sections for clear context separation
  return `email_type: ${emailType}
rfq_reference: ${rfqReference}
recipient_name: ${recipientName}
recipient_company: ${recipientCompany}
sender_company: ${senderCompany}

--- Context ---
${context || 'No additional context provided.'}`;
}

// --- Input shape for the regenerate email user message builder ---
interface RegenerateEmailInput {
  emailType: 'clarification' | 'supplier_inquiry' | 'quotation';
  previousEmail: string; // JSON string of previous email result
  generalFeedback: string;
  inlineNotes: Array<{ selectedText: string; comment: string }>;
}

// --- Builds the user message for re-generation with feedback ---
export function buildRegenerateEmailUserMessage(
  input: RegenerateEmailInput
): string {
  const { emailType, previousEmail, generalFeedback, inlineNotes } = input;

  // Format inline notes as numbered list
  const notesSection = inlineNotes.length
    ? inlineNotes
        .map((n, i) => `${i + 1}. "${n.selectedText}" — ${n.comment}`)
        .join('\n')
    : 'None';

  return `email_type: ${emailType}

--- Previous Email ---
${previousEmail}

--- General Feedback ---
${generalFeedback || 'No general feedback.'}

--- Inline Notes ---
${notesSection}

Revise the email based on the feedback above. Return the full corrected JSON.`;
}
