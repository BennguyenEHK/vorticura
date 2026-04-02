'use server';

// =============================================
// INCOMING EMAIL PROCESSOR — Route by Action Type
// =============================================
// Handles data_type = 'incoming_email'
// action_types: handleRFQ | handleSupplierRespond | handleUnknown
//
// Flow: email-pipeline persists to DB → handleHTTPRequest → this processor
//   handleRFQ → build rfq_analysis input → call processAnalysis()
//   handleSupplierRespond → stub (future: call processSupplierRespond())
//   handleUnknown → log, return success
//
// Architecture:
//   email-pipeline (persist + classify) → data-processor → processIncomingEmail()
//     → handleRFQEmail() → processAnalysis() (direct call, no re-entry through handleHTTPRequest)

import { processAnalysis } from './analysis-actions';
import { eventBus } from '@/lib/event-bus';
import { extractRfqReference } from '@/lib/services/email/email-pipeline';
import type { ProcessorInput, ProcessorResult } from '../utils/validator';

// Handler map — routes action_type to specific handler function
const ACTION_HANDLERS: Record<string, (input: ProcessorInput) => Promise<ProcessorResult>> = {
  handleRFQ: handleRFQEmail,
  handleSupplierRespond: handleSupplierRespondEmail,
  handleUnknown: handleUnknownEmail,
};

/**
 * Main entry: route incoming email by action_type to specific handler
 */
export async function processIncomingEmail(input: ProcessorInput): Promise<ProcessorResult> {
  const handler = ACTION_HANDLERS[input.action_type];
  if (!handler) {
    return {
      success: false,
      data_type: input.data_type,
      action_type: input.action_type,
      status: 'error',
      session_id: '',
      processing_time_ms: 0,
      error: `Unknown action_type for incoming_email: ${input.action_type}`,
      timestamp: new Date().toISOString(),
    };
  }
  return handler(input);
}

/**
 * Handle RFQ email: build rfq_analysis input and call processAnalysis() directly
 * Extracts email content + attachments → analysis_content for AI processing
 */
async function handleRFQEmail(input: ProcessorInput): Promise<ProcessorResult> {
  const ie = input.incoming_email as Record<string, any>;
  if (!ie) {
    return errorResult(input, 'incoming_email data missing from input');
  }

  // Build attachment list matching the flat parsed shape from email-pipeline
  const attachmentsParsed = (ie.attachments_parsed || []) as Array<{
    filename: string;
    content_type: string;
    extracted_text: string;
  }>;

  // Build analysis content from email body + attachment text
  const analysisContent = buildAnalysisContentFromParsed(
    ie.email_body_text || '',
    attachmentsParsed
  );

  // Extract RFQ reference from subject line (or generate fallback)
  const rfqReference = extractRfqReference(ie.subject || '') || `EMAIL-${Date.now()}`;

  // Build rfq_analysis ProcessorInput for downstream processing
  const rfqInput: ProcessorInput = {
    data_type: 'rfq_analysis',
    action_type: 'analyze',
    rfq_reference: rfqReference,
    workspace: input.workspace,
    analysis: {
      subject: ie.subject || '(no subject)',
      analysis_content: analysisContent,
    },
  };

  // Call processAnalysis directly (no re-entry through handleHTTPRequest)
  const analysisResult = await processAnalysis(rfqInput);

  // Emit SSE event for real-time UI notification
  eventBus.emit('comms-update', {
    type: 'incoming-email-routed',
    routedTo: 'rfq_analysis',
    from: ie.from_email,
    subject: ie.subject,
    rfqReference,
    timestamp: new Date().toISOString(),
  });

  return {
    success: analysisResult.success,
    data_type: 'incoming_email',
    action_type: 'handleRFQ',
    status: analysisResult.status,
    session_id: analysisResult.session_id || '',
    processing_time_ms: analysisResult.processing_time_ms || 0,
    data: {
      routed_to: 'rfq_analysis',
      classification: { type: 'rfq_analysis', confidence: input.classification_confidence },
      downstream_result: analysisResult.data,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Handle supplier response email — stub for future implementation
 * Will route to processSupplierRespond() when supplier_respond processor is built
 */
async function handleSupplierRespondEmail(input: ProcessorInput): Promise<ProcessorResult> {
  const ie = input.incoming_email as Record<string, any>;

  // Emit SSE event so UI knows a supplier response was received
  eventBus.emit('comms-update', {
    type: 'incoming-email-routed',
    routedTo: 'supplier_respond',
    from: ie?.from_email,
    subject: ie?.subject,
    timestamp: new Date().toISOString(),
  });

  // TODO: Implement supplier_respond routing when processSupplierRespond() is available
  // Future flow: match sender to known supplier → update supplier_item_status → check all_items_available
  return {
    success: true,
    data_type: 'incoming_email',
    action_type: 'handleSupplierRespond',
    status: 'completed',
    session_id: '',
    processing_time_ms: 0,
    data: {
      routed_to: 'supplier_respond',
      status: 'pending_implementation',
      from: ie?.from_email,
      subject: ie?.subject,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Handle unknown/unclassified email — log and return success (no downstream routing)
 */
async function handleUnknownEmail(input: ProcessorInput): Promise<ProcessorResult> {
  const ie = input.incoming_email as Record<string, any>;

  console.log(
    `[incoming-email] Unknown email from ${ie?.from_email}, subject: "${ie?.subject}" — no routing applied`
  );

  // Emit SSE so UI can show unclassified email in inbox
  eventBus.emit('comms-update', {
    type: 'incoming-email-unclassified',
    from: ie?.from_email,
    subject: ie?.subject,
    timestamp: new Date().toISOString(),
  });

  return {
    success: true,
    data_type: 'incoming_email',
    action_type: 'handleUnknown',
    status: 'completed',
    session_id: '',
    processing_time_ms: 0,
    data: {
      routed_to: 'none',
      reason: 'no_pattern_matched',
      from: ie?.from_email,
      subject: ie?.subject,
    },
    timestamp: new Date().toISOString(),
  };
}

// =============================================
// HELPERS
// =============================================

/**
 * Build analysis content string from email body text + parsed attachments
 * Used by handleRFQEmail to prepare input for processAnalysis.
 *
 * Note: We use this local helper instead of email-pipeline's buildAnalysisContent()
 * because that function expects ExtractedEmail/ProcessedAttachment types, while
 * here we work with the flat incoming_email data shape from the DB.
 */
function buildAnalysisContentFromParsed(
  bodyText: string,
  attachments: Array<{ filename: string; content_type: string; extracted_text: string }>
): string {
  const parts: string[] = [];

  if (bodyText) {
    parts.push('--- EMAIL BODY ---');
    parts.push(bodyText);
  }

  for (const att of attachments) {
    if (att.extracted_text && att.extracted_text !== '[extraction_failed]') {
      parts.push(`--- ATTACHMENT: ${att.filename} ---`);
      parts.push(att.extracted_text);
    }
  }

  return parts.join('\n\n');
}

/**
 * Build standardized error ProcessorResult
 */
function errorResult(input: ProcessorInput, message: string): ProcessorResult {
  return {
    success: false,
    data_type: input.data_type,
    action_type: input.action_type,
    status: 'error',
    session_id: '',
    processing_time_ms: 0,
    error: message,
    timestamp: new Date().toISOString(),
  };
}
