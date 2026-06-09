import { fetchAsMarkdown } from './fetch-markdown';
import { callModel, extractJson, QWEN_MODEL } from '@/lib/ai-agent/qwen-client';
import {
  FILL_SHOPPING_METADATA_PROMPT,
  buildFillShoppingMetadataMessage,
} from '@/lib/ai-agent/prompt/fill-shopping-metadata';
import type { ShoppingItem } from './serper-shopping';

export interface FilledShoppingItem extends ShoppingItem {
  directUrl: string;
  manufacturer: string | null;
  itemDescription: string | null;
  in_stock: boolean | null;
  items_origin: string | null;
}

export interface EnrichedSource extends FilledShoppingItem {
  unit: string | null;
  _enriched?: boolean;
}

const META_FIELDS = ['manufacturer', 'itemDescription', 'in_stock', 'items_origin'] as const;
type MetaField = typeof META_FIELDS[number];

interface MetaPatch {
  manufacturer?: string | null;
  itemDescription?: string | null;
  in_stock?: boolean | null;
  items_origin?: string | null;
}

async function qwenGapFill(
  missingFields: string[],
  url: string,
  content: string,
): Promise<MetaPatch> {
  const raw = await callModel({
    model: QWEN_MODEL,
    enable_thinking: false,
    temperature: 0.1,
    max_tokens: 512,
    messages: [
      { role: 'system', content: FILL_SHOPPING_METADATA_PROMPT },
      { role: 'user', content: buildFillShoppingMetadataMessage(missingFields, url, content) },
    ],
  });
  return extractJson<MetaPatch>(raw) ?? {};
}

function significantWords(s: string): string[] {
  return s.toLowerCase().split(/\s+/).filter(w => w.length > 3);
}

function shouldDiscard(filled: FilledShoppingItem, itemDescription: string): boolean {
  if (!filled.itemDescription) return false;
  const descWords = new Set(significantWords(filled.itemDescription));
  const itemWords = significantWords(itemDescription);
  if (itemWords.length === 0) return false;
  return itemWords.every(w => !descWords.has(w));
}

async function fillOne(
  item: ShoppingItem,
  itemDescription: string,
): Promise<FilledShoppingItem | null> {
  const fetched = await fetchAsMarkdown(item.link);

  const filled: FilledShoppingItem = {
    ...item,
    directUrl: fetched?.finalUrl ?? item.link,
    manufacturer: null,
    itemDescription: null,
    in_stock: null,
    items_origin: null,
  };

  if (fetched) {
    const missing = META_FIELDS.filter(f => filled[f] == null) as MetaField[];
    if (missing.length > 0) {
      const patch = await qwenGapFill(missing as string[], filled.directUrl, fetched.markdown);
      if (patch.manufacturer != null) filled.manufacturer = patch.manufacturer;
      if (patch.itemDescription != null) filled.itemDescription = patch.itemDescription;
      if (patch.in_stock != null) filled.in_stock = patch.in_stock;
      if (patch.items_origin != null) filled.items_origin = patch.items_origin;
    }
  }

  if (shouldDiscard(filled, itemDescription)) return null;
  return filled;
}

export async function fillShoppingMetadata(
  items: ShoppingItem[],
  itemDescription: string,
): Promise<FilledShoppingItem[]> {
  const BATCH = 5;
  const results: FilledShoppingItem[] = [];
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map(item => fillOne(item, itemDescription)));
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value !== null) results.push(s.value);
    }
  }
  return results;
}
