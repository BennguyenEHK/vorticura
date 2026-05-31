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
import { planQueries } from '@/lib/services/search/query-planner';
import { SUPPLIER_SCHEMA, normalizeSupplierExtraction, type SupplierExtraction } from '@/lib/ai-agent/schemas/supplier';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';
// Stage 11 — budget circuit-breaker + Stage 10 — alt-URL relevance floor
import {
  createBudget,
  consumeLlmCall,
  isExhausted,
  lexicalRelevance,
  ALT_RELEVANCE_FLOOR,
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
// Phase 1 — item router (L2 deterministic-direct vs L3 full-plan).
import { classifyItem } from '@/lib/services/search/item-router';
// Phase 2 — supplier memory (L0 exact-match learned cache).
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
  budget: SearchBudget,       // Stage 11 — per-item circuit-breaker budget
  depth: number = 0,
  visitedUrls: Set<string> = new Set(),
  // The ORIGINAL RFQ requirement, preserved across the alt-URL recursion so
  // substitutes found at depth>0 can be justified against the real need.
  originalDescription: string = item.description,
  // Parsed spec for the product-page scorer (exact-model + spec-density layers).
  spec: ScorerSpec = {},
): Promise<ExtractResult> {
  // (1) Single-query Tavily search (cache-first), scored + ranked by the
  //     product-page classifier. The query is LLM-planned upstream by
  //     planQueries() — no tier walk or query mutation here.
  const search = await searchOneQuery(query, spec);

  // Stage 2 — Raw Search Execution telemetry: query → verified-page payload shape.
  logSearchStage('raw-search', {
    item_id: item.itemId,
    depth,
    query,
    snippets: search.snippets.length,
    tavilyCalls: search.tavilyCalls,
    sampleUrls: search.snippets.map((s) => s.url),
  });

  if (search.snippets.length === 0) {
    console.warn(`[supplier-search] item=${item.itemId} depth=${depth} no snippets for query`);
    // Stage 14 — return tavilyCalls even on early-out so the orchestrator
    // accumulates the quota this item spent before deciding there was nothing.
    return { rows: null, tavilyCalls: search.tavilyCalls, deadUrls: 0 };
  }

  // searchOneQuery already scored, filtered and ranked candidates to relevant
  // product pages; no separate liveness/HEAD check (adds latency without
  // improving precision in this flow).
  const liveSnippets = search.snippets;
  const deadUrls = 0;

  // LLM extraction. Stage 11 circuit-breaker: reserve one LLM call against the
  // budget BEFORE invoking the model. consumeLlmCall() returns false when the
  // ceiling is already crossed. Degrade to null at depth 0 or return what we
  // have deeper.
  if (!consumeLlmCall(budget)) {
    console.warn(
      `[supplier-search] item=${item.itemId} depth=${depth} budget exhausted — skipping LLM extraction`,
    );
    // depth > 0 means we're in an alt-URL recursion — no primary row to return.
    return { rows: null, tavilyCalls: search.tavilyCalls, deadUrls };
  }

  // Extraction via ai-router — local mode enforces SUPPLIER_SCHEMA with
  // vLLM guided_json; remote mode sends prompt-only to HF (no schema
  // enforcement) and falls back to local-with-schema if HF errors.
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
        snippets: liveSnippets,
        originalDescription,
      }),
      600,                // tight cap — one supplier object is small (~200-400 tokens)
      SUPPLIER_SCHEMA,    // honored by local vLLM; ignored by HF (see ai-router.ts)
    );
    extracted = normalizeSupplierExtraction(rawExtracted);
  } catch (err) {
    console.warn(`[supplier-search] item=${item.itemId} depth=${depth} llm error:`, err instanceof Error ? err.message : err);
    return { rows: null, tavilyCalls: search.tavilyCalls, deadUrls };
  }
  console.log(`[ai-server] item=${item.itemId} depth=${depth} extract latency=${Date.now() - llmStart}ms`);

  // (3) Stock Protection Rule — guard against suppliers who can't fulfill.
  //     Required buffer is item.qty + 5. available_qty === 0 = "not stated" and
  //     bypasses the filter (we don't have grounds to drop unknowns).
  if (extracted.available_qty > 0 && extracted.available_qty < item.qty + 5) {
    console.log(`[supplier-search] item=${item.itemId} depth=${depth} stock=${extracted.available_qty} below qty+5=${item.qty + 5}, dropping`);
    return { rows: null, tavilyCalls: search.tavilyCalls, deadUrls };
  }

  // Stage 7 — Deterministic microdata price override.
  // Decision rule: if microdata returns a price AND the LLM produced 0 (i.e.,
  // nothing useful was found on the page), we trust the structured ground truth
  // instead. We only override when LLM found nothing so we never clobber a
  // page-specific quote the LLM correctly read. The snippet whose URL matches
  // the extracted source_url is the most relevant candidate; fall back to the
  // first snippet that yields a result if no exact URL match exists.
  let resolvedPrice = extracted.bidder_unit_price;
  let resolvedCurrency = extracted.currency_code || 'USD';
  let extractionTrack: string = 'llm';

  if (extracted.bidder_unit_price === 0) {
    // Prefer the snippet whose URL matches the LLM's chosen source_url.
    const matchingSnippet = liveSnippets.find((s) => s.url === extracted.source_url);
    const candidateSnippets = matchingSnippet
      ? [matchingSnippet, ...liveSnippets.filter((s) => s.url !== extracted.source_url)]
      : liveSnippets;

    for (const snippet of candidateSnippets) {
      const microdata = extractMicrodataPrice(snippet.content || '');
      if (microdata) {
        // Microdata is structured ground truth — use it as the price.
        resolvedPrice = microdata.value;
        if (microdata.currency) {
          resolvedCurrency = microdata.currency;
        }
        extractionTrack = 'deterministic';
        console.log(
          `[supplier-search] item=${item.itemId} depth=${depth} microdata price override: ${resolvedCurrency} ${resolvedPrice} (llm had 0)`,
        );
        break;
      }
    }
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
    bidder_unit_price: resolvedPrice,    // Stage 7 — microdata or LLM
    currency_code: resolvedCurrency,     // Stage 7 — microdata or LLM
    compliance_deviation: extracted.compliance_deviation,
    notes: `${altTag}${stockPrefix}${extracted.notes}`.trim(),
    contact_email: extracted.contact_email,
    contact_phone: extracted.contact_phone,
    // Stage 7 — provenance fields persisted to items_source
    available_qty: extracted.available_qty,
    source_tier: 0,                      // tiers removed; 0 = n/a
    extraction_track: extractionTrack,
    // Dossier signals from the LLM extraction
    selling_unit: extracted.selling_unit,
    pack_size: extracted.pack_size,
    // match_reasoning only meaningful for substitutes (alt rows); the LLM returns
    // '' for exact matches. Force '' on the primary (depth 0) row regardless.
    match_reasoning: depth > 0 ? extracted.match_reasoning : '',
  };

  const rows: ItemSourceRow[] = [primaryRow];

  // Extraction telemetry (extractionTrack notes when a microdata price override fired).
  logSearchStage('extract', {
    item_id: item.itemId, depth,
    track: extractionTrack === 'deterministic' ? 'llm+microdata' : 'llm',
    liveSnippets: liveSnippets.length,
    source_url: primaryRow.source_url,
    bidder_unit_price: primaryRow.bidder_unit_price,
    currency_code: primaryRow.currency_code,
    available_qty: primaryRow.available_qty,
    selling_unit: primaryRow.selling_unit,
    pack_size: primaryRow.pack_size,
    rowsEmitted: 1,
  });

  // Running Tavily call + dead-URL counts for this recursion branch.
  let totalTavilyCalls = search.tavilyCalls;
  let totalDeadUrls = deadUrls;

  // (5) Alt-URL re-loop — depth-capped + visited-set guarded.
  //     The alternative_source_url is an EXPLICIT link the supplier offered;
  //     we feed it directly as the search query for one searchOneQuery call.
  //     Reuses all infra.
  //
  //     Stage 11 — also skip the alt-URL follow if the budget is already spent:
  //     preserve the primary row but don't burn more quota on an alt.
  if (
    depth < ALT_URL_MAX_DEPTH &&
    extracted.alternative_source_url &&
    !visitedUrls.has(extracted.alternative_source_url) &&
    !isExhausted(budget)  // Stage 11 — budget guard on the alt-URL hop
  ) {
    // Mark both the current source and the alternative as visited BEFORE
    // recursing — defends against A→B→A loops between cross-linked vendors.
    if (extracted.source_url) visitedUrls.add(extracted.source_url);
    visitedUrls.add(extracted.alternative_source_url);

    // An alt-URL follow-up failure must NEVER drop the primary row we already
    // hold — isolate the recursion so a thrown error degrades to "no alt found".
    try {
      // Stage 11 — thread the SAME budget object into the recursive call so
      // LLM calls from alt hops count against this item's ceiling too.
      // Stage 14 — collect tavilyCalls from the alt recursion.
      // The alternative URL becomes the search query at depth+1 (the new
      // single-query flow uses the URL as the exact query string).
      const altResult = await extractSupplierForItem(
        extracted.alternative_source_url,
        { ...item, description: extracted.alternative_source_url },
        budget,
        depth + 1,
        visitedUrls,
        originalDescription,   // preserve the real requirement for match_reasoning
        spec,                  // same parsed spec drives scoring on the alt page
      );

      // Stage 14 — accumulate Tavily calls + dead-URL drops from the alt branch.
      totalTavilyCalls += altResult.tavilyCalls;
      totalDeadUrls += altResult.deadUrls;

      if (altResult.rows) {
        // Stage 10 — Relevance floor: only keep alt rows whose extracted
        // description still resembles the RFQ item (Jaccard ≥ ALT_RELEVANCE_FLOOR).
        // This prevents the alt-URL loop from drifting into off-spec products
        // that merely satisfy the source count but wouldn't fulfill the actual need.
        for (const altRow of altResult.rows) {
          const relevance = lexicalRelevance(item.description, altRow.bidder_description);
          if (relevance >= ALT_RELEVANCE_FLOOR) {
            rows.push(altRow);
          } else {
            console.log(
              `[supplier-search] item=${item.itemId} alt row dropped (relevance=${relevance.toFixed(3)} < floor=${ALT_RELEVANCE_FLOOR}): "${altRow.bidder_description.slice(0, 60)}"`,
            );
          }
        }
      }
    } catch (err) {
      console.warn(`[supplier-search] item=${item.itemId} alt-loop error (primary kept):`, err instanceof Error ? err.message : err);
    }
  }

  // Stage 14 — return row array + total Tavily calls and dead-URL drops for this item.
  return { rows, tavilyCalls: totalTavilyCalls, deadUrls: totalDeadUrls };
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
          // (3a) ROUTE — decide effort tier BEFORE paying the ~5-7s planner cost.
          //      Tier 1 (L2 deterministic-direct): text already model-specific →
          //      one composed query, skip the planner. Tier 3 (L3): full plan.
          const route = classifyItem(searchText);

          let parsed: ParsedSpec = {};
          let queries: string[];

          if (route.tier === 1) {
            queries = route.directQuery ? [route.directQuery] : [];
          } else {
            // L3 — LLM parses spec + emits ranked queries (narrow→broad).
            const plan = await planQueries(searchText);
            parsed = plan.parsed;
            queries = plan.queries;

            // (3b) L0 MEMORY — exact-match short-circuit (Phase 2). Keyed on the
            //      parsed spec, so it runs post-plan; a fresh hit skips the entire
            //      density loop (Tavily searches + extraction LLM calls).
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
              // budget is unused on the memory path; create one so downstream
              // telemetry aggregation (llm_calls/exhausted) stays uniform.
              return {
                result: { rows: memRows, tavilyCalls: 0, deadUrls: 0, attempts: 0 },
                budget: createBudget(),
                itemId: baseItem.itemId,
                parsed,
                fromMemory: true,
              };
            }
          }

          // Stage 11 — start the wall-clock budget AFTER planning + queue wait, not before,
          // so the ~5-7s HF query-planning call (which isn't an extraction call) doesn't eat
          // the deadline before the first retry.
          const budget = createBudget();
          // Fallback: an empty query plan must not silently skip the item — search the raw text once.
          const effectiveQueries = queries.length ? queries : [searchText].filter((q) => q.trim());
          // Phase 1 — speculative fan-out: overlap up to FANOUT_WIDTH query
          // attempts per round instead of serializing them.
          const result = await gatherSourcesForItemParallel<ItemSourceRow>(
            baseItem,
            effectiveQueries,
            budget,
            (query, b) => extractSupplierForItem(query, baseItem, b, 0, new Set<string>(), baseItem.description, parsed),
          );
          return { result, budget, itemId: baseItem.itemId, parsed, fromMemory: false };
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
