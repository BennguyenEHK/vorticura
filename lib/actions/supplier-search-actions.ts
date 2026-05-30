// =============================================
// SUPPLIER SEARCH ACTIONS — RAG pipeline (Tavily + vLLM guided extraction)
// =============================================
// Internal server module (called by data-processor, NOT a server action).
// Flow: ProcessorInput → fetch rfq_items → sort by item_id ASC →
//       per-item (tier-cascaded search → liveness gate → Track A microdata
//       OR Track B vLLM extract → stock filter → alt-URL re-loop) →
//       URL guards → deterministic supplier_id → save → result.
// Liveness (Stage 5) and Track A (Stage 7) run BEFORE the LLM so dead links and
// pages with complete structured pricing never cost an LLM call.
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
import { searchWeb, isProductPage } from '@/lib/services/search';
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
// Stage 11+ — density-validation loop (the source-count floor) + telemetry
import {
  gatherSourcesForItem,
  computeItemsBelowTarget,
  isUsableSourceRow,
  MIN_SOURCES,
} from '@/lib/services/search/density-loop';
import { logSearchStage } from '@/lib/services/search/telemetry';
// Stage 7 — deterministic microdata price extraction (Track A short-circuit)
import { extractMicrodataPrice } from '@/lib/services/search/html-gate';
import { buildDeterministicSupplier } from '@/lib/services/search/track-a';
import type { TavilySnippet } from '@/lib/services/search/tavily-client';

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

/**
 * Stage 5 — Liveness Gate. HEAD-check each snippet URL in parallel; drop dead
 * links (status >= 400, or fetch throws/times out) BEFORE any extraction so we
 * never spend LLM tokens (or microdata effort) on a page that no longer exists.
 * Bounded by AbortSignal.timeout so a slow site can't hang the whole pipeline
 * against the Vercel function timeout.
 */
async function filterLiveSnippets(snippets: TavilySnippet[]): Promise<{ live: TavilySnippet[]; dropped: number }> {
  const checks = await Promise.allSettled(
    snippets.map((s) =>
      fetch(s.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3_000),
        // Some servers reject default fetch UA — set a generic one to reduce false-drops
        headers: { 'User-Agent': 'Mozilla/5.0 QuoteFlowBot/1.0' },
      }),
    ),
  );

  const live: TavilySnippet[] = [];
  let dropped = 0;
  checks.forEach((result, idx) => {
    const snippet = snippets[idx];
    // Treat fetch reject (timeout, DNS, TLS) as dead
    if (result.status !== 'fulfilled') { dropped++; return; }
    // Some sites reject HEAD with 405 but the page itself is fine — keep those
    if (result.value.status === 405) { live.push(snippet); return; }
    if (result.value.status >= 400) { dropped++; return; }
    live.push(snippet);
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

// Stage 14 — extractSupplierForItem returns rows + Tavily call count so the
// orchestrator can accumulate pipeline-wide telemetry without a global counter.
interface ExtractResult {
  rows: ItemSourceRow[] | null;
  tavilyCalls: number;
  // Stage 5 — snippet URLs dropped by the per-item liveness gate (pre-extraction).
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
 *   (1) Stock Protection — drop row if 0 < available_qty < (qty + 2).
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
 */
async function extractSupplierForItem(
  item: RfqItemInput,
  budget: SearchBudget,       // Stage 11 — per-item circuit-breaker budget
  depth: number = 0,
  visitedUrls: Set<string> = new Set(),
  // The ORIGINAL RFQ requirement, preserved across the alt-URL recursion so
  // substitutes found at depth>0 can be justified against the real need.
  originalDescription: string = item.description,
): Promise<ExtractResult> {
  // (1) Tier-walked Tavily search w/ Redis cache. Tier 3 is invoked INSIDE
  //     searchWeb when Tiers 1/2 fall short of the verified threshold.
  const search = await searchWeb({ description: item.description, qty: item.qty, uom: item.uom });

  // Stage 2 — Raw Search Execution telemetry: query → verified-page payload shape.
  logSearchStage('raw-search', {
    item_id: item.itemId,
    depth,
    tier: search.tier,
    verifiedCount: search.verifiedCount,
    snippets: search.snippets.length,
    tavilyCalls: search.tavilyCalls,
    sampleUrls: search.snippets.map((s) => s.url),
  });

  if (search.snippets.length === 0) {
    console.warn(`[supplier-search] item=${item.itemId} depth=${depth} no snippets after tier walk`);
    // Stage 14 — return tavilyCalls even on early-out so the orchestrator
    // accumulates the quota this item spent before deciding there was nothing.
    return { rows: null, tavilyCalls: search.tavilyCalls, deadUrls: 0 };
  }

  // Stage 5 — Liveness Gate: HEAD-check candidate URLs and drop dead links
  // BEFORE spending LLM tokens or microdata effort (spec ordering:
  // search → liveness → page-type → Track A → Track B).
  const { live: liveSnippets, dropped: deadUrls } = await filterLiveSnippets(search.snippets);
  if (liveSnippets.length === 0) {
    console.warn(
      `[supplier-search] item=${item.itemId} depth=${depth} all ${search.snippets.length} URL(s) dead after liveness gate`,
    );
    return { rows: null, tavilyCalls: search.tavilyCalls, deadUrls };
  }

  // Stage 7 — Track A (deterministic): if a live product page exposes COMPLETE
  // price+currency microdata, build the supplier row from structured ground
  // truth and SKIP the LLM entirely (free + instant). No budget is consumed —
  // this is what keeps llm_calls below item-count when pages are well-marked.
  // available_qty=0 ("unknown") bypasses the stock filter; microdata carries no
  // alternative link so the alt-URL re-loop does not apply to Track A rows.
  const deterministic = buildDeterministicSupplier(liveSnippets, isProductPage);
  if (deterministic) {
    console.log(
      `[supplier-search] item=${item.itemId} depth=${depth} track=A deterministic ${deterministic.currency_code} ${deterministic.bidder_unit_price} (LLM skipped)`,
    );
    const deterministicRow: ItemSourceRow = {
      item_id: item.itemId,
      supplier_id: 0,                      // placeholder — assigned post-merge
      supplier_name: deterministic.supplier_name,
      source_url: deterministic.source_url,
      status: 'pending',                   // schema constant — never AI-derived
      delivery_time: '',                   // not in microdata
      bidder_description: deterministic.bidder_description,
      bidder_unit_price: deterministic.bidder_unit_price,
      currency_code: deterministic.currency_code,
      compliance_deviation: '',
      notes: depth > 0 ? 'via_alt: ' : '',
      contact_email: '',
      contact_phone: '',
      available_qty: 0,                    // unknown — bypasses the stock filter
      source_tier: search.tier,
      extraction_track: 'deterministic',
      selling_unit: '',                    // microdata carries no packaging info
      pack_size: 0,
      match_reasoning: '',                 // deterministic rows are exact product-page matches
    };
    // Stage 7 — Extraction telemetry (Track A, no LLM consumed).
    logSearchStage('extract', {
      item_id: item.itemId, depth, track: 'A-deterministic',
      liveSnippets: liveSnippets.length,
      source_url: deterministicRow.source_url,
      bidder_unit_price: deterministicRow.bidder_unit_price,
      currency_code: deterministicRow.currency_code,
      rowsEmitted: 1,
    });
    return { rows: [deterministicRow], tavilyCalls: search.tavilyCalls, deadUrls };
  }

  // Stage 8 — Track B (LLM extract): only reached when Track A couldn't fully
  // parse any live page. Stage 11 circuit-breaker: reserve one LLM call against
  // the budget BEFORE invoking the model. consumeLlmCall() returns false when
  // the ceiling is already crossed. Degrade to null at depth 0 or return what
  // we have deeper.
  if (!consumeLlmCall(budget)) {
    console.warn(
      `[supplier-search] item=${item.itemId} depth=${depth} budget exhausted — skipping LLM extraction`,
    );
    // depth > 0 means we're in an alt-URL recursion — no primary row to return.
    return { rows: null, tavilyCalls: search.tavilyCalls, deadUrls };
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
  //     Required buffer is item.qty + 2. available_qty === 0 = "not stated" and
  //     bypasses the filter (we don't have grounds to drop unknowns).
  if (extracted.available_qty > 0 && extracted.available_qty < item.qty + 2) {
    console.log(`[supplier-search] item=${item.itemId} depth=${depth} stock=${extracted.available_qty} below qty+2=${item.qty + 2}, dropping`);
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
    source_tier: search.tier,
    extraction_track: extractionTrack,
    // Dossier signals from the LLM extraction
    selling_unit: extracted.selling_unit,
    pack_size: extracted.pack_size,
    // match_reasoning only meaningful for substitutes (alt rows); the LLM returns
    // '' for exact matches. Force '' on the primary (depth 0) row regardless.
    match_reasoning: depth > 0 ? extracted.match_reasoning : '',
  };

  const rows: ItemSourceRow[] = [primaryRow];

  // Stage 8 — Extraction telemetry (Track B; extractionTrack notes microdata override).
  logSearchStage('extract', {
    item_id: item.itemId, depth,
    track: extractionTrack === 'deterministic' ? 'B-llm+microdata' : 'B-llm',
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
  //     we feed it back into the search loop as a new search subject so the
  //     existing tier cascade discovers / extracts it. Reuses all infra.
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
      const altResult = await extractSupplierForItem(
        { ...item, description: extracted.alternative_source_url },
        budget,
        depth + 1,
        visitedUrls,
        originalDescription,   // preserve the real requirement for match_reasoning
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

    // (3) Per-item DENSITY LOOP with one budget per item (Stage 11+).
    //     gatherSourcesForItem keeps mutating the query + re-extracting until the
    //     item reaches MIN_SOURCES distinct sources OR the budget/retry ceiling
    //     stops it. The injected extractor preserves the ORIGINAL description as
    //     originalDescription so alt-URL match_reasoning/relevance still compares
    //     against the real requirement (not the mutated probe).
    const rawItemResults = await Promise.all(
      itemRows.map((row) => {
        // Stage 11 — create ONE budget per item, scoped to this map callback so
        // each item's LLM ceiling is independent. The SAME budget threads through
        // every density-loop attempt, so retries can never exceed the per-item cap.
        const budget = createBudget();
        const baseItem = {
          itemId: Number(row.itemId),
          description: String(row.companyDescription || ''),
          qty: Number(row.qty || 0),
          uom: String(row.uom || 'EA'),
        };
        return limit(() =>
          gatherSourcesForItem<ItemSourceRow>(
            baseItem,
            budget,
            // One search+extract pass for a (mutated) probe. Reset visited-set per
            // attempt; pin originalDescription to the un-mutated requirement.
            (probe, b) =>
              extractSupplierForItem(probe, b, 0, new Set<string>(), baseItem.description),
          ).then((result) => ({ result, budget, itemId: baseItem.itemId })),
        );
      }),
    );

    // Flatten the gathered rows into one set. gatherSourcesForItem always returns
    // an array (possibly empty) — never null — so no null filter is needed.
    const beforeUrlGuards: ItemSourceRow[] = rawItemResults.flatMap((r) => r.result.rows);

    // URL guard — a row only survives if it points at a REAL product page.
    // Empty-source_url rows are "No product page found" results (often a
    // hallucinated supplier name/contact lifted from a homepage or directory
    // listing); we now DROP them instead of persisting them as markers — storing
    // them only inflated the row count with junk. isUsableSourceRow rejects empty
    // urls; isProductPage rejects homepages/PDFs/listings even if the LLM slipped.
    // NOTE: liveness (Stage 5) already ran per-item on the snippet URLs BEFORE
    // extraction, so every chosen source_url here is already known-live.
    const productPageItems = beforeUrlGuards.filter((r) => isUsableSourceRow(r) && isProductPage(r.source_url));

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

    // Dead-URL drops happened pre-extraction (Stage 5); aggregate the per-item
    // counts and add the row-level URL-guard drops for the total dropped figure.
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
