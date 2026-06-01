# Supplier-Search Mechanism — Stage-by-Stage Flow (for verification)

**Goal of the whole pipeline:** for every RFQ item, end with **≥3 (target 5) distinct
supplier sources** — cheaply and accurately — then persist them.

Entry point: `processSupplierSearch()` in `lib/actions/supplier-search-actions.ts`
(called by `lib/data-processor.ts`, NOT a direct server action).

```
ProcessorInput ─► processSupplierSearch ─► (per item, 8 concurrent) ─► persist ─► ProcessorResult
```

---

## Top-level flow (per RFQ)

| # | Stage | Code | Input | Output |
|---|-------|------|-------|--------|
| 1 | **Fetch items** | `getData('rfqItems', {rfqId})` | `rfq_id` | rows: `[{itemId, companyDescription, qty, uom, agentItemSummary}]` |
| 2 | **Sort** | `.sort(itemId ASC)` | item rows | same rows, deterministic order (so `supplier_id` is stable across re-runs) |
| 3 | **Per-item harvest** | `pLimit(8)` → loop below | one item | `ItemSourceRow[]` (the sources found) |
| 4 | **URL guards** | `isUsableSourceRow` + `isProductPage` | all rows | only rows with a real product-page URL survive |
| 5 | **Assign supplier_id** | sort + enumerate | survivors | each row gets `supplier_id = index+1` |
| 6 | **Memorize** (optional) | `rememberSupplier` | survivors | L0 cache write (only if `SEARCH_MEMORY_ENABLED`) |
| 7 | **Persist** | `modifyDatabase` | rows + telemetry | written to `supplier_item_status`; returns `WriteFailure[]` |
| 8 | **Telemetry + result** | build `search_telemetry` | counts | `ProcessorResult` → SSE → UI |

**Concurrency:** up to 8 items run at once (`RAG_CONCURRENCY = 8`). Each item has its own
**budget** (LLM-call + wall-clock leash, `budget.ts`) so a hard-to-source item degrades to
best-effort instead of looping forever.

---

## Per-item flow (the heart of it)

This runs inside step 3 for each item, in this order:

### 3a. PLAN — `planQueries(searchText)`
- **Input:** flat text built from the item (`agentItemSummary` axes joined, else
  `companyDescription`) — `buildSearchText()`.
- **What it does:** one LLM call parses the spec and emits up to **8 ranked web queries**
  ordered narrow→broad; qualified queries (with manufacturer/type) are re-ranked ahead of
  bare part-number queries.
- **Output:** `{ parsed: ParsedSpec, queries: string[] }`.
  - `parsed` → feeds the scorer (exact-model + spec-density signals).
  - `queries` → drives the harvest loop.
- **Fallback:** empty plan ⇒ search the raw text once (item is never silently skipped).

### 3b. L0 MEMORY (optional short-circuit) — `lookupMemory(parsed, scope)`
- Disabled by default (`SEARCH_MEMORY_ENABLED`). When on and an exact spec-hash hits,
  returns cached rows and **skips all web search** for that item.

### 3c. HARVEST LOOP — `gatherSourcesForItemParallel(item, queries, budget, extract)`
Walks the query list in **rounds of up to `FANOUT_WIDTH` (3)** queries fired concurrently.
**Stops before a new round when:** `collected ≥ MIN_SOURCES (3)`, budget exhausted, or
queries used up. Dedups sources by `source_url`. Inner cap = `TARGET_SOURCES (5)`.

Each query runs `extractSupplierForItem()`:

| Sub | Step | Code | Input → Output |
|-----|------|------|----------------|
| 1 | **Search 1 query** | `searchOneQuery(query, spec, qty)` | query → Tavily candidates |
| 2a | **Classify** | `classifyPage` | snippet → `page_type: 'product' \| 'tech_spec'` |
| 2b | **Eliminate** | inside scorer/`eliminate` | drop out-of-stock / non-product / qty-floor fails (unknown = keep) |
| 2c | **Score** | `scoreProductPage(snippet, spec)` | weighted score + `detected` field-map (has_price, has_contact, has_quote_request…) ; keep ≥ threshold, rank best-first |
|  | → returns | `{ candidates: [{snippet, score, detected, pageType}], tavilyCalls }` | top-K (`MAX_PAGES_PER_QUERY = 5`) go to extract |

Then **hybrid-extract each kept page** (this is where ≥3 sources come from ONE search):

| Sub | Step | What | Output |
|-----|------|------|--------|
| 2a | **Manual extract** | `manualExtract(content, detected)` — regex pulls price/currency/contact/qty/delivery, **guided by the detected-map** | `fields` + `confidence` |
| 2b | **Verify** | each regex value must re-appear in `raw_content`, else discarded as "missing" | verified fields only |
| 2c | **LLM gap-fill** | one budget-gated LLM call per page fills **name + description** (never regex'd) and any missing/zero/failed fields | `SupplierExtraction` |
| 2d | **Merge** | manual-verified value wins; LLM fills the rest | merged fields |
| 2e | **Microdata price override** | if price still 0, `extractMicrodataPrice(content)` | deterministic price fallback; `track += '+microdata'` |
| 2f | **Stock protection** | drop if `0 < available_qty < qty+5` (0 = unknown = keep) | unfulfillable suppliers removed |
| 2g | **requires_quote** | set true if LLM flags it OR (price 0 AND `detected.has_quote_request`) | operator "request a quote" affordance |

A page with no `supplier_name` or `bidder_description` is **not** a usable source (skipped).
Each surviving page becomes **its own `ItemSourceRow`**.

### 3d. ALT OUTER LOOP (substitutes) — bounded, only if still short
If after the harvest `collected < MIN_SOURCES`: re-plan with broadened text
(`"… alternative equivalent substitute compatible replacement"`) and re-harvest through the
**same** filter→score→extract gate, at most `MAX_REPLAN_ROUNDS (2)` times. Substitute rows
carry `match_reasoning` (why a non-exact product still fulfils the requirement).

---

## What one `ItemSourceRow` looks like (the per-stage output you can verify)

```
{ item_id, supplier_id, supplier_name, source_url (REAL candidate URL, never LLM's),
  status:'pending', bidder_description, bidder_unit_price, currency_code, delivery_time,
  compliance_deviation, notes, contact_email, contact_phone, available_qty,
  extraction_track ('manual' | 'manual+llm' | 'llm' [+'microdata']),
  selling_unit, pack_size, match_reasoning (substitutes only),
  requires_quote, page_type, extraction_confidence }
```

These map 1:1 to the `supplier_item_status` columns (see `lib/db/schema.ts:447`).

---

## How to verify each stage (telemetry)

Every stage emits a structured log via `logSearchStage(...)` (`telemetry.ts`). Grep the run:

| Log stage | Tells you |
|-----------|-----------|
| `query-gen` | which query fired (item_id, attempt, round) |
| `raw-search` | how many candidates a query returned + sample URLs + Tavily calls |
| `extract` | per-page result: track, url, price, currency, qty, requires_quote, page_type |
| `density-check` | running source count vs need (3), budget/wall-clock left |
| `persist` | rows handed to DB + any write failures |

Aggregate run summary: `[supplier-search] telemetry rfq_id=… tavily=… llm=… exhausted=…
items_below_target=…`. `items_below_target` lists item_ids that ended **below** the 3-source
floor (including zero-row items) — your single signal for "which items under-sourced".

---

## Cost / accuracy levers (knobs)

| Knob | Default | Effect |
|------|---------|--------|
| `RAG_CONCURRENCY` | 8 | items processed in parallel |
| `FANOUT_WIDTH` (`SEARCH_FANOUT_WIDTH`) | 3 | queries fired per round |
| `MIN_SOURCES` / `TARGET_SOURCES` | 3 / 5 | floor to keep trying / cap per item |
| `MAX_PAGES_PER_QUERY` | 5 | pages hybrid-extracted per search |
| `MAX_REPLAN_ROUNDS` | 2 | extra substitute-discovery rounds |
| `SEARCH_MEMORY_ENABLED` | off | L0 exact-match cache short-circuit |
| `budget.ts` | per-item | hard LLM-call + wall-clock ceiling |

**Why it's cheap & accurate:** manual-first regex limits the LLM to gap-fill; the verify
layer rejects regex/LLM hallucinations (value must exist in `raw_content`); the out-of-stock
pre-filter avoids paying to extract dead suppliers; and multi-page extraction yields N sources
per single Tavily call instead of one.
