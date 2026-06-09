# Agentic Shopping Pipeline Design
Date: 2026-06-09

## Overview

Replace the existing Tavily/Firecrawl/density-loop supplier search with an agentic
Serper-shopping loop inspired by inventory-scanner, powered entirely by
`Qwen/Qwen3.6-35B-A3B:featherless-ai` via featherless-ai inference provider.

The boundary change in `supplier-search-actions.ts` is a single call-site swap:
`gatherSourcesForItemParallel()` → `agenticShoppingPipeline()`. All orchestration,
DB writes, telemetry, and supplier-memory layers above that seam are untouched.

Simultaneously, all other AI calls in the app (email generation, RFQ analysis,
quotation actions, thread AI) switch to Qwen3.6 automatically by updating
`ai-router.ts` to delegate to the new `qwen-client.ts`.

---

## Section 1 — Global Qwen Client

### New file: `lib/ai-agent/qwen-client.ts`
Direct port of inventory-scanner's `src/lib/inference.ts`.

**Exports:**
- `callModel(params: CallModelParams): Promise<string>`
  - Primary: RunPod serverless (`RUNPOD_API_KEY`)
  - Fallback: HuggingFace featherless-ai provider (`HF_TOKEN`)
  - Supports `enable_thinking`, `budget_tokens`, `temperature`, `max_tokens`
- `callQwen(messages, opts?): Promise<{ text: string; thinking: string | null }>`
  - Thin wrapper; default model = `Qwen/Qwen3.6-35B-A3B:featherless-ai`
  - `opts.thinking` maps to `enable_thinking`
- `extractJson<T>(raw: string): T | null`
  - Strips `<think>` blocks, handles markdown fences, slices outermost `{}`
- `extractThinking(raw: string): { thinking: string | null; text: string }`
- `stripThinking(raw: string): string`

### Modified file: `lib/ai-agent/ai-router.ts`
Replace the HuggingFace SDK body of `aiChatCompletion()` with a delegating call
to `callQwen()`. All existing callers pick up Qwen3.6 with zero per-file changes.

### Deleted files (AI agent layer)
- `lib/ai-agent/hf-client.ts` — replaced by `qwen-client.ts`
- `lib/ai-agent/local-model.ts` — replaced by Qwen3.6 via featherless-ai

---

## Section 2 — New Search Service Files

All new files live in `lib/services/search/`.

### `serper-shopping.ts`
```
serperShoppingSearch(query: string): Promise<ShoppingItem[]>
```
- POST `https://google.serper.dev/shopping`, `num: 10`
- Parses price via `SYMBOL_MAP` + ISO code regex (same as inventory-scanner)
- Price is **authoritative and never overwritten** downstream
- `ShoppingItem`: `{ title, source, link, price, currency, imageUrl? }`

### `fill-shopping-metadata.ts`
```
fillShoppingMetadata(
  items: ShoppingItem[],
  itemDescription: string,
  runId?: string
): Promise<FilledShoppingItem[]>
```
- Single Qwen3.6 call, `thinking: false`
- Does three things in one pass:
  1. Removes obvious outliers (title/source clearly wrong product)
  2. Fills metadata gaps: `manufacturer`, `itemDescription`, `in_stock`, `items_origin`
  3. Infers `directUrl` per item from title + source name (Google Shopping link is a redirect)
- Price field is **read-only** — prompt explicitly forbids overwriting it
- Returns `FilledShoppingItem[]` (extends `ShoppingItem` + `{ directUrl: string | null }`)

### `fetch-markdown.ts`
```
fetchAsMarkdown(url: string, timeoutMs?: number): Promise<string | null>
```
- Productionized port of `tools/agent-test/fetch-to-markdown.ts`
- Cheerio noise removal (scripts, nav, ads, related products) → Turndown → markdown
- `FETCH_MARKDOWN_MAX_CHARS = 12_000` cap (matches inventory-scanner's Jina budget)
- Default timeout: 15s. Returns `null` on any failure (never throws).

### `shopping-review.ts`
```
reviewAttempt(
  sources: EnrichedSource[],
  itemDescription: string,
  ctx: SearchContext
): Promise<ReviewResult>
```
- Fast-path: if `sources.length < TARGET_SOURCES (3)`, skip LLM → `{ sufficient: false }`
- Qwen3.6 call, `thinking: true`
- Compares accumulated sources against the RFQ **customer item description**
- Returns `{ sufficient, retained: EnrichedSource[], rejected: RejectedSource[], nextQueryHint: string | null }`
- Auto-accept (sufficient: true) if LLM returns unparseable output

### `agentic-shopping-pipeline.ts`
```
agenticShoppingPipeline(
  item: RfqItem,
  itemDescription: string,
  runId?: string
): Promise<{ sources: EnrichedSource[]; rejected: RejectedSource[]; attempts: number }>
```
Main loop orchestrator — see Section 3.

### Prompt files (`lib/ai-agent/prompt/`)
- `fill-shopping-metadata.ts` — system prompt: outlier removal rules, metadata field
  extraction from shopping result signals, direct URL inference from merchant name + title,
  explicit rule that price is never overwritten, JSON output schema
- `shopping-review.ts` — system prompt: match sources against customer description,
  sufficiency criteria (retained ≥ 3, unique sources ≥ 2), rejection rules,
  next_query_hint format, JSON output schema

---

## Section 3 — Pipeline Data Flow

```
const TARGET_SOURCES = 3   // B2B context — fewer, higher-quality sources
const MAX_ATTEMPTS   = 5   // safety cap; primary exit is sufficient=true

agenticShoppingPipeline(item, itemDescription, runId):
  ctx = { triedQueries: [], lastQueryHint: null }
  allSources: EnrichedSource[] = []
  allRejected: RejectedSource[] = []
  attempt = 0

  while (true):
    // 1. Plan 1 query — Qwen3.6, thinking: true, temperature escalates on retry
    query = planNextQuery(item, ctx)
    ctx.triedQueries.push(query)
    publishEvent(runId, { kind: 'search_query', attempt, query })

    // 2. Serper shopping — price authoritative
    rawItems = serperShoppingSearch(query)
    publishEvent(runId, { kind: 'search_urls', engine: 'Serper Shopping', ... })

    // 3. Fill metadata + extract directUrl — Qwen3.6, thinking: false
    filled = fillShoppingMetadata(rawItems, itemDescription, runId)

    // 4. Dedup by source name (lowest price wins on collision)
    allSources = deduplicate([...allSources, ...filled])

    // 5. Enrich each source in parallel: fetchMarkdown → regex → merge
    //    enrichWithMarkdown() is idempotent — skips already-enriched items
    allSources = await Promise.all(allSources.map(enrichWithMarkdown))
    publishEvent(runId, { kind: 'search_prices', total: allSources.length })

    // 6. Review — Qwen3.6, thinking: true
    { sufficient, retained, rejected, nextQueryHint } =
      reviewAttempt(allSources, itemDescription, ctx)
    allSources  = retained
    allRejected = [...allRejected, ...rejected]
    ctx.lastQueryHint = nextQueryHint
    publishEvent(runId, { kind: 'search_sufficient', sufficient })

    if (sufficient)                  break   // primary exit
    if (attempt + 1 >= MAX_ATTEMPTS) break   // safety cap
    attempt++

  return { sources: allSources, rejected: allRejected, attempts: attempt + 1 }
```

`planNextQuery` uses `thinking: true` (per spec); temperature starts at 0.2 for
attempt 0, steps to 0.4 for re-search attempts (same as inventory-scanner pattern).

`enrichWithMarkdown(source)`:
1. Skip if `source.directUrl` is null or `source._enriched === true`
2. `fetchAsMarkdown(source.directUrl)` → null on failure → return source unchanged
3. `extractFromText(markdown)` via `html-extract.ts` regex layer
4. Merge: regex fields fill null slots only — **price is never overwritten**
5. Set `source._enriched = true`

`EnrichedSource` extends `FilledShoppingItem` with `{ _enriched?: boolean }` flag
to prevent re-fetching items carried over from prior loop iterations.

`planNextQuery` is a private function **inside `agentic-shopping-pipeline.ts`**
(not exported). It uses the existing `lib/ai-agent/prompt/plan-queries.ts` prompt
adapted for `count: 1` output, calls `callQwen()` with `thinking: true`.

---

## Section 4 — Files to Delete

### `lib/services/search/` — 9 files deleted
| File | Reason |
|------|--------|
| `density-loop.ts` | Loop replaced by `agentic-shopping-pipeline.ts` |
| `tavily-client.ts` | Search replaced by `serper-shopping.ts` |
| `firecrawl-client.ts` | Fetch replaced by `fetch-markdown.ts` |
| `budget.ts` | Budget replaced by simple attempt counter |
| `vision-extract.ts` | Vision not in new pipeline |
| `manual-extract.ts` | Manual extraction removed |
| `html-gate.ts` | Gated Firecrawl/Tavily fetches — no longer needed |
| `product-page-scorer.ts` | Scored Tavily result pages — no longer needed |
| `eliminate.ts` | Source elimination replaced by `reviewAttempt` |

### `lib/ai-agent/` — 2 files deleted
| File | Reason |
|------|--------|
| `hf-client.ts` | Replaced by `qwen-client.ts` |
| `local-model.ts` | Replaced by Qwen3.6 via featherless-ai |

---

## Section 5 — Modified Files

| File | Change |
|------|--------|
| `lib/ai-agent/ai-router.ts` | Delegate `aiChatCompletion()` body to `callQwen()` |
| `lib/services/search/query-planner.ts` | Use `callQwen()` instead of `aiChatCompletion()` directly; keep `planQueries()` for non-shopping search paths |
| `lib/services/search/index.ts` | Update re-exports: remove deleted files, add new ones |
| `lib/actions/supplier-search-actions.ts` | Swap `gatherSourcesForItemParallel()` → `agenticShoppingPipeline()` |

Email, RFQ analysis, quotation, thread-AI actions require **no changes** — they
call `aiChatCompletion()` which will transparently use Qwen3.6 after ai-router update.

---

## Section 6 — Team Agent Breakdown (Implementation)

Implementation runs via parallel team agents. Each agent owns a disjoint file set.

| Agent | Responsibility | Files owned |
|-------|---------------|-------------|
| **Agent A** | Global Qwen client + ai-router update | `lib/ai-agent/qwen-client.ts` (new), `lib/ai-agent/ai-router.ts` (mod) |
| **Agent B** | New search service files | `serper-shopping.ts`, `fill-shopping-metadata.ts`, `fetch-markdown.ts`, `shopping-review.ts`, `agentic-shopping-pipeline.ts` |
| **Agent C** | Prompt files | `lib/ai-agent/prompt/fill-shopping-metadata.ts`, `lib/ai-agent/prompt/shopping-review.ts` |
| **Agent D** | Call-site swap + index update | `lib/actions/supplier-search-actions.ts`, `lib/services/search/index.ts`, `lib/services/search/query-planner.ts` |
| **Agent E** | Delete redundant files | All 11 files in Section 4 |

**Sequencing:** Agents A, B, C, E run in parallel first (disjoint files).
Agent D runs after A and B complete (depends on `qwen-client.ts` and `agentic-shopping-pipeline.ts` exports).

---

## Environment Variables Required

```
SERPER_API_KEY       # Serper.dev shopping search
RUNPOD_API_KEY       # Qwen3.6 primary inference
HF_TOKEN             # Qwen3.6 featherless-ai fallback
```

`TAVILY_API_KEY` and `FIRECRAWL_API_KEY` can be removed from `.env`.
