// RAG pipeline — supplier search actions (agentic shopping pipeline).

import pLimit from 'p-limit';
import { getData } from '@/lib/db/queries';
import { modifyDatabase, type WriteFailure } from '@/lib/utils/databaseHandler';
import { agenticShoppingPipeline, isProductPage, type EnrichedSource } from '@/lib/services/search';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';
import {
  enterSearchRun,
  emitRunStart,
  emitDensity,
  emitRunSummary,
} from '@/lib/services/search/telemetry';
import { clearLivenessCache } from '@/lib/services/search/liveness';
import type { AgentItemSummary } from '@/types/preview';

// --- Config ---

/** Per-RFQ item concurrency cap. */
const RAG_CONCURRENCY = 8;

// --- DB row shape ---

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
  available_qty: number;          // 0 = not stated
  selling_unit: string;           // '' | 'per_unit' | 'per_pack'
  pack_size: number;              // units per pack; 0 otherwise
  match_reasoning: string;        // non-empty for substitutes only
  requires_quote: boolean;        // no public price, quote needed
  page_type: string;              // 'product' | 'tech_spec'
  extraction_confidence: string;  // provenance label
  item_identification?: string[];
  item_origin?: string | null;
  manufacturer?: string | null;
}

// --- Helpers ---

/** Pull identification[] from agent_item_summary jsonb. */
function extractIdentification(row: Record<string, unknown>): string[] {
  const summary = row.agentItemSummary as { identification?: unknown } | null;
  return summary && Array.isArray(summary.identification)
    ? (summary.identification as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : [];
}

/** Map one enriched shopping source to a persisted supplier row. */
function mapSourceToRow(itemId: number, s: EnrichedSource): ItemSourceRow {
  return {
    item_id: itemId,
    supplier_id: 0,
    supplier_name: s.source,
    source_url: s.directUrl,
    status: 'active',
    delivery_time: '',
    bidder_description: s.itemDescription ?? s.title,
    bidder_unit_price: s.price,
    currency_code: s.currency,
    compliance_deviation: '',
    notes: '',
    contact_email: '',
    contact_phone: '',
    available_qty: 0,
    selling_unit: s.unit ?? 'per_unit',
    pack_size: 0,
    match_reasoning: '',
    requires_quote: s.in_stock === false,
    page_type: 'product',
    extraction_confidence: 'shopping',
    item_identification: [],
  };
}

// --- Main processor ---

/** Run the full supplier-search pipeline for one RFQ. */
export async function processSupplierSearch(input: ProcessorInput): Promise<ProcessorResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const { action_type, rfq_id, rfq_reference, ai_comments, workspace } = input;
    if (!workspace) throw new Error('Missing workspace context');

    console.log(`[supplier-search] start rfq_id=${rfq_id} action=${action_type}`);

    // Log research feedback for audit; no field-level diffing yet.
    if (action_type === 'research' && ai_comments) {
      const noteCount = ai_comments.inline_notes?.length ?? 0;
      console.log(`[supplier-search] research feedback: notes=${noteCount} general=${(ai_comments.general_feedback || '').length}c`);
    }

    // (1) Fetch RFQ items — source of truth for what to source.
    const itemRowsRaw = rfq_id
      ? ((await getData('rfqItems', { rfqId: rfq_id }, workspace)) as Array<Record<string, unknown>>)
      : [];

    if (itemRowsRaw.length === 0) throw new Error(`No rfq_items found for rfq_id=${rfq_id}`);

    // (2) Sort by itemId ASC for deterministic supplier_id assignment.
    const itemRows = itemRowsRaw.slice().sort((a, b) => Number(a.itemId) - Number(b.itemId));

    const limit = pLimit(RAG_CONCURRENCY);

    enterSearchRun(rfq_id ?? 0);
    clearLivenessCache(); // reset per-run liveness cache
    emitRunStart(itemRows.length);

    // (3) Per-item agentic shopping pipeline.
    const rawItemResults = await Promise.all(
      itemRows.map((row) => {
        const baseItem = {
          itemId: Number(row.itemId),
          description: String(row.companyDescription || ''),
          qty: Number(row.qty || 0),
          uom: String(row.uom || 'EA'),
        };
        return limit(async () => {
          const itemDescription = String(row.companyDescription || '');
          const summary = (row.agentItemSummary as AgentItemSummary | null) ?? null;

          const { sources, attempts } = await agenticShoppingPipeline(
            baseItem.itemId,
            itemDescription,
            summary,
            rfq_id ? String(rfq_id) : undefined,
          );

          const rows = sources
            .filter((s) => isProductPage(s.directUrl))
            .map((s) => mapSourceToRow(baseItem.itemId, s));

          console.log(`[supplier-search] item=${baseItem.itemId} pipeline: sources=${sources.length} rows_after_filter=${rows.length}`);
          emitDensity(baseItem.itemId, rows.length, 3);

          return {
            result: { rows, tavilyCalls: 0, deadUrls: 0, attempts },
            itemId: baseItem.itemId,
            fromMemory: false,
          };
        });
      }),
    );

    const beforeUrlGuards: ItemSourceRow[] = rawItemResults.flatMap((r) => r.result.rows);

    // URL guard: drop rows without a real product page URL.
    const productPageItems = beforeUrlGuards.filter((r) => isProductPage(r.source_url));

    // (4) Assign supplier_id deterministically (item_id ASC, stable sort).
    const merged = [...productPageItems];
    merged.sort((a, b) => a.item_id - b.item_id);

    const identByItem = new Map<number, string[]>();
    for (const row of itemRows) {
      const ident = extractIdentification(row);
      if (ident.length) identByItem.set(Number(row.itemId), ident);
    }

    const finalItems: ItemSourceRow[] = merged.map((row, idx) => ({
      ...row,
      supplier_id: idx + 1,
      item_identification: identByItem.get(row.item_id) ?? [],
    }));

    const totalDropped = beforeUrlGuards.length - productPageItems.length;
    console.log(`[supplier-search] done rfq_id=${rfq_id} returned=${finalItems.length} dropped=${totalDropped} (beforeUrlGuards=${beforeUrlGuards.length} productPageItems=${productPageItems.length})`);

    // Aggregate telemetry.
    const attempts_total = rawItemResults.reduce((sum, r) => sum + r.result.attempts, 0);
    const dropped_count = totalDropped;
    const search_telemetry = {
      attempts_total,
      dropped_count,
      write_failures: [] as WriteFailure[],
    };

    console.log(
      `[supplier-search] telemetry rfq_id=${rfq_id} attempts=${attempts_total} dropped=${dropped_count}`,
    );

    const suppliers_search = {
      subject: `Supplier Search Results - ${rfq_reference || `RFQ ${rfq_id}`}`,
      search_status: 'completed',
      search_telemetry,
    };

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

    // Persist; surface per-row write failures into telemetry.
    let writeFailures: WriteFailure[] = [];
    try {
      writeFailures = await modifyDatabase(
        {
          data_type: 'supplier_search',
          rfq_id,
          rfq_reference,
          items_source: finalItems
            .slice()
            .sort((a, b) => a.item_id - b.item_id)
            .map((item) => ({ ...item, rfq_id })),
        },
        workspace,
      );
    } catch (dbError) {
      console.error('[supplier-search] DB save failed (non-blocking):', dbError);
      writeFailures = [{ table: 'supplier_search', error: dbError instanceof Error ? dbError.message : String(dbError) }];
    }

    search_telemetry.write_failures = writeFailures;

    emitRunSummary(itemRows.length, dropped_count, false);

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
