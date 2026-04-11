// =============================================
// SUPPLIER SEARCH ACTIONS - Supplier Discovery Processor
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → fetch rfq_items from DB → build AI message → AI call → save to DB → return ProcessorResult
// Supports: search | research

import { hfChatCompletion } from '@/lib/ai-agent/hf-client';
import {
  SEARCH_SUPPLIERS_PROMPT,
  buildSearchUserMessage,
  buildResearchUserMessage,
} from '@/lib/ai-agent/prompt/search-suppliers';
import { getData } from '@/lib/db/queries';
import { modifyDatabase } from '@/lib/utils/databaseHandler';
import { getLocalModel } from '@/lib/ai-agent/local-model';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** AI inference mode: 'local' = run model locally, anything else = call remote API */
const AI_MODE = process.env.AI_MODE || 'remote';

// ---------------------------------------------
// AI Output Type (matches SEARCH_SUPPLIERS_PROMPT schema)
// ---------------------------------------------

/** AI-generated supplier search result — matches the prompt's output schema */
interface SupplierSearchAIResult {
  suppliers_search: {
    subject: string;
    search_content: string;   // HTML-safe summary with <br> separators
    search_status: string;    // always "completed"
  };
  items_source: Array<{
    item_id: number;
    supplier_id: number;
    supplier_name: string;
    source_url: string;
    status: string;
    delivery_time: string;
    bidder_description: string;
    bidder_unit_price: number;
    compliance_deviation: string;
    notes: string;
  }>;
}

// ---------------------------------------------
// Main Processor: Process Supplier Search
// ---------------------------------------------

/**
 * Process supplier search based on action_type.
 * - search:   fetches rfq_items from DB → builds structured AI message → AI finds suppliers
 * - research: re-searches with user feedback on previous results
 * @param input - Validated ProcessorInput (data_type: 'supplier_search')
 * @returns ProcessorResult with supplier data
 */
export async function processSupplierSearch(input: ProcessorInput): Promise<ProcessorResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const { action_type, rfq_id, rfq_reference, search, workspace } = input;

    if (!workspace) throw new Error('Missing workspace context');

    // Build AI user message based on action_type
    let userMessage: string;

    if (action_type === 'search') {
      // Fetch rfq_items from DB for structured per-item AI input
      const itemRows = rfq_id
        ? (await getData('rfqItems', { rfqId: rfq_id }, workspace)) as Array<Record<string, unknown>>
        : [];

      userMessage = buildSearchUserMessage({
        rfqReference: rfq_reference || '',
        subject: search?.subject || '',
        items: itemRows.map((i) => ({
          itemId: Number(i.itemId),
          description: String(i.companyDescription || ''),
          qty: Number(i.qty || 0),
          uom: String(i.uom || 'EA'),
        })),
      });
    } else {
      // research: re-search with user inline notes + general feedback
      userMessage = buildResearchUserMessage({
        rfqReference: rfq_reference || '',
        previousSearch: search?.search_content || '',
        generalFeedback: input.ai_comments?.general_feedback || '',
        inlineNotes: (input.ai_comments?.inline_notes || []).map((n) => ({
          selectedText: n.selected_text,
          comment: n.comment,
        })),
      });
    }

    // Call AI — local or remote based on AI_MODE
    let aiResult: SupplierSearchAIResult;
    if (AI_MODE === 'local') {
      console.log('[Supplier Search] Using local AI model');
      aiResult = await getLocalModel().chatCompletion<SupplierSearchAIResult>(
        SEARCH_SUPPLIERS_PROMPT,
        userMessage,
      );
    } else {
      aiResult = await hfChatCompletion<SupplierSearchAIResult>(
        SEARCH_SUPPLIERS_PROMPT,
        userMessage,
        4096  // ← supplier search generates large items_source arrays
      );
    }

    // Build result — include rfq_id so SSE preview panel can run proceed pipeline
    const result: ProcessorResult = {
      success: true,
      data_type: 'supplier_search',
      action_type,
      status: 'completed',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      data: {
        rfq_id: rfq_id ?? null,                   // required by preview-panel-content.tsx for Accept action
        suppliers_search: aiResult.suppliers_search,
        items_source: aiResult.items_source || [],
      },
      timestamp,
    };

    // Save to database (non-blocking — errors don't fail the response)
    try {
      await modifyDatabase(
        {
          data_type: 'supplier_search',
          rfq_id,
          rfq_reference,
          suppliers_search: aiResult.suppliers_search,  // AI-generated summary
          items_source: (aiResult.items_source || []).map((item) => ({
            ...item,
            rfq_id,  // inject rfq_id for FK linkage in supplierItemStatus table
          })),
        },
        workspace,
      );
    } catch (dbError) {
      console.error('[Supplier Search] DB save failed (non-blocking):', dbError);
    }

    return result;
  } catch (error) {
    console.error('[Supplier Search] Error:', error);

    return {
      success: false,
      data_type: 'supplier_search',
      action_type: input.action_type,
      status: 'error',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Supplier search failed',
      timestamp: new Date().toISOString(),
    };
  }
}
