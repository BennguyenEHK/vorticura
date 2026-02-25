// =============================================
// EMAIL ACTIONS - Email Processor
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → route by action_type → generate/send → save to DB → emit SSE → return ProcessorResult
// Supports: generate | re_generate | send

import ky from 'ky';
import { eventBus } from '@/lib/event-bus';
import { modifyDatabase } from '@/lib/utils/databaseHandler';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** Email API endpoint */
const EMAIL_API_URL = process.env.EMAIL_API_URL || 'https://api.example.com/email';

// ---------------------------------------------
// Main Processor: Process Email
// ---------------------------------------------

/**
 * Process email based on action_type
 * @param input - Validated ProcessorInput (data_type: 'email')
 * @returns ProcessorResult with email data
 */
export async function processEmail(input: ProcessorInput): Promise<ProcessorResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const { action_type, quotation_id, rfq_reference, email, workspace } = input;
    let resultData: unknown;
    let emailStatus: string;

    // Route by action_type
    switch (action_type) {
      case 'generate':
      case 're_generate': {
        // Generate email draft from template
        const draft = generateDraftFromTemplate(input);
        resultData = draft;
        emailStatus = 'draft';
        break;
      }
      case 'send': {
        // Send email via API
        const sendResult = await sendEmailViaAPI({
          to: email?.recipient_email || '',
          subject: email?.subject || '',
          body: email?.email_content || '',
        });
        resultData = sendResult;
        emailStatus = 'sent';
        break;
      }
      default:
        throw new Error(`Unsupported email action_type: ${action_type}`);
    }

    // Build result
    const result: ProcessorResult = {
      success: true,
      data_type: 'email',
      action_type,
      status: 'completed',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      data: resultData,
      timestamp,
    };

    // Save to database (non-blocking)
    try {
      await modifyDatabase({
        data_type: 'email',
        quotation_id,
        rfq_reference,
        email: {
          subject: email?.subject || '',
          email_content: email?.email_content || '',
          recipient_email: email?.recipient_email || '',
          email_status: emailStatus,
        },
      }, workspace!);
    } catch (dbError) {
      console.error('[Email] DB save failed (non-blocking):', dbError);
    }

    // Emit SSE for real-time preview update
    eventBus.emit('preview-update', result);

    return result;
  } catch (error) {
    console.error('[Email] Error:', error);

    const errorResult: ProcessorResult = {
      success: false,
      data_type: 'email',
      action_type: input.action_type,
      status: 'error',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Email processing failed',
      timestamp,
    };

    eventBus.emit('preview-update', errorResult);
    return errorResult;
  }
}

// ---------------------------------------------
// Draft Generation
// ---------------------------------------------

/**
 * Generate email draft from template using ProcessorInput data
 */
function generateDraftFromTemplate(input: ProcessorInput): EmailDraftData {
  const email = input.email;

  // Use provided content as the draft (already validated by validator)
  return {
    to: email?.recipient_email || '',
    subject: email?.subject || '',
    body: email?.email_content || '',
  };
}

// ---------------------------------------------
// Email Templates
// ---------------------------------------------

interface EmailTemplate {
  subject: string;
  body: string;
}

/** Available email templates */
const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
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

/**
 * Populate template with context values
 */
export function populateTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  let result = template;
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{{${key}}}`;
    const replacement = String(value ?? '');
    result = result.replace(new RegExp(placeholder, 'g'), replacement);
  }
  return result;
}

/**
 * Get email template by name
 */
export function getEmailTemplate(templateName: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES[templateName];
}

// ---------------------------------------------
// Send Email via API
// ---------------------------------------------

/** Email draft data shape */
interface EmailDraftData {
  to: string;
  subject: string;
  body: string;
  attachments?: string[];
}

/**
 * Send an email via the email API
 */
async function sendEmailViaAPI(
  draft: EmailDraftData
): Promise<{ messageId: string }> {
  try {
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

    return { messageId: response.message_id };
  } catch (error) {
    // In development, return mock response
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Email] API failed, using mock send response');
      return { messageId: `mock-${Date.now()}` };
    }
    throw error;
  }
}
