// =============================================
// SUPPLIER SEARCH ACTIONS — RAG pipeline (Tavily + vLLM guided extraction)
// =============================================
// Internal server module (called by data-processor, NOT a server action).
// Flow: ProcessorInput → fetch rfq_items → sort by item_id ASC →
//       per-item (tier-cascaded search → vLLM extract → stock filter →
//       alt-URL re-loop) → URL guards → deterministic supplier_id → save → result.
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
import { aiChatCompletion } from '@/lib/ai-agent/ai-router';
import { searchWeb, isProductPage } from '@/lib/services/search';
import { SUPPLIER_SCHEMA, normalizeSupplierExtraction, type SupplierExtraction } from '@/lib/ai-agent/schemas/supplier';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** Per-RFQ concurrency cap — keeps Tavily free-tier happy and prevents pod OOM */
const RAG_CONCURRENCY = 8;

/**
 * Maximum re-loop depth for alternative_source_url follow-ups. depth=1 means
 * "primary supplier may have ONE alt; the alt has no alts of its own." Beyond
 * this and we'd burn budget chasing cross-linked supplier graphs.
 */
const ALT_URL_MAX_DEPTH = 1;

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
  currency_code: string;
  compliance_deviation: string;
  notes: string;
  contact_email: string;
  contact_phone: string;
}

// ---------------------------------------------
// URL Guards
// ---------------------------------------------
// isProductPage lives in lib/services/search — single source of truth shared
// with the tier cascade. We re-export it implicitly via the import above.

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
    const ccy = r.currency_code || 'USD';
    const price = r.bidder_unit_price > 0 ? `${ccy} ${r.bidder_unit_price.toFixed(2)}` : 'price n/a';
    return `• Item #${r.item_id}: ${r.supplier_name} — ${price} — ${r.delivery_time}`;
  });
  const drop = droppedCount > 0 ? `<br>Note: ${droppedCount} candidate URL(s) dropped (offline or homepage-only).` : '';
  return `Supplier search for RFQ ${rfqReference}:<br>${lines.join('<br>')}${drop}`;
}

// ---------------------------------------------
// Per-item RAG: tier-cascaded search → vLLM extract → typed rows
// ---------------------------------------------

interface RfqItemInput {
  itemId: number;
  description: string;
  qty: number;
  uom: string;
}

/**
 * Extract one or more supplier rows for a single RFQ item.
 *
 * The function returns an ARRAY because of the alt-URL re-loop: the primary
 * extracted supplier may explicitly reference an alternative product on a
 * different page, which we follow once (depth=1) and return as an additional
 * row tagged with "via_alt:<origin_supplier_id>" in its notes.
 *
 * Filters applied in order:
 *   (1) Stock Protection — drop row if 0 < available_qty < (qty + 2).
 *       available_qty === 0 means "unknown" and is treated as a bypass —
 *       we never punish unknowns because the LLM can't extract what isn't
 *       stated on the page.
 *   (2) Alt-URL re-loop — at depth 0, follow alternative_source_url if
 *       present and not already visited. Visited set is shared across the
 *       recursion so cross-linked vendors can't infinite-loop.
 */
async function extractSupplierForItem(
  item: RfqItemInput,
  depth: number = 0,
  visitedUrls: Set<string> = new Set(),
): Promise<ItemSourceRow[] | null> {
  // (1) Tier-walked Tavily search w/ Redis cache. Tier 3 is invoked INSIDE
  //     searchWeb when Tiers 1/2 fall short of the verified threshold.
  const search = await searchWeb({ description: item.description, qty: item.qty, uom: item.uom });
  if (search.snippets.length === 0) {
    console.warn(`[supplier-search] item=${item.itemId} depth=${depth} no snippets after tier walk`);
    return null;
  }

  // (2) Extraction via ai-router — local mode enforces SUPPLIER_SCHEMA with
  //     vLLM guided_json; remote mode sends prompt-only to HF (no schema
  //     enforcement) and falls back to local-with-schema if HF errors.
  const llmStart = Date.now();
  let extracted: SupplierExtraction;
  try {
    // Provider-agnostic extraction: local vLLM enforces SUPPLIER_SCHEMA via
    // guided_json, but the HF remote path is schema-less, so we ALWAYS run the
    // raw response through normalizeSupplierExtraction(). This coerces wrapped /
    // aliased / missing fields into the typed shape and is the fix for the
    // "returned=0 dropped=9" wipeout — previously an undefined source_url failed
    // the URL guard and an undefined available_qty bypassed the stock filter.
    const rawExtracted = await aiChatCompletion<unknown>(
      EXTRACT_SUPPLIER_FROM_SNIPPETS_PROMPT,
      buildExtractUserMessage({
        item,
        snippets: search.snippets,
      }),
      600,                // tight cap — one supplier object is small (~200-400 tokens)
      SUPPLIER_SCHEMA,    // honored by local vLLM; ignored by HF (see ai-router.ts)
    );
    extracted = normalizeSupplierExtraction(rawExtracted);
  } catch (err) {
    console.warn(`[supplier-search] item=${item.itemId} depth=${depth} llm error:`, err instanceof Error ? err.message : err);
    return null;
  }
  console.log(`[ai-server] item=${item.itemId} depth=${depth} extract latency=${Date.now() - llmStart}ms`);

  // (3) Stock Protection Rule — guard against suppliers who can't fulfill.
  //     Required buffer is item.qty + 2. available_qty === 0 = "not stated" and
  //     bypasses the filter (we don't have grounds to drop unknowns).
  if (extracted.available_qty > 0 && extracted.available_qty < item.qty + 2) {
    console.log(`[supplier-search] item=${item.itemId} depth=${depth} stock=${extracted.available_qty} below qty+2=${item.qty + 2}, dropping`);
    return null;
  }

  // (4) Build the primary supplier row. notes carries both the LLM-authored
  //     content and a structured stock summary prefix (for UI display);
  //     when this is an alt-loop row, prepend the via_alt provenance tag.
  const stockPrefix = extracted.available_qty > 0
    ? `Stock: ${extracted.available_qty} available. `
    : '';
  const altTag = depth > 0 ? `via_alt: ` : '';

  const primaryRow: ItemSourceRow = {
    item_id: item.itemId,
    supplier_id: 0,                      // placeholder — assigned post-merge
    supplier_name: extracted.supplier_name,
    source_url: extracted.source_url,
    status: 'pending',                   // schema constant — never AI-derived
    delivery_time: extracted.delivery_time,
    bidder_description: extracted.bidder_description,
    bidder_unit_price: extracted.bidder_unit_price,
    currency_code: extracted.currency_code || 'USD',
    compliance_deviation: extracted.compliance_deviation,
    notes: `${altTag}${stockPrefix}${extracted.notes}`.trim(),
    contact_email: extracted.contact_email,
    contact_phone: extracted.contact_phone,
  };

  const rows: ItemSourceRow[] = [primaryRow];

  // (5) Alt-URL re-loop — depth-capped + visited-set guarded.
  //     The alternative_source_url is an EXPLICIT link the supplier offered;
  //     we feed it back into the search loop as a new search subject so the
  //     existing tier cascade discovers / extracts it. Reuses all infra.
  if (
    depth < ALT_URL_MAX_DEPTH &&
    extracted.alternative_source_url &&
    !visitedUrls.has(extracted.alternative_source_url)
  ) {
    // Mark both the current source and the alternative as visited BEFORE
    // recursing — defends against A→B→A loops between cross-linked vendors.
    if (extracted.source_url) visitedUrls.add(extracted.source_url);
    visitedUrls.add(extracted.alternative_source_url);

    // An alt-URL follow-up failure must NEVER drop the primary row we already
    // hold — isolate the recursion so a thrown error degrades to "no alt found".
    try {
      const altRows = await extractSupplierForItem(
        { ...item, description: extracted.alternative_source_url },
        depth + 1,
        visitedUrls,
      );
      if (altRows) {
        rows.push(...altRows);
      }
    } catch (err) {
      console.warn(`[supplier-search] item=${item.itemId} alt-loop error (primary kept):`, err instanceof Error ? err.message : err);
    }
  }

  return rows;
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

    // (1) Fetch RFQ items from DB — single source of truth for "what to source"
    const itemRowsRaw = rfq_id
      ? ((await getData('rfqItems', { rfqId: rfq_id }, workspace)) as Array<Record<string, unknown>>)
      : [];

    if (itemRowsRaw.length === 0) {
      throw new Error(`No rfq_items found for rfq_id=${rfq_id}`);
    }

    // (2) Pre-sorting layer — sort by itemId ASC so supplier_id assignment is
    //     deterministic and reproducible across re-runs. A re-run with the same
    //     RFQ must always produce the same supplier_id sequence.
    const itemRows = itemRowsRaw
      .slice()
      .sort((a, b) => Number(a.itemId) - Number(b.itemId));

    // Cap per-item concurrency so 30 items don't fire 30 parallel Tavily/vLLM calls
    const limit = pLimit(RAG_CONCURRENCY);

    // (3) Per-item extraction. Returns arrays because one item may produce
    //     {primary + 1 alt} rows when the alt-URL re-loop fires.
    const rawItemArrays = await Promise.all(
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

    // Drop hard failures (null) and flatten the alt-row arrays into one set.
    const beforeUrlGuards: ItemSourceRow[] = rawItemArrays
      .filter((r): r is ItemSourceRow[] => r !== null)
      .flat();

    // URL guard — drop homepages even if the LLM slipped past the prompt rule.
    // We KEEP rows with empty source_url (those are explicit "no product page" markers).
    const productPageItems = beforeUrlGuards.filter((r) => r.source_url === '' || isProductPage(r.source_url));

    // Liveness check — HEAD each URL, drop dead ones (parallelized)
    const itemsWithUrl = productPageItems.filter((r) => r.source_url !== '');
    const itemsWithoutUrl = productPageItems.filter((r) => r.source_url === '');
    const { live, dropped: deadUrlCount } = await filterLiveUrls(itemsWithUrl);

    // (4) Merge survivors and assign supplier_id deterministically: sort by
    //     item_id ASC, then enumerate. Rows from the same item_id are kept
    //     adjacent (primary first, alts after — order preserved from the
    //     extractor's rows[] return) because Array.sort() is stable in ES2019+.
    const merged = [...live, ...itemsWithoutUrl];
    merged.sort((a, b) => a.item_id - b.item_id);
    const finalItems: ItemSourceRow[] = merged.map((row, idx) => ({
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
          // Explicit item_id ASC sort on the DB payload — guarantees a
          // deterministic supplier_id ↔ item_id ordering in supplierItemStatus
          // independent of any upstream reordering. FK linkage via rfq_id.
          items_source: finalItems
            .slice()
            .sort((a, b) => a.item_id - b.item_id)
            .map((item) => ({ ...item, rfq_id })),
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
