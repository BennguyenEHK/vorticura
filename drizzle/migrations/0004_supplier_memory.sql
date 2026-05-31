-- =============================================
-- Migration 0004: Add supplier_memory table (search Tier-0 learned cache)
-- =============================================
-- Persistent memoization of successful sourcing: a normalized RFQ spec
-- (spec_hash) maps to a previously-verified supplier/product page so an
-- identical future item resolves WITHOUT a live web search or LLM planning call.
-- Additive — the live supplier-search pipeline is unchanged when this table is
-- empty or memory is disabled (SEARCH_MEMORY_ENABLED).
--
-- PART A (below) is the L0 exact-match table — no extension required, safe on any
-- Postgres. PART B is the OPTIONAL pgvector L1 near-match layer; run it only when
-- you want embedding-based fuzzy matching (SEARCH_MEMORY_EMBEDDINGS=1).

-- ---------------------------------------------
-- PART A — L0 exact-match table (required)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS "supplier_memory" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "user_company"("company_id"),  -- tenant isolation
  "user_id" integer,
  "spec_hash" varchar(40) NOT NULL,                                       -- L0 exact-match key
  "spec_json" jsonb NOT NULL DEFAULT '{}'::jsonb,                         -- normalized ParsedSpec
  "supplier_name" varchar(255),
  "source_url" text NOT NULL,                                             -- verified product page
  "bidder_description" text,
  "bidder_unit_price" numeric(15, 4),
  "currency_code" varchar(3),
  "delivery_time" varchar(100),
  "available_qty" integer,
  "selling_unit" varchar(12),                                            -- 'per_unit' | 'per_pack'
  "pack_size" integer,
  "hit_count" integer NOT NULL DEFAULT 0,                                -- popularity / eviction signal
  "last_verified_at" timestamp DEFAULT now(),                            -- TTL / verify-on-stale
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

-- L0 dedup: one memory row per (tenant, spec, source).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_supplier_memory_key"
  ON "supplier_memory" ("company_id", "spec_hash", "source_url");
--> statement-breakpoint

-- L0 hot read path: (tenant, spec_hash) lookup.
CREATE INDEX IF NOT EXISTS "idx_supplier_memory_spec"
  ON "supplier_memory" ("company_id", "spec_hash");
--> statement-breakpoint

-- ---------------------------------------------
-- PART B — OPTIONAL pgvector L1 near-match layer
-- ---------------------------------------------
-- Run ONLY if you want embedding-based fuzzy matching. Requires the pgvector
-- extension (available on Neon). 384 dims = all-MiniLM-L6-v2 (the model already
-- shipped via @xenova/transformers). The application reads/writes this column via
-- raw SQL, gated behind SEARCH_MEMORY_EMBEDDINGS — it is NOT in the Drizzle schema,
-- so `drizzle-kit push` will not touch it.
--
--   CREATE EXTENSION IF NOT EXISTS vector;
--
--   ALTER TABLE "supplier_memory" ADD COLUMN IF NOT EXISTS "embedding" vector(384);
--
--   -- Approximate-NN index for cosine similarity (build AFTER some rows exist).
--   CREATE INDEX IF NOT EXISTS "idx_supplier_memory_embedding"
--     ON "supplier_memory" USING hnsw ("embedding" vector_cosine_ops);
