// =============================================
// EMAIL ACTIONS - Email Drafting Server Actions
// =============================================
// Server actions for email operations:
// - Draft supplier inquiry emails
// - Draft customer response emails
// - Draft follow-up emails
// - Send emails via SMTP/API

'use server';

import ky from 'ky';
import type {
  ActionResult,
  EmailInput,
  EmailOutput,
  EmailDraft,
} from '@/types/workflow';
import { EmailInputSchema } from '@/types/workflow';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** Email API endpoint */
const EMAIL_API_URL = process.env.EMAIL_API_URL || 'https://api.example.com/email';

// ---------------------------------------------
// Main Action: Generate Email Drafts
// ---------------------------------------------

/**
 * Generate email drafts for an RFQ
 * @param input - Email generation input
 * @returns ActionResult with email drafts
 */
export async function generateEmailDrafts(
  input: EmailInput
): Promise<ActionResult<EmailOutput>> {
  const timestamp = new Date().toISOString();

  try {
    // Validate input using Zod schema
    const validationResult = EmailInputSchema.safeParse(input);
    if (!validationResult.success) {
      return {
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
        timestamp,
        stepId: 'email',
        rfqId: input.rfqId,
      };
    }

    // Generate drafts based on template type
    const drafts = await generateDrafts(input);

    // TODO: Store drafts in database when DB layer is implemented

    const output: EmailOutput = {
      rfqId: input.rfqId,
      drafts,
    };

    return {
      success: true,
      data: output,
      timestamp,
      stepId: 'email',
      rfqId: input.rfqId,
    };

  } catch (error) {
    console.error('[Email] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Email generation failed',
      timestamp,
      stepId: 'email',
      rfqId: input.rfqId,
    };
  }
}

// ---------------------------------------------
// Draft Generation
// ---------------------------------------------

/**
 * Generate email drafts based on template type
 */
async function generateDrafts(input: EmailInput): Promise<EmailDraft[]> {
  const drafts: EmailDraft[] = [];

  for (const recipient of input.recipients) {
    const draft = await generateSingleDraft(input, recipient);
    drafts.push(draft);
  }

  return drafts;
}

/**
 * Generate a single email draft
 */
async function generateSingleDraft(
  input: EmailInput,
  recipient: string
): Promise<EmailDraft> {
  // Get template based on type
  const template = getEmailTemplate(input.templateType);

  // Populate template with context
  const subject = populateTemplate(template.subject, input.context);
  const body = populateTemplate(template.body, input.context);

  return {
    to: recipient,
    subject,
    body,
  };
}

// ---------------------------------------------
// Email Templates
// ---------------------------------------------

interface EmailTemplate {
  subject: string;
  body: string;
}

/**
 * Get email template by type
 */
function getEmailTemplate(
  templateType: EmailInput['templateType']
): EmailTemplate {
  const templates: Record<EmailInput['templateType'], EmailTemplate> = {
    supplier_inquiry: {
      subject: 'RFQ: {{item_description}} - Request for Quotation',
      body: `Dear {{supplier_name}},

We are writing to request a quotation for the following items:

{{items_list}}

Please provide your best pricing and lead time.

Deadline for response: {{deadline}}

Best regards,
{{sender_name}}
{{company_name}}`,
    },
    customer_response: {
      subject: 'Re: {{original_subject}} - Quotation Ready',
      body: `Dear {{customer_name}},

Thank you for your inquiry. Please find attached our quotation for the requested items.

Summary:
{{quotation_summary}}

Total Amount: {{total_amount}}

This quotation is valid until {{valid_until}}.

Best regards,
{{sender_name}}
{{company_name}}`,
    },
    follow_up: {
      subject: 'Follow-up: {{original_subject}}',
      body: `Dear {{recipient_name}},

We are following up on our previous communication regarding {{subject_matter}}.

{{follow_up_message}}

Please let us know if you have any questions.

Best regards,
{{sender_name}}
{{company_name}}`,
    },
  };

  return templates[templateType];
}

/**
 * Populate template with context values
 */
function populateTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  let result = template;

  // Replace all {{key}} placeholders with values from context
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{{${key}}}`;
    const replacement = String(value ?? '');
    result = result.replace(new RegExp(placeholder, 'g'), replacement);
  }

  return result;
}

// ---------------------------------------------
// Send Email Action
// ---------------------------------------------

/**
 * Send an email draft
 * @param draft - Email draft to send
 * @param rfqId - Associated RFQ ID
 */
export async function sendEmail(
  draft: EmailDraft,
  rfqId: string
): Promise<ActionResult<{ messageId: string }>> {
  const timestamp = new Date().toISOString();

  try {
    // Send via email API using ky
    const response = await ky.post(EMAIL_API_URL, {
      json: {
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
        attachments: draft.attachments,
      },
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${process.env.EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }).json<{ message_id: string }>();

    // TODO: Log sent email in database when DB layer is implemented

    return {
      success: true,
      data: { messageId: response.message_id },
      timestamp,
      stepId: 'email',
      rfqId,
    };

  } catch (error) {
    console.error('[Email] Send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
      timestamp,
      stepId: 'email',
      rfqId,
    };
  }
}
