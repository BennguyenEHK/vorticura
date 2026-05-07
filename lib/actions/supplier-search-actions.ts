// =============================================
// SUPPLIER SEARCH ACTIONS — RAG pipeline (Tavily + vLLM guided extraction)
// =============================================
// Internal server module (called by data-processor, NOT a server action).
// Flow: ProcessorInput → fetch rfq_items → per-item (Tavily search → vLLM
// extract with guided_json) → URL guards → save to DB → ProcessorResult.
//
// Both action_types route through the same RAG flow:
//   - 'search'   : initial supplier discovery for an RFQ
//   - 'research' : re-run after user feedback (feedback is logged for audit;
//                  field-level diffing vs previous result is not yet implemented)

import pLimit from 'p-limit';
import {
  EXTRACT_SUPPLIER_FROM_SNIPPETS_PROMPT,
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

/** Per-RFQ concurrency cap — keeps Tavily free-tier happy and prevents pod OOM */
const RAG_CONCURRENCY = 8;

// ---------------------------------------------
// DB row shape (mirrors items_source columns)
// ---------------------------------------------

interface ItemSourceRow {
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
  contact_email: string;
  contact_phone: string;
}

// ---------------------------------------------
// URL Guards
// ---------------------------------------------

/**
 * True only when the URL points at a specific page (not a bare domain).
 * Defensive net behind the LLM prompt's "no homepage" rule — the model is
 * good at this but we never fully trust it.
 */
function isProductPage(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
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
    // Some sites reject HEAD with 405 but the page itself is fine — keep those
    if (result.value.status === 405) { live.push(item); return; }
    if (result.value.status >= 400) { dropped++; return; }
    live.push(item);
  });

  return { live, dropped };
}

// ---------------------------------------------
// Deterministic suppliers_search summary (no LLM)
// ---------------------------------------------

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
// Per-item RAG: Tavily search → vLLM extract → typed row
// ---------------------------------------------

interface RfqItemInput {
  itemId: number;
  description: string;
  qty: number;
  uom: string;
}

async function extractSupplierForItem(item: RfqItemInput): Promise<ItemSourceRow | null> {
  // (1) Tier-walked Tavily search w/ Redis cache
  const search = await searchWeb({ description: item.description, qty: item.qty, uom: item.uom });
  if (search.snippets.length === 0) {
    console.warn(`[supplier-search] item=${item.itemId} no snippets after tier walk`);
    return null;
  }

  // (2) vLLM extraction — guided_json locks output to SUPPLIER_SCHEMA
  const llmStart = Date.now();
  let extracted: SupplierExtraction;
  try {
    extracted = await getLocalModel().chatCompletion<SupplierExtraction>(
      EXTRACT_SUPPLIER_FROM_SNIPPETS_PROMPT,
      buildExtractUserMessage({
        item,
        snippets: search.snippets,
      }),
      600,                // tight cap — one supplier object is small (~200-400 tokens)
      SUPPLIER_SCHEMA,    // xgrammar-enforced shape
    );
  } catch (err) {
    console.warn(`[supplier-search] item=${item.itemId} llm error:`, err instanceof Error ? err.message : err);
    return null;
  }
  console.log(`[ai-server] item=${item.itemId} extract latency=${Date.now() - llmStart}ms`);

  return {
    item_id: item.itemId,
    supplier_id: 0,                      // placeholder — assigned post-merge
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
}

// ---------------------------------------------
// Main Processor
// ---------------------------------------------

/**
 * Process supplier search via RAG pipeline.
 * @param input - Validated ProcessorInput (data_type: 'supplier_search')
 * @returns ProcessorResult with supplier data
 */
export async function processSupplierSearch(input: ProcessorInput): Promise<ProcessorResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const { action_type, rfq_id, rfq_reference, ai_comments, workspace } = input;
    if (!workspace) throw new Error('Missing workspace context');

    console.log(`[supplier-search] start rfq_id=${rfq_id} action=${action_type}`);

    // For 'research' action_type, log the user feedback for audit. The RAG
    // flow re-runs every item; field-level diffing vs the previous result is
    // a future enhancement — keeping behavior simple keeps blast radius small.
    if (action_type === 'research' && ai_comments) {
      const noteCount = ai_comments.inline_notes?.length ?? 0;
      console.log(`[supplier-search] research feedback: notes=${noteCount} general=${(ai_comments.general_feedback || '').length}c`);
    }

    // Fetch RFQ items from DB — single source of truth for "what to source"
    const itemRows = rfq_id
      ? ((await getData('rfqItems', { rfqId: rfq_id }, workspace)) as Array<Record<string, unknown>>)
      : [];

    if (itemRows.length === 0) {
      throw new Error(`No rfq_items found for rfq_id=${rfq_id}`);
    }

    // Cap per-item concurrency so 30 items don't fire 30 parallel Tavily/vLLM calls
    const limit = pLimit(RAG_CONCURRENCY);

    const rawItems = await Promise.all(
      itemRows.map((row) =>
        limit(() =>
          extractSupplierForItem({
            itemId: Number(row.itemId),
            description: String(row.companyDescription || ''),
            qty: Number(row.qty || 0),
            uom: String(row.uom || 'EA'),
          }),
        ),
      ),
    );

    // Drop hard failures so downstream code only sees real items
    const beforeUrlGuards = rawItems.filter((r): r is ItemSourceRow => r !== null);

    // URL guard — drop homepages even if the LLM slipped past the prompt rule.
    // We KEEP rows with empty source_url (those are explicit "no product page" markers).
    const productPageItems = beforeUrlGuards.filter((r) => r.source_url === '' || isProductPage(r.source_url));

    // Liveness check — HEAD each URL, drop dead ones (parallelized)
    const itemsWithUrl = productPageItems.filter((r) => r.source_url !== '');
    const itemsWithoutUrl = productPageItems.filter((r) => r.source_url === '');
    const { live, dropped: deadUrlCount } = await filterLiveUrls(itemsWithUrl);

    // Sequential supplier_id assignment across the merged set (deterministic, no LLM)
    const finalItems: ItemSourceRow[] = [...live, ...itemsWithoutUrl].map((row, idx) => ({
      ...row,
      supplier_id: idx + 1,
    }));

    const totalDropped = beforeUrlGuards.length - productPageItems.length + deadUrlCount;
    console.log(`[supplier-search] done rfq_id=${rfq_id} returned=${finalItems.length} dropped=${totalDropped}`);

    // Build suppliers_search summary deterministically — NO LLM call here
    const suppliers_search = {
      subject: `Supplier Search Results - ${rfq_reference || `RFQ ${rfq_id}`}`,
      search_content: buildSearchContent(rfq_reference || `${rfq_id ?? ''}`, finalItems, totalDropped),
      search_status: 'completed',
    };

    const result: ProcessorResult = {
      success: true,
      data_type: 'supplier_search',
      action_type,
      status: 'completed',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      data: {
        rfq_id: rfq_id ?? null,                // required by preview-panel-content.tsx for Accept action
        suppliers_search,
        items_source: finalItems,
      },
      timestamp,
    };

    // Persist — modifyDatabase contract is unchanged so DB schema is untouched
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
  } catch (error) {
    console.error('[supplier-search] error:', error);

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
