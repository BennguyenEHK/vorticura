// Product page relevance scorer — weighted multi-layer classifier.

import { isLikelyProductPage, extractMicrodataPrice } from './html-gate';

// --- Spec input ---
// Local shape; avoids ai-agent import graph. Compatible with ParsedSpec.
export interface ScorerSpec {
  type?:         string;
  size?:         string;
  class?:        string;
  connection?:   string;
  material?:     string;
  bore?:         string;
  standard?:     string;
  model?:        string;
  manufacturer?: string;
}

/** Minimal snippet shape the scorer reads — subset of TavilySnippet. */
export interface ScorableSnippet {
  url: string;
  title?: string;
  snippet?: string;
  content?: string;
}

/**
 * Supplier-relevant fields the page appears to contain.
 * Cheap presence signals — drive the manual extractor, not scored.
 */
export interface DetectedFieldMap {
  has_price: boolean;
  has_currency: boolean;
  has_contact_email: boolean;
  has_contact_phone: boolean;
  has_stock: boolean;
  has_delivery: boolean;
  has_quote_request: boolean;
}

/** Scoring outcome: numeric score, keep decision, fired signals. */
export interface ScoreResult {
  score: number;
  kept: boolean;
  /** Signal tags that contributed — for telemetry/debugging. */
  signals: string[];
  /** Detected fields driving manual extraction. */
  detected: DetectedFieldMap;
}

// --- Tuning: signal weights + keep threshold ---
// A page is kept on any one strong signal:
//   schema.org Product (100), exact model (50),
//   product URL (20) + keyword (10) = 30, two spec matches = 30.
// Homepage (-100) or junk (-40) pushed well below threshold.
export const KEEP_THRESHOLD = 30;

const W = {
  SCHEMA: 100,          // schema.org Product / og:type=product
  MICRODATA_PRICE: 30,  // parseable microdata price
  MODEL: 50,            // exact RFQ model/part number match
  SPEC: 15,             // per parsed-spec field found
  URL_PRODUCT: 20,      // product-ish URL path segment
  PDF: 25,              // datasheet / catalog PDF
  TERM: 10,             // per procurement content keyword
  TERM_CAP: 40,         // ceiling on keyword contribution
  TRUSTED: 25,          // known industrial supplier domain
  URL_JUNK: -40,        // blog / news / about / login / cart
  DIRECTORY: -35,       // supplier directory / aggregator listing
  HOMEPAGE: -100,       // bare domain root — never a product page
} as const;

// Product-ish path segments (substring match, handles locale prefixes).
const PRODUCT_URL_PATTERNS = [
  '/product', '/products', '/item', '/items', '/sku', '/part', '/parts',
  '/catalog', '/catalogue', '/p/', '/pd/', '/dp/', '/shop', '/store', '/buy',
];

// Surfaces never a single sourceable product.
const JUNK_URL_PATTERNS = [
  '/blog', '/news', '/about', '/about-us', '/contact', '/login', '/signin',
  '/account', '/cart', '/checkout', '/careers', '/press', '/investor',
  '/company', '/corporate', '/media', '/gazette', '/forum', '/wiki',
  '/docs', '/support', '/search',
];

// Directory listings — negative weight, recoverable by strong signals.
const DIRECTORY_URL_PATTERNS = [
  '-suppliers', '/suppliers', '/supplier-', '/manufacturers', '/wholesale',
  'products-search', '/companies', '/directory', '/marketplace',
];

// Known aggregator/directory hostnames — whole domain is a listing surface.
const DIRECTORY_DOMAINS = [
  'alibaba.com', 'made-in-china.com', 'globalsources.com', 'indiamart.com',
  'thomasnet.com', 'tradeindia.com', 'ec21.com', 'go4worldbusiness.com',
];

// Plain-text procurement keywords (lowercased substring match).
const PRODUCT_TERMS = [
  'add to cart', 'request quote', 'request a quote', 'request a quotation',
  'get a quote', 'get quote', 'add to quote', 'datasheet', 'data sheet',
  'specification', 'part number', 'model no', 'in stock', 'lead time', 'moq',
];

// Known industrial supplier domains — strong trust signal.
const TRUSTED_SUPPLIERS = [
  'emerson.com', 'flowserve.com', 'cranefs.com', 'swagelok.com', 'valin.com',
  'mrcglobal.com', 'kitz.com', 'parker.com', 'spiraxsarco.com', 'samson.de',
];

/** Strip to [a-z0-9] so "Z41H-16C" and "z41h 16c" compare equal. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// --- Detected-field signals ---
// Cheap presence checks — NOT scored. Tell extractor which fields to hunt.
const DET_PRICE = /(?:USD|EUR|GBP|VND|SGD|MYR|THB|IDR|CNY|JPY|AUD|[$€£¥])\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:USD|EUR|GBP|VND|SGD|MYR|THB|IDR|CNY|JPY|AUD)/i;
const DET_CURRENCY = /(?:USD|EUR|GBP|VND|SGD|MYR|THB|IDR|CNY|JPY|AUD|[$€£¥])/i;
// Standard address OR obfuscated [at]/(at) variant used by B2B sites.
const DET_EMAIL =
  /[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,24}|[a-z0-9._%+-]{1,64}\s*(?:\[at\]|\(at\)|(?<!\w)at(?!\w))\s*[a-z0-9.-]{1,253}/i;
// Covers telephone, mobile, fax, whatsapp, wechat, contact, direct.
const DET_PHONE =
  /(?:tel(?:ephone)?|phone|call|hotline|mobile|cell(?:phone)?|fax|whatsapp|wechat|contact|direct(?:\s+line)?|\+?\d)[\s:]*\+?\d[\d\s().-]{6,18}\d/i;
const DET_STOCK = /\bin\s+stock\b|\bavailable\s+(?:now|to\s+ship|to\s+order|in\s+stock|for\s+(?:immediate\s+)?(?:shipment|delivery|order|dispatch)|qty|quantity)\b|\bstock\s*[:=]|\bavailability\s*[:=]/i;
const DET_DELIVERY = /\blead\s*time\b|\bdelivery\b|\bships?\s+in\b|\b\d+\s*(?:day|days|week|weeks|month|months)\b/i;
const DET_QUOTE = /request\s+a?\s*quote|request\s+for\s+quotation|get\s+a\s+quote|contact\s+for\s+price|price\s+on\s+request|\brfq\b/i;

/** All-false detected map for early-return paths. */
const EMPTY_DETECTED: DetectedFieldMap = {
  has_price: false, has_currency: false, has_contact_email: false,
  has_contact_phone: false, has_stock: false, has_delivery: false,
  has_quote_request: false,
};

/** Scan lowercased text and return detected-field map. */
function detectFields(text: string): DetectedFieldMap {
  return {
    has_price: DET_PRICE.test(text),
    has_currency: DET_CURRENCY.test(text),
    has_contact_email: DET_EMAIL.test(text),
    has_contact_phone: DET_PHONE.test(text),
    has_stock: DET_STOCK.test(text),
    has_delivery: DET_DELIVERY.test(text),
    has_quote_request: DET_QUOTE.test(text),
  };
}

export type PageType = 'product' | 'tech_spec';

/**
 * Classify page: 'tech_spec' for PDF/datasheet/catalog, 'product' otherwise.
 * Deterministic, never throws.
 */
export function classifyPage(snippet: ScorableSnippet): PageType {
  const url = (snippet.url || '').toLowerCase();
  if (/\.pdf(?:[?#]|$)/i.test(url)) return 'tech_spec';
  // Datasheet/catalog signal in URL or text → tech-spec doc.
  const docSignal = /datasheet|data\s+sheet|catalogue|catalog|spec\s*sheet/i;
  if (docSignal.test(url)) return 'tech_spec';
  const content = `${snippet.title || ''} ${snippet.content || snippet.snippet || ''}`.toLowerCase();
  if (docSignal.test(content)) return 'tech_spec';
  return 'product';
}

/**
 * Score a snippet against the RFQ spec. Higher = more likely a product page.
 * `kept` is true when score >= KEEP_THRESHOLD.
 * Deterministic and side-effect-free. Never throws.
 */
export function scoreProductPage(snippet: ScorableSnippet, spec: ScorerSpec = {}): ScoreResult {
  const signals: string[] = [];
  let score = 0;

  const url = snippet.url || '';
  if (!url) return { score: 0, kept: false, signals, detected: EMPTY_DETECTED };

  let path: string;
  let host: string;
  try {
    const u = new URL(url);
    path = u.pathname.toLowerCase();
    host = u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return { score: 0, kept: false, signals, detected: EMPTY_DETECTED };
  }

  const rawContent = snippet.content || '';
  const text = `${snippet.title || ''} ${snippet.snippet || ''} ${rawContent}`.slice(0, 16384);
  const lower = text.toLowerCase();
  const normText = norm(text);
  const normUrl = norm(url);

  // ---- Layer 1: URL pattern ----
  if (path.length <= 1) {
    score += W.HOMEPAGE;
    signals.push('url:homepage');
  }
  if (JUNK_URL_PATTERNS.some((p) => path.startsWith(p) || path.includes(p + '/'))) {
    score += W.URL_JUNK;
    signals.push('url:junk');
  }
  if (PRODUCT_URL_PATTERNS.some((p) => path.includes(p))) {
    score += W.URL_PRODUCT;
    signals.push('url:product');
  }
  if (path.endsWith('.pdf')) {
    score += W.PDF;
    signals.push('url:pdf');
  }
  // Negative but recoverable — exact model match (+50) can pull above threshold.
  if (
    DIRECTORY_DOMAINS.some((d) => host === d || host.endsWith('.' + d)) ||
    DIRECTORY_URL_PATTERNS.some((p) => path.includes(p))
  ) {
    score += W.DIRECTORY;
    signals.push('url:directory');
  }

  // ---- Layer 5: schema.org / microdata (strongest deterministic signal) ----
  // isLikelyProductPage only matches raw HTML; Tavily often returns cleaned text.
  if (rawContent.includes('<') && isLikelyProductPage(rawContent)) {
    score += W.SCHEMA;
    signals.push('schema:product');
  }
  if (extractMicrodataPrice(rawContent)) {
    score += W.MICRODATA_PRICE;
    signals.push('microdata:price');
  }

  // ---- Layer 3: exact model / part-number match ----
  if (spec.model) {
    const nm = norm(spec.model);
    // Require >=3 chars so short tokens don't false-match.
    if (nm.length >= 3 && (normText.includes(nm) || normUrl.includes(nm))) {
      score += W.MODEL;
      signals.push('model:exact');
    }
  }

  // ---- Layer 4: specification density ----
  let specHits = 0;
  for (const key of ['type', 'size', 'class', 'connection', 'material', 'bore', 'standard', 'manufacturer'] as const) {
    const v = spec[key];
    if (v && v.trim() && lower.includes(v.trim().toLowerCase())) specHits += 1;
  }
  if (specHits > 0) {
    score += specHits * W.SPEC;
    signals.push(`spec:${specHits}`);
  }

  // ---- Layer 2: content keywords ----
  let termHits = 0;
  for (const t of PRODUCT_TERMS) if (lower.includes(t)) termHits += 1;
  if (termHits > 0) {
    score += Math.min(termHits * W.TERM, W.TERM_CAP);
    signals.push(`terms:${termHits}`);
  }

  // ---- Layer 7: trusted supplier domain ----
  if (TRUSTED_SUPPLIERS.some((d) => host === d || host.endsWith('.' + d))) {
    score += W.TRUSTED;
    signals.push('domain:trusted');
  }

  return { score, kept: score >= KEEP_THRESHOLD, signals, detected: detectFields(lower) };
}
