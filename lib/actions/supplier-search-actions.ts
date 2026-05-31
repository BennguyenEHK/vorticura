// =============================================
// SUPPLIER SEARCH ACTIONS — RAG pipeline (Tavily + vLLM guided extraction)
// =============================================
// Internal server module (called by data-processor, NOT a server action).
// Flow: ProcessorInput → fetch rfq_items → sort by item_id ASC →
//       per-item (LLM-planned ranked queries + parsed spec → single-query Tavily
//       search scored by the product-page classifier → LLM extract → stock filter
//       → alt-URL re-loop) → URL guards → deterministic supplier_id → save → result.
// Every page is extracted by the LLM; a deterministic microdata price override
// fills in a price only when the LLM returns 0 (page-stated price wins otherwise).
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
import { modifyDatabase, type WriteFailure } from '@/lib/utils/databaseHandler';
import { aiChatCompletion } from '@/lib/ai-agent/ai-router';
import { searchOneQuery, isProductPage, type ScorerSpec } from '@/lib/services/search';
import { manualExtract } from '@/lib/services/search/manual-extract';
import { planQueries } from '@/lib/services/search/query-planner';
import { SUPPLIER_SCHEMA, normalizeSupplierExtraction, type SupplierExtraction } from '@/lib/ai-agent/schemas/supplier';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';
// Budget circuit-breaker — the per-item resource leash (LLM calls + wall-clock).
import {
  createBudget,
  consumeLlmCall,
  isExhausted,
  type SearchBudget,
} from '@/lib/services/search/budget';
// Stage 11+ — density-validation loop (the source-count floor) + telemetry.
// Phase 1 (2026-05-31 spec): the orchestrator drives the SPECULATIVE FAN-OUT
// variant (gatherSourcesForItemParallel) so an item's query attempts overlap
// instead of serializing.
import {
  gatherSourcesForItemParallel,
  computeItemsBelowTarget,
  isUsableSourceRow,
  MIN_SOURCES,
} from '@/lib/services/search/density-loop';
import { logSearchStage } from '@/lib/services/search/telemetry';
// Phase 2 — supplier memory (L0 exact-match learned cache; gated off by default).
import {
  lookupMemory,
  rememberSupplier,
  type MemoryScope,
  type MemoryHit,
} from '@/lib/services/search/supplier-memory';
import type { ParsedSpec } from '@/lib/ai-agent/schemas/query-plan';
// Deterministic microdata price extraction — used to override an LLM price of 0
import { extractMicrodataPrice } from '@/lib/services/search/html-gate';


// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** Per-RFQ concurrency cap — keeps Tavily free-tier happy and prevents pod OOM */
const RAG_CONCURRENCY = 8;

/**
 * Top-K kept candidates to hybrid-extract per query. One Tavily search yields
 * many ranked product pages; extracting the strongest K turns a single search
 * into several supplier sources (the redesign's "≥3 sources" engine), while the
 * per-item budget + density TARGET_SOURCES cap bound the LLM spend.
 */
const MAX_PAGES_PER_QUERY = 5;

/**
 * Bounded substitute/broaden rounds: when an item is still below the source
 * floor after its planned queries, re-plan with a broaden hint at most this many
 * times before accepting best-effort. Keeps cost bounded (decision: bounded retries).
 */
const MAX_REPLAN_ROUNDS = 2;

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
  // Stage 7 — quantity in stock at time of extraction (0 = not stated by LLM)
  available_qty: number;
  // Stage 7 — which search tier (1|2|3) produced the snippets this row was built from
  source_tier: number;
  // Stage 7 — 'deterministic' if microdata overrode LLM price; 'llm' otherwise
  extraction_track: string;
  // Dossier signals — how the product is sold + why an alternative is a valid substitute
  selling_unit: string;       // '' | 'per_unit' | 'per_pack'
  pack_size: number;          // units per pack when per_pack; 0 otherwise
  match_reasoning: string;    // populated for substitutes/alternatives; '' for exact matches
  // Redesign (2026-05-31) — multi-page hybrid extraction signals
  requires_quote: boolean;    // page sells item but needs a manual quote request (no public price)
  page_type: string;          // 'product' | 'tech_spec'
  extraction_confidence: string; // 'manual' | 'manual+llm' | 'llm' (+ '+microdata')
}

// ---------------------------------------------
// URL Guards
// ---------------------------------------------
// isProductPage lives in lib/services/search — single source of truth shared
// with the tier cascade. We re-export it implicitly via the import above.

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
// Memory → row adapter (Phase 2, L0 exact-match)
// ---------------------------------------------

/**
 * Build an ItemSourceRow from a cached supplier-memory hit. A memory hit is a
 * previously-verified sourcing result for the SAME normalized spec, so it skips
 * the live search + extraction entirely. Provenance is tagged in notes and via
 * extraction_track='memory'; supplier_id is assigned later in the global merge.
 */
function buildRowFromMemory(item: RfqItemInput, hit: MemoryHit): ItemSourceRow {
  const stockPrefix = hit.available_qty > 0 ? `Stock: ${hit.available_qty} available. ` : '';
  return {
    item_id: item.itemId,
    supplier_id: 0,                       // placeholder — assigned post-merge
    supplier_name: hit.supplier_name,
    source_url: hit.source_url,
    status: 'pending',
    delivery_time: hit.delivery_time,
    bidder_description: hit.bidder_description,
    bidder_unit_price: hit.bidder_unit_price,
    currency_code: hit.currency_code || 'USD',
    compliance_deviation: '',
    notes: `${stockPrefix}(from memory)`.trim(),
    contact_email: '',
    contact_phone: '',
    available_qty: hit.available_qty,
    source_tier: 0,
    extraction_track: 'memory',           // provenance — distinct from 'llm'/'deterministic'
    selling_unit: hit.selling_unit,
    pack_size: hit.pack_size,
    match_reasoning: '',
    requires_quote: false,
    page_type: 'product',
    extraction_confidence: 'memory',
  };
}

// ---------------------------------------------
// Per-item RAG: LLM-planned ranked queries → single-query Tavily search → typed rows
// ---------------------------------------------

interface RfqItemInput {
  itemId: number;
  description: string;
  qty: number;
  uom: string;
}

// Stage 14 — extractSupplierForItem returns rows + Tavily call count so the
// orchestrator can accumulate pipeline-wide telemetry without a global counter.
interface ExtractResult {
  rows: ItemSourceRow[] | null;
  tavilyCalls: number;
  // Snippet URLs dropped pre-extraction (kept at 0; liveness gate removed).
  deadUrls: number;
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
 *   (1) Stock Protection — drop row if 0 < available_qty < (qty + 5).
 *       available_qty === 0 means "unknown" and is treated as a bypass —
 *       we never punish unknowns because the LLM can't extract what isn't
 *       stated on the page.
 *   (2) Alt-URL re-loop — at depth 0, follow alternative_source_url if
 *       present and not already visited. Visited set is shared across the
 *       recursion so cross-linked vendors can't infinite-loop.
 *
 * Stage 11: One SearchBudget is threaded through the entire recursion for this
 * item. consumeLlmCall() is called BEFORE the LLM — if the budget is spent the
 * LLM is skipped and we degrade gracefully instead of burning serverless quota.
 *
 * Stage 14: Returns { rows, tavilyCalls } so the orchestrator can accumulate
 * search_telemetry across all items without shared mutable state.
 *
 * `spec` is the parsed RFQ specification (from planQueries) threaded into the
 * product-page scorer so candidate ranking uses exact-model + spec-density signals.
 */
async function extractSupplierForItem(
  query: string,
  item: RfqItemInput,
  budget: SearchBudget,            // per-item circuit-breaker budget
  // The ORIGINAL RFQ requirement — drives substitute match_reasoning.
  originalDescription: string = item.description,
  // Parsed spec for the product-page scorer (exact-model + spec-density layers).
  spec: ScorerSpec = {},
  // Substitute round: when true, surface the LLM's match_reasoning (why a
  // non-exact product still fulfils the requirement). '' for exact matches.
  isSubstitute: boolean = false,
): Promise<ExtractResult> {
  // (1) One Tavily search → classify → eliminate → score → ranked candidates,
  //     each carrying its detected-field map + page classification.
  const search = await searchOneQuery(query, spec, item.qty);

  logSearchStage('raw-search', {
    item_id: item.itemId,
    query,
    snippets: search.candidates.length,
    tavilyCalls: search.tavilyCalls,
    sampleUrls: search.candidates.map((c) => c.snippet.url),
  });

  if (search.candidates.length === 0) {
    console.warn(`[supplier-search] item=${item.itemId} no candidates for query`);
    return { rows: null, tavilyCalls: search.tavilyCalls, deadUrls: 0 };
  }

  // (2) HYBRID EXTRACT each kept page (top-K, ranked best-first). Each page that
  //     yields a usable supplier becomes its OWN source row — so a single Tavily
  //     search can satisfy the MIN_SOURCES floor on its own.
  const pages = search.candidates.slice(0, MAX_PAGES_PER_QUERY);
  const rows: ItemSourceRow[] = [];

  for (const cand of pages) {
    // Budget is the hard leash — stop opening new pages once it's spent.
    if (isExhausted(budget)) break;

    const content = cand.snippet.content || cand.snippet.snippet || '';

    // (2a) MANUAL extract + verify-against-content. Regex pulls price/currency/
    //      contact/qty/delivery; each value must re-appear in content or it is
    //      discarded into `missing` for the LLM to recover.
    const manual = manualExtract(content, cand.detected);
    const manualUsed = Object.values(manual.confidence).some((c) => c > 0);

    // (2b) LLM GAP-FILL — supplier_name + description are never regex-extracted,
    //      so the LLM still runs (budget-gated) but grounded by the SINGLE
    //      pre-filtered page. consumeLlmCall reserves the call BEFORE the model;
    //      a spent budget skips the LLM and the page degrades to manual-only.
    let llm: SupplierExtraction | null = null;
    if (consumeLlmCall(budget)) {
      const llmStart = Date.now();
      try {
        const raw = await aiChatCompletion<unknown>(
          EXTRACT_SUPPLIER_FROM_SNIPPETS_PROMPT,
          buildExtractUserMessage({ item, snippets: [cand.snippet], originalDescription }),
          600,
          SUPPLIER_SCHEMA,
        );
        llm = normalizeSupplierExtraction(raw);
      } catch (err) {
        console.warn(`[supplier-search] item=${item.itemId} llm gap-fill error:`, err instanceof Error ? err.message : err);
        llm = null;
      }
      console.log(`[ai-server] item=${item.itemId} gap-fill latency=${Date.now() - llmStart}ms`);
    }

    // (2c) MERGE — manual-verified fields win; the LLM fills the rest. Fields the
    //      regex layer can't do (name/description/compliance/notes/packaging/
    //      reasoning) always come from the LLM.
    const f = manual.fields;
    const supplier_name = llm?.supplier_name ?? '';
    const bidder_description = llm?.bidder_description ?? '';
    // A page with no name or description is not a usable supplier source.
    if (!supplier_name.trim() || !bidder_description.trim()) continue;

    let price = f.bidder_unit_price > 0 ? f.bidder_unit_price : (llm?.bidder_unit_price ?? 0);
    let currency = f.currency_code || llm?.currency_code || 'USD';
    const delivery_time = f.delivery_time || llm?.delivery_time || '';
    const contact_email = f.contact_email || llm?.contact_email || '';
    const contact_phone = f.contact_phone || llm?.contact_phone || '';
    const available_qty = f.available_qty > 0 ? f.available_qty : (llm?.available_qty ?? 0);

    // (2d) Deterministic microdata price override when price is still 0.
    let track = manualUsed ? (llm ? 'manual+llm' : 'manual') : 'llm';
    if (price === 0) {
      const micro = extractMicrodataPrice(content);
      if (micro) {
        price = micro.value;
        if (micro.currency) currency = micro.currency;
        track = `${track}+microdata`;
      }
    }

    // (2e) Stock Protection — drop suppliers that can't fulfil. 0 = unknown = bypass.
    if (available_qty > 0 && available_qty < item.qty + 5) {
      console.log(`[supplier-search] item=${item.itemId} stock=${available_qty} below qty+5, dropping page`);
      continue;
    }

    // (2f) requires_quote — page sells the item but has no public price and asks
    //      buyers to request a quote (LLM flag OR price-absent + quote-intent signal).
    const requiresQuote = (llm?.requires_quote ?? false) || (price === 0 && cand.detected.has_quote_request);

    const stockPrefix = available_qty > 0 ? `Stock: ${available_qty} available. ` : '';
    const notes = `${stockPrefix}${llm?.notes ?? ''}`.trim();

    rows.push({
      item_id: item.itemId,
      supplier_id: 0,                          // placeholder — assigned post-merge
      supplier_name,
      // source_url is the REAL candidate URL — never the LLM's (avoids hallucinated URLs).
      source_url: cand.snippet.url,
      status: 'pending',                       // schema constant — never AI-derived
      delivery_time,
      bidder_description,
      bidder_unit_price: price,
      currency_code: currency,
      compliance_deviation: llm?.compliance_deviation ?? '',
      notes,
      contact_email,
      contact_phone,
      available_qty,
      source_tier: 0,                          // tiers removed; 0 = n/a
      extraction_track: track,
      selling_unit: llm?.selling_unit ?? '',
      pack_size: llm?.pack_size ?? 0,
      // match_reasoning surfaces only on substitute rounds; '' for exact matches.
      match_reasoning: isSubstitute ? (llm?.match_reasoning ?? '') : '',
      requires_quote: requiresQuote,
      page_type: cand.pageType,
      extraction_confidence: track,
    });

    logSearchStage('extract', {
      item_id: item.itemId,
      track,
      source_url: cand.snippet.url,
      bidder_unit_price: price,
      currency_code: currency,
      available_qty,
      requires_quote: requiresQuote,
      page_type: cand.pageType,
    });

    // Inner cap — one query never needs to mint more than the top-K sources.
    if (rows.length >= MAX_PAGES_PER_QUERY) break;
  }

  return { rows: rows.length ? rows : null, tavilyCalls: search.tavilyCalls, deadUrls: 0 };
}

// ---------------------------------------------
// Search-text builder — collapses AgentItemSummary into a flat query string
// ---------------------------------------------

/**
 * Build the free-text blob passed to planQueries() for a single RFQ item row.
 *
 * Preference order:
 *   1. agentItemSummary (AI 4-axis summary) — join all string/string[] values
 *      from all axes with '; ' for the richest signal.
 *   2. companyDescription — raw description from the RFQ.
 *
 * Coded defensively: the DB row comes in as Record<string, unknown>, and
 * AgentItemSummary structure may not always be fully populated.
 */
function buildSearchText(row: Record<string, unknown>): string {
  const summary = row.agentItemSummary;
  if (summary !== null && summary !== undefined && typeof summary === 'object') {
    const parts: string[] = [];
    for (const val of Object.values(summary as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        for (const v of val) {
          if (typeof v === 'string' && v.trim()) parts.push(v.trim());
        }
      } else if (typeof val === 'string' && val.trim()) {
        parts.push(val.trim());
      }
    }
    const serialized = parts.join('; ');
    if (serialized) return serialized;
  }
  // Fall back to raw company description when summary is absent or empty.
  return String(row.companyDescription || '');
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

    // Tenant scope for the supplier-memory layer (L0 exact-match cache).
    const scope: MemoryScope = { companyId: workspace.company_id, userId: workspace.user_id };

    // (3) Per-item DENSITY LOOP with one budget per item (Stage 11+).
    //     planQueries() generates up to 8 LLM-ranked queries + a parsed spec.
    //     gatherSourcesForItem walks the query list and re-extracts until the
    //     item reaches MIN_SOURCES distinct sources OR the query list / budget
    //     ceiling stops it. Each extractor call issues one Tavily query.
    //     originalDescription is pinned to the un-mutated requirement so
    //     alt-URL match_reasoning/relevance compares against the real need.
    const rawItemResults = await Promise.all(
      itemRows.map((row) => {
        const baseItem = {
          itemId: Number(row.itemId),
          description: String(row.companyDescription || ''),
          qty: Number(row.qty || 0),
          uom: String(row.uom || 'EA'),
        };
        const searchText = buildSearchText(row);
        return limit(async () => {
          // (3a) PLAN — LLM-only query planning (no deterministic-direct tier).
          //      The LLM parses the item spec + emits up to 8 ranked queries
          //      (narrow→broad). 'LLM only, no other tiers' (decision 2026-05-31).
          const plan = await planQueries(searchText);
          const parsed: ParsedSpec = plan.parsed;
          const queries: string[] = plan.queries;

          // (3b) L0 MEMORY — exact-match short-circuit. Disabled by default
          //      (SEARCH_MEMORY_ENABLED); lookupMemory no-ops + returns null when
          //      off, so the live pipeline always runs unless explicitly enabled.
          const hits = await lookupMemory(parsed, scope);
          if (hits && hits.length) {
            const memRows = hits.map((h) => buildRowFromMemory(baseItem, h));
            logSearchStage('density-check', {
              item_id: baseItem.itemId,
              attempt: 0,
              query: '(memory)',
              have: memRows.length,
              need: MIN_SOURCES,
              source: 'memory',
            });
            return {
              result: { rows: memRows, tavilyCalls: 0, deadUrls: 0, attempts: 0 },
              budget: createBudget(),
              itemId: baseItem.itemId,
              parsed,
              fromMemory: true,
            };
          }

          // Start the wall-clock budget AFTER planning + queue wait, so the
          // ~5-7s query-planning call doesn't eat the deadline before extraction.
          const budget = createBudget();
          // Fallback: an empty query plan must not silently skip the item — search the raw text once.
          const effectiveQueries = queries.length ? queries : [searchText].filter((q) => q.trim());
          // Speculative fan-out: overlap up to FANOUT_WIDTH query attempts per round.
          // Each attempt HYBRID-extracts the top-K kept pages, so one search can
          // mint several distinct sources toward the MIN_SOURCES floor.
          const result = await gatherSourcesForItemParallel<ItemSourceRow>(
            baseItem,
            effectiveQueries,
            budget,
            (q, b) => extractSupplierForItem(q, baseItem, b, baseItem.description, parsed, false),
          );

          // (3c) ALT OUTER LOOP — bounded substitute discovery. If the item is
          //      still below the source floor, re-plan BROADENED queries and
          //      harvest substitutes through the SAME filter→score→extract path
          //      (decisions: alternatives loop back through the full gate;
          //      bounded retries). Substitute rows carry match_reasoning.
          const collected = new Map<string, ItemSourceRow>();
          for (const r of result.rows) collected.set(r.source_url, r);

          let replanRound = 0;
          while (
            collected.size < MIN_SOURCES &&
            !isExhausted(budget) &&
            replanRound < MAX_REPLAN_ROUNDS
          ) {
            replanRound++;
            const broadenText = `${searchText} alternative equivalent substitute compatible replacement`;
            const replan = await planQueries(broadenText);
            const replanQueries = replan.queries.length ? replan.queries : [broadenText];
            const altResult = await gatherSourcesForItemParallel<ItemSourceRow>(
              baseItem,
              replanQueries,
              budget,
              (q, b) => extractSupplierForItem(q, baseItem, b, baseItem.description, replan.parsed ?? parsed, true),
            );
            for (const r of altResult.rows) {
              if (!collected.has(r.source_url)) collected.set(r.source_url, r);
            }
            result.tavilyCalls += altResult.tavilyCalls;
            result.deadUrls += altResult.deadUrls;
            result.attempts += altResult.attempts;
            logSearchStage('density-check', {
              item_id: baseItem.itemId,
              attempt: result.attempts,
              query: '(substitute-replan)',
              have: collected.size,
              need: MIN_SOURCES,
              round: replanRound,
              source: 'substitute',
            });
          }

          const mergedResult = { ...result, rows: [...collected.values()] };
          return { result: mergedResult, budget, itemId: baseItem.itemId, parsed, fromMemory: false };
        });
      }),
    );

    // Flatten the gathered rows into one set. gatherSourcesForItem always returns
    // an array (possibly empty) — never null — so no null filter is needed.
    const beforeUrlGuards: ItemSourceRow[] = rawItemResults.flatMap((r) => r.result.rows);

    // URL guard — a row only survives if it points at a REAL product page.
    // Empty-source_url rows are "No product page found" results (often a
    // hallucinated supplier name/contact lifted from a homepage or directory
    // listing); we DROP them instead of persisting them as markers — storing
    // them only inflated the row count with junk. isUsableSourceRow rejects empty
    // urls; isProductPage rejects homepages/PDFs/listings even if the LLM slipped.
    // searchOneQuery already filters to verified product pages before extraction.
    const productPageItems = beforeUrlGuards.filter((r) => isUsableSourceRow(r) && isProductPage(r.source_url));

    // (3c) MEMORIZE (Phase 2) — persist verified sourcings so an identical spec
    //      resolves at Tier-0 next time. Skip rows that CAME from memory (no
    //      re-write churn) and rows whose item carried no parsed spec (Tier-1 /
    //      empty plan → rememberSupplier no-ops on an empty spec_hash anyway).
    //      Fail-safe: rememberSupplier never throws, so a memory-write outage
    //      cannot affect the search result.
    const parsedByItem = new Map<number, ParsedSpec>();
    const memoryItemIds = new Set<number>();
    for (const r of rawItemResults) {
      parsedByItem.set(r.itemId, r.parsed);
      if (r.fromMemory) memoryItemIds.add(r.itemId);
    }
    await Promise.all(
      productPageItems
        .filter((row) => !memoryItemIds.has(row.item_id))
        .map((row) =>
          rememberSupplier(
            parsedByItem.get(row.item_id) ?? {},
            {
              supplier_name: row.supplier_name,
              source_url: row.source_url,
              bidder_description: row.bidder_description,
              bidder_unit_price: row.bidder_unit_price,
              currency_code: row.currency_code,
              delivery_time: row.delivery_time,
              available_qty: row.available_qty,
              selling_unit: row.selling_unit,
              pack_size: row.pack_size,
            },
            scope,
          ),
        ),
    );

    // (4) Merge survivors and assign supplier_id deterministically: sort by
    //     item_id ASC, then enumerate. Rows from the same item_id are kept
    //     adjacent (primary first, alts after — order preserved from the
    //     extractor's rows[] return) because Array.sort() is stable in ES2019+.
    const merged = [...productPageItems];
    merged.sort((a, b) => a.item_id - b.item_id);
    const finalItems: ItemSourceRow[] = merged.map((row, idx) => ({
      ...row,
      supplier_id: idx + 1,
    }));

    // deadUrls is 0 per-item (liveness gate removed); aggregate and add the
    // row-level URL-guard drops for the total dropped figure.
    const deadUrlCount = rawItemResults.reduce((sum, r) => sum + r.result.deadUrls, 0);
    const totalDropped = (beforeUrlGuards.length - productPageItems.length) + deadUrlCount;
    console.log(`[supplier-search] done rfq_id=${rfq_id} returned=${finalItems.length} dropped=${totalDropped}`);

    // Stage 14 — Aggregate pipeline telemetry across all items.
    // tavily_calls: sum of Tavily API calls consumed (cache hits excluded).
    // llm_calls: sum of LLM calls consumed per budget (read after awaits complete).
    // budget_exhausted: latched true if ANY item hit its LLM/wall-clock ceiling.
    // dropped_count: URL-guard + liveness drops (existing totalDropped).
    // items_below_target: item_ids whose distinct-source count is BELOW the floor
    //   (MIN_SOURCES) — now includes both under-filled AND zero-row items.
    const tavily_calls = rawItemResults.reduce((sum, r) => sum + r.result.tavilyCalls, 0);
    const llm_calls = rawItemResults.reduce((sum, r) => sum + r.budget.llmCallsUsed, 0);
    const budget_exhausted = rawItemResults.some((r) => r.budget.exhausted);
    const dropped_count = totalDropped;
    const items_below_target = computeItemsBelowTarget(
      rawItemResults.map((r) => r.itemId),
      finalItems,
      MIN_SOURCES,
    );

    // write_failures is populated AFTER the DB save (a write can't know its own
    // outcome before it runs); initialised here so the telemetry shape is stable.
    const search_telemetry = {
      tavily_calls,
      llm_calls,
      dropped_count,
      budget_exhausted,
      items_below_target,
      write_failures: [] as WriteFailure[],
    };

    console.log(
      `[supplier-search] telemetry rfq_id=${rfq_id} tavily=${tavily_calls} llm=${llm_calls} exhausted=${budget_exhausted} items_below_target=${items_below_target.length}`,
    );

    // Build suppliers_search summary deterministically — NO LLM call here.
    // Stage 14 — attach search_telemetry so modifyDatabase can persist it to
    // the supplier_search jsonb column (lead mapped data.search_telemetry →
    // searchTelemetry via TC_supplierSearch spread in databaseHandler.ts).
    const suppliers_search = {
      subject: `Supplier Search Results - ${rfq_reference || `RFQ ${rfq_id}`}`,
      search_content: buildSearchContent(rfq_reference || `${rfq_id ?? ''}`, finalItems, totalDropped),
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
        rfq_id: rfq_id ?? null,                // required by preview-panel-content.tsx for Accept action
        suppliers_search,
        items_source: finalItems,
      },
      timestamp,
    };

    // Persist — modifyDatabase contract is unchanged so DB schema is untouched.
    // It now RETURNS WriteFailure[] (per-row isolation): we surface those into
    // telemetry instead of discarding them, so a silent persistence drop is
    // visible in the run summary / SSE payload.
    let writeFailures: WriteFailure[] = [];
    try {
      writeFailures = await modifyDatabase(
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
      // A thrown save (not a per-row failure) is itself a write failure to report.
      writeFailures = [{ table: 'supplier_search', error: dbError instanceof Error ? dbError.message : String(dbError) }];
    }

    // Surface the persistence outcome into the returned telemetry (search_telemetry
    // is shared by reference with result.data.suppliers_search, so the SSE/UI sees it).
    search_telemetry.write_failures = writeFailures;

    // Stage 4 — Persistence telemetry: rows handed to the DB + any failures.
    logSearchStage('persist', {
      rfq_id: rfq_id ?? null,
      table: 'supplierItemStatus',
      rows: finalItems.length,
      failures: writeFailures,
    });

    // Run summary — density floor coverage + persistence in one record.
    logSearchStage('run-summary', {
      rfq_id: rfq_id ?? null,
      tavily_calls,
      llm_calls,
      dropped_count,
      budget_exhausted,
      items_total: itemRows.length,
      items_at_or_above_floor: itemRows.length - items_below_target.length,
      items_below_target,
      rows_written: finalItems.length,
      write_failures: writeFailures,
    });

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
