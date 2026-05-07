// =============================================
// SUPPLIER SEARCH ACTIONS - Supplier Discovery Processor
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → fetch rfq_items from DB → AI call → save to DB → return ProcessorResult
// Two pipelines, gated by SUPPLIER_SEARCH_MODE env:
//   - 'rag'    (new): Tavily search → vLLM extraction with guided_json schema (per-item, p-limit 8)
//   - 'legacy' (old): single-shot LLM hallucinating supplier data (kept until Phase 6 cleanup)

import pLimit from 'p-limit';
import { hfChatCompletion } from '@/lib/ai-agent/hf-client';
import {
  SEARCH_SUPPLIERS_PROMPT,
  EXTRACT_SUPPLIER_FROM_SNIPPETS_PROMPT,
  buildSearchUserMessage,
  buildResearchUserMessage,
  buildExtractUserMessage,
} from '@/lib/ai-agent/prompt/search-suppliers';
import { getData } from '@/lib/db/queries';
import { modifyDatabase } from '@/lib/utils/databaseHandler';
import { getLocalModel } from '@/lib/ai-agent/local-model';
import { searchWeb } from '@/lib/services/search';
import { SUPPLIER_SCHEMA, type SupplierExtraction } from '@/lib/ai-agent/schemas/supplier';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** AI inference mode: 'local' = vLLM RunPod pod, anything else = HF remote */
const AI_MODE = process.env.AI_MODE || 'remote';
/** Pipeline switch: 'rag' = Tavily+guided extraction, anything else = legacy single-shot */
const SUPPLIER_SEARCH_MODE = process.env.SUPPLIER_SEARCH_MODE || 'legacy';
/** Per-RFQ concurrency cap for the RAG branch — keeps Tavily free-tier happy and prevents pod OOM */
const RAG_CONCURRENCY = 8;

// ---------------------------------------------
// AI Output Type (matches SEARCH_SUPPLIERS_PROMPT schema — legacy path)
// ---------------------------------------------

/** AI-generated supplier search result (legacy path) */
interface SupplierSearchAIResult {
  suppliers_search: {
    subject: string;
    search_content: string;
    search_status: string;
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
    contact_email?: string;
    contact_phone?: string;
  }>;
}

/** Same shape as legacy items_source row, used when assembling RAG output */
type ItemSourceRow = SupplierSearchAIResult['items_source'][number];

// ---------------------------------------------
// URL Guards (RAG path only)
// ---------------------------------------------

/**
 * Returns true only when the URL points at a specific page (not a bare domain).
 * Defensive net behind the LLM prompt's "no homepage" rule — the model is good
 * at this but we never fully trust it.
 */
function isProductPage(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    // Path must be more than just "/"; query strings alone don't count as a product page
    return u.pathname.length > 1;
  } catch {
    return false;
  }
}

/**
 * HEAD-check each url in parallel; mark items dead when status >= 400 or fetch
 * throws/times out. Bounded by AbortSignal.timeout so a slow site can't hang
 * the whole pipeline against the Vercel function timeout.
 */
async function filterLiveUrls(items: ItemSourceRow[]): Promise<{ live: ItemSourceRow[]; dropped: number }> {
  const checks = await Promise.allSettled(
    items.map((item) =>
      fetch(item.source_url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3_000),
        // Some servers reject default fetch UA — set a generic one to reduce false-drops
        headers: { 'User-Agent': 'Mozilla/5.0 QuoteFlowBot/1.0' },
      }),
    ),
  );

  const live: ItemSourceRow[] = [];
  let dropped = 0;
  checks.forEach((result, idx) => {
    const item = items[idx];
    // Treat fetch reject (timeout, DNS, TLS) as dead
    if (result.status !== 'fulfilled') { dropped++; return; }
    // Some sites reject HEAD with 405 but the page itself is fine — keep those.
    // Drop everything else ≥ 400.
    if (result.value.status === 405) { live.push(item); return; }
    if (result.value.status >= 400) { dropped++; return; }
    live.push(item);
  });

  return { live, dropped };
}

// ---------------------------------------------
// Deterministic suppliers_search summary (RAG path — no LLM)
// ---------------------------------------------

/** Build the HTML summary string used for the search-results panel. Kept short and consistent. */
function buildSearchContent(rfqReference: string, rows: ItemSourceRow[], droppedCount: number): string {
  if (rows.length === 0) {
    return `No supplier results for RFQ ${rfqReference}.`;
  }
  // One <br>-separated line per item — readable in the panel preview, no double-<br>s
  const lines = rows.map((r) => {
    const price = r.bidder_unit_price > 0 ? `USD ${r.bidder_unit_price.toFixed(2)}` : 'price n/a';
    return `• Item #${r.item_id}: ${r.supplier_name} — ${price} — ${r.delivery_time}`;
  });
  const drop = droppedCount > 0 ? `<br>Note: ${droppedCount} candidate URL(s) dropped (offline or homepage-only).` : '';
  return `Supplier search for RFQ ${rfqReference}:<br>${lines.join('<br>')}${drop}`;
}

// ---------------------------------------------
// Main Processor: Process Supplier Search
// ---------------------------------------------

/**
 * Process supplier search based on action_type.
 * @param input - Validated ProcessorInput (data_type: 'supplier_search')
 * @returns ProcessorResult with supplier data
 */
export async function processSupplierSearch(input: ProcessorInput): Promise<ProcessorResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const { action_type, rfq_id, rfq_reference, search, workspace } = input;

    if (!workspace) throw new Error('Missing workspace context');

    // =========================================
    // RAG branch — only for action_type='search' (re-search uses legacy until we port that path)
    // =========================================
    if (SUPPLIER_SEARCH_MODE === 'rag' && action_type === 'search') {
      console.log(`[supplier-search] start rfq_id=${rfq_id} mode=rag`);

      // Fetch RFQ items from DB — single source of truth for "what to source"
      const itemRows = rfq_id
        ? ((await getData('rfqItems', { rfqId: rfq_id }, workspace)) as Array<Record<string, unknown>>)
        : [];

      if (itemRows.length === 0) {
        throw new Error(`No rfq_items found for rfq_id=${rfq_id}`);
      }

      // Cap per-item concurrency so 30 items don't fire 30 parallel Tavily/vLLM calls
      const limit = pLimit(RAG_CONCURRENCY);

      // Per-item pipeline: search → extract → return one ItemSourceRow (or null on hard failure)
      const rawItems = await Promise.all(
        itemRows.map((row) =>
          limit(async (): Promise<ItemSourceRow | null> => {
            const itemId = Number(row.itemId);
            const description = String(row.companyDescription || '');
            const qty = Number(row.qty || 0);
            const uom = String(row.uom || 'EA');

            // (1) Tier-walked Tavily search w/ Redis cache
            const search = await searchWeb({ description, qty, uom });

            // Empty snippets → no point calling vLLM. Return a placeholder row so the UI shows the gap.
            if (search.snippets.length === 0) {
              console.warn(`[supplier-search] item=${itemId} no snippets after tier walk`);
              return null;
            }

            // (2) vLLM extraction — guided_json locks output to SUPPLIER_SCHEMA
            const llmStart = Date.now();
            let extracted: SupplierExtraction;
            try {
              extracted = await getLocalModel().chatCompletion<SupplierExtraction>(
                EXTRACT_SUPPLIER_FROM_SNIPPETS_PROMPT,
                buildExtractUserMessage({
                  item: { itemId, description, qty, uom },
                  snippets: search.snippets,
                }),
                600,                // tight cap — one supplier object is small (~200-400 tokens)
                SUPPLIER_SCHEMA,    // xgrammar-enforced shape
              );
            } catch (err) {
              console.warn(`[supplier-search] item=${itemId} llm error:`, err instanceof Error ? err.message : err);
              return null;
            }
            console.log(`[ai-server] item=${itemId} extract latency=${Date.now() - llmStart}ms`);

            // (3) Map to DB row shape; supplier_id is assigned post-hoc after the merge
            return {
              item_id: itemId,
              supplier_id: 0,                      // placeholder — filled in below
              supplier_name: extracted.supplier_name,
              source_url: extracted.source_url,
              status: 'pending',                   // schema constant — never AI-derived
              delivery_time: extracted.delivery_time,
              bidder_description: extracted.bidder_description,
              bidder_unit_price: extracted.bidder_unit_price,
              compliance_deviation: extracted.compliance_deviation,
              notes: extracted.notes,
              contact_email: extracted.contact_email,
              contact_phone: extracted.contact_phone,
            };
          }),
        ),
      );

      // Drop nulls (hard failures) so downstream code only sees real items
      const beforeUrlGuards = rawItems.filter((r): r is ItemSourceRow => r !== null);

      // (4) URL guard — drop homepages even if the LLM slipped past the prompt rule
      const productPageItems = beforeUrlGuards.filter((r) => isProductPage(r.source_url) || r.source_url === '');

      // (5) Liveness check — HEAD each URL, drop dead ones (parallelized)
      const itemsWithUrl = productPageItems.filter((r) => r.source_url !== '');
      const itemsWithoutUrl = productPageItems.filter((r) => r.source_url === '');
      const { live, dropped: deadUrlCount } = await filterLiveUrls(itemsWithUrl);

      // (6) Sequential supplier_id assignment across the merged set (deterministic, no LLM)
      const finalItems: ItemSourceRow[] = [...live, ...itemsWithoutUrl].map((row, idx) => ({
        ...row,
        supplier_id: idx + 1,
      }));

      const totalDropped = beforeUrlGuards.length - productPageItems.length + deadUrlCount;
      console.log(`[supplier-search] done rfq_id=${rfq_id} returned=${finalItems.length} dropped=${totalDropped}`);

      // (7) Build suppliers_search summary deterministically — NO LLM call here
      const suppliers_search = {
        subject: `Supplier Search Results - ${rfq_reference || `RFQ ${rfq_id}`}`,
        search_content: buildSearchContent(rfq_reference || `${rfq_id ?? ''}`, finalItems, totalDropped),
        search_status: 'completed',
      };

      // Build the ProcessorResult before the DB save (UI gets the result regardless of save outcome)
      const result: ProcessorResult = {
        success: true,
        data_type: 'supplier_search',
        action_type,
        status: 'completed',
        session_id: '',
        processing_time_ms: Date.now() - startTime,
        data: {
          rfq_id: rfq_id ?? null,
          suppliers_search,
          items_source: finalItems,
        },
        timestamp,
      };

      // (8) Persist — same modifyDatabase contract as legacy, so DB schema is untouched
      try {
        await modifyDatabase(
          {
            data_type: 'supplier_search',
            rfq_id,
            rfq_reference,
            suppliers_search,
            items_source: finalItems.map((item) => ({ ...item, rfq_id })),  // FK linkage for supplierItemStatus
          },
          workspace,
        );
      } catch (dbError) {
        console.error('[supplier-search] DB save failed (non-blocking):', dbError);
      }

      return result;
    }

    // =========================================
    // LEGACY branch — single-shot LLM hallucination path (kept for rollback until Phase 6)
    // =========================================
    let userMessage: string;

    if (action_type === 'search') {
      const itemRows = rfq_id
        ? ((await getData('rfqItems', { rfqId: rfq_id }, workspace)) as Array<Record<string, unknown>>)
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

    let aiResult: SupplierSearchAIResult;
    if (AI_MODE === 'local') {
      console.log('[Supplier Search] Using local AI model (legacy path)');
      aiResult = await getLocalModel().chatCompletion<SupplierSearchAIResult>(
        SEARCH_SUPPLIERS_PROMPT,
        userMessage,
        6500,
      );
    } else {
      aiResult = await hfChatCompletion<SupplierSearchAIResult>(
        SEARCH_SUPPLIERS_PROMPT,
        userMessage,
        6500,
      );
    }

    const result: ProcessorResult = {
      success: true,
      data_type: 'supplier_search',
      action_type,
      status: 'completed',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      data: {
        rfq_id: rfq_id ?? null,
        suppliers_search: aiResult.suppliers_search,
        items_source: aiResult.items_source || [],
      },
      timestamp,
    };

    try {
      await modifyDatabase(
        {
          data_type: 'supplier_search',
          rfq_id,
          rfq_reference,
          suppliers_search: aiResult.suppliers_search,
          items_source: (aiResult.items_source || []).map((item) => ({ ...item, rfq_id })),
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
