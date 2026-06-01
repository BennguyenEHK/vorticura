# Extraction Redesign + Supplier-Search Cleanup — Design

**Date:** 2026-06-02
**Branch:** `feat/llm-query-planning`
**Status:** Approved design → implementation planning
**Scope owner:** supplier-search subsystem (`lib/services/search/**`, `lib/actions/supplier-search-actions.ts`, `lib/db/schema.ts`, preview panel)

---

## 1. Goals

1. **Lower extraction bias + raise price/contact accuracy** by reordering the per-page
   extraction cascade so cheap, deterministic, *canonical* layers run before the
   expensive probabilistic ones, and by adding the structured-HTML layer that is
   currently dead.
2. **Eliminate dead URLs** before extraction (keep HTTP 200 only).
3. **Recover missing supplier contacts** via a bounded query-builder loopback.
4. **Remove the redundant `supplier_search` summary table** and reclaim its UI chrome
   so the Suppliers master-detail panels expand — **without** touching the extraction
   engine or the `supplier_item_status` results.

### Non-goals
- No change to query planning (`query-planner.ts`), the density loop, scoring, or
  memory beyond what the cascade requires.
- No removal of `supplier_item_status` or `supplier_memory`.
- No removal of the Suppliers tab / `SupplierSearchDocument` (results still need a
  review surface). Only its summary/telemetry chrome is stripped.
- Layer 4 (vision/image-to-text) is **stubbed, not built** (Phase 2 — see §6).

---

## 2. Current state (baseline)

Per surviving candidate page in `extractSupplierForItem`
(`lib/actions/supplier-search-actions.ts`):

1. Tavily `raw_content` (`include_raw_content: true`, currently **markdown**) → `content`.
2. `manualExtract(content, detected)` — regex price/currency/contact/qty/delivery,
   each verified by re-appearing in `content`.
3. LLM gap-fill — **always** runs (name + description are never regex-extracted);
   also fills price/contact the regex missed.
4. `extractMicrodataPrice(content)` — overrides price only when price is still 0.

**Key defect:** Step 4 matches HTML patterns (`itemtype=`, `<meta itemprop="price">`,
`<span itemprop>`), but `content` is Tavily **text/markdown**, not HTML — so the
patterns almost never fire. The structured-data layer is effectively dead, which is the
root of the observed bias (raw_content frequently lacks the price or quote-intent text).

`deadUrls` is hardcoded to 0 — there is **no** URL liveness check today.

---

## 3. Redesigned extraction cascade (Tasks 1 + 2)

Ordering principle: **deterministic + cheap + canonical first; probabilistic + expensive last.**

| # | Layer | Cost | Runs when | Output |
|---|-------|------|-----------|--------|
| 0 | **URL liveness pre-gate** | low (1 fetch) | every candidate before extraction | `{ status, html }`; keep **200 only**, drop 403/404/410/timeout |
| 1 | **Manual regex on Tavily `raw_content` (text)** | ~0 | every surviving page | price/currency/contact/qty/delivery (expanded vocab + multi-price disambiguation) |
| 2 | **Structured-HTML / cheerio** | low (reuses Layer 0 html) | price still unknown | JSON-LD `offers.price`, microdata, OG tags, broad currency regex on real HTML |
| 3 | **LLM extraction** | high | always (name/desc); gap-fills price/contact | supplier_name, description, compliance, notes, + recovered fields |
| 4 | **Image-to-text / VLM** | highest | price unknown AND quote-intent unknown | **Phase 2 — stubbed behind flag** |

### 3.1 Layer 0 — URL liveness pre-gate
- One `fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8_000) })`
  per candidate, run inside the existing per-item budget/concurrency caps.
- **Status handling distinguishes *dead* from *blocked*** (this is the key nuance — a
  403 on Amazon is bot-protection, not a missing page; the product still exists):

  | Status | Meaning | Action |
  |--------|---------|--------|
  | 200–299 | live | keep candidate; **retain `html` for Layer 2** |
  | 404 / 410 | gone (truly dead) | **DROP candidate**, `deadUrls++` — never persist a broken link |
  | 403 / 429 / 503 | blocked / rate-limited (not dead) | keep candidate, **skip the HTML enhancement**; proceed on Tavily `raw_content` (Layers 1 + 3) |
  | timeout / network error | unknown | keep candidate, skip HTML enhancement (soft-fail, best-effort) |

- **Rationale:** the user's "only take 200, eliminate 403/404" intent is honored for
  *dead* pages (404/410 dropped) without discarding bot-protected big retailers whose
  Tavily `raw_content` is already in hand (Tavily content is server-rendered and
  bot-proof). Persisting a 404 would hand the user a broken source link; a 403 page is
  still a valid source we extracted real content from.
- **The fetched body (`html`) is retained and passed to Layer 2 only on 2xx** — no
  second fetch.

### 3.2 Tavily change — markdown → text
- `tavily-client.ts`: request raw content as **text** rather than markdown so regex sees
  clean prose, not `#`, `*`, `|` table noise. Tavily supports `include_raw_content`
  accepting `"text"` / `"markdown"`; switch to `"text"`.

### 3.3 Layer 1 — manual regex improvements
**A2 — price vocabulary expansion.** Add labeled-price anchors so a *labeled* price beats
a bare number: `sales price`, `list price`, `unit price`, `price each`, `our price`,
`MSRP`, `now`. A labeled match scores higher than an unlabeled currency-near-number.

**A1 — multi-price disambiguation (Amazon size-variant problem).**
- When more than one price is found, choose the price whose **surrounding ±N-char text
  window** best matches the item's spec identification tokens.
- Spec tokens come from `agent_item_summary.identification` + parsed spec
  (size / class / model / material), threaded into `manualExtract`.
- Score each candidate price = count of spec tokens present in its window. Highest wins.
- Tie / no-match → keep the lowest plausible price and append an `ambiguous-price` note
  so the human reviewer sees it.
- **Signature change:** `manualExtract(content, detected, specTokens?: string[])`.

### 3.4 Layer 2 — structured-HTML / cheerio
- New module `lib/services/search/html-extract.ts` (keeps `html-gate.ts` regex helpers
  intact; this is the cheerio/JSON-LD layer).
- Input: real HTML from Layer 0 (when 200).
- Order of attempts: JSON-LD `Product.offers.price`/`priceCurrency` → microdata
  (`itemprop="price"`) → OpenGraph (`product:price:amount`) → broad currency regex on
  the HTML body.
- Canonical: a structured price **overrides** an LLM price (it is exact and
  un-hallucinated), but still respects multi-price disambiguation (§3.3) when several
  offers exist.
- `cheerio` is added as a dependency.

### 3.5 Layer 3 — LLM extraction
- Unchanged role: always runs for `supplier_name` + `bidder_description` (+ compliance,
  notes, packaging, match_reasoning). Now it runs **after** Layers 1–2, so price/contact
  are only requested from the LLM when the deterministic layers missed them.
- Grounded on Tavily `raw_content` (current behavior).

### 3.6 `requires_quote` gate (formalizes the user's rule)
After Layers 1–3, when `price` is still unknown:
- **quote-intent present** (`detected.has_quote_request`, or text "request a quote" /
  "call for price" / "get a quote") → `requires_quote = true`, **accept the row**, do
  **not** escalate to Layer 4.
- **price unknown AND quote-intent unknown** → mark eligible for Layer 4 escalation.
  (Phase 1: the eligibility flag is recorded; Layer 4 is stubbed so the row is accepted
  with `price = unknown`.)

### 3.7 Fall-through summary
```
candidate
  └─ Layer 0 liveness ── 404 / 410 (dead) ──► DROP (deadUrls++)
        │ 2xx (html kept)            │ 403/429/503/timeout (blocked, html skipped)
        ▼                            ▼
  Layer 1 (raw_content regex) ───────┘
        │ price found ─────────────────────────────► use it
        │ price unknown
        ▼
  Layer 2 (cheerio on html, if html present)
        │ price found (canonical) ──────────────────► use it (override)
        │ price unknown
        ▼
  Layer 3 (LLM: always name/desc; price gap-fill)
        │ price found ──────────────────────────────► use it
        │ price unknown
        ▼
  requires_quote gate
        │ quote-intent ─────────────► requires_quote=true, accept (price unknown)
        │ neither ──────────────────► eligible-for-Layer-4 flag (Phase 2); accept now
```

### 3.8 Contact loopback (Task 2.2)
- After a row is extracted, if **both** `contact_email` and `contact_phone` are empty,
  flag the row for a contact-recovery pass.
- Recovery pass: build a contact-specific query
  `"<supplier_name>" contact email phone "get in touch"` via the query builder → one
  Tavily call → `manualExtract` (email/phone only) → write recovered contacts back onto
  the row before persistence.
- **Bounds:** at most **1 recovery round per supplier**, gated by the per-item
  `SearchBudget`, fail-safe (errors never block the row). Skipped when budget exhausted.

---

## 4. Task 3 — drop `supplier_search`, reclaim panel space

### 4.1 Database
- `DROP TABLE IF EXISTS supplier_search CASCADE;` (SQL delivered to user).
- Remove `supplierSearch` pgTable + `SupplierSearch`/`NewSupplierSearch` type exports
  from `lib/db/schema.ts`.
- New drizzle migration reflecting the drop.
- **Keep** `supplier_item_status` and `supplier_memory`.

### 4.2 Code audit (remove `supplier_search` reads/writes)
Trace and remove every path that persists/reads the summary table while preserving the
SSE/preview document flow:
- `supplier-search-actions.ts`: drop the `suppliers_search` persistence to the table and
  `buildSearchContent`'s table-bound usage; **keep** a minimal in-memory `subject` +
  `rfq_id` on the returned document envelope so the Suppliers tab and the Accept action
  still work. Telemetry continues via `logSearchStage` (console), no longer persisted to
  a table.
- `lib/utils/databaseHandler.ts`: remove the `supplier_search` write mapping.
- `lib/db/queries.ts`: remove `supplier_search` reads.
- `types/database.ts`, `types/preview.ts`, `lib/ui-reload/fetch-workspace.ts`,
  `lib/data-loader.ts`, `hooks/use-preview-sse.ts`: prune `supplier_search`
  table-derived fields; keep the `items_source`-derived document data.

### 4.3 UI
- Keep the Suppliers tab + `SupplierSearchDocument`.
- Remove the summary/telemetry header chrome from `supplier-search-document.tsx` so the
  **upper (supplier list)** and **lower (detail)** master-detail panels gain vertical
  space. No change to the workboard grid panel set.

### 4.4 Risk
`suppliers_search` is woven into the SSE document shape, `data-processor` preview
routing, and the Accept/Reject map. This is a careful multi-file audit; every reference
is traced before deletion. `lib/data-processor.ts` and `lib/db/schema.ts` are Rule-5
core modules → edited directly by the orchestrator.

---

## 5. Sequencing

1. **Task 3** — drop `supplier_search` + panel chrome cleanup (subtractive; shrinks
   surface area first).
2. **Layer 0** — liveness pre-gate + `deadUrls` wiring + URL 200 filter.
3. **Layer 1 + Tavily text** — vocab expansion + multi-price disambiguation.
4. **Layer 2** — `html-extract.ts` (cheerio/JSON-LD) reusing Layer 0 html.
5. **`requires_quote` gate** formalization.
6. **Contact loopback.**
7. **Layer 4 stub** behind flag (Phase 2 infra deferred).

---

## 6. Phase 2 (deferred) — Layer 4 image-to-text / VLM

- Vercel serverless can't run headless Chromium well; screenshotting many pages in a 60s
  function is impractical. **Deferred.**
- When built: render via an external browser/scrape API (Browserless/ScrapingBee) or a
  self-hosted Playwright worker, screenshot the page, run a Claude vision call, extract
  visible price/contact. Gated by the per-item budget and the §3.6 eligibility flag.
- Phase 1 leaves a feature-flagged stub + the eligibility flag so wiring Phase 2 is
  additive.

---

## 7. Decisions captured (from brainstorming)

- Task 3 = drop **`supplier_search` only**; keep engine + `supplier_item_status` +
  `supplier_memory`; keep Suppliers tab, strip summary chrome.
- Layer 4 VLM → **deferred to Phase 2**, stubbed behind a flag.
- Layer 2 HTML → **best-effort, reusing the Layer 0 liveness fetch** (one fetch; fall
  through on 403).
