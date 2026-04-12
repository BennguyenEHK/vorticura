// =============================================
// ANALYSIS ACTIONS - RFQ Analysis Processor (Two-Pass)
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → Pass 1 (deterministic extraction) → Pass 2 (AI) → merge → DB → result
// Supports: analyze | reanalyze | handleRFQ (incoming_email routed)

import { hfChatCompletion} from '@/lib/ai-agent/hf-client';
import { ANALYZE_RFQ_PROMPT, buildAnalyzeUserMessage, buildReanalyzeUserMessage } from '@/lib/ai-agent/prompt';
import { modifyDatabase } from '@/lib/utils/databaseHandler';
import { getData } from '@/lib/db/queries';
import { getLocalModel } from '@/lib/ai-agent/local-model';
import { extractAll, type ExtractionResult } from '@/lib/utils/rfq-extractor';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';
import type { AnalysisData, MergedAnalysisData } from '@/types/ai-agent';
import { getServerActionWorkspace } from '@/lib/middleware/get-workspace';
import type { WorkspaceContext } from '@/lib/middleware/workspace-context';

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
// Main Processor: Process Analysis (Two-Pass)
// ---------------------------------------------

/**
 * Process RFQ analysis using two-pass extraction:
 *   Pass 1: Deterministic pattern extraction (rfq_reference, items, contact, currency, deadline)
 *   Pass 2: AI generates only unstructured fields (subject, analysis_content, company_name, address)
 *   Merge: Combine both passes into MergedAnalysisData for DB save + result
 *
 * @param input - Validated ProcessorInput (data_type: 'rfq_analysis' or 'incoming_email')
 * @returns ProcessorResult with merged analysis data
 */
export async function processAnalysis(input: ProcessorInput): Promise<ProcessorResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const { action_type, rfq_id } = input;
    // SECURITY: Prefer cookie-based workspace; fallback to input.workspace for test/CLI
    let cookieWs: WorkspaceContext | null = null;
    try { cookieWs = await getServerActionWorkspace(); } catch { /* outside Next.js server action context */ }
    const workspace = cookieWs ?? input.workspace;
    if (!workspace) {
      throw new Error('Missing workspace context — not authenticated');
    }

    // ── PASS 1: Deterministic extraction (handleRFQ / analyze with incoming_email) ──
    let extracted: ExtractionResult | null = null;
    const ie = input.incoming_email;
    if (ie && (action_type === 'handleRFQ' || action_type === 'analyze')) {
      // Fetch user's full name for Attn: self-exclusion
      let userFullName = '';
      try {
        const userRows = await getData('userInfo', { userId: workspace.user_id }, workspace) as Array<Record<string, unknown>>;
        if (userRows.length) userFullName = String(userRows[0].fullName || '');
      } catch { /* non-critical — extraction still works without exclusion */ }

      extracted = extractAll({
        from_email: ie.from_email || '',
        from_name: ie.from_name || '',
        cc: ie.cc || [],
        subject: ie.subject || '',
        email_body_text: ie.email_body_text || '',
        attachments_parsed: ie.attachments_parsed,
        user_full_name: userFullName,
      });
    }

    // Resolve rfq_reference: extracted pattern > input override > empty
    const rfqRef = extracted?.rfq_reference || input.rfq_reference || '';

    // For reanalyze: load previous analysis from DB if not provided in input
    let subjectOverride = '';
    let analysisContentOverride = '';
    if (action_type === 'reanalyze' && rfq_id && (!input.analysis || !input.analysis.analysis_content)) {
      const rows = await getData('rfqAnalysis', { rfqId: rfq_id }, workspace) as Array<Record<string, unknown>>;
      if (rows.length) {
        subjectOverride = String(rows[0].subject || '');
        analysisContentOverride = String(rows[0].analysisContent || '');
      }
    }

    // ── PASS 2: AI call (reduced scope — only subject, analysis_content, company_name, address) ──
    const subject = ie?.subject || subjectOverride || input.analysis?.subject || '(no subject)';
    const analysisContent = ie
      ? buildIncomingAnalysisContent(ie)
      : (analysisContentOverride || input.analysis?.analysis_content || '');

    const aiResponse = await callAIAnalysis(input, subject, analysisContent, workspace);

    // ── MERGE: deterministic + AI → complete MergedAnalysisData ──
    const merged: MergedAnalysisData = extracted
      ? mergeExtractionWithAI(extracted, aiResponse)
      : {
          // Fallback for reanalyze or non-email inputs (AI handles everything)
          rfq_analysis: aiResponse.rfq_analysis,
          customer_info: {
            company_name: aiResponse.customer_partial?.company_name || '',
            attention_person: '',
            carbon_copy_person: [],
            email: '',
            phone: '',
            fax_number: '',
            customer_address: aiResponse.customer_partial?.customer_address || '',
          },
          rfq_items: [],
          required_currency: 'USD',
          deadline_period: null,
          closing_time: null,
          rfq_reference: rfqRef || null,
        };

    // ── NEW vs EXISTING RFQ resolution ──
    // Always run dedup when we have email + reference (catches duplicate SEQ3-style inputs)
    let resolvedRfqId = rfq_id;
    if (merged.customer_info.email && rfqRef) {
      const existingId = await resolveRfqId(merged.customer_info.email, rfqRef, workspace);
      resolvedRfqId = existingId ?? rfq_id;
    }

    // Build result — always report as rfq_analysis for downstream consumers
    const result: ProcessorResult = {
      success: true,
      data_type: 'rfq_analysis',
      action_type,
      status: 'completed',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      data: { ...merged, rfq_id: resolvedRfqId ?? null }, // include rfq_id for SSE preview panel
      timestamp,
    };

    // Save to database (non-blocking, errors don't fail the response)
    // Note: updated_at auto-bumps on any UPDATE via $onUpdate — that is what
    // pushes the RFQ to priority 1 in the sidebar queue. current_stage /
    // unread_count are set ONLY for new RFQs so reanalyze never regresses them.
    const isNewRfq = resolvedRfqId == null;
    try {
      await modifyDatabase({
        data_type: 'rfq_analysis',
        rfq_id: resolvedRfqId,
        rfq_reference: rfqRef,
        rfq_analysis: {
          ...merged.rfq_analysis,
          required_currency: merged.required_currency,
          deadline_period: merged.deadline_period,
          closing_time: merged.closing_time,
          // Newly-created rows land at Gate 1 (user_validation); existing rows keep their stage
          current_stage: isNewRfq ? 'user_validation' : undefined,
          unread_count: isNewRfq ? 1 : undefined,
        },
        rfq_items: merged.rfq_items,
        customer_info: merged.customer_info,
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
// Merge: Deterministic + AI
// ---------------------------------------------

/**
 * Merge deterministic extraction with AI output into complete MergedAnalysisData.
 * Deterministic fields always win over AI for contact/items (higher reliability).
 * AI wins for company_name and customer_address (unstructured extraction).
 */
function mergeExtractionWithAI(
  extracted: ExtractionResult,
  aiResponse: AnalysisData
): MergedAnalysisData {
  return {
    rfq_analysis: aiResponse.rfq_analysis,
    customer_info: {
      company_name: aiResponse.customer_partial?.company_name || '',      // AI: unstructured
      attention_person: extracted.customer.attention_person,               // Deterministic: from_name / signature
      carbon_copy_person: extracted.customer.carbon_copy_person,           // Deterministic: CC header
      email: extracted.customer.email,                                    // Deterministic: from_email
      phone: extracted.customer.phone,                                    // Deterministic: signature pattern
      fax_number: extracted.customer.fax_number,                          // Deterministic: signature pattern
      customer_address: aiResponse.customer_partial?.customer_address || '', // AI: unstructured
    },
    rfq_items: extracted.rfq_items.map(item => ({
      item_id: item.item_id,
      currency_code: item.currency_code,
      company_requirement: {
        company_description: item.company_description,
        qty: item.qty,
        uom: item.uom,
      },
    })),
    required_currency: extracted.required_currency,
    deadline_period: extracted.deadline_period,
    closing_time: extracted.closing_time,
    rfq_reference: extracted.rfq_reference,
  };
}

// ---------------------------------------------
// RFQ ID Resolution
// ---------------------------------------------

/**
 * Determine if this is a new or existing RFQ.
 * Lookup: customers table by (company_id, email) → matching rfq_id with same rfq_reference.
 * Returns existing rfq_id if found, undefined if new (let DB auto-increment).
 */
async function resolveRfqId(
  customerEmail: string,
  rfqReference: string,
  workspace: WorkspaceContext
): Promise<number | undefined> {
  try {
    // 1. Find existing customers with this email in this company
    const existingCustomers = await getData('customers', {
      companyId: workspace.company_id,
      email: customerEmail,
    }, workspace) as Array<Record<string, unknown>>;

    if (!existingCustomers.length) return undefined; // New customer → new RFQ

    // 2. Check if any of their RFQs have this rfq_reference
    for (const cust of existingCustomers) {
      const custRfqId = cust.rfqId as number;
      if (!custRfqId) continue;

      const rfqs = await getData('rfqAnalysis', { rfqId: custRfqId }, workspace) as Array<Record<string, unknown>>;
      if (rfqs.length && rfqs[0].rfqReference === rfqReference) {
        return custRfqId; // Existing RFQ → update
      }
    }

    return undefined; // Known customer, new RFQ reference → new RFQ
  } catch {
    return undefined; // On error, treat as new
  }
}

// ---------------------------------------------
// AI API Call
// ---------------------------------------------

/**
 * Call AI for RFQ analysis — routes to local model or remote API based on AI_MODE.
 * AI now returns only: rfq_analysis + customer_partial (reduced scope).
 * Uses FUNCTION_MAP to select the correct prompt builder for the action_type.
 */
async function callAIAnalysis(input: ProcessorInput, subject: string, analysisContent: string, workspace: WorkspaceContext): Promise<AnalysisData> {
  const { action_type } = input;

  // Build the user message using the appropriate prompt builder
  let userMessage: string;

  if (action_type === 'reanalyze' && input.rfq_id) {
    // For reanalyze: fetch customer info + rfq items from DB for full context
    const customers = await getData('customers', { rfqId: input.rfq_id }, workspace) as Array<Record<string, unknown>>;
    const customer = customers[0];
    const items = await getData('rfqItems', { rfqId: input.rfq_id }, workspace) as Array<Record<string, unknown>>;

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
