// =============================================
// ANALYSIS ACTIONS - RFQ Analysis Processor
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → route by action_type → AI API call → save to DB → return ProcessorResult
// Supports: analyze | reanalyze | handleRFQ (incoming_email routed)

import { hfChatCompletion, ANALYSIS_SYSTEM_PROMPT } from '@/lib/ai-agent/hf-client';
import { ANALYZE_RFQ_PROMPT, buildAnalyzeUserMessage, buildReanalyzeUserMessage } from '@/lib/ai-agent/prompt';
import { modifyDatabase } from '@/lib/utils/databaseHandler';
import { getData } from '@/lib/db/queries';
import { getLocalModel } from '@/lib/ai-agent/local-model';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';
import type { AnalysisData } from '@/types/ai-agent';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** AI inference mode: 'local' = run model locally, anything else = call remote API */
const AI_MODE = process.env.AI_MODE || 'remote';

// Prompt builder map: action_type → message builder function
// handleRFQ/analyze → buildAnalyzeUserMessage (initial analysis from email or direct)
// reanalyze → buildReanalyzeUserMessage (re-analysis with user feedback + DB context)
const FUNCTION_MAP: Record<string, typeof buildAnalyzeUserMessage | typeof buildReanalyzeUserMessage> = {
  handleRFQ: buildAnalyzeUserMessage,
  analyze: buildAnalyzeUserMessage,
  reanalyze: buildReanalyzeUserMessage,
};

// ---------------------------------------------
// Main Processor: Process Analysis
// ---------------------------------------------

/**
 * Process RFQ analysis based on action_type.
 * Handles both direct rfq_analysis input and incoming_email routed via handleRFQ.
 * @param input - Validated ProcessorInput (data_type: 'rfq_analysis' or 'incoming_email')
 * @returns ProcessorResult with analysis data
 */
export async function processAnalysis(input: ProcessorInput): Promise<ProcessorResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const { action_type, rfq_id, rfq_reference, analysis, workspace } = input;
    // workspace should be provided by validator, but guard defensively
    if (!workspace) {
      throw new Error('Missing workspace context');
    }

    // Detect if input is incoming_email (routed from handleRFQ) vs direct rfq_analysis
    const isFromIncomingEmail = input.data_type === 'incoming_email';
    const ie = input.incoming_email;

    // Build subject and analysis content based on input source
    const subject = isFromIncomingEmail
      ? (ie?.subject || '(no subject)')
      : (analysis?.subject || '');
    const analysisContent = isFromIncomingEmail
      ? buildIncomingAnalysisContent(ie!)
      : (analysis?.analysis_content || '');

    // Route by action_type: analyze | reanalyze | handleRFQ → all call AI API
    const aiResponse = await callAIAnalysis(input, subject, analysisContent);

    // Build result — always report as rfq_analysis/analyze for downstream consumers
    const result: ProcessorResult = {
      success: true,
      data_type: 'rfq_analysis',
      action_type: isFromIncomingEmail ? 'analyze' : action_type,
      status: 'completed',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      data: aiResponse,
      timestamp,
    };

    // Save to database (non-blocking, errors don't fail the response)
    try {
      await modifyDatabase({
        data_type: 'rfq_analysis',
        rfq_id,
        rfq_reference,
        rfq_analysis: {
          subject: subject,
          analysis_content: aiResponse.summary || analysisContent,
          analysis_status: 'completed',
        },
      }, workspace);
    } catch (dbError) {
      console.error('[Analysis] DB save failed (non-blocking):', dbError);
    }

    return result;
  } catch (error) {
    console.error('[Analysis] Error:', error);

    const errorResult: ProcessorResult = {
      success: false,
      data_type: 'rfq_analysis',
      action_type: input.action_type,
      status: 'error',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Analysis failed',
      timestamp,
    };

    return errorResult;
  }
}

// ---------------------------------------------
// AI API Call
// ---------------------------------------------

/**
 * Call AI for RFQ analysis — routes to local model or remote API based on AI_MODE.
 * Uses FUNCTION_MAP to select the correct prompt builder for the action_type.
 * Local mode: runs model in-process via @xenova/transformers
 * Remote mode: calls HuggingFace Inference API via hfChatCompletion
 */
async function callAIAnalysis(input: ProcessorInput, subject: string, analysisContent: string): Promise<AnalysisData> {
  const { action_type } = input;

  // Build the user message using the appropriate prompt builder from FUNCTION_MAP
  let userMessage: string;

  if (action_type === 'reanalyze' && input.rfq_id) {
    // For reanalyze: fetch customer info + rfq items from DB for full context
    const customers = await getData('customers', { rfqId: input.rfq_id }, input.workspace!) as Array<Record<string, unknown>>;
    const customer = customers[0];
    const items = await getData('quotationItems', { rfqId: input.rfq_id }, input.workspace!) as Array<Record<string, unknown>>;

    userMessage = buildReanalyzeUserMessage({
      subject,
      previousAnalysis: analysisContent,
      generalFeedback: input.ai_comments?.general_feedback || '',
      inlineNotes: (input.ai_comments?.inline_notes || []).map(n => ({
        selectedText: n.selected_text,
        comment: n.comment,
      })),
      customerInfo: customer ? {
        companyName: String(customer.companyName || ''),
        attentionPerson: String(customer.attentionPerson || ''),
        email: String(customer.email || ''),
        phone: String(customer.phone || ''),
        customerAddress: String(customer.customerAddress || ''),
      } : undefined,
      rfqItems: items.map(i => ({
        itemId: Number(i.itemId),
        description: String(i.companyDescription || ''),
        qty: Number(i.qty || 0),
        uom: String(i.uom || 'EA'),
      })),
    });
  } else {
    // For handleRFQ / analyze: build message from email fields
    userMessage = buildAnalyzeUserMessage({
      subject,
      emailBodyText: analysisContent,
      fromEmail: input.incoming_email?.from_email || '',
      fromName: input.incoming_email?.from_name || '',
      cc: input.incoming_email?.cc || [],
      attachmentsText: '', // Already included in analysisContent
    });
  }

  // Route: local model inference (no network required)
  if (AI_MODE === 'local') {
    console.log('[Analysis] Using local AI model');
    // Generic chatCompletion<T> matches hf-client pattern
    return await getLocalModel().chatCompletion<AnalysisData>(ANALYZE_RFQ_PROMPT, userMessage);
  }

  // Route: remote API call via HuggingFace Inference SDK
  return await hfChatCompletion<AnalysisData>(ANALYZE_RFQ_PROMPT, userMessage);
}

// ---------------------------------------------
// Helpers
// ---------------------------------------------

/** Build analysis content from incoming_email body + parsed attachment text */
function buildIncomingAnalysisContent(ie: { email_body_text: string; attachments_parsed?: Array<{ filename: string; content_type: string; extracted_text: string }> }): string {
  const parts: string[] = [];
  if (ie.email_body_text) {
    parts.push('--- EMAIL BODY ---');
    parts.push(ie.email_body_text);
  }
  for (const att of ie.attachments_parsed || []) {
    if (att.extracted_text && att.extracted_text !== '[extraction_failed]') {
      parts.push(`--- ATTACHMENT: ${att.filename} ---`);
      parts.push(att.extracted_text);
    }
  }
  return parts.join('\n\n');
}
