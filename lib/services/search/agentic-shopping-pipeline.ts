import pLimit from 'p-limit';
import { serperShoppingSearch } from './serper-shopping';
import { fillShoppingMetadata, type EnrichedSource } from './fill-shopping-metadata';
import { fetchAsMarkdown } from './fetch-markdown';
import { reviewAttempt } from './shopping-review';
import { callModel, extractJson, QWEN_MODEL } from '@/lib/ai-agent/qwen-client';
import { PLAN_SINGLE_QUERY_PROMPT, buildPlanSingleQueryMessage } from '@/lib/ai-agent/prompt/plan-queries';
import type { AgentItemSummary } from '@/types/preview';

export type { EnrichedSource };

const TARGET_SOURCES = 3;
const MAX_ATTEMPTS = 5;

interface SearchContext {
  triedQueries: string[];
  lastQueryHint: string | null;
  researchAttempt: number;
}

const PRICE_RE = /(?:AU\$|CA\$|NZ\$|SG\$|US\$|USD|AUD|EUR|GBP|SGD|[$€£¥])\s*[\d,.]{1,12}|[\d,.]{1,12}\s*(?:USD|AUD|EUR|GBP|SGD)/gi;
const IN_STOCK_RE = /\b(in\s+stock|available(?!\s+soon)|ships?\s+(?:now|today)|ready\s+to\s+ship)\b/i;
const OUT_OF_STOCK_RE = /\b(out\s+of\s+stock|unavailable|discontinued|sold\s+out)\b/i;
const UNIT_RE = /\b(pack\s+of\s+\d+|box\s+of\s+\d+|each|per\s+unit|single)\b/i;
const MANUFACTURER_RE = /\b(?:brand|manufacturer|made\s+by)\s*:?\s*([A-Z][a-zA-Z0-9&\s\-]{1,35}?)(?=\s*[-,.|(\n]|$)/m;
const ORIGIN_RE = /(?:made\s+in|country\s+of\s+origin\s*:?\s*|manufactured\s+in)\s*([A-Z][a-zA-Z\s]{2,24}?)(?=\s*[-.,\n]|$)/mi;
const EMAIL_RE = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/;
const PHONE_RE = /(?:\+?\d[\d\s\-().]{6,}\d)/;
const SOCIAL_RE = /https?:\/\/(?:www\.)?(?:facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com)\/[^\s"')>]+/i;
const DELIVERY_RE = /\b(?:ships?\s+in|delivers?\s+in|delivery\s+(?:in|within)|dispatch(?:es)?\s+in|estimated\s+delivery\s*:?)\s*(\d+(?:\s*[-–]\s*\d+)?\s*(?:business\s+)?days?|\d+\s*(?:–|-)\s*\d+\s*weeks?)\b/i;

void PRICE_RE; // declared for completeness, not used directly in extraction

function extractFieldsFromMarkdown(text: string): Partial<Pick<EnrichedSource, 'in_stock' | 'unit' | 'manufacturer' | 'items_origin' | 'contact_email' | 'contact_phone' | 'social_contact' | 'delivery_days'>> {
  const result: Partial<Pick<EnrichedSource, 'in_stock' | 'unit' | 'manufacturer' | 'items_origin' | 'contact_email' | 'contact_phone' | 'social_contact' | 'delivery_days'>> = {};
  if (OUT_OF_STOCK_RE.test(text)) result.in_stock = false;
  else if (IN_STOCK_RE.test(text)) result.in_stock = true;
  const unitMatch = text.match(UNIT_RE);
  if (unitMatch) result.unit = unitMatch[1];
  const mfgMatch = text.match(MANUFACTURER_RE);
  if (mfgMatch) result.manufacturer = mfgMatch[1].trim();
  const originMatch = text.match(ORIGIN_RE);
  if (originMatch) result.items_origin = originMatch[1].trim();
  const emailMatch = text.match(EMAIL_RE);
  if (emailMatch) result.contact_email = emailMatch[0];
  const phoneMatch = text.match(PHONE_RE);
  if (phoneMatch) result.contact_phone = phoneMatch[0].trim();
  const socialMatch = text.match(SOCIAL_RE);
  if (socialMatch) result.social_contact = socialMatch[0];
  const deliveryMatch = text.match(DELIVERY_RE);
  if (deliveryMatch) result.delivery_days = deliveryMatch[0].trim();
  return result;
}

function deduplicate(sources: EnrichedSource[]): EnrichedSource[] {
  const seen = new Map<string, EnrichedSource>();
  for (const s of sources) {
    const key = s.source.toLowerCase();
    const existing = seen.get(key);
    if (!existing || s.price < existing.price) seen.set(key, s);
  }
  return Array.from(seen.values());
}

async function planNextQuery(
  itemDescription: string,
  agentItemSummary: AgentItemSummary | null,
  ctx: SearchContext,
): Promise<string> {
  const fallback = `${itemDescription.slice(0, 80)} price buy`;
  try {
    const raw = await callModel({
      model: QWEN_MODEL,
      enable_thinking: true,
      budget_tokens: 2048,
      temperature: ctx.triedQueries.length > 0 ? 0.4 : 0.2,
      messages: [
        { role: 'system', content: PLAN_SINGLE_QUERY_PROMPT },
        { role: 'user', content: buildPlanSingleQueryMessage(itemDescription, agentItemSummary, ctx) },
      ],
    });
    const result = extractJson<{ queries?: string[] }>(raw);
    const q = result?.queries?.[0];
    return typeof q === 'string' && q.trim().length > 0 ? q.trim() : fallback;
  } catch {
    return fallback;
  }
}

async function enrichWithMarkdown(source: EnrichedSource): Promise<EnrichedSource> {
  if (source._enriched) return source;
  const pageUrl = source.product_page_url ?? source.directUrl;
  if (!pageUrl) return { ...source, _enriched: true };
  const fetched = await fetchAsMarkdown(pageUrl);
  if (!fetched) return { ...source, _enriched: true };
  const fields = extractFieldsFromMarkdown(fetched.markdown);
  return {
    ...source,
    in_stock: source.in_stock ?? fields.in_stock ?? null,
    unit: source.unit ?? fields.unit ?? null,
    manufacturer: source.manufacturer ?? fields.manufacturer ?? null,
    items_origin: source.items_origin ?? fields.items_origin ?? null,
    contact_email: source.contact_email ?? fields.contact_email ?? null,
    contact_phone: source.contact_phone ?? fields.contact_phone ?? null,
    social_contact: source.social_contact ?? fields.social_contact ?? null,
    delivery_days: source.delivery_days ?? fields.delivery_days ?? null,
    _enriched: true,
  };
}

export async function agenticShoppingPipeline(
  itemDescription: string,
  agentItemSummary: AgentItemSummary | null,
  runId?: string,
): Promise<{
  sources: EnrichedSource[];
  rejected: Array<EnrichedSource & { reason: string }>;
  attempts: number;
}> {
  void runId;
  const ctx: SearchContext = { triedQueries: [], lastQueryHint: null, researchAttempt: 0 };
  let allSources: EnrichedSource[] = [];
  const allRejected: Array<EnrichedSource & { reason: string }> = [];
  let attempt = 0;

  while (true) {
    const query = await planNextQuery(itemDescription, agentItemSummary, ctx);
    ctx.triedQueries.push(query);
    console.log(`[shopping-pipeline] attempt=${attempt + 1} query="${query.slice(0, 80)}"`);

    const rawItems = await serperShoppingSearch(query).catch(err => {
      console.error('[shopping-pipeline] Serper failed:', err instanceof Error ? err.message : err);
      return [];
    });

    const filled = await fillShoppingMetadata(rawItems, itemDescription);
    const enriched: EnrichedSource[] = filled.map(f => ({ ...f, unit: null }));
    allSources = deduplicate([...allSources, ...enriched]);

    const limit = pLimit(3);
    allSources = await Promise.all(allSources.map(s => limit(() => enrichWithMarkdown(s))));

    const { sufficient, retained, rejected, nextQueryHint } = await reviewAttempt(
      allSources,
      itemDescription,
      { triedQueries: ctx.triedQueries, researchAttempt: ctx.researchAttempt },
    );
    allSources = retained;
    allRejected.push(...rejected);
    ctx.lastQueryHint = nextQueryHint;
    ctx.researchAttempt = attempt;

    if (sufficient) break;
    if (attempt + 1 >= MAX_ATTEMPTS) break;
    attempt++;
  }

  return { sources: allSources, rejected: allRejected, attempts: attempt + 1 };
}
