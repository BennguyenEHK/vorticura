/* ============================================================================
   EXTRACTION-LAYER DIAGNOSTIC PROBE  (full cascade: L0→L1→L2→L3→L4)
   + FIELD-BY-FIELD DIFF against supplier_item_status.json stored values
   ----------------------------------------------------------------------------
   Runs every source_url from supplier_item_status.json through ALL FOUR real
   extraction layers, concurrently, reproducing the production cascade + gates:

     L0  liveness    — checkLiveness(url)            (real fetch + WAF profiles)
     L1  manual      — manualExtract(text, …)        (regex on page text)
     L2  structured  — extractFromHtml(html, …)      (cheerio JSON-LD/microdata/OG)
         meta        — extractMetaFromHtml(html)     (name + description)
         scorer      — scoreProductPage(snippet)     (detected.has_quote_request)
     L3  LLM         — aiChatCompletion(EXTRACT…)    (HF/local gap-fill)  [PROBE_L3=1]
     L4  vision      — extractFromVision(html,url)   (ScreenshotOne + HF vision) [PROBE_L4=1]

   Cascade + gates mirror supplier-search-actions.ts:
     price = manual>0 ? manual : structured>0 ? structured : (llm?.price ?? 0)
     if price===0 && visionEnabled → vision may override
     requiresQuote = price===0 && (llm.requires_quote || detected.has_quote_request)
     supplier_name = llm?.supplier_name || meta.supplierName
     bidder_description = llm?.bidder_description || meta.description
     delivery_time = manual.delivery_time || llm?.delivery_time
     contact_email = manual.contact_email || llm?.contact_email
     contact_phone = manual.contact_phone || llm?.contact_phone
     available_qty = manual.available_qty>0 ? manual.available_qty : (llm?.available_qty ?? 0)
     + compliance_deviation, notes, selling_unit, pack_size from LLM

   After extraction, every field is diffed against the stored JSON value:
     =  match          ≠  differ         +  extracted (stored was empty/0)
     !  regression     ?  both empty/0

   Plus an INDEPENDENT raw-HTML oracle (price signals NOT routed through the
   project extractors) to separate "page has a price but we missed it" from
   "page genuinely has no public price".

   Faithfulness notes:
     • L1/L3 see the live HTML's stripped text (production feeds Tavily raw_content);
       L2/L4 use the same inputs as production, so they are faithful.
     • L4 also runs on BLOCKED (403) pages from the URL alone (screenshot path),
       exactly as the production URL-only recovery does.

   Run:  npx tsx --env-file=.env.local tools/agent-test/extraction-probe.ts
         (--env-file is REQUIRED for L3/L4: a standalone tsx script does not
          auto-load .env.local the way Next.js does, so HF_TOKEN /
          SEARCH_VISION_ENABLED / SCREENSHOTONE_ACCESS_KEY would be unset and
          L3/L4 would silently no-op.)
   Env:  PROBE_L3=0 / PROBE_L4=0 to skip a layer · PROBE_AI_CONCURRENCY (default 4)
   ========================================================================== */

import pLimit from 'p-limit';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { checkLiveness } from '../../lib/services/search/liveness';
import { manualExtract } from '../../lib/services/search/manual-extract';
import { extractFromHtml, extractMetaFromHtml } from '../../lib/services/search/html-extract';
import { firecrawlFetch } from '../../lib/services/search/firecrawl-client';
import { extractMetaFromFirecrawl } from '../../lib/services/search/html-extract';
import { scoreProductPage, classifyPage } from '../../lib/services/search/product-page-scorer';
import { extractFromVision, isVisionEnabled } from '../../lib/services/search/vision-extract';
import { aiChatCompletion } from '@/lib/ai-agent/ai-router';
import {
  EXTRACT_SUPPLIER_FROM_SNIPPETS_PROMPT,
  buildExtractUserMessage,
} from '@/lib/ai-agent/prompt/search-suppliers';
import { SUPPLIER_SCHEMA, normalizeSupplierExtraction } from '@/lib/ai-agent/schemas/supplier';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const STATUS_JSON = resolve(REPO_ROOT, 'supplier_item_status.json');
const OUT_JSON = resolve(__dirname, 'extraction-probe-output.json');

const AI_CONCURRENCY = Number(process.env.PROBE_AI_CONCURRENCY ?? 4);
const FETCH_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 20000);
const L3_TIMEOUT_MS = Number(process.env.PROBE_L3_TIMEOUT_MS ?? 30000);
const L4_TIMEOUT_MS = Number(process.env.PROBE_L4_TIMEOUT_MS ?? 60000);
const RUN_L3 = process.env.PROBE_L3 !== '0';
const RUN_L4 = process.env.PROBE_L4 !== '0';

// ---- Stored-JSON row shape (all comparable fields) -------------------------
interface StatusRow {
  id: number;
  item_id: number;
  source_url: string;
  // Comparable stored fields
  supplier_name: string;
  bidder_unit_price: string;     // stored as "0.0000" string
  currency_code: string;
  delivery_time: string;
  bidder_description: string;
  contact_email: string;
  contact_phone: string;
  available_qty: number;
  compliance_deviation: string;
  notes: string;
  selling_unit: string | null;
  pack_size: number | null;
  requires_quote: boolean;
  page_type: string;
  extraction_confidence: string;
}

// ---- Diff entry per field --------------------------------------------------
// status:  '=' match · '≠' differ · '+' new (stored empty, extracted has value)
//          '!' regression (stored had value, extracted empty/0) · '?' both empty
interface FieldDiff {
  field: string;
  stored: string | number | boolean | null;
  extracted: string | number | boolean | null;
  status: '=' | '≠' | '+' | '!' | '?';
}

// ---- Full probe result -----------------------------------------------------
interface ProbeResult {
  id: number; item_id: number; host: string; url: string;

  // --- stored values (mirrors StatusRow) ---
  db_price: string; db_requires_quote: boolean; db_track: string;
  db_supplier_name: string; db_currency: string; db_delivery_time: string;
  db_description: string; db_contact_email: string; db_contact_phone: string;
  db_available_qty: number; db_compliance: string; db_notes: string;
  db_selling_unit: string | null; db_pack_size: number | null;
  db_page_type: string;

  // --- L0 liveness ---
  liveStatus: string; httpStatus: number; htmlLen: number;

  // --- raw HTML oracle ---
  raw: ReturnType<typeof rawSignals> | null;

  // --- L1 manual ---
  manualPrice: number;
  manualDelivery: string; manualEmail: string; manualPhone: string; manualQty: number;

  // --- L2 structured ---
  structuredPrice: number; structuredCurrency: string;

  // --- meta (B1 skip gate) ---
  metaSupplierName: string; metaDescription: string;
  metaHasName: boolean; metaHasDesc: boolean;

  // --- scorer ---
  detectedQuoteRequest: boolean; pageType: string;

  // --- L3 LLM ---
  llmRan: boolean;
  llmPrice: number; llmCurrency: string; llmRequiresQuote: boolean;
  llmSupplierName: string; llmDescription: string;
  llmDelivery: string; llmEmail: string; llmPhone: string;
  llmQty: number; llmCompliance: string; llmNotes: string;
  llmSellingUnit: string; llmPackSize: number;

  // --- L4 vision ---
  visionRan: boolean; visionPrice: number; visionCurrency: string;

  // --- merged final row (production cascade) ---
  finalPrice: number; finalCurrency: string; finalTrack: string;
  finalRequiresQuote: boolean;
  finalSupplierName: string; finalDescription: string;
  finalDelivery: string; finalEmail: string; finalPhone: string;
  finalQty: number; finalCompliance: string; finalNotes: string;
  finalSellingUnit: string; finalPackSize: number;
  finalPageType: string;

  // --- diff against stored values ---
  diffs: FieldDiff[];
  diffCount: number;       // total '≠' + '!' + '+' (changes)
  regressions: number;     // total '!' (had value, now empty)

  // --- verdict ---
  verdict: string;
  error?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T, tag: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((res) => {
    timer = setTimeout(() => { console.warn(`[probe] ${tag} timed out after ${ms}ms`); res(fallback); }, ms);
  });
  return Promise.race([
    p.catch((e) => { console.warn(`[probe] ${tag} error: ${e instanceof Error ? e.message : e}`); return fallback; }),
    timeout,
  ]).finally(() => clearTimeout(timer));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- INDEPENDENT raw-HTML oracle (judges the extractors) -------------------
function rawSignals(html: string) {
  const jsonLdBlocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const jsonLdPrice = jsonLdBlocks.some((b) =>
    /"price"\s*:\s*"?(?!0+(?:\.0+)?"?[,}\s])[\d.]+/i.test(b)
    || /"(?:lowPrice|highPrice)"\s*:\s*"?(?!0+(?:\.0+)?")[\d.]+/i.test(b));
  const microdataPrice = /itemprop\s*=\s*["']price["'][^>]*content\s*=\s*["'](?!0+(?:\.0+)?["'])[\d.]+/i.test(html);
  const ogPrice = /property\s*=\s*["'](?:product:price:amount|og:price:amount)["'][^>]*content\s*=\s*["'](?!0+(?:\.0+)?["'])[\d.]+/i.test(html);
  const currencyNumMatches =
    html.match(/(?:[$€£¥]|\b(?:USD|EUR|GBP|AUD|INR|CNY|SGD|MYR)\b)\s?\d[\d,]*(?:\.\d{1,2})?/gi) ?? [];
  const quoteCta =
    /request a quote|get a quote|request (?:a )?price|contact (?:us )?for (?:a )?(?:price|quote|pricing)|call for (?:price|pricing)|login (?:required|to (?:see|view))|add to (?:quote|inquiry)|enquir/i
      .test(html);
  return {
    jsonLdPrice, microdataPrice, ogPrice,
    currencyNumCount: currencyNumMatches.length,
    currencyNumSamples: Array.from(new Set(currencyNumMatches)).slice(0, 6),
    quoteCta,
    hasAnyPriceSignal: jsonLdPrice || microdataPrice || ogPrice || currencyNumMatches.length > 0,
  };
}

// ---- Field diff helpers -----------------------------------------------------

/** Normalise price: stored JSON uses "0.0000" strings, extracted is a number. */
function normPrice(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

/** Normalise string: trim + lower for loose equality (ignores case/whitespace). */
function normStr(v: string | null | undefined): string {
  return (v ?? '').trim();
}

/**
 * Build a FieldDiff entry with status:
 *   '?' — both are empty/zero/null
 *   '=' — values match (or both empty)
 *   '+' — extracted has a value, stored was empty/zero
 *   '!' — stored had a value, extracted is empty/zero (regression)
 *   '≠' — both have values but they differ
 */
function diffField(
  field: string,
  stored: string | number | boolean | null,
  extracted: string | number | boolean | null,
): FieldDiff {
  const storedEmpty  = stored  === '' || stored  === 0 || stored  === null || stored  === undefined;
  const extractedEmpty = extracted === '' || extracted === 0 || extracted === null || extracted === undefined;

  if (storedEmpty && extractedEmpty) return { field, stored, extracted, status: '?' };

  // Normalise for comparison (strings: trim+lower; numbers: numeric equality).
  let equal: boolean;
  if (typeof stored === 'boolean' || typeof extracted === 'boolean') {
    equal = Boolean(stored) === Boolean(extracted);
  } else if (typeof stored === 'number' || typeof extracted === 'number') {
    equal = Math.abs(normPrice(stored ?? 0) - normPrice(extracted ?? 0)) < 0.001;
  } else {
    equal = normStr(stored as string).toLowerCase() === normStr(extracted as string).toLowerCase();
  }

  if (equal) return { field, stored, extracted, status: '=' };
  if (storedEmpty)    return { field, stored, extracted, status: '+' };  // gained
  if (extractedEmpty) return { field, stored, extracted, status: '!' };  // regression
  return { field, stored, extracted, status: '≠' };                      // differ
}

// ---- Build production-merged final row from all layers ---------------------
function buildFinalRow(params: {
  manualPrice: number; manualCurrency: string;
  manualDelivery: string; manualEmail: string; manualPhone: string; manualQty: number;
  structuredPrice: number; structuredCurrency: string;
  metaSupplierName: string; metaDescription: string;
  llm: {
    supplier_name: string; bidder_description: string; bidder_unit_price: number;
    currency_code: string; delivery_time: string; contact_email: string;
    contact_phone: string; available_qty: number; compliance_deviation: string;
    notes: string; selling_unit: string; pack_size: number; requires_quote: boolean;
  } | null;
  visionPrice: number; visionCurrency: string;
  detectedQuoteRequest: boolean; pageType: string;
}) {
  const {
    manualPrice, manualCurrency, manualDelivery, manualEmail, manualPhone, manualQty,
    structuredPrice, structuredCurrency,
    metaSupplierName, metaDescription,
    llm, visionPrice, visionCurrency,
    detectedQuoteRequest, pageType,
  } = params;

  // Price cascade: manual → structured → LLM → vision
  let price =
    manualPrice > 0 ? manualPrice
    : structuredPrice > 0 ? structuredPrice
    : (llm?.bidder_unit_price ?? 0);
  let currency = manualCurrency || structuredCurrency || llm?.currency_code || '';

  // Track (provenance label)
  let track =
    manualPrice > 0 ? (llm ? 'manual+llm' : 'manual')
    : structuredPrice > 0 ? (llm ? 'structured+llm' : 'structured')
    : llm ? 'llm'
    : 'none';

  if (price === 0 && visionPrice > 0) {
    price = visionPrice;
    currency = visionCurrency || currency;
    track = 'vision';
  }

  const supplier_name = llm?.supplier_name || metaSupplierName;
  const bidder_description = llm?.bidder_description || metaDescription;
  const delivery_time = manualDelivery || llm?.delivery_time || '';
  const contact_email = manualEmail || llm?.contact_email || '';
  const contact_phone = manualPhone || llm?.contact_phone || '';
  const available_qty = manualQty > 0 ? manualQty : (llm?.available_qty ?? 0);
  const compliance_deviation = llm?.compliance_deviation ?? '';
  const notes = llm?.notes ?? '';
  const selling_unit = llm?.selling_unit ?? '';
  const pack_size = llm?.pack_size ?? 0;
  const requires_quote = price === 0 && ((llm?.requires_quote ?? false) || detectedQuoteRequest);

  return {
    price, currency, track, requires_quote,
    supplier_name, bidder_description,
    delivery_time, contact_email, contact_phone,
    available_qty, compliance_deviation, notes,
    selling_unit, pack_size,
    page_type: pageType,
  };
}

function host(u: string): string { try { return new URL(u).host.replace(/^www\./, ''); } catch { return '?'; } }

// ---- Main probe per row ----------------------------------------------------
async function probe(row: StatusRow): Promise<ProbeResult> {
  const dbPrice = normPrice(row.bidder_unit_price);

  const r: ProbeResult = {
    id: row.id, item_id: row.item_id, host: host(row.source_url), url: row.source_url,

    db_price: row.bidder_unit_price, db_requires_quote: row.requires_quote, db_track: row.extraction_confidence,
    db_supplier_name: row.supplier_name ?? '', db_currency: row.currency_code ?? '',
    db_delivery_time: row.delivery_time ?? '', db_description: row.bidder_description ?? '',
    db_contact_email: row.contact_email ?? '', db_contact_phone: row.contact_phone ?? '',
    db_available_qty: row.available_qty ?? 0, db_compliance: row.compliance_deviation ?? '',
    db_notes: row.notes ?? '', db_selling_unit: row.selling_unit ?? null,
    db_pack_size: row.pack_size ?? null, db_page_type: row.page_type ?? '',

    liveStatus: '-', httpStatus: 0, htmlLen: 0, raw: null,

    manualPrice: 0, manualDelivery: '', manualEmail: '', manualPhone: '', manualQty: 0,
    structuredPrice: 0, structuredCurrency: '',
    metaSupplierName: '', metaDescription: '',
    metaHasName: false, metaHasDesc: false,
    detectedQuoteRequest: false, pageType: '-',

    llmRan: false, llmPrice: 0, llmCurrency: '', llmRequiresQuote: false,
    llmSupplierName: '', llmDescription: '', llmDelivery: '', llmEmail: '', llmPhone: '',
    llmQty: 0, llmCompliance: '', llmNotes: '', llmSellingUnit: '', llmPackSize: 0,

    visionRan: false, visionPrice: 0, visionCurrency: '',

    finalPrice: 0, finalCurrency: '', finalTrack: 'none', finalRequiresQuote: false,
    finalSupplierName: '', finalDescription: '', finalDelivery: '',
    finalEmail: '', finalPhone: '', finalQty: 0, finalCompliance: '', finalNotes: '',
    finalSellingUnit: '', finalPackSize: 0, finalPageType: '-',

    diffs: [], diffCount: 0, regressions: 0,
    verdict: '-',
  };

  let llmResult: ReturnType<typeof normalizeSupplierExtraction> | null = null;
  let manualCurrency = '';

  try {
    // L0 — liveness
    const live = await checkLiveness(row.source_url, FETCH_TIMEOUT_MS);
    r.liveStatus = live.status; r.httpStatus = live.httpStatus;
    const html = live.html ?? ''; r.htmlLen = html.length;
    const dead = live.status === 'dead';

    if (html) {
      r.raw = rawSignals(html);
      const text = stripHtml(html);

      // L1 — manual regex
      const m1 = manualExtract(text, undefined, undefined);
      r.manualPrice = m1.fields.bidder_unit_price;
      manualCurrency = m1.fields.currency_code;
      r.manualDelivery = m1.fields.delivery_time;
      r.manualEmail = m1.fields.contact_email;
      r.manualPhone = m1.fields.contact_phone;
      r.manualQty = m1.fields.available_qty;

      // Firecrawl HTML for L2 — JS-rendered DOM (data-price-amount, bot-bypass).
      // Falls back to live.html when Firecrawl is unavailable or times out.
      const fcResult = await firecrawlFetch(row.source_url);
      const htmlForL2 = fcResult?.html ?? html;

      // L2 — structured HTML
      const s2 = extractFromHtml(htmlForL2, undefined);
      r.structuredPrice = s2.price;
      r.structuredCurrency = s2.currency;

      // Meta (B1 skip gate)
      const meta = fcResult
        ? extractMetaFromFirecrawl(fcResult.meta as Record<string, unknown>)
        : extractMetaFromHtml(html);
      r.metaSupplierName = meta.supplierName;
      r.metaDescription = meta.description;
      r.metaHasName = meta.supplierName.trim().length > 0;
      r.metaHasDesc = meta.description.trim().length > 0;

      // Scorer
      const snippet = { url: row.source_url, title: meta.productName || '', content: text.slice(0, 20000) };
      r.detectedQuoteRequest = scoreProductPage(snippet).detected.has_quote_request;
      r.pageType = classifyPage(snippet);

      // L3 — LLM gap-fill (runs when price still 0, or always to test all fields)
      const deterministicPrice = r.manualPrice > 0 || r.structuredPrice > 0;
      const canSkip = deterministicPrice && r.metaHasName && r.metaHasDesc;

      if (RUN_L3 && !canSkip) {
        r.llmRan = true;
        const userMsg = buildExtractUserMessage({
          item: { itemId: row.item_id, description: row.supplier_name || 'product', qty: 1, uom: 'EA' },
          snippets: [{ title: meta.productName || '', url: row.source_url, snippet: meta.description.slice(0, 300), content: text.slice(0, 8000) }],
          originalDescription: row.supplier_name || '',
        });
        const raw = await withTimeout(
          aiChatCompletion<unknown>(EXTRACT_SUPPLIER_FROM_SNIPPETS_PROMPT, userMsg, 600, SUPPLIER_SCHEMA),
          L3_TIMEOUT_MS, null, `#${row.id} L3`,
        );
        if (raw) {
          llmResult = normalizeSupplierExtraction(raw);
          r.llmPrice = llmResult.bidder_unit_price;
          r.llmCurrency = llmResult.currency_code;
          r.llmRequiresQuote = llmResult.requires_quote;
          r.llmSupplierName = llmResult.supplier_name;
          r.llmDescription = llmResult.bidder_description;
          r.llmDelivery = llmResult.delivery_time;
          r.llmEmail = llmResult.contact_email;
          r.llmPhone = llmResult.contact_phone;
          r.llmQty = llmResult.available_qty;
          r.llmCompliance = llmResult.compliance_deviation;
          r.llmNotes = llmResult.notes;
          r.llmSellingUnit = llmResult.selling_unit;
          r.llmPackSize = llmResult.pack_size;
        }
      } else if (RUN_L3 && canSkip) {
        // Use meta fields as LLM stand-in for name/desc, other fields blank
        r.llmRan = false; // skipped (B1)
      }
    } else if (!dead) {
      r.raw = rawSignals('');
    }

    // L4 — vision (fires when price still 0 and not dead)
    const priceAfterL3 =
      r.manualPrice > 0 ? r.manualPrice
      : r.structuredPrice > 0 ? r.structuredPrice
      : r.llmPrice;

    if (RUN_L4 && priceAfterL3 === 0 && !dead && isVisionEnabled()) {
      r.visionRan = true;
      const vision = await withTimeout(
        extractFromVision(html ?? '', row.source_url, []),
        L4_TIMEOUT_MS, { price: 0, currency: '' }, `#${row.id} L4`,
      );
      r.visionPrice = vision.price;
      r.visionCurrency = vision.currency;
    }

    // Build final merged row (production cascade)
    const final = buildFinalRow({
      manualPrice: r.manualPrice, manualCurrency,
      manualDelivery: r.manualDelivery, manualEmail: r.manualEmail,
      manualPhone: r.manualPhone, manualQty: r.manualQty,
      structuredPrice: r.structuredPrice, structuredCurrency: r.structuredCurrency,
      metaSupplierName: r.metaSupplierName, metaDescription: r.metaDescription,
      llm: llmResult,
      visionPrice: r.visionPrice, visionCurrency: r.visionCurrency,
      detectedQuoteRequest: r.detectedQuoteRequest, pageType: r.pageType,
    });

    r.finalPrice = final.price;
    r.finalCurrency = final.currency;
    r.finalTrack = final.track;
    r.finalRequiresQuote = final.requires_quote;
    r.finalSupplierName = final.supplier_name;
    r.finalDescription = final.bidder_description;
    r.finalDelivery = final.delivery_time;
    r.finalEmail = final.contact_email;
    r.finalPhone = final.contact_phone;
    r.finalQty = final.available_qty;
    r.finalCompliance = final.compliance_deviation;
    r.finalNotes = final.notes;
    r.finalSellingUnit = final.selling_unit;
    r.finalPackSize = final.pack_size;
    r.finalPageType = final.page_type;

    // Field-by-field diff against stored values
    r.diffs = [
      diffField('bidder_unit_price', dbPrice,              r.finalPrice),
      diffField('requires_quote',    row.requires_quote,   r.finalRequiresQuote),
      diffField('currency_code',     row.currency_code,    r.finalCurrency),
      diffField('page_type',         row.page_type,        r.finalPageType),
      diffField('supplier_name',     row.supplier_name,    r.finalSupplierName),
      diffField('bidder_description',row.bidder_description, r.finalDescription),
      diffField('contact_email',     row.contact_email,    r.finalEmail),
      diffField('contact_phone',     row.contact_phone,    r.finalPhone),
      diffField('delivery_time',     row.delivery_time,    r.finalDelivery),
      diffField('available_qty',     row.available_qty,    r.finalQty),
      diffField('compliance_deviation', row.compliance_deviation, r.finalCompliance),
      diffField('notes',             row.notes,            r.finalNotes),
      diffField('selling_unit',      row.selling_unit,     r.finalSellingUnit),
      diffField('pack_size',         row.pack_size,        r.finalPackSize),
    ];

    r.diffCount   = r.diffs.filter((d) => d.status === '≠' || d.status === '!' || d.status === '+').length;
    r.regressions = r.diffs.filter((d) => d.status === '!').length;

    // Verdict (extraction quality verdict, unchanged from original probe)
    if (r.liveStatus !== 'live' && r.finalPrice === 0 && !r.visionRan) {
      r.verdict = `FETCH_${r.liveStatus.toUpperCase()}`;
    } else if (r.finalPrice > 0) {
      r.verdict = `PRICE_${r.finalTrack.toUpperCase()}`;
    } else if (r.raw?.hasAnyPriceSignal) {
      r.verdict = 'EXTRACTION_MISS';
    } else if (r.finalRequiresQuote || r.raw?.quoteCta) {
      r.verdict = 'GENUINE_QUOTE_ONLY';
    } else {
      r.verdict = 'NO_PRICE_NO_SIGNAL';
    }
  } catch (err) {
    r.error = err instanceof Error ? err.message : String(err);
    r.verdict = 'PROBE_ERROR';
  }
  return r;
}

// ---- Console helpers -------------------------------------------------------
function pad(s: string | number, n: number) { return String(s).padEnd(n).slice(0, n); }

// Summarise diffs for one row as compact inline string: "≠currency_code +delivery_time ..."
function diffSummary(diffs: FieldDiff[]): string {
  return diffs
    .filter((d) => d.status !== '=' && d.status !== '?')
    .map((d) => `${d.status}${d.field}`)
    .join(' ') || '(all match or empty)';
}

async function main() {
  const rows: StatusRow[] = JSON.parse(readFileSync(STATUS_JSON, 'utf8'));
  console.log(`[probe] ${rows.length} URLs · L3=${RUN_L3} L4=${RUN_L4 && isVisionEnabled()} · ai-concurrency=${AI_CONCURRENCY}\n`);

  const limit = pLimit(AI_CONCURRENCY);
  const t0 = Date.now();
  const results = await Promise.all(rows.map((r) => limit(() => probe(r))));
  results.sort((a, b) => a.id - b.id);

  // ---- Summary table (compact, per-row) ------------------------------------
  console.log(
    pad('id', 3), pad('item', 4), pad('host', 24), pad('live', 7),
    pad('L1$', 8), pad('L2$', 8), pad('L3$', 8), pad('L4$', 8),
    pad('reqQ', 5), pad('verdict', 20), pad('Δ', 3), 'changed fields',
  );
  console.log('-'.repeat(160));

  for (const r of results) {
    console.log(
      pad(r.id, 3), pad(r.item_id, 4), pad(r.host, 24), pad(r.liveStatus, 7),
      pad(r.manualPrice || '·', 8), pad(r.structuredPrice || '·', 8),
      pad(r.llmRan ? (r.llmPrice || (r.llmRequiresQuote ? 'Q' : '0')) : '–', 8),
      pad(r.visionRan ? (r.visionPrice || '0') : '–', 8),
      pad(r.finalRequiresQuote ? 'yes' : '·', 5),
      pad(r.verdict, 20),
      pad(r.diffCount, 3),
      diffSummary(r.diffs),
    );
  }

  // ---- Verdict tally -------------------------------------------------------
  const tally: Record<string, number> = {};
  for (const r of results) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;
  console.log('\n[verdict tally]');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(k, 22)} ${v}`);
  }

  // ---- Field diff heatmap --------------------------------------------------
  const DIFF_FIELDS = [
    'bidder_unit_price', 'requires_quote', 'currency_code', 'page_type',
    'supplier_name', 'bidder_description', 'contact_email', 'contact_phone',
    'delivery_time', 'available_qty', 'compliance_deviation', 'notes',
    'selling_unit', 'pack_size',
  ];
  const fieldStats: Record<string, Record<string, number>> = {};
  for (const f of DIFF_FIELDS) fieldStats[f] = { '=': 0, '≠': 0, '+': 0, '!': 0, '?': 0 };

  for (const r of results) {
    for (const d of r.diffs) {
      if (fieldStats[d.field]) fieldStats[d.field][d.status] = (fieldStats[d.field][d.status] ?? 0) + 1;
    }
  }

  console.log(`\n[field-diff heatmap]  (n=${rows.length} rows)  = match · ≠ differ · + gained · ! regression · ? both empty`);
  console.log(pad('field', 22), pad('=', 5), pad('≠', 5), pad('+', 5), pad('!', 5), pad('?', 5));
  console.log('-'.repeat(52));
  for (const f of DIFF_FIELDS) {
    const s = fieldStats[f];
    console.log(pad(f, 22), pad(s['='], 5), pad(s['≠'], 5), pad(s['+'], 5), pad(s['!'], 5), pad(s['?'], 5));
  }

  // ---- Regression detail (fields marked '!') --------------------------------
  const regressionRows = results.filter((r) => r.regressions > 0);
  if (regressionRows.length > 0) {
    console.log(`\n[regressions — stored had value, probe extracted nothing]`);
    for (const r of regressionRows) {
      const regDiffs = r.diffs.filter((d) => d.status === '!');
      console.log(`  #${r.id} ${r.host}`);
      for (const d of regDiffs) {
        console.log(`    ${d.field}: stored="${d.stored}" → extracted="${d.extracted}"`);
      }
    }
  }

  // ---- Differ detail (fields marked '≠') ------------------------------------
  const differRows = results.filter((r) => r.diffs.some((d) => d.status === '≠'));
  if (differRows.length > 0) {
    console.log(`\n[differs — both have values but they changed]`);
    for (const r of differRows) {
      const diffs = r.diffs.filter((d) => d.status === '≠');
      console.log(`  #${r.id} ${r.host}`);
      for (const d of diffs) {
        const storedStr = String(d.stored).slice(0, 80);
        const extractedStr = String(d.extracted).slice(0, 80);
        console.log(`    ${d.field}:`);
        console.log(`      stored    = "${storedStr}"`);
        console.log(`      extracted = "${extractedStr}"`);
      }
    }
  }

  // ---- Layer recovery summary ----------------------------------------------
  const l3Wins = results.filter((r) => r.finalTrack === 'llm');
  const l4Wins = results.filter((r) => r.finalTrack === 'vision');
  console.log(`\n[layer recovery] L3 recovered price on ${l3Wins.length} page(s); L4 vision on ${l4Wins.length} page(s).`);
  for (const r of [...l3Wins, ...l4Wins]) {
    console.log(`  #${r.id} ${r.host} → ${r.finalTrack} ${r.finalPrice} ${r.finalCurrency}`);
  }

  // ---- Extraction miss list ------------------------------------------------
  const misses = results.filter((r) => r.verdict === 'EXTRACTION_MISS');
  if (misses.length) {
    console.log(`\n[EXTRACTION_MISS — price signal present but no layer recovered it]`);
    for (const r of misses) {
      console.log(`  #${r.id} ${r.host} · samples: ${r.raw?.currencyNumSamples.join(' | ') || '(structured)'}`);
    }
  }

  // ---- Overall diff summary ------------------------------------------------
  const totalDiffs   = results.reduce((s, r) => s + r.diffCount, 0);
  const totalRegs    = results.reduce((s, r) => s + r.regressions, 0);
  const totalGained  = results.reduce((s, r) => s + r.diffs.filter((d) => d.status === '+').length, 0);
  const totalDiffer  = results.reduce((s, r) => s + r.diffs.filter((d) => d.status === '≠').length, 0);
  const rowsChanged  = results.filter((r) => r.diffCount > 0).length;
  console.log(`\n[diff summary] ${rowsChanged}/${rows.length} rows have changes · total_changes=${totalDiffs} (differ=${totalDiffer} gained=${totalGained} regressions=${totalRegs})`);

  // ---- Write full dump -----------------------------------------------------
  writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));
  console.log(`\n[probe] done in ${((Date.now() - t0) / 1000).toFixed(1)}s · full dump → ${OUT_JSON}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
