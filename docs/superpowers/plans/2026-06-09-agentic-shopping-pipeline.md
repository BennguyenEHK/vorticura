# Agentic Shopping Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution model:** Team agents run Phases 1A/1B/1C/1E in **parallel** (disjoint file sets). Phase 2 runs **after** 1A and 1B complete.

**Goal:** Replace Tavily/Firecrawl/density-loop supplier search with a Serper-shopping agentic loop powered by Qwen/Qwen3.6-35B-A3B via featherless-ai, while globally switching all AI calls across the app to Qwen3.6.

**Architecture:** `agenticShoppingPipeline()` replaces `gatherSourcesForItemParallel()` at a single call site in `supplier-search-actions.ts`. The loop runs `planNextQuery → serperShoppingSearch → fillShoppingMetadata (fetch+qwenGapFill) → dedup → enrichWithMarkdown → reviewAttempt` until `sufficient=true` or MAX_ATTEMPTS. All other AI calls (email, RFQ analysis, quotation) switch to Qwen3.6 transparently via `ai-router.ts` delegation to `qwen-client.ts`.

**Tech Stack:** Qwen/Qwen3.6-35B-A3B:featherless-ai (HF primary, RunPod fallback), Serper.dev shopping API, cheerio + turndown (HTML→markdown), p-limit (concurrency), vitest (unit tests)

---

## File Map

| Action | File |
|--------|------|
| CREATE | `lib/ai-agent/qwen-client.ts` |
| MODIFY | `lib/ai-agent/ai-router.ts` |
| DELETE | `lib/ai-agent/hf-client.ts` |
| DELETE | `lib/ai-agent/local-model.ts` |
| CREATE | `lib/services/search/serper-shopping.ts` |
| CREATE | `lib/services/search/fetch-markdown.ts` |
| CREATE | `lib/services/search/fill-shopping-metadata.ts` |
| CREATE | `lib/services/search/shopping-review.ts` |
| CREATE | `lib/services/search/agentic-shopping-pipeline.ts` |
| MODIFY | `lib/ai-agent/prompt/plan-queries.ts` |
| CREATE | `lib/ai-agent/prompt/fill-shopping-metadata.ts` |
| CREATE | `lib/ai-agent/prompt/shopping-review.ts` |
| MODIFY | `lib/actions/supplier-search-actions.ts` |
| MODIFY | `lib/services/search/index.ts` |
| DELETE | `lib/services/search/density-loop.ts` |
| DELETE | `lib/services/search/tavily-client.ts` |
| DELETE | `lib/services/search/firecrawl-client.ts` |
| DELETE | `lib/services/search/budget.ts` |
| DELETE | `lib/services/search/vision-extract.ts` |
| DELETE | `lib/services/search/manual-extract.ts` |
| DELETE | `lib/services/search/html-gate.ts` |
| DELETE | `lib/services/search/product-page-scorer.ts` |
| DELETE | `lib/services/search/eliminate.ts` |

---

## Phase 1A — Agent A: Global Qwen Client (runs in parallel with 1B, 1C, 1E)

### Task 1: Create `lib/ai-agent/qwen-client.ts`

**Files:**
- Create: `lib/ai-agent/qwen-client.ts`
- Create: `tests/test_unit/qwen-client.test.ts`

- [ ] **Step 1: Write failing tests for pure functions**

```typescript
// tests/test_unit/qwen-client.test.ts
import { describe, it, expect } from 'vitest';
import { stripThinking, extractThinking, extractJson } from '@/lib/ai-agent/qwen-client';

describe('stripThinking', () => {
  it('removes think blocks', () => {
    expect(stripThinking('<think>reasoning here</think>{"a":1}')).toBe('{"a":1}');
  });
  it('passes through text with no think block', () => {
    expect(stripThinking('{"a":1}')).toBe('{"a":1}');
  });
});

describe('extractThinking', () => {
  it('splits thinking from answer', () => {
    const { thinking, text } = extractThinking('<think>step 1</think>{"ok":true}');
    expect(thinking).toBe('step 1');
    expect(text).toBe('{"ok":true}');
  });
  it('returns null thinking when no block', () => {
    const { thinking, text } = extractThinking('{"ok":true}');
    expect(thinking).toBeNull();
    expect(text).toBe('{"ok":true}');
  });
});

describe('extractJson', () => {
  it('parses clean JSON', () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips think block then parses', () => {
    expect(extractJson<{ a: number }>('<think>x</think>{"a":1}')).toEqual({ a: 1 });
  });
  it('handles markdown fences', () => {
    expect(extractJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('returns null on garbage', () => {
    expect(extractJson('not json at all')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run tests/test_unit/qwen-client.test.ts
```
Expected: FAIL with "Cannot find module '@/lib/ai-agent/qwen-client'"

- [ ] **Step 3: Create `lib/ai-agent/qwen-client.ts`**

```typescript
// lib/ai-agent/qwen-client.ts
export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallModelParams {
  model?: string;
  messages: ModelMessage[];
  enable_thinking?: boolean;
  budget_tokens?: number;
  temperature?: number;
  max_tokens?: number;
}

export const QWEN_MODEL = 'Qwen/Qwen3.6-35B-A3B:featherless-ai';
const HF_BASE_URL = 'https://router.huggingface.co/v1/chat/completions';

export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export function extractThinking(raw: string): { thinking: string | null; text: string } {
  const match = raw.match(/<think>([\s\S]*?)<\/think>/);
  return {
    thinking: match ? match[1].trim() : null,
    text: raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
  };
}

export function extractJson<T>(raw: string): T | null {
  const cleaned = stripThinking(raw).trim();
  try { return JSON.parse(cleaned) as T; } catch { /* fall through */ }
  const noFence = cleaned.replace(/```(?:json)?/gi, '');
  const start = noFence.indexOf('{');
  const end = noFence.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(noFence.slice(start, end + 1)) as T; } catch { /* fall through */ }
  }
  return null;
}

function buildRawContent(msg: {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
}): string {
  const content = msg.content ?? '';
  const reasoning = msg.reasoning_content ?? msg.reasoning ?? null;
  if (reasoning && !content.includes('<think>')) return `<think>${reasoning}</think>${content}`;
  return content;
}

async function tryRunPod(payload: Record<string, unknown>): Promise<string | null> {
  const url = process.env.RUNPOD_REASONING_URL;
  if (!url) return null;
  const rpModel = process.env.RUNPOD_REASONING_MODEL;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.RUNPOD_API_KEY) headers.Authorization = `Bearer ${process.env.RUNPOD_API_KEY}`;
  const res = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...payload, ...(rpModel ? { model: rpModel } : {}) }),
    signal: AbortSignal.timeout(Number(process.env.RUNPOD_TIMEOUT_MS ?? 90_000)),
  });
  if (!res.ok) throw new Error(`RunPod HTTP ${res.status}`);
  const data = await res.json() as {
    choices?: { message: { content?: string | null; reasoning_content?: string | null } }[];
  };
  const msg = data.choices?.[0]?.message;
  return msg ? buildRawContent(msg) : null;
}

async function getModelContent(params: CallModelParams): Promise<string> {
  const {
    model = QWEN_MODEL,
    messages,
    enable_thinking = false,
    budget_tokens = 8000,
    temperature = 0.1,
    max_tokens = 1024,
  } = params;

  // CRITICAL: always send explicit enable_thinking — Qwen3.6 defaults thinking ON.
  // Omitting it on "non-thinking" calls causes the model to consume max_tokens on
  // the reasoning chain and truncate the JSON response.
  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: Math.min(enable_thinking ? budget_tokens : max_tokens, 4096),
    chat_template_kwargs: { enable_thinking },
  };

  const hfToken = process.env.HF_TOKEN ?? process.env.HF_API_KEY;
  const hfUrl = process.env.HF_BASE_URL ?? HF_BASE_URL;
  try {
    const res = await fetch(hfUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hfToken}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(enable_thinking ? 290_000 : 60_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`HF HTTP ${res.status}${errBody ? ` — ${errBody.slice(0, 200)}` : ''}`);
    }
    const data = await res.json() as {
      choices?: { message: { content?: string | null; reasoning_content?: string | null } }[];
    };
    if (data.choices?.[0]) return buildRawContent(data.choices[0].message);
    throw new Error('HF returned no choices');
  } catch (err) {
    console.error('[qwen-client] HF failed → RunPod fallback:', err instanceof Error ? err.message : err);
  }

  const rpResult = await tryRunPod(payload);
  if (rpResult) return rpResult;
  throw new Error(`Qwen inference failed — both HF and RunPod unavailable`);
}

export async function callModel(params: CallModelParams): Promise<string> {
  return stripThinking(await getModelContent(params));
}

export async function callQwen(
  messages: ModelMessage[],
  opts?: { thinking?: boolean; budgetTokens?: number; temperature?: number; maxTokens?: number },
): Promise<{ text: string; thinking: string | null }> {
  const raw = await getModelContent({
    model: QWEN_MODEL,
    messages,
    enable_thinking: opts?.thinking ?? false,
    budget_tokens: opts?.budgetTokens,
    temperature: opts?.temperature,
    max_tokens: opts?.maxTokens,
  });
  return extractThinking(raw);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run tests/test_unit/qwen-client.test.ts
```
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ai-agent/qwen-client.ts tests/test_unit/qwen-client.test.ts
git commit -m "feat(ai): add qwen-client.ts — Qwen3.6 via HF featherless-ai + RunPod fallback"
```

---

### Task 2: Update `lib/ai-agent/ai-router.ts` to delegate to `callQwen`

**Files:**
- Modify: `lib/ai-agent/ai-router.ts`

- [ ] **Step 1: Replace ai-router.ts content**

Replace the entire file with:

```typescript
// lib/ai-agent/ai-router.ts
import { callQwen, extractJson, type ModelMessage } from './qwen-client';

/**
 * Unified chat completion — delegates to Qwen3.6 via qwen-client.ts.
 * All callers (email, RFQ analysis, quotation, thread AI) pick up Qwen3.6
 * automatically. The schema param is accepted for backward compatibility but
 * ignored — Qwen uses prompt-based JSON formatting.
 */
export async function aiChatCompletion<T>(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1024,
  _schema?: object,
): Promise<T> {
  const messages: ModelMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
  const { text } = await callQwen(messages, { thinking: false, maxTokens });
  const parsed = extractJson<T>(text);
  if (parsed === null) {
    throw new Error(`[ai-router] Failed to parse JSON from Qwen response: ${text.slice(0, 200)}`);
  }
  return parsed;
}
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```
Expected: 0 errors (hf-client and local-model imports now gone from ai-router)

- [ ] **Step 3: Commit**

```bash
git add lib/ai-agent/ai-router.ts
git commit -m "feat(ai): delegate aiChatCompletion to Qwen3.6 via qwen-client"
```

---

## Phase 1B — Agent B: New Search Service Files (parallel with 1A, 1C, 1E)

### Task 3: Create `lib/services/search/serper-shopping.ts`

**Files:**
- Create: `lib/services/search/serper-shopping.ts`
- Create: `tests/test_unit/serper-shopping.test.ts`

- [ ] **Step 1: Write failing tests for pure parsing functions**

```typescript
// tests/test_unit/serper-shopping.test.ts
import { describe, it, expect } from 'vitest';
import { parseShoppingPrice, parseShoppingItem } from '@/lib/services/search/serper-shopping';

describe('parseShoppingPrice', () => {
  it('parses USD dollar sign', () => {
    expect(parseShoppingPrice('$49.99')).toEqual({ price: 49.99, currency: 'USD' });
  });
  it('parses Vietnamese dong', () => {
    expect(parseShoppingPrice('₫37,084')).toEqual({ price: 37084, currency: 'VND' });
  });
  it('parses EUR', () => {
    expect(parseShoppingPrice('€12.50')).toEqual({ price: 12.50, currency: 'EUR' });
  });
  it('parses ISO prefix', () => {
    expect(parseShoppingPrice('AUD 89.50')).toEqual({ price: 89.50, currency: 'AUD' });
  });
  it('returns null for empty string', () => {
    expect(parseShoppingPrice('')).toBeNull();
  });
  it('returns null for non-numeric', () => {
    expect(parseShoppingPrice('call for price')).toBeNull();
  });
});

describe('parseShoppingItem', () => {
  it('maps a valid item', () => {
    const result = parseShoppingItem({
      title: 'M8 Hex Nut',
      source: 'Bolt Depot',
      link: 'https://google.com/shopping/redirect',
      price: '$2.99',
    });
    expect(result).toMatchObject({ source: 'Bolt Depot', price: 2.99, currency: 'USD' });
  });
  it('returns null when price is missing', () => {
    expect(parseShoppingItem({ title: 'X', source: 'Y', link: 'Z', price: '' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run tests/test_unit/serper-shopping.test.ts
```
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create `lib/services/search/serper-shopping.ts`**

```typescript
// lib/services/search/serper-shopping.ts
export interface ShoppingItem {
  title: string;
  source: string;
  link: string;
  price: number;
  currency: string;
  imageUrl?: string;
}

const SYMBOL_MAP: Array<[string, string]> = [
  ['AU$', 'AUD'], ['CA$', 'CAD'], ['NZ$', 'NZD'], ['SG$', 'SGD'], ['US$', 'USD'],
  ['$', 'USD'], ['€', 'EUR'], ['£', 'GBP'], ['¥', 'JPY'], ['₫', 'VND'],
];

export function parseShoppingPrice(raw: string): { price: number; currency: string } | null {
  if (!raw?.trim()) return null;
  const upper = raw.toUpperCase();
  for (const [sym, cur] of SYMBOL_MAP) {
    if (!upper.includes(sym.toUpperCase())) continue;
    const numStr = raw
      .replace(new RegExp(sym.replace(/[$]/g, '\\$'), 'gi'), '')
      .replace(/,/g, '')
      .trim();
    const price = parseFloat(numStr);
    if (isFinite(price) && price > 0) return { price, currency: cur };
  }
  const codeMatch = raw.match(/^(USD|AUD|EUR|GBP|SGD|CAD|NZD|VND)\s*([\d,.]+)/i);
  if (codeMatch) {
    const price = parseFloat(codeMatch[2].replace(/,/g, ''));
    if (isFinite(price) && price > 0) return { price, currency: codeMatch[1].toUpperCase() };
  }
  return null;
}

interface RawItem { title?: string; source?: string; link?: string; price?: string; imageUrl?: string }

export function parseShoppingItem(item: RawItem): ShoppingItem | null {
  const parsed = parseShoppingPrice(item.price ?? '');
  if (!parsed) return null;
  return {
    title: item.title ?? '',
    source: item.source ?? '',
    link: item.link ?? '',
    price: parsed.price,
    currency: parsed.currency,
    imageUrl: item.imageUrl,
  };
}

export async function serperShoppingSearch(query: string): Promise<ShoppingItem[]> {
  if (!query.trim()) return [];
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error('SERPER_API_KEY is not set');
  const res = await fetch('https://google.serper.dev/shopping', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query.trim(), num: 10 }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Serper shopping failed: ${res.status} ${res.statusText}`);
  const data = await res.json() as { shopping?: RawItem[] };
  return (data.shopping ?? [])
    .map(parseShoppingItem)
    .filter((item): item is ShoppingItem => item !== null);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run tests/test_unit/serper-shopping.test.ts
```
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/search/serper-shopping.ts tests/test_unit/serper-shopping.test.ts
git commit -m "feat(search): add serper-shopping.ts — shopping search client with price parser"
```

---

### Task 4: Create `lib/services/search/fetch-markdown.ts`

**Files:**
- Create: `lib/services/search/fetch-markdown.ts`
- Create: `tests/test_unit/fetch-markdown.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/test_unit/fetch-markdown.test.ts
import { describe, it, expect } from 'vitest';
import { cleanHtmlToMarkdown, FETCH_MARKDOWN_MAX_CHARS } from '@/lib/services/search/fetch-markdown';

describe('cleanHtmlToMarkdown', () => {
  it('strips nav and script tags', () => {
    const html = '<html><body><nav>menu</nav><main><p>Product price $9.99</p></main><script>alert(1)</script></body></html>';
    const md = cleanHtmlToMarkdown(html);
    expect(md).toContain('Product price');
    expect(md).not.toContain('menu');
    expect(md).not.toContain('alert');
  });
  it('caps output at FETCH_MARKDOWN_MAX_CHARS', () => {
    const html = `<body><p>${'x'.repeat(20000)}</p></body>`;
    const md = cleanHtmlToMarkdown(html);
    expect(md.length).toBeLessThanOrEqual(FETCH_MARKDOWN_MAX_CHARS);
  });
  it('prefers main content over body', () => {
    const html = '<body><aside>sidebar</aside><main><p>main content</p></main></body>';
    const md = cleanHtmlToMarkdown(html);
    expect(md).toContain('main content');
    expect(md).not.toContain('sidebar');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run tests/test_unit/fetch-markdown.test.ts
```
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create `lib/services/search/fetch-markdown.ts`**

```typescript
// lib/services/search/fetch-markdown.ts
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

export const FETCH_MARKDOWN_MAX_CHARS = 12_000;

const REMOVE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'object', 'embed',
  'img', 'picture', 'source', 'video', 'audio', 'canvas', 'svg',
  'header', 'nav', 'aside',
  '[aria-hidden="true"]',
  '.breadcrumb', '.breadcrumbs', '[class*="breadcrumb"]',
  '.banner', '[class*="banner"]', '[class*="advertisement"]', '[class*="promo"]',
  '[class*="social"]', '[class*="share"]', '[class*="follow"]',
  '[class*="cookie"]', '[class*="gdpr"]', '[id*="cookie"]',
  '[class*="related"]', '[class*="recommend"]', '[class*="upsell"]',
  '[class*="cross-sell"]', '[class*="also-bought"]',
  '[class*="review-stars"]', '[class*="rating-bar"]',
  '[class*="wishlist"]', '[class*="compare"]',
];

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

/** Exported for unit testing without HTTP. */
export function cleanHtmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);
  REMOVE_SELECTORS.forEach(sel => $(sel).remove());
  const contentEl = $("main, article, [role='main'], #main, #center_col").first();
  const cleaned = contentEl.length ? contentEl.html()! : $('body').html() ?? '';
  const md = td.turndown(cleaned).replace(/\n{3,}/g, '\n\n').trim();
  return md.slice(0, FETCH_MARKDOWN_MAX_CHARS);
}

export async function fetchAsMarkdown(
  url: string,
  timeoutMs = 15_000,
): Promise<{ markdown: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const finalUrl = res.url;
    const html = await res.text();
    return { markdown: cleanHtmlToMarkdown(html), finalUrl };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run tests/test_unit/fetch-markdown.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/search/fetch-markdown.ts tests/test_unit/fetch-markdown.test.ts
git commit -m "feat(search): add fetch-markdown.ts — HTML fetch + cheerio/turndown conversion"
```

---

### Task 5: Create `lib/services/search/fill-shopping-metadata.ts`

**Files:**
- Create: `lib/services/search/fill-shopping-metadata.ts`

Note: This file depends on `fetch-markdown.ts` (Task 4) and `qwen-client.ts` (Task 1) and the prompt file (Task 8). Implement after those files exist.

- [ ] **Step 1: Create `lib/services/search/fill-shopping-metadata.ts`**

```typescript
// lib/services/search/fill-shopping-metadata.ts
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
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```
Expected: 0 errors for this file (prompt file and qwen-client must exist first)

- [ ] **Step 3: Commit**

```bash
git add lib/services/search/fill-shopping-metadata.ts
git commit -m "feat(search): add fill-shopping-metadata.ts — fetch+qwenGapFill per shopping item"
```

---

### Task 6: Create `lib/services/search/shopping-review.ts`

**Files:**
- Create: `lib/services/search/shopping-review.ts`

- [ ] **Step 1: Create `lib/services/search/shopping-review.ts`**

```typescript
// lib/services/search/shopping-review.ts
import { callModel, extractJson, QWEN_MODEL } from '@/lib/ai-agent/qwen-client';
import {
  SHOPPING_REVIEW_PROMPT,
  buildShoppingReviewMessage,
} from '@/lib/ai-agent/prompt/shopping-review';
import type { EnrichedSource } from './fill-shopping-metadata';

export interface ReviewResult {
  sufficient: boolean;
  retained: EnrichedSource[];
  rejected: Array<EnrichedSource & { reason: string }>;
  nextQueryHint: string | null;
}

const TARGET_SOURCES = 3;

export async function reviewAttempt(
  sources: EnrichedSource[],
  itemDescription: string,
  ctx: { triedQueries: string[]; researchAttempt: number },
): Promise<ReviewResult> {
  if (sources.length === 0) {
    return { sufficient: false, retained: [], rejected: [], nextQueryHint: null };
  }

  // Fast-path: below the floor — skip LLM call
  if (sources.length < TARGET_SOURCES) {
    return { sufficient: false, retained: sources, rejected: [], nextQueryHint: null };
  }

  const raw = await callModel({
    model: QWEN_MODEL,
    enable_thinking: true,
    budget_tokens: 4096,
    temperature: 0.1,
    messages: [
      { role: 'system', content: SHOPPING_REVIEW_PROMPT },
      {
        role: 'user',
        content: buildShoppingReviewMessage(itemDescription, sources, ctx.triedQueries, ctx.researchAttempt),
      },
    ],
  }).catch(err => {
    console.error('[shopping-review] reviewAttempt failed:', err instanceof Error ? err.message : err);
    return null;
  });

  if (!raw) {
    // Auto-accept on total failure so the pipeline can return what it has
    return { sufficient: sources.length >= TARGET_SOURCES, retained: sources, rejected: [], nextQueryHint: null };
  }

  const result = extractJson<{
    sufficient: boolean;
    retained_ids: number[];
    rejected_ids: Array<{ id: number; reason: string }>;
    next_query_hint?: string | null;
  }>(raw);

  // Auto-accept if LLM returns unparseable output
  if (!result) {
    return { sufficient: true, retained: sources, rejected: [], nextQueryHint: null };
  }

  const retainedSet = new Set(result.retained_ids ?? []);
  const rejectedMap = new Map((result.rejected_ids ?? []).map(r => [r.id, r.reason]));
  const retained = sources.filter((_, i) => retainedSet.has(i));
  const rejected = sources
    .map((s, i) => retainedSet.has(i) ? null : { ...s, reason: rejectedMap.get(i) ?? 'rejected by review' })
    .filter((s): s is EnrichedSource & { reason: string } => s !== null);

  return {
    sufficient: result.sufficient,
    retained,
    rejected,
    nextQueryHint: result.next_query_hint ?? null,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/search/shopping-review.ts
git commit -m "feat(search): add shopping-review.ts — Qwen3.6 thinking reviewAttempt"
```

---

### Task 7: Create `lib/services/search/agentic-shopping-pipeline.ts`

**Files:**
- Create: `lib/services/search/agentic-shopping-pipeline.ts`

- [ ] **Step 1: Create `lib/services/search/agentic-shopping-pipeline.ts`**

```typescript
// lib/services/search/agentic-shopping-pipeline.ts
import pLimit from 'p-limit';
import { serperShoppingSearch } from './serper-shopping';
import { fillShoppingMetadata, type FilledShoppingItem, type EnrichedSource } from './fill-shopping-metadata';
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

// --- Price regex for markdown text enrichment ---
const PRICE_RE = /(?:AU\$|CA\$|NZ\$|SG\$|US\$|USD|AUD|EUR|GBP|SGD|[$€£¥])\s*[\d,.]{1,12}|[\d,.]{1,12}\s*(?:USD|AUD|EUR|GBP|SGD)/gi;
const IN_STOCK_RE = /\b(in\s+stock|available(?!\s+soon)|ships?\s+(?:now|today)|ready\s+to\s+ship)\b/i;
const OUT_OF_STOCK_RE = /\b(out\s+of\s+stock|unavailable|discontinued|sold\s+out)\b/i;
const UNIT_RE = /\b(pack\s+of\s+\d+|box\s+of\s+\d+|each|per\s+unit|single)\b/i;
const MANUFACTURER_RE = /\b(?:brand|manufacturer|made\s+by)\s*:?\s*([A-Z][a-zA-Z0-9&\s\-]{1,35}?)(?=\s*[-,.|(\n]|$)/m;
const ORIGIN_RE = /(?:made\s+in|country\s+of\s+origin\s*:?\s*|manufactured\s+in)\s*([A-Z][a-zA-Z\s]{2,24}?)(?=\s*[-.,\n]|$)/mi;

function extractFieldsFromMarkdown(text: string): Partial<Pick<EnrichedSource, 'in_stock' | 'unit' | 'manufacturer' | 'items_origin'>> {
  const result: Partial<Pick<EnrichedSource, 'in_stock' | 'unit' | 'manufacturer' | 'items_origin'>> = {};
  if (OUT_OF_STOCK_RE.test(text)) result.in_stock = false;
  else if (IN_STOCK_RE.test(text)) result.in_stock = true;
  const unitMatch = text.match(UNIT_RE);
  if (unitMatch) result.unit = unitMatch[1];
  const mfgMatch = text.match(MANUFACTURER_RE);
  if (mfgMatch) result.manufacturer = mfgMatch[1].trim();
  const originMatch = text.match(ORIGIN_RE);
  if (originMatch) result.items_origin = originMatch[1].trim();
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
  if (!source.directUrl) return { ...source, _enriched: true };
  const fetched = await fetchAsMarkdown(source.directUrl);
  if (!fetched) return { ...source, _enriched: true };
  const fields = extractFieldsFromMarkdown(fetched.markdown);
  return {
    ...source,
    in_stock: source.in_stock ?? fields.in_stock ?? null,
    unit: source.unit ?? fields.unit ?? null,
    manufacturer: source.manufacturer ?? fields.manufacturer ?? null,
    items_origin: source.items_origin ?? fields.items_origin ?? null,
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
  void runId; // reserved for future telemetry integration
  const ctx: SearchContext = { triedQueries: [], lastQueryHint: null, researchAttempt: 0 };
  let allSources: EnrichedSource[] = [];
  const allRejected: Array<EnrichedSource & { reason: string }> = [];
  let attempt = 0;

  while (true) {
    // 1. Plan 1 query — Qwen3.6, thinking: true
    const query = await planNextQuery(itemDescription, agentItemSummary, ctx);
    ctx.triedQueries.push(query);
    console.log(`[shopping-pipeline] attempt=${attempt + 1} query="${query.slice(0, 80)}"`);

    // 2. Serper shopping search
    const rawItems = await serperShoppingSearch(query).catch(err => {
      console.error('[shopping-pipeline] Serper failed:', err instanceof Error ? err.message : err);
      return [];
    });

    // 3. Fill metadata via fetchAsMarkdown(redirect) + qwenGapFill — price unchanged
    const filled = await fillShoppingMetadata(rawItems, itemDescription);

    // 4. Deduplicate by source name (lowest price wins on collision)
    allSources = deduplicate([...allSources, ...filled]);

    // 5. Enrich each source in parallel: fetchMarkdown → regex extraction → merge
    const limit = pLimit(3);
    allSources = await Promise.all(allSources.map(s => limit(() => enrichWithMarkdown(s))));

    // 6. Review: Qwen3.6 thinking — compares sources against item description
    const { sufficient, retained, rejected, nextQueryHint } = await reviewAttempt(
      allSources,
      itemDescription,
      { triedQueries: ctx.triedQueries, researchAttempt: ctx.researchAttempt },
    );
    allSources = retained;
    allRejected.push(...rejected);
    ctx.lastQueryHint = nextQueryHint;
    ctx.researchAttempt = attempt;

    if (sufficient) break;                   // primary exit
    if (attempt + 1 >= MAX_ATTEMPTS) break;  // safety cap
    attempt++;
  }

  return { sources: allSources, rejected: allRejected, attempts: attempt + 1 };
}
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add lib/services/search/agentic-shopping-pipeline.ts
git commit -m "feat(search): add agentic-shopping-pipeline.ts — Serper+Qwen agentic loop"
```

---

## Phase 1C — Agent C: Prompt Files (parallel with 1A, 1B, 1E)

### Task 8: Create `lib/ai-agent/prompt/fill-shopping-metadata.ts`

**Files:**
- Create: `lib/ai-agent/prompt/fill-shopping-metadata.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/ai-agent/prompt/fill-shopping-metadata.ts
export const FILL_SHOPPING_METADATA_PROMPT = `You are a product metadata extractor for industrial and commercial parts.

## Your task
You receive the markdown content of a product page. Extract values for ONLY the fields listed as "missing". Do not invent data that is not on the page.

## Fields you may fill
- manufacturer: The brand or manufacturer name (string or null)
- itemDescription: A concise product description (string or null, max 200 chars)
- in_stock: Whether the product is currently available (boolean or null — only when page explicitly states stock status)
- items_origin: Country of manufacture if stated on page (string or null)

## Hard rules
- NEVER include or modify price or currency fields — those are authoritative and must not change
- Return ONLY valid JSON — no markdown fences, no commentary outside the JSON
- If a field value cannot be found in the provided content, return null for that field
- Do not hallucinate or guess values

## Output format
{"manufacturer": "Acme Corp", "itemDescription": "M8 hex nut, grade 8, zinc plated", "in_stock": true, "items_origin": "Germany"}`;

export function buildFillShoppingMetadataMessage(
  missingFields: string[],
  url: string,
  content: string,
): string {
  return `Page URL: ${url}

Fields to extract (return null for any not found): ${missingFields.join(', ')}

Page content:
${content.slice(0, 8_000)}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai-agent/prompt/fill-shopping-metadata.ts
git commit -m "feat(prompt): add fill-shopping-metadata system prompt"
```

---

### Task 9: Create `lib/ai-agent/prompt/shopping-review.ts`

**Files:**
- Create: `lib/ai-agent/prompt/shopping-review.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/ai-agent/prompt/shopping-review.ts
import type { EnrichedSource } from '@/lib/services/search/fill-shopping-metadata';

export const SHOPPING_REVIEW_PROMPT = `You are a price-data validator for a B2B procurement system.

You receive a customer item description and a list of price sources found via shopping search. Complete three tasks:

## Task 1 — Verify each source
A source is INVALID if:
- Its title or description clearly describes a completely different product category (e.g. customer needs M8 nut, source sells a drill bit)
- Its price is implausibly wrong relative to all other sources (10x higher/lower without explanation)
- It is for an accessory or incompatible variant of the customer's item

A source is VALID if:
- It matches the product category, even if specific specs differ
- It is a different size/grade/configuration of the same product type
- Metadata is absent (null) — absence of metadata is NOT grounds for rejection

## Task 2 — Decide sufficiency
sufficient: true ONLY when ALL of:
- retained_ids count >= 3
- unique source names in retained >= 2

Err toward sufficient: false when ambiguous.

## Task 3 — Generate next_query_hint (only when sufficient: false)
A specific, actionable hint for the next search. Examples:
- "search for part number XB123 to find exact variant"
- "try industrial distributor sites instead of retail stores"
- "search by material grade and dimensions rather than brand"

## Output format (strict JSON, no markdown)
{"sufficient": true|false, "retained_ids": [0, 2, 3], "rejected_ids": [{"id": 1, "reason": "completely different product"}], "next_query_hint": "...or null"}

RULES:
- retained_ids + rejected_ids must account for ALL indices 0 to N-1
- next_query_hint must be null when sufficient: true
- Return ONLY valid JSON`;

export function buildShoppingReviewMessage(
  itemDescription: string,
  sources: Pick<EnrichedSource, 'source' | 'price' | 'currency' | 'title' | 'manufacturer' | 'itemDescription'>[],
  triedQueries: string[],
  researchAttempt: number,
): string {
  const sourceList = sources
    .map((s, i) => {
      const meta: string[] = [];
      if (s.manufacturer) meta.push(`manufacturer: ${s.manufacturer}`);
      if (s.itemDescription) meta.push(`description: ${s.itemDescription}`);
      const metaStr = meta.length > 0 ? ` | ${meta.join(', ')}` : '';
      return `[${i}] ${s.source} — ${s.currency} ${s.price}/each | "${s.title}"${metaStr}`;
    })
    .join('\n');

  const queries = triedQueries.slice(-3).join(', ') || '(none)';

  return `Customer item description: "${itemDescription}"

Price sources (${sources.length} total):
${sourceList}

Search context: attempt ${researchAttempt + 1}, tried queries: ${queries}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai-agent/prompt/shopping-review.ts
git commit -m "feat(prompt): add shopping-review system prompt"
```

---

### Task 10: Add `buildPlanSingleQueryMessage` to `lib/ai-agent/prompt/plan-queries.ts`

**Files:**
- Modify: `lib/ai-agent/prompt/plan-queries.ts`

- [ ] **Step 1: Append new export to the file (do not remove existing exports)**

Add after the existing `buildPlanUserMessage` function. This adds both a dedicated system prompt for single-query planning (separate from the 8-query `PLAN_QUERIES_PROMPT`) and the user-message builder:

```typescript
// Add to bottom of lib/ai-agent/prompt/plan-queries.ts

/**
 * System prompt for the agentic pipeline's single-query planner.
 * Separate from PLAN_QUERIES_PROMPT (8-query batch) to avoid conflicting
 * "UP TO 8" instruction when asking for exactly 1 query.
 */
export const PLAN_SINGLE_QUERY_PROMPT = `You are a procurement price-search strategist.

Your task: generate EXACTLY 1 search query for finding the price of the described item.

## Query strategy
- If part/model identifiers are available: use the most specific one + a source-type keyword ("price buy", "supplier", "distributor")
- If only description is available: combine key technical terms + "price" or "buy"
- RE-SEARCH MODE: if prior queries are listed, pick a completely different angle (different terminology, different source type, different specificity)

## Hard rules
- DO NOT append country or region names
- Output EXACTLY 1 query — no more, no fewer
- Return ONLY valid JSON: {"queries": ["<single query string>"]}
- No markdown, no commentary outside the JSON`;


/**
 * Build the user message for the agentic shopping pipeline's single-query planner.
 * Receives structured item analysis from analysis-actions.ts (AgentItemSummary)
 * plus prior search context so Qwen avoids repeats and follows the reviewer's hint.
 */
export function buildPlanSingleQueryMessage(
  itemDescription: string,
  agentItemSummary: { identification?: string[]; features?: string[] } | null,
  ctx: { triedQueries: string[]; lastQueryHint: string | null },
): string {
  const identification = agentItemSummary?.identification ?? [];
  const features = agentItemSummary?.features ?? [];

  const base = `Generate exactly 1 price-search query for this procurement item.

Customer description: ${itemDescription}
${identification.length > 0 ? `Part/model identifiers: ${identification.join(', ')}` : ''}
${features.length > 0 ? `Technical specifications: ${features.slice(0, 3).join(', ')}` : ''}

Required query count: 1
Return JSON: {"queries": ["<single query string>"]}`;

  if (ctx.triedQueries.length === 0) return base;

  let message = `${base}

IMPORTANT — RE-SEARCH MODE: Previous queries returned insufficient price data. Generate a query that is genuinely different in angle or terminology from those already tried.

Queries already tried (do NOT repeat or rephrase):
${ctx.triedQueries.map(q => `- ${q}`).join('\n')}`;

  if (ctx.lastQueryHint) {
    message += `\n\nData-reviewer hint for this attempt: ${ctx.lastQueryHint}\nUse this hint to guide the query angle.`;
  }

  return message;
}
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add lib/ai-agent/prompt/plan-queries.ts
git commit -m "feat(prompt): add buildPlanSingleQueryMessage for agentic shopping pipeline"
```

---

## Phase 1E — Agent E: Delete Redundant Files (parallel with 1A, 1B, 1C)

### Task 11: Delete all replaced files

**Files to delete:**

- [ ] **Step 1: Delete search service files**

```bash
git rm lib/services/search/density-loop.ts
git rm lib/services/search/tavily-client.ts
git rm lib/services/search/firecrawl-client.ts
git rm lib/services/search/budget.ts
git rm lib/services/search/vision-extract.ts
git rm lib/services/search/manual-extract.ts
git rm lib/services/search/html-gate.ts
git rm lib/services/search/product-page-scorer.ts
git rm lib/services/search/eliminate.ts
```

- [ ] **Step 2: Delete AI agent files**

```bash
git rm lib/ai-agent/hf-client.ts
git rm lib/ai-agent/local-model.ts
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(cleanup): remove Tavily/Firecrawl/density-loop/HF files replaced by Qwen pipeline"
```

---

## Phase 2 — Agent D: Integration (runs after Phase 1A + 1B complete)

### Task 12: Update `lib/services/search/index.ts`

**Files:**
- Modify: `lib/services/search/index.ts`

- [ ] **Step 1: Replace index.ts entirely**

```typescript
// lib/services/search/index.ts
// Re-exports for the agentic shopping pipeline.
// isProductPage kept as a URL utility used by supplier-search-actions.ts.

export { serperShoppingSearch, type ShoppingItem } from './serper-shopping';
export { fetchAsMarkdown, FETCH_MARKDOWN_MAX_CHARS } from './fetch-markdown';
export { fillShoppingMetadata, type FilledShoppingItem, type EnrichedSource } from './fill-shopping-metadata';
export { reviewAttempt, type ReviewResult } from './shopping-review';
export { agenticShoppingPipeline } from './agentic-shopping-pipeline';
export { getCachedSearch, setCachedSearch } from './cache';
export { lookupMemory, rememberSupplier, type MemoryScope, type MemoryHit } from './supplier-memory';
export { checkLivenessCached, clearLivenessCache } from './liveness';
export { logSearchStage, enterSearchRun, emitRunStart, emitLiveness, emitLayer } from './telemetry';
export { computeSpecHash } from './spec-hash';

// URL utility — kept for the URL guard in supplier-search-actions.ts
const HARD_JUNK_PREFIXES = [
  '/search', '/blog', '/news', '/about', '/about-us', '/contact',
  '/login', '/signin', '/account', '/cart', '/checkout',
  '/company', '/corporate', '/careers', '/press', '/investor',
];
const HARD_JUNK_INCLUDES = [
  '/company/', '/corporate/', '/about/', '/about-us/',
  '/careers/', '/press/', '/investor/',
];

export function isProductPage(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.pathname.length <= 1) return false;
    const path = u.pathname.toLowerCase();
    if (HARD_JUNK_PREFIXES.some(seg => path.startsWith(seg))) return false;
    if (HARD_JUNK_INCLUDES.some(sub => path.includes(sub))) return false;
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```
Expected: Errors only from supplier-search-actions.ts (still importing old symbols) — fix in Task 13.

- [ ] **Step 3: Commit**

```bash
git add lib/services/search/index.ts
git commit -m "feat(search): update index.ts — remove Tavily/density imports, add pipeline exports"
```

---

### Task 13: Update `lib/actions/supplier-search-actions.ts`

**Files:**
- Modify: `lib/actions/supplier-search-actions.ts`

The goal is to replace the per-item block that calls `planQueries → gatherSourcesForItemParallel → alt-loop` with a single `agenticShoppingPipeline()` call, then map results to `ItemSourceRow`.

- [ ] **Step 1: Remove old imports and add new ones**

Find these import lines near the top and remove them:

```typescript
// REMOVE these imports:
import { searchOneQuery, isProductPage, type ScorerSpec } from '@/lib/services/search';
import { manualExtract } from '@/lib/services/search/manual-extract';
import { planQueries, planContactQueries } from '@/lib/services/search/query-planner';
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
import { extractFromHtml, extractMetaFromHtml } from '@/lib/services/search/html-extract';
import { firecrawlFetch } from '@/lib/services/search/firecrawl-client';
import { extractMetaFromFirecrawl } from '@/lib/services/search/html-extract';
import { extractFromVision, isVisionEnabled } from '@/lib/services/search/vision-extract';
```

Add these imports instead:

```typescript
import { agenticShoppingPipeline, isProductPage, type EnrichedSource } from '@/lib/services/search';
import { planContactQueries } from '@/lib/services/search/query-planner';
import type { AgentItemSummary } from '@/types/preview';
```

- [ ] **Step 2: Add the source-row mapper function**

After the `buildSearchText` function (around line 477), add:

```typescript
/** Map one EnrichedSource to the ItemSourceRow shape expected by the DB writer. */
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
```

- [ ] **Step 3: Replace the per-item pipeline block**

Find the `limit(async () => {` block inside `rawItemResults = await Promise.all(...)`. Replace everything from `const plan = await planQueries(searchText);` down to `return { result: mergedResult, budget, itemId: ... }` with:

```typescript
return limit(async () => {
  const itemDescription = String(row.companyDescription || '');
  const summary = (row.agentItemSummary as AgentItemSummary | null) ?? null;

  const { sources, attempts } = await agenticShoppingPipeline(
    itemDescription,
    summary,
    rfq_id ? String(rfq_id) : undefined,
  );

  const rows = sources
    .filter(s => isProductPage(s.directUrl))
    .map(s => mapSourceToRow(baseItem.itemId, s));

  return {
    result: { rows, tavilyCalls: 0, deadUrls: 0, attempts },
    itemId: baseItem.itemId,
    fromMemory: false,
  };
});
```

- [ ] **Step 4: Remove now-unused variables after the loop**

Find and remove references to `budget`, `visionBudget`, `specTokens`, `parsed` that are no longer defined. Specifically:
- Remove `const visionBudget = createVisionBudget();`
- Remove `emitRunStart(itemRows.length, createBudget().maxLlmCalls, visionBudget.maxVisionCalls);`  
  Replace with: `emitRunStart(itemRows.length, MAX_ATTEMPTS, 0);`
- Remove the `rawItemResults` destructuring of `budget`, `specTokens`, `parsed`, `fromMemory` where they're no longer used downstream

- [ ] **Step 5: Type-check**

```
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 6: Lint**

```
npm run lint
```
Expected: 0 errors/warnings for the changed files

- [ ] **Step 7: Commit**

```bash
git add lib/actions/supplier-search-actions.ts
git commit -m "feat(search): swap density-loop for agenticShoppingPipeline in supplier-search-actions"
```

---

### Task 14: Final type-check + build verification

- [ ] **Step 1: Full type check**

```
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 2: Lint**

```
npm run lint
```
Expected: 0 errors

- [ ] **Step 3: Build**

```
npm run build
```
Expected: Build completes with no type errors. (Note: Qwen/Serper API calls won't be exercised during build — they require env vars at runtime.)

- [ ] **Step 4: Run unit tests**

```
npx vitest run tests/test_unit/qwen-client.test.ts tests/test_unit/serper-shopping.test.ts tests/test_unit/fetch-markdown.test.ts
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final type-check and build verification — agentic shopping pipeline complete"
```

---

## Environment Variables

Add to `.env.local` (do not commit):
```
SERPER_API_KEY=       # Serper.dev shopping search
HF_TOKEN=             # HuggingFace featherless-ai (primary Qwen inference)
RUNPOD_REASONING_URL= # Optional RunPod endpoint (fallback)
RUNPOD_REASONING_MODEL= # Optional model override on RunPod
RUNPOD_API_KEY=       # Optional RunPod auth key
RUNPOD_TIMEOUT_MS=    # Optional RunPod timeout (default 90000)
```

Remove from `.env.local`:
```
TAVILY_API_KEY
FIRECRAWL_API_KEY
HF_MODEL_ID           # replaced by QWEN_MODEL constant in qwen-client.ts
AI_MODE               # no longer used
```

---

## Parallel Execution Order

```
Phase 1 (all parallel):
  Agent A → Tasks 1, 2   (qwen-client + ai-router)
  Agent B → Tasks 3–7    (serper-shopping, fetch-markdown, fill-metadata, shopping-review, pipeline)
  Agent C → Tasks 8–10   (prompt files)
  Agent E → Task 11      (delete files)

Phase 2 (after A + B complete):
  Agent D → Tasks 12–14  (index.ts + supplier-search-actions + final verification)
```
