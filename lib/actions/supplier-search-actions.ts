// RAG pipeline — supplier search actions (search + research).

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
import { planQueries, planContactQueries } from '@/lib/services/search/query-planner';
import { SUPPLIER_SCHEMA, normalizeSupplierExtraction, type SupplierExtraction } from '@/lib/ai-agent/schemas/supplier';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';
import {
  createBudget,
  consumeLlmCall,
  isExhausted,
  type SearchBudget,
  createVisionBudget,
  consumeVisionCall,
  type VisionBudget,
} from '@/lib/services/search/budget';
import {
  type SpecToken,
  type SpecTokenInput,
  PRICE_CONF_THRESHOLD,
} from '@/lib/services/search/price-select';
import {
  gatherSourcesForItemParallel,
  computeItemsBelowTarget,
  isUsableSourceRow,
  MIN_SOURCES,
} from '@/lib/services/search/density-loop';
import {
  logSearchStage,
  enterSearchRun,
  emitRunStart,
  emitLiveness,
  emitLayer,
} from '@/lib/services/search/telemetry';
import {
  lookupMemory,
  rememberSupplier,
  type MemoryScope,
  type MemoryHit,
} from '@/lib/services/search/supplier-memory';
import type { ParsedSpec } from '@/lib/ai-agent/schemas/query-plan';
import { checkLivenessCached, clearLivenessCache } from '@/lib/services/search/liveness';
import { extractFromHtml, extractMetaFromHtml } from '@/lib/services/search/html-extract';
import { firecrawlFetch } from '@/lib/services/search/firecrawl-client';
import { extractMetaFromFirecrawl } from '@/lib/services/search/html-extract';
import { extractFromVision, isVisionEnabled } from '@/lib/services/search/vision-extract';

// --- Config ---

/** Returns URL host or '' on parse failure. */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** Per-RFQ item concurrency cap. */
const RAG_CONCURRENCY = 8;

/** Max candidate pages extracted per Tavily query. */
const MAX_PAGES_PER_QUERY = 5;

/** Max substitute re-plan rounds when below source floor. */
const MAX_REPLAN_ROUNDS = 2;

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
  extraction_confidence: string;  // 'manual' | 'manual+llm' | 'llm' etc.
  item_identification?: string[];
}

// --- Helpers ---

/** Pull identification[] from agent_item_summary jsonb. */
function extractIdentification(row: Record<string, unknown>): string[] {
  const summary = row.agentItemSummary as { identification?: unknown } | null;
  return summary && Array.isArray(summary.identification)
    ? (summary.identification as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : [];
}

/** Build weighted SpecToken[] from parsed spec + identification axis. */
function buildSpecTokens(parsed: ParsedSpec, identification: string[], agentItemSummary?: Record<string, unknown>): SpecToken[] {
  const tokens: SpecToken[] = [];

  for (const ident of identification) {
    if (ident.trim()) tokens.push({ token: ident.trim(), weight: 2 });
  }

  for (const [key, v] of Object.entries(parsed ?? {})) {
    const keyLower = key.toLowerCase();
    let weight = 2;
    if (/model|size|class|rating|pressure|dimension|dn|type/i.test(keyLower)) {
      weight = 3;
    } else if (/material/i.test(keyLower)) {
      weight = 2;
    }
    if (typeof v === 'string' && v.trim()) {
      tokens.push({ token: v.trim(), weight });
    } else if (typeof v === 'number') {
      tokens.push({ token: String(v), weight });
    } else if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === 'string' && x.trim()) tokens.push({ token: x.trim(), weight });
      }
    }
  }

  if (agentItemSummary && typeof agentItemSummary === 'object') {
    for (const [key, v] of Object.entries(agentItemSummary)) {
      if (/compl|deviat|note|remark/i.test(key)) {
        if (typeof v === 'string' && v.trim()) {
          tokens.push({ token: v.trim(), weight: 1 });
        } else if (Array.isArray(v)) {
          for (const x of v) {
            if (typeof x === 'string' && x.trim()) tokens.push({ token: x.trim(), weight: 1 });
          }
        }
      }
    }
  }

  return tokens;
}

// --- Memory → row adapter ---

/** Build an ItemSourceRow from a supplier-memory cache hit. */
function buildRowFromMemory(item: RfqItemInput, hit: MemoryHit): ItemSourceRow {
  const stockPrefix = hit.available_qty > 0 ? `Stock: ${hit.available_qty} available. ` : '';
  return {
    item_id: item.itemId,
    supplier_id: 0,                       // assigned post-merge
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
    selling_unit: hit.selling_unit,
    pack_size: hit.pack_size,
    match_reasoning: '',
    requires_quote: false,
    page_type: 'product',
    extraction_confidence: 'memory',
  };
}

// --- Per-item RAG ---

interface RfqItemInput {
  itemId: number;
  description: string;
  qty: number;
  uom: string;
}

interface ExtractResult {
  rows: ItemSourceRow[] | null;
  tavilyCalls: number;
  deadUrls: number; // dropped by L0 liveness gate (404/410)
}

/** Extract supplier rows for one RFQ item via the full L0→L4 cascade. */
async function extractSupplierForItem(
  query: string,
  item: RfqItemInput,
  budget: SearchBudget,
  originalDescription: string = item.description,
  spec: ScorerSpec = {},
  isSubstitute: boolean = false,
  specTokens: SpecTokenInput[] = [],
  visionBudget: VisionBudget = createVisionBudget(),
): Promise<ExtractResult> {
  // (1) Tavily search → classify → eliminate → score → ranked candidates.
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

  // (2) Hybrid-extract top-K pages; each usable page becomes its own row.
  const pages = search.candidates.slice(0, MAX_PAGES_PER_QUERY);
  const rows: ItemSourceRow[] = [];
  let deadUrls = 0;

  for (const cand of pages) {
    if (isExhausted(budget)) break;

    // L0 — liveness gate: dead (404/410) → drop; blocked → keep on Tavily content.
    const live = await checkLivenessCached(cand.snippet.url);
    emitLiveness(item.itemId, live.status, safeHost(cand.snippet.url));
    if (live.status === 'dead') { deadUrls++; continue; }
    const html = live.html;   // non-null when status === 'live'

    // L2 HTML: Firecrawl rendered DOM preferred; falls back to live.html.
    const fcResult = await firecrawlFetch(cand.snippet.url);
    const htmlForL2 = fcResult?.html ?? html;

    const content = cand.snippet.content || cand.snippet.snippet || '';

    // L1 — manual regex on Tavily raw_content.
    const manual = manualExtract(content, cand.detected, specTokens);
    emitLayer(item.itemId, 1);
    const manualUsed = Object.values(manual.confidence).some((c) => c > 0);
    let manualPriceConfidence: number | undefined;
    if (manual.fields.bidder_unit_price > 0 && manual.priceConfidence !== undefined) {
      manualPriceConfidence = manual.priceConfidence;
    }

    // L2 — structured HTML (JSON-LD/microdata/OG + data-price-amount).
    let structuredPrice = 0;
    let structuredCurrency = '';
    let structuredPriceConfidence: number | undefined;
    if (manual.fields.bidder_unit_price === 0 && htmlForL2) {
      emitLayer(item.itemId, 2); // Firecrawl HTML preferred, live.html fallback
      const s = extractFromHtml(htmlForL2, specTokens);
      if (s.price > 0) {
        structuredPrice = s.price;
        structuredCurrency = s.currency;
        if (s.confidence !== undefined) structuredPriceConfidence = s.confidence;
      }
    }

    // B1 metadata: Firecrawl metadata object preferred; falls back to HTML parse.
    const meta = fcResult
      ? extractMetaFromFirecrawl(fcResult.meta as Record<string, unknown>)
      : (html ? extractMetaFromHtml(html) : { supplierName: '', description: '', siteName: '', productName: '' });

    // L3 — LLM gap-fill. Skipped (B1) when deterministic price + name + desc exist.
    const deterministicPrice = manual.fields.bidder_unit_price > 0 || structuredPrice > 0;
    const canSkipLlm = !isSubstitute && deterministicPrice && meta.supplierName !== '' && meta.description !== '';

    let llm: SupplierExtraction | null = null;
    if (!canSkipLlm && consumeLlmCall(budget)) {
      emitLayer(item.itemId, 3);
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
    } else if (canSkipLlm) {
      console.log(`[supplier-search] item=${item.itemId} L3 LLM skipped (deterministic price + structured name/description)`);
    }

    // Merge: name/desc from LLM → meta fallback.
    const f = manual.fields;
    const supplier_name = llm?.supplier_name || meta.supplierName || '';
    const bidder_description = llm?.bidder_description || meta.description || '';
    if (!supplier_name.trim() || !bidder_description.trim()) continue;

    // Price cascade: manual → structured → LLM.
    let price =
      f.bidder_unit_price > 0 ? f.bidder_unit_price
      : structuredPrice > 0 ? structuredPrice
      : (llm?.bidder_unit_price ?? 0);
    // Currency cascade; '' means unknown — no fabricated 'USD'.
    let currency = f.currency_code || structuredCurrency || llm?.currency_code || '';
    let winningPriceConfidence: number | undefined;
    if (f.bidder_unit_price > 0) {
      winningPriceConfidence = manualPriceConfidence;
    } else if (structuredPrice > 0) {
      winningPriceConfidence = structuredPriceConfidence;
    }

    // L4 — vision price recovery; only when price still 0.
    let visionUsed = false;
    if (price === 0 && isVisionEnabled() && consumeVisionCall(visionBudget)) {
      emitLayer(item.itemId, 4);
      const visionTokens = specTokens.map((t) => (typeof t === 'string' ? t : t.token));
      const vision = await extractFromVision(html ?? '', cand.snippet.url, visionTokens);
      if (vision.price > 0) {
        price = vision.price;
        currency = vision.currency || currency;
        visionUsed = true;
      }
    }

    const delivery_time = f.delivery_time || llm?.delivery_time || '';
    const contact_email = f.contact_email || llm?.contact_email || '';
    const contact_phone = f.contact_phone || llm?.contact_phone || '';
    const available_qty = f.available_qty > 0 ? f.available_qty : (llm?.available_qty ?? 0);

    // Provenance label for extraction_confidence.
    const track =
      visionUsed ? 'vision'
      : f.bidder_unit_price > 0 ? (manualUsed ? (llm ? 'manual+llm' : 'manual') : 'manual')
      : structuredPrice > 0 ? (llm ? 'structured+llm' : 'structured')
      : 'llm';

    // Stock protection: drop if stated qty can't fulfil (0 = unknown = bypass).
    if (available_qty > 0 && available_qty < item.qty + 5) {
      console.log(`[supplier-search] item=${item.itemId} stock=${available_qty} below qty+5, dropping page`);
      continue;
    }

    // requires_quote: only when no price extracted AND quote signal present.
    const requiresQuote = price === 0 && ((llm?.requires_quote ?? false) || cand.detected.has_quote_request);

    // Prepend low-confidence price marker to notes when applicable.
    const stockPrefix = available_qty > 0 ? `Stock: ${available_qty} available. ` : '';
    let notes = `${stockPrefix}${llm?.notes ?? ''}`.trim();
    if (winningPriceConfidence !== undefined && winningPriceConfidence < PRICE_CONF_THRESHOLD) {
      notes = `[price match: low-confidence variant] ${notes}`.trim();
    }

    rows.push({
      item_id: item.itemId,
      supplier_id: 0,                          // assigned post-merge
      supplier_name,
      source_url: cand.snippet.url,            // always the real URL, never LLM-hallucinated
      status: 'pending',
      delivery_time,
      bidder_description,
      bidder_unit_price: price,
      currency_code: currency,
      compliance_deviation: llm?.compliance_deviation ?? '',
      notes,
      contact_email,
      contact_phone,
      available_qty,
      selling_unit: llm?.selling_unit ?? '',
      pack_size: llm?.pack_size ?? 0,
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

    if (rows.length >= MAX_PAGES_PER_QUERY) break;
  }

  return { rows: rows.length ? rows : null, tavilyCalls: search.tavilyCalls, deadUrls };
}

// --- Homepage fallback helpers ---

/** Derive origin URL (protocol + host + /) from source_url. */
function deriveHomeOrigin(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    return `${url.protocol}//${url.host}/`;
  } catch {
    return '';
  }
}

/** Try homepage paths to recover missing contact fields. Never throws. */
async function contactHomepageFallback(row: ItemSourceRow): Promise<void> {
  if ((row.contact_email || row.contact_phone) || !row.source_url) return;

  const origin = deriveHomeOrigin(row.source_url);
  if (!origin) return;

  const paths = ['', 'contact', 'contact-us', 'about', 'about-us'];

  try {
    for (const path of paths) {
      if (row.contact_email && row.contact_phone) break;

      const homeUrl = origin + path;
      const live = await checkLivenessCached(homeUrl);
      emitLiveness(Number(row.item_id) || 0, live.status, safeHost(homeUrl));

      if (live.status !== 'live' || !live.html) continue;

      const extracted = manualExtract(
        live.html,
        { has_price: false, has_stock: false, has_delivery: false, has_contact_email: true, has_contact_phone: true },
      );

      if (!row.contact_email && extracted.fields.contact_email) row.contact_email = extracted.fields.contact_email;
      if (!row.contact_phone && extracted.fields.contact_phone) row.contact_phone = extracted.fields.contact_phone;
    }
  } catch (err) {
    console.warn(`[supplier-search] homepage fallback error:`, err instanceof Error ? err.message : err);
  }
}

// --- Search-text builder ---

/** Collapse RFQ item row into flat query string for planQueries(). */
function buildSearchText(row: Record<string, unknown>): string {
  // Always include raw description — preserves exact part numbers the LLM may paraphrase.
  const parts: string[] = [];

  const companyDescription = String(row.companyDescription || '').trim();
  if (companyDescription) parts.push(companyDescription);

  const summary = row.agentItemSummary;
  if (summary !== null && summary !== undefined && typeof summary === 'object') {
    for (const val of Object.values(summary as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        for (const v of val) {
          if (typeof v === 'string' && v.trim()) parts.push(v.trim());
        }
      } else if (typeof val === 'string' && val.trim()) {
        parts.push(val.trim());
      }
    }
  }

  // Dedupe (case-insensitive), preserving order.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) { seen.add(key); deduped.push(p); }
  }

  return deduped.join('; ');
}

// --- Main processor ---

/** Run the full RAG supplier-search pipeline for one RFQ. */
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
    const scope: MemoryScope = { companyId: workspace.company_id, userId: workspace.user_id };

    // One vision budget per RFQ, shared across all items.
    const visionBudget = createVisionBudget();

    enterSearchRun(rfq_id ?? 0);
    clearLivenessCache(); // reset per-run liveness cache
    emitRunStart(itemRows.length, createBudget().maxLlmCalls, visionBudget.maxVisionCalls);

    // (3) Per-item density loop: plan queries → gather sources → substitute loop.
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
          // (3a) LLM query planning — parses spec, emits ranked queries.
          const plan = await planQueries(searchText);
          const parsed: ParsedSpec = plan.parsed;
          const queries: string[] = plan.queries;
          const specTokens = buildSpecTokens(parsed, extractIdentification(row), row.agentItemSummary as Record<string, unknown> | undefined);

          // (3b) L0 memory — exact-match short-circuit (disabled by default).
          const hits = await lookupMemory(parsed, scope);
          if (hits && hits.length) {
            const memRows = hits.map((h) => buildRowFromMemory(baseItem, h));
            logSearchStage('density-check', {
              item_id: baseItem.itemId, attempt: 0, query: '(memory)',
              have: memRows.length, need: MIN_SOURCES, source: 'memory',
            });
            return {
              result: { rows: memRows, tavilyCalls: 0, deadUrls: 0, attempts: 0 },
              budget: createBudget(), itemId: baseItem.itemId, parsed, specTokens, fromMemory: true,
            };
          }

          // Budget starts after planning to preserve wall-clock for extraction.
          const budget = createBudget();
          const effectiveQueries = queries.length ? queries : [searchText].filter((q) => q.trim());
          const result = await gatherSourcesForItemParallel<ItemSourceRow>(
            baseItem,
            effectiveQueries,
            budget,
            (q, b) => extractSupplierForItem(q, baseItem, b, baseItem.description, parsed, false, specTokens, visionBudget),
          );

          // (3c) Alt loop — broaden queries when below source floor.
          const collected = new Map<string, ItemSourceRow>();
          for (const r of result.rows) collected.set(r.source_url, r);

          let replanRound = 0;
          while (collected.size < MIN_SOURCES && !isExhausted(budget) && replanRound < MAX_REPLAN_ROUNDS) {
            replanRound++;
            const broadenText = `${searchText} alternative equivalent substitute compatible replacement`;
            const replan = await planQueries(broadenText);
            const replanQueries = replan.queries.length ? replan.queries : [broadenText];
            const altResult = await gatherSourcesForItemParallel<ItemSourceRow>(
              baseItem,
              replanQueries,
              budget,
              (q, b) => extractSupplierForItem(q, baseItem, b, baseItem.description, replan.parsed ?? parsed, true, specTokens, visionBudget),
            );
            for (const r of altResult.rows) {
              if (!collected.has(r.source_url)) collected.set(r.source_url, r);
            }
            result.tavilyCalls += altResult.tavilyCalls;
            result.deadUrls += altResult.deadUrls;
            result.attempts += altResult.attempts;
            logSearchStage('density-check', {
              item_id: baseItem.itemId, attempt: result.attempts,
              query: '(substitute-replan)', have: collected.size,
              need: MIN_SOURCES, round: replanRound, source: 'substitute',
            });
          }

          const mergedResult = { ...result, rows: [...collected.values()] };
          return { result: mergedResult, budget, itemId: baseItem.itemId, parsed, specTokens, fromMemory: false };
        });
      }),
    );

    const beforeUrlGuards: ItemSourceRow[] = rawItemResults.flatMap((r) => r.result.rows);

    // URL guard: drop rows without a real product page URL.
    const productPageItems = beforeUrlGuards.filter((r) => isUsableSourceRow(r) && isProductPage(r.source_url));

    // L4 vision ran in-loop per item — no separate post-survivor pass needed.

    // (3b1) Contact homepage fallback (env-gated: SEARCH_CONTACT_HOMEPAGE_FALLBACK=1).
    const CONTACT_RECOVERY_CAP = Number(process.env.SEARCH_CONTACT_RECOVERY_CAP ?? 10);
    let contactRecoveries = 0;
    let contactTavilyCalls = 0;
    const homepageFallbackEnabled = process.env.SEARCH_CONTACT_HOMEPAGE_FALLBACK === '1';
    for (const row of productPageItems) {
      if (contactRecoveries >= CONTACT_RECOVERY_CAP) break;
      if (row.contact_email || row.contact_phone || !row.supplier_name) continue;

      if (homepageFallbackEnabled) {
        await contactHomepageFallback(row);
        if (row.contact_email && row.contact_phone) { contactRecoveries++; continue; }
      }

      // (3b2) Name-targeted Tavily contact loopback.
      contactRecoveries++;
      try {
        const planned = await planContactQueries(row.supplier_name);
        const contactQueries = planned.length
          ? planned.slice(0, 2)
          : [`"${row.supplier_name}" contact email phone "get in touch"`];

        for (const contactQuery of contactQueries) {
          if (row.contact_email && row.contact_phone) break;
          const cs = await searchOneQuery(contactQuery);
          contactTavilyCalls += cs.tavilyCalls;
          for (const c of cs.candidates.slice(0, 2)) {
            const extracted = manualExtract(
              c.snippet.content || c.snippet.snippet || '',
              { has_price: false, has_stock: false, has_delivery: false, has_contact_email: true, has_contact_phone: true },
            );
            if (!row.contact_email && extracted.fields.contact_email) row.contact_email = extracted.fields.contact_email;
            if (!row.contact_phone && extracted.fields.contact_phone) row.contact_phone = extracted.fields.contact_phone;
            if (row.contact_email && row.contact_phone) break;
          }
        }
      } catch (err) {
        console.warn(`[supplier-search] contact recovery failed for "${row.supplier_name}":`, err instanceof Error ? err.message : err);
      }
    }
    if (contactRecoveries > 0) {
      console.log(`[supplier-search] contact recovery: attempted=${contactRecoveries} tavily=${contactTavilyCalls}`);
    }

    // (3c) Memorize verified sourcings for future L0 exact-match hits.
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

    const deadUrlCount = rawItemResults.reduce((sum, r) => sum + r.result.deadUrls, 0);
    const totalDropped = (beforeUrlGuards.length - productPageItems.length) + deadUrlCount;
    console.log(`[supplier-search] done rfq_id=${rfq_id} returned=${finalItems.length} dropped=${totalDropped}`);

    // Aggregate telemetry.
    const tavily_calls = rawItemResults.reduce((sum, r) => sum + r.result.tavilyCalls, 0) + contactTavilyCalls;
    const llm_calls = rawItemResults.reduce((sum, r) => sum + r.budget.llmCallsUsed, 0);
    const budget_exhausted = rawItemResults.some((r) => r.budget.exhausted);
    const dropped_count = totalDropped;
    const items_below_target = computeItemsBelowTarget(
      rawItemResults.map((r) => r.itemId),
      finalItems,
      MIN_SOURCES,
    );
    const vision_calls = visionBudget.visionCallsUsed;
    const search_telemetry = {
      tavily_calls, llm_calls, vision_calls, dropped_count,
      budget_exhausted, items_below_target,
      write_failures: [] as WriteFailure[],
    };

    console.log(
      `[supplier-search] telemetry rfq_id=${rfq_id} tavily=${tavily_calls} llm=${llm_calls} vision=${vision_calls} exhausted=${budget_exhausted} items_below_target=${items_below_target.length}`,
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

    logSearchStage('persist', {
      rfq_id: rfq_id ?? null,
      table: 'supplierItemStatus',
      rows: finalItems.length,
      failures: writeFailures,
    });

    logSearchStage('run-summary', {
      rfq_id: rfq_id ?? null,
      tavily_calls, llm_calls, dropped_count, budget_exhausted,
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
