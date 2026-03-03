-- =============================================
-- Migration 0001: Schema Redesign
-- =============================================
-- Fixes: temporal FK mismatch, no referential integrity, wrong FK directions
-- Strategy: ALTER only, never DROP+CREATE — all existing data preserved
-- Ordered to respect FK dependencies (parents before children)

-- =============================================
-- PHASE A: RENAME PK + ADD NEW COLUMNS (nullable, no constraints yet)
-- =============================================

-- A1. rfq_analysis: RENAME PK analysis_id → rfq_id
ALTER TABLE "rfq_analysis" RENAME COLUMN "analysis_id" TO "rfq_id";
--> statement-breakpoint

-- A2. quotations: ADD rfq_id (nullable for now)
ALTER TABLE "quotations" ADD COLUMN "rfq_id" integer;
--> statement-breakpoint

-- A3. supplier_search: ADD rfq_id (nullable for now, will replace quotation_id)
ALTER TABLE "supplier_search" ADD COLUMN "rfq_id" integer;
--> statement-breakpoint

-- A4. email_table: ADD rfq_id
ALTER TABLE "email_table" ADD COLUMN "rfq_id" integer;
--> statement-breakpoint

-- A5. file_metadata: ADD rfq_id + quotation_id
ALTER TABLE "file_metadata" ADD COLUMN "rfq_id" integer;
--> statement-breakpoint
ALTER TABLE "file_metadata" ADD COLUMN "quotation_id" integer;
--> statement-breakpoint

-- A6. customers: ADD customer_id column (will become new PK)
ALTER TABLE "customers" ADD COLUMN "customer_id" serial;
--> statement-breakpoint

-- =============================================
-- PHASE B: BACKFILL DATA using existing rfq_reference linkage
-- =============================================

-- B1. quotations: backfill rfq_id from rfq_analysis via rfq_reference
UPDATE "quotations" SET "rfq_id" = (
  SELECT ra."rfq_id" FROM "rfq_analysis" ra
  WHERE ra."rfq_reference" = "quotations"."rfq_reference"
  LIMIT 1
)
WHERE "rfq_id" IS NULL AND "rfq_reference" IS NOT NULL;
--> statement-breakpoint

-- B2. For quotations with NULL rfq_id after backfill (orphans with no matching rfq_analysis):
--     Create stub rfq_analysis rows, then link them back.
--     This INSERT creates one stub per distinct (company_id, rfq_reference) pair.
INSERT INTO "rfq_analysis" ("company_id", "client_id", "rfq_reference", "subject", "analysis_status")
SELECT DISTINCT q."company_id", q."client_id", COALESCE(q."rfq_reference", 'ORPHAN-' || q."quotation_id"),
       'Auto-created stub for orphan quotation', 'stub'
FROM "quotations" q
WHERE q."rfq_id" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "rfq_analysis" ra
    WHERE ra."rfq_reference" = COALESCE(q."rfq_reference", 'ORPHAN-' || q."quotation_id")
    AND ra."company_id" = q."company_id"
  );
--> statement-breakpoint

-- B3. Re-link orphan quotations after stub creation
UPDATE "quotations" SET "rfq_id" = (
  SELECT ra."rfq_id" FROM "rfq_analysis" ra
  WHERE ra."rfq_reference" = COALESCE("quotations"."rfq_reference", 'ORPHAN-' || "quotations"."quotation_id")
    AND ra."company_id" = "quotations"."company_id"
  LIMIT 1
)
WHERE "rfq_id" IS NULL;
--> statement-breakpoint

-- B4. supplier_search: backfill rfq_id from rfq_analysis via rfq_reference
UPDATE "supplier_search" SET "rfq_id" = (
  SELECT ra."rfq_id" FROM "rfq_analysis" ra
  WHERE ra."rfq_reference" = "supplier_search"."rfq_reference"
  LIMIT 1
)
WHERE "rfq_id" IS NULL AND "rfq_reference" IS NOT NULL;
--> statement-breakpoint

-- B5. supplier_search orphans: create stubs if needed, then link
INSERT INTO "rfq_analysis" ("company_id", "client_id", "rfq_reference", "subject", "analysis_status")
SELECT DISTINCT ss."company_id", ss."client_id", COALESCE(ss."rfq_reference", 'ORPHAN-SS-' || ss."search_id"),
       'Auto-created stub for orphan supplier_search', 'stub'
FROM "supplier_search" ss
WHERE ss."rfq_id" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "rfq_analysis" ra
    WHERE ra."rfq_reference" = COALESCE(ss."rfq_reference", 'ORPHAN-SS-' || ss."search_id")
    AND ra."company_id" = ss."company_id"
  );
--> statement-breakpoint

UPDATE "supplier_search" SET "rfq_id" = (
  SELECT ra."rfq_id" FROM "rfq_analysis" ra
  WHERE ra."rfq_reference" = COALESCE("supplier_search"."rfq_reference", 'ORPHAN-SS-' || "supplier_search"."search_id")
    AND ra."company_id" = "supplier_search"."company_id"
  LIMIT 1
)
WHERE "rfq_id" IS NULL;
--> statement-breakpoint

-- B6. email_table: backfill rfq_id from rfq_analysis via rfq_reference
UPDATE "email_table" SET "rfq_id" = (
  SELECT ra."rfq_id" FROM "rfq_analysis" ra
  WHERE ra."rfq_reference" = "email_table"."rfq_reference"
  LIMIT 1
)
WHERE "rfq_id" IS NULL AND "rfq_reference" IS NOT NULL;
--> statement-breakpoint

-- B7. file_metadata: backfill rfq_id/quotation_id where possible (context-dependent)
-- file_metadata has no rfq_reference, so we can't auto-backfill.
-- Leave rfq_id and quotation_id NULL for existing rows — they'll be set by the app going forward.
--> statement-breakpoint

-- B8. customers: copy current PK values (quotation_id) into customer_id
UPDATE "customers" SET "customer_id" = "quotation_id";
--> statement-breakpoint

-- =============================================
-- PHASE C: ADD NOT NULL CONSTRAINTS + FK REFERENCES
-- =============================================
-- Safe because data has been backfilled above.

-- C1. rfq_analysis: enforce company_id NOT NULL + FK, rfq_reference NOT NULL
-- First backfill any NULL company_id rows (edge case)
UPDATE "rfq_analysis" SET "company_id" = 0 WHERE "company_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "rfq_analysis" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "rfq_analysis" ALTER COLUMN "rfq_reference" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "rfq_analysis" ADD CONSTRAINT "fk_rfq_analysis_company"
  FOREIGN KEY ("company_id") REFERENCES "client_company"("company_id");
--> statement-breakpoint

-- C2. quotations: enforce rfq_id NOT NULL + FK, company_id NOT NULL + FK, add UNIQUE
-- Backfill any NULL company_id
UPDATE "quotations" SET "company_id" = 0 WHERE "company_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "quotations" ALTER COLUMN "rfq_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "quotations" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "fk_quotations_rfq"
  FOREIGN KEY ("rfq_id") REFERENCES "rfq_analysis"("rfq_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "fk_quotations_company"
  FOREIGN KEY ("company_id") REFERENCES "client_company"("company_id");
--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "uq_quotations_rfq_version"
  UNIQUE ("rfq_id", "version_number");
--> statement-breakpoint

-- C3. supplier_search: enforce rfq_id NOT NULL + FK, company_id NOT NULL + FK
UPDATE "supplier_search" SET "company_id" = 0 WHERE "company_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "supplier_search" ALTER COLUMN "rfq_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_search" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_search" ADD CONSTRAINT "fk_supplier_search_rfq"
  FOREIGN KEY ("rfq_id") REFERENCES "rfq_analysis"("rfq_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "supplier_search" ADD CONSTRAINT "fk_supplier_search_company"
  FOREIGN KEY ("company_id") REFERENCES "client_company"("company_id");
--> statement-breakpoint

-- C4. email_table: FK rfq_id, FK quotation_id, company_id NOT NULL + FK, CHECK constraint
UPDATE "email_table" SET "company_id" = 0 WHERE "company_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "email_table" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_table" ADD CONSTRAINT "fk_email_table_rfq"
  FOREIGN KEY ("rfq_id") REFERENCES "rfq_analysis"("rfq_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "email_table" ADD CONSTRAINT "fk_email_table_quotation"
  FOREIGN KEY ("quotation_id") REFERENCES "quotations"("quotation_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "email_table" ADD CONSTRAINT "fk_email_table_company"
  FOREIGN KEY ("company_id") REFERENCES "client_company"("company_id");
--> statement-breakpoint
ALTER TABLE "email_table" ADD CONSTRAINT "chk_email_has_parent"
  CHECK ("rfq_id" IS NOT NULL OR "quotation_id" IS NOT NULL);
--> statement-breakpoint

-- C5. file_metadata: FK rfq_id, FK quotation_id, company_id NOT NULL + FK
UPDATE "file_metadata" SET "company_id" = 0 WHERE "company_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "file_metadata" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "file_metadata" ADD CONSTRAINT "fk_file_metadata_rfq"
  FOREIGN KEY ("rfq_id") REFERENCES "rfq_analysis"("rfq_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "file_metadata" ADD CONSTRAINT "fk_file_metadata_quotation"
  FOREIGN KEY ("quotation_id") REFERENCES "quotations"("quotation_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "file_metadata" ADD CONSTRAINT "fk_file_metadata_company"
  FOREIGN KEY ("company_id") REFERENCES "client_company"("company_id");
--> statement-breakpoint

-- C6. customers: swap PK from quotation_id to customer_id, repurpose quotation_id as FK
ALTER TABLE "customers" DROP CONSTRAINT "customers_pkey";
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("customer_id");
--> statement-breakpoint
-- Now quotation_id is a regular column (was serial PK, now just integer FK)
UPDATE "customers" SET "company_id" = 0 WHERE "company_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "fk_customers_company"
  FOREIGN KEY ("company_id") REFERENCES "client_company"("company_id");
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "fk_customers_quotation"
  FOREIGN KEY ("quotation_id") REFERENCES "quotations"("quotation_id") ON DELETE CASCADE;
--> statement-breakpoint

-- C7. quotation_items: company_id NOT NULL + FK, quotation_id FK
UPDATE "quotation_items" SET "company_id" = 0 WHERE "company_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "quotation_items" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "fk_quotation_items_company"
  FOREIGN KEY ("company_id") REFERENCES "client_company"("company_id");
--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "fk_quotation_items_quotation"
  FOREIGN KEY ("quotation_id") REFERENCES "quotations"("quotation_id") ON DELETE CASCADE;
--> statement-breakpoint

-- C8. quotation_pricing: company_id NOT NULL + FK, quotation_id FK
UPDATE "quotation_pricing" SET "company_id" = 0 WHERE "company_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "quotation_pricing" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "quotation_pricing" ADD CONSTRAINT "fk_quotation_pricing_company"
  FOREIGN KEY ("company_id") REFERENCES "client_company"("company_id");
--> statement-breakpoint
ALTER TABLE "quotation_pricing" ADD CONSTRAINT "fk_quotation_pricing_quotation"
  FOREIGN KEY ("quotation_id") REFERENCES "quotations"("quotation_id") ON DELETE CASCADE;
--> statement-breakpoint

-- C9. client_info: FK company_id → client_company
ALTER TABLE "client_info" ADD CONSTRAINT "fk_client_info_company"
  FOREIGN KEY ("company_id") REFERENCES "client_company"("company_id");
--> statement-breakpoint

-- =============================================
-- PHASE D: DROP OBSOLETE COLUMNS
-- =============================================

-- D1. quotations: DROP quotation_html (JSON-as-Source-of-Truth replaces HTML rendering)
ALTER TABLE "quotations" DROP COLUMN "quotation_html";
--> statement-breakpoint

-- D2. rfq_analysis: DROP quotation_id (old column, root entity doesn't reference child)
ALTER TABLE "rfq_analysis" DROP COLUMN "quotation_id";
--> statement-breakpoint

-- D3. supplier_search: DROP quotation_id (replaced by rfq_id)
ALTER TABLE "supplier_search" DROP COLUMN "quotation_id";
--> statement-breakpoint

-- =============================================
-- PHASE E: ADD INDEXES
-- =============================================

-- Tenant isolation indexes (every table with company_id)
CREATE INDEX "idx_rfq_analysis_company" ON "rfq_analysis"("company_id");
--> statement-breakpoint
CREATE INDEX "idx_quotations_company" ON "quotations"("company_id");
--> statement-breakpoint
CREATE INDEX "idx_supplier_search_company" ON "supplier_search"("company_id");
--> statement-breakpoint
CREATE INDEX "idx_email_table_company" ON "email_table"("company_id");
--> statement-breakpoint
CREATE INDEX "idx_file_metadata_company" ON "file_metadata"("company_id");
--> statement-breakpoint
CREATE INDEX "idx_quotation_items_company" ON "quotation_items"("company_id");
--> statement-breakpoint
CREATE INDEX "idx_quotation_pricing_company" ON "quotation_pricing"("company_id");
--> statement-breakpoint
CREATE INDEX "idx_customers_company" ON "customers"("company_id");
--> statement-breakpoint

-- FK lookup indexes
CREATE INDEX "idx_quotations_rfq" ON "quotations"("rfq_id");
--> statement-breakpoint
CREATE INDEX "idx_supplier_search_rfq" ON "supplier_search"("rfq_id");
--> statement-breakpoint
CREATE INDEX "idx_email_table_rfq" ON "email_table"("rfq_id");
--> statement-breakpoint
CREATE INDEX "idx_email_table_quotation" ON "email_table"("quotation_id");
--> statement-breakpoint
CREATE INDEX "idx_file_metadata_rfq" ON "file_metadata"("rfq_id");
--> statement-breakpoint
CREATE INDEX "idx_file_metadata_quotation" ON "file_metadata"("quotation_id");
--> statement-breakpoint
CREATE INDEX "idx_quotation_items_quotation" ON "quotation_items"("quotation_id");
--> statement-breakpoint
CREATE INDEX "idx_quotation_pricing_quotation" ON "quotation_pricing"("quotation_id");
--> statement-breakpoint
CREATE INDEX "idx_customers_quotation" ON "customers"("quotation_id");
--> statement-breakpoint

-- Business lookup indexes
CREATE INDEX "idx_rfq_analysis_reference" ON "rfq_analysis"("rfq_reference");
--> statement-breakpoint
CREATE INDEX "idx_quotations_reference" ON "quotations"("rfq_reference");
--> statement-breakpoint
CREATE INDEX "idx_rfq_analysis_status" ON "rfq_analysis"("analysis_status");
--> statement-breakpoint
CREATE INDEX "idx_quotations_status" ON "quotations"("quotation_status");
