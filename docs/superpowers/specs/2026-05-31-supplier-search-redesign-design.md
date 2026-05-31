# Supplier-Search Redesign — Multi-Page Hybrid Extraction

**Date:** 2026-05-31
**Branch:** `feat/llm-query-planning`
**Status:** Design approved, pending implementation plan
**Owner module:** `lib/actions/supplier-search-actions.ts` + `lib/services/search/**`

---

## 1. Goal

Rework the per-item supplier-search flow so that **every RFQ item ends with at least
3–5 distinct supplier sources** (plus substitute products where applicable), produced
**cheaply and accurately**, by:

1. Planning queries with the LLM only (no deterministic-direct tier).
2. Extracting **every filtered page** of a single search (not one supplier per query).
3. Extracting with a **manual-first + verify + LLM-gap-fill** hybrid.
4. Pre-eliminating out-of-stock / non-product pages **before** any extraction spend.
5. Surfacing **quote-required** pages to the operator.

This is a restructure of an existing pipeline, not a greenfield build. It reuses the
weighted scorer, budget circuit-breaker, density-loop control structure, telemetry, and
persistence already in place.

---

## 2. Approved decisions

| Decision | Choice |
|----------|--------|
| Extraction strategy | **Hybrid with confidence gate** — manual regex first, LLM re-verifies low-confidence/missing/zero fields |
| Verify layer | **Yes** — re-find each manually-extracted value in `raw_content`; failures go to LLM |
| Alternatives routing | **Loop back through filter → score → extract** (substitutes get the same quality gate) |
| Retry budget | **Bounded retries** — re-plan broadened queries up to ~2 extra rounds or until ≥3 sources |
| Tiers / memory | **Remove item-router Tier-1 bypass**; keep `supplier-memory` behind `SEARCH_MEMORY_ENABLED` (default off) |

---

## 3. Current pipeline (baseline being replaced)

`processSupplierSearch` per item, all items concurrent (`pLimit(8)`):

```
ROUTE (classifyItem)  ── Tier 1: 1 raw query, skip planner
                       └─ Tier 3: planQueries() → ≤8 queries + parsed spec
                            └─ L0 memory lookup → hit short-circuits everything
DENSITY LOOP (fan-out 3)
  per query: searchOneQuery → Tavily(1) → scoreProductPage → keep≥30
             extractSupplierForItem → ONE LLM call → ONE supplier
             stock filter (post-extraction) → microdata price override
             alt-URL re-loop (depth 1, supplier-linked only)
  until MIN_SOURCES=3 (target 5) or budget/queries exhausted
URL guards → supplier_id → rememberSupplier → persist
```

### Identified gaps

- **A. Tiers contradict "LLM only."** Tier-1 emits 1 query, not 8.
- **B. One supplier per query.** 3 sources require 3+ Tavily searches — wasteful and
  the main reason items fall short of the floor.
- **C. No page classification** (tech-spec PDF vs product page).
- **D. Stock filtering happens after extraction** — we pay to extract dead suppliers.
- **E. Scorer signals discarded** — detected fields don't drive extraction.
- **F. No quote-required flag.**
- **G. LLM-only extraction** — no manual/verify path; highest token cost.
- **H. No substitute discovery** for items that find 0 direct sources.

---

## 4. Proposed flow

```
fetch rfqItems from DB → sort by itemId ASC
PER ITEM (pLimit concurrency):

 1. PLAN
    planQueries(searchText) → { parsed spec, 8 ranked queries narrow→broad }
    (item-router removed; memory lookup only when SEARCH_MEMORY_ENABLED)

 2. HARVEST LOOP  (bounded; fan-out over the query list)
    per query:
      Tavily search (1 call, cache-first) → candidates [{url, title, content}]
      2a CLASSIFY     → page_type: 'tech_spec' (PDF/datasheet) | 'product'
      2b ELIMINATE    drop if:
                        • out-of-stock keyword match, OR
                        • stated available_qty < (required qty + buffer), OR
                        • no product/item terms present
                      (unknown / not-stated = BYPASS, never punish missing data)
      2c SCORE        weighted scorer → keep ≥ KEEP_THRESHOLD, re-rank best-first,
                      EMIT detected-field map (has_price, has_currency, has_contact,
                      has_stock, has_delivery, …) per kept page
      2d EXTRACT each kept page (parallel, capped):
           i.   manual regex extract, targeted by 2c detected-field map
           ii.  VERIFY: confirm each extracted value re-appears in raw_content
           iii. LLM gap-fill ONLY for fields that are missing / =0 / failed-verify /
                low-confidence  (one batched LLM call per page; skipped if nothing to fill)
           iv.  set requires_quote=true when page signals "request a quote /
                contact for price" and no price was extractable
      accumulate distinct sources (dedup by source_url); stop at ≥ MIN_SOURCES (target 5)

    if sources < MIN_SOURCES after the full query list:
      RE-PLAN broadened/alternative queries (bounded: ≤2 extra rounds) → repeat HARVEST

 3. ALT OUTER LOOP  (items still < MIN_SOURCES)
    LLM proposes substitute product spec(s) → re-enter PLAN → HARVEST
    (full filter→score→extract path); tag rows with match_reasoning

 4. PERSIST all sources per item (≥3-5 where the web allows)
    URL guards → deterministic supplier_id → rememberSupplier (if write-enabled) → DB
```

### 4.1 Module responsibilities

| Module | Change |
|--------|--------|
| `query-planner.ts` | Keep. Remove the bare-code re-rank dependency on router; always returns up to 8 queries. |
| `item-router.ts` | **Remove from critical path** (Tier-1 bypass deleted). File may be retained for tests or deleted. |
| `supplier-memory.ts` | Keep; only consulted when `SEARCH_MEMORY_ENABLED` (default off). |
| `product-page-scorer.ts` | Extend `ScoreResult` to emit a **detected-field map** alongside `signals[]`. Add a `classifyPage()` returning `'product' \| 'tech_spec'`. |
| **NEW** `eliminate.ts` | Pure pre-extraction filter: OOS keywords, qty floor, product-term presence. Unknown = bypass. |
| **NEW** `manual-extract.ts` | Pure regex extractor (price/currency/contact/delivery/qty/…) + `verifyAgainstContent()`. |
| `search-suppliers.ts` (prompt) | Repurpose to **gap-fill**: given a page + the fields still missing, fill only those. Add `requires_quote` semantics. |
| `density-loop.ts` | Keep control structure; extractor now returns **multiple rows per query** (one per kept page) and supports the bounded re-plan round. |
| `supplier-search-actions.ts` | Rewire orchestration to the new flow; remove ONE-supplier-per-query assumption. |

### 4.2 Extraction detail (the hybrid + verify gate)

For each kept page:

1. **Manual pass** — regex pulls each field, guided by the scorer's detected-field map
   (don't hunt for a price the scorer already said isn't there).
2. **Verify pass** — every non-empty extracted value must re-appear in `raw_content`
   (normalized compare). A value that fails verification is treated as missing.
3. **Gap-fill pass** — collect `{missing ∪ zero ∪ failed-verify ∪ low-confidence}` fields;
   if non-empty, one batched LLM call fills only those from the page content. Microdata
   price override remains as the deterministic fallback when price is still 0.
4. **Final** — if a required-but-optional field (price/delivery) is still absent **and**
   the page shows quote-request intent → `requires_quote = true`.

**Always-required fields:** `supplier_name`, `bidder_description`, `source_url`.
**Optional (may be quote-gated):** `bidder_unit_price`, `currency_code`, `delivery_time`,
`contact_email`, `contact_phone`.

### 4.3 Bounded retry & substitutes

- Re-plan rounds capped (default 2) via an env knob; budget circuit-breaker
  (`budget.ts`) remains the hard wall-clock/LLM-call leash.
- Substitute discovery only fires when an item is still below the floor after direct
  re-plans, so it never adds cost to easily-sourced items.

---

## 5. Data model changes (`lib/db/schema.ts` — Rule 5 core, edited by Claude directly)

Add to `items_source` / `supplierItemStatus`:

| Column | Type | Meaning |
|--------|------|---------|
| `requires_quote` | boolean (default false) | page sells the item but needs a manual quote request |
| `page_type` | text ('product' \| 'tech_spec') | classification from 2a |
| `extraction_confidence` | text or smallint | overall confidence / which track filled the row |

`match_reasoning`, `available_qty`, `selling_unit`, `pack_size`, `extraction_track`
already exist and are reused.

UI (downer panel, `items-ordering-document.tsx`) shows a "Request quote" affordance
linking to `source_url` when `requires_quote`.

---

## 6. Performance & accuracy rationale

- **Cost ↓** — manual-first limits LLM to gap-fill; 2b eliminates dead pages before
  extraction; multi-page extraction yields N sources per Tavily call instead of 1.
- **Accuracy ↑** — verify layer rejects regex false-positives and LLM hallucinations
  (value must exist in `raw_content`); OOS pre-filter keeps unfulfillable suppliers out.
- **Completeness ↑** — multi-page harvest + bounded re-plan + substitute discovery make
  the ≥3-source floor reachable rather than silently degraded.
- **Operator UX** — `requires_quote` tells the user exactly which sources need a manual
  quote and where to go.

---

## 7. Non-goals / out of scope

- Re-enabling L1 pgvector near-match memory (left provisioned, off).
- Field-level diffing for the `research` action (still re-runs the full flow).
- Vision/LLM page classification (deterministic classifier only).

---

## 8. Testing

- Unit: `eliminate.ts`, `manual-extract.ts` + `verifyAgainstContent`, `classifyPage`,
  detected-field map — all pure, table-driven (same discipline as existing
  `testDensityLoop.ts` / scorer tests).
- Integration: orchestrator produces ≥3 sources for sourceable items; falls through to
  substitute discovery for unsourceable ones; `requires_quote` set correctly.
- Telemetry assertions: `items_below_target`, per-stage logs unchanged in shape.
