// =============================================
// EMAIL ACTIONS - Email Processor
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → route by action_type → generate/send → save to DB → emit SSE → return ProcessorResult
// Supports: generate | re_generate | send

import ky from 'ky';
import { modifyDatabase } from '@/lib/utils/databaseHandler';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';
import { db } from '@/lib/db/client';
import { emailConnections } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { decryptToken, refreshGoogleToken, refreshMicrosoftToken, encryptToken } from '@/lib/services/email/oauth-helper';
import { sendGmailMessage } from '@/lib/services/email/gmail-client';
import { sendOutlookMessage } from '@/lib/services/email/outlook-client';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** Fallback email API endpoint (used when no OAuth connection exists) */
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

    // Handle incoming_email routing (handleUnknown → processEmail)
    // Map incoming_email fields to email fields for processing
    const isFromIncomingEmail = input.data_type === 'incoming_email';
    const effectiveEmail = isFromIncomingEmail && input.incoming_email
      ? {
          recipient_email: input.incoming_email.from_email,
          subject: `RE: ${input.incoming_email.subject || '(no subject)'}`,
          email_content: input.incoming_email.email_body_text || '',
        }
      : email;

    let resultData: unknown;
    let emailStatus: string;

    // Route by action_type (use 'generate' for incoming_email routed input)
    const effectiveActionType = isFromIncomingEmail ? 'generate' : action_type;

    switch (effectiveActionType) {
      case 'generate':
      case 're_generate': {
        // Generate email draft from template
        const draft = generateDraftFromTemplate(input);
        resultData = draft;
        emailStatus = 'draft';
        break;
      }
      case 'send': {
        // Validate recipient field is present and non-empty
        if (!effectiveEmail?.recipient_email || effectiveEmail.recipient_email.trim() === '') {
          throw new Error(
            'Cannot send email: no recipient address provided. ' +
            'Please specify a valid recipient email or ensure the draft contains a "to" field.'
          );
        }

        // Send email via user's OAuth provider, fallback to generic API
        const sendResult = await sendEmailViaProvider(
          {
            to: effectiveEmail.recipient_email,
            subject: effectiveEmail?.subject || '',
            body: effectiveEmail?.email_content || '',
          },
          workspace?.client_id,
          workspace?.company_id,
        );
        resultData = sendResult;
        emailStatus = 'sent';
        break;
      }
      default:
        throw new Error(`Unsupported email action_type: ${effectiveActionType}`);
    }

    // Build result — always report as data_type 'email' regardless of input source
    const result: ProcessorResult = {
      success: true,
      data_type: 'email',
      action_type: isFromIncomingEmail ? 'generate' : action_type,
      status: 'completed',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      data: resultData,
      timestamp,
    };

    // Save to database (non-blocking), use effectiveEmail for field values
    try {
      if (workspace) {
        await modifyDatabase({
          data_type: 'email',
          quotation_id,
          rfq_reference,
          email: {
            subject: effectiveEmail?.subject || '',
            email_content: effectiveEmail?.email_content || '',
            recipient_email: effectiveEmail?.recipient_email || '',
            email_status: emailStatus,
          },
        }, workspace);
      } else {
        console.warn('[Email] Skipping DB save because workspace is missing');
      }
    } catch (dbError) {
      console.error('[Email] DB save failed (non-blocking):', dbError);
    }

    return result;
  } catch (error) {
    console.error('[Email] Error:', error);

    const isFromIncomingEmailErr = input.data_type === 'incoming_email';
    const errorResult: ProcessorResult = {
      success: false,
      data_type: 'email',  // Always report as email regardless of input source
      action_type: isFromIncomingEmailErr ? 'generate' : input.action_type,
      status: 'error',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Email processing failed',
      timestamp,
    };

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
  // Handle incoming_email routing — use incoming_email fields as draft source
  if (input.data_type === 'incoming_email' && input.incoming_email) {
    return {
      to: input.incoming_email.from_email,
      subject: `RE: ${input.incoming_email.subject || '(no subject)'}`,
      body: input.incoming_email.email_body_text || '',
    };
  }

  // Standard email input — use provided content as the draft
  const email = input.email;
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
    // Use replaceAll (no regex) to avoid ReDoS from user-controlled keys
    result = result.replaceAll(placeholder, replacement);
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
// Send Email via Provider (OAuth) or Fallback API
// ---------------------------------------------

/** Email draft data shape */
interface EmailDraftData {
  to: string;
  subject: string;
  body: string;
  attachments?: string[];
}

/**
 * Send email via the user's connected OAuth provider (Gmail/Outlook).
 * Falls back to the generic EMAIL_API_URL if no active connection exists.
 */
async function sendEmailViaProvider(
  draft: EmailDraftData,
  clientId?: number,
  companyId?: number,
): Promise<{ messageId: string }> {
  // Try to find an active OAuth email connection for this user
  if (clientId && companyId) {
    try {
      const connections = await db
        .select()
        .from(emailConnections)
        .where(
          and(
            eq(emailConnections.clientId, clientId),
            eq(emailConnections.companyId, companyId),
            eq(emailConnections.status, 'active'),
          )
        )
        .limit(1);

      const connection = connections[0];

      if (connection) {
        let accessToken = decryptToken(connection.accessToken);

        // Refresh token if expired
        if (new Date(connection.tokenExpiresAt) <= new Date()) {
          const refreshToken = decryptToken(connection.refreshToken);
          const refreshed = connection.provider === 'gmail'
            ? await refreshGoogleToken(refreshToken)
            : await refreshMicrosoftToken(refreshToken);

          accessToken = refreshed.access_token;

          // Persist refreshed token
          await db
            .update(emailConnections)
            .set({
              accessToken: encryptToken(refreshed.access_token),
              tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
            })
            .where(eq(emailConnections.connectionId, connection.connectionId));
        }

        // Route to provider-specific send
        if (connection.provider === 'gmail') {
          return sendGmailMessage(accessToken, {
            to: draft.to,
            subject: draft.subject,
            body: draft.body,
            from: connection.emailAddress,
          });
        }

        if (connection.provider === 'outlook') {
          return sendOutlookMessage(accessToken, {
            to: draft.to,
            subject: draft.subject,
            body: draft.body,
          });
        }
      }
    } catch (error) {
      console.error('[Email] OAuth send failed, falling back to generic API:', error);
    }
  }

  // Fallback: generic email API
  return sendEmailViaFallbackAPI(draft);
}

/**
 * Fallback: send email via generic external API
 */
async function sendEmailViaFallbackAPI(
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
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Email] Fallback API failed, using mock send response');
      return { messageId: `mock-${Date.now()}` };
    }
    throw error;
  }
}
