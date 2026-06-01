-- 0005_add_requires_quote_columns
-- Date: 2026-06-01
-- Fixes runtime error: column "requires_quote" does not exist (42703) on every
-- read of supplier_item_status. These three columns were added to lib/db/schema.ts
-- in the 2026-05-31 multi-page hybrid extraction redesign (commit 73d9ead) but were
-- never pushed to the Neon database, so Drizzle's db.select() (which lists ALL schema
-- columns) failed on the missing column.
--
-- Additive + idempotent (IF NOT EXISTS). Defaults mirror schema.ts:490-492 exactly.
-- Already applied to the live DB on 2026-06-01; kept here as the reproducible record
-- for any environment synced via `drizzle-kit migrate`/`push`.

ALTER TABLE "supplier_item_status" ADD COLUMN IF NOT EXISTS "requires_quote" boolean DEFAULT false;
ALTER TABLE "supplier_item_status" ADD COLUMN IF NOT EXISTS "page_type" varchar(12) DEFAULT 'product';
ALTER TABLE "supplier_item_status" ADD COLUMN IF NOT EXISTS "extraction_confidence" varchar(16);
