-- Migration: Rename client→user tables/columns, quotation_items→rfq_items, add bidder fields to supplier_item_status
-- Generated for: refactor(schema) commit

-- ============================================
-- 1. RENAME TABLES
-- ============================================
ALTER TABLE "client_company" RENAME TO "user_company";
ALTER TABLE "client_info" RENAME TO "user_info";
ALTER TABLE "quotation_items" RENAME TO "rfq_items";

-- ============================================
-- 2. RENAME client_id → user_id COLUMNS (all tables that have it)
-- ============================================
ALTER TABLE "user_info" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "user_info" RENAME COLUMN "client_role" TO "user_role";
ALTER TABLE "user_info" RENAME COLUMN "client_status" TO "user_status";
ALTER TABLE "rfq_analysis" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "quotations" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "customers" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "email_table" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "file_metadata" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "rfq_items" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "quotation_pricing" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "supplier_search" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "supplier_item_status" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "user_sessions" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "workboard_snapshots" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "email_connections" RENAME COLUMN "client_id" TO "user_id";
ALTER TABLE "incoming_emails" RENAME COLUMN "client_id" TO "user_id";

-- ============================================
-- 3. RFQ_ITEMS: rename quotation_id → rfq_id, drop bidder columns
-- ============================================
-- Drop the old FK constraint on quotation_id before renaming
ALTER TABLE "rfq_items" DROP CONSTRAINT IF EXISTS "quotation_items_quotation_id_quotations_quotation_id_fk";
-- Rename column
ALTER TABLE "rfq_items" RENAME COLUMN "quotation_id" TO "rfq_id";
-- Add new FK to rfq_analysis
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_rfq_id_rfq_analysis_rfq_id_fk"
  FOREIGN KEY ("rfq_id") REFERENCES "rfq_analysis"("rfq_id") ON DELETE CASCADE;
-- Drop bidder columns (moved to supplier_item_status)
ALTER TABLE "rfq_items" DROP COLUMN IF EXISTS "bidder_description";
ALTER TABLE "rfq_items" DROP COLUMN IF EXISTS "bidder_unit_price";
ALTER TABLE "rfq_items" DROP COLUMN IF EXISTS "delivery_time";
ALTER TABLE "rfq_items" DROP COLUMN IF EXISTS "compliance_deviation";

-- ============================================
-- 4. SUPPLIER_ITEM_STATUS: add bidder fields, rename unit_price
-- ============================================
ALTER TABLE "supplier_item_status" ADD COLUMN IF NOT EXISTS "bidder_description" text;
ALTER TABLE "supplier_item_status" RENAME COLUMN "unit_price" TO "bidder_unit_price";
ALTER TABLE "supplier_item_status" ADD COLUMN IF NOT EXISTS "compliance_deviation" text;

-- ============================================
-- 5. Update FK constraints that referenced old table names
-- ============================================
-- user_info FK → user_company
ALTER TABLE "user_info" DROP CONSTRAINT IF EXISTS "client_info_company_id_client_company_company_id_fk";
ALTER TABLE "user_info" ADD CONSTRAINT "user_info_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");

-- rfq_analysis FK → user_company
ALTER TABLE "rfq_analysis" DROP CONSTRAINT IF EXISTS "rfq_analysis_company_id_client_company_company_id_fk";
ALTER TABLE "rfq_analysis" ADD CONSTRAINT "rfq_analysis_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");

-- quotations FK → user_company
ALTER TABLE "quotations" DROP CONSTRAINT IF EXISTS "quotations_company_id_client_company_company_id_fk";
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");

-- customers FK → user_company
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_company_id_client_company_company_id_fk";
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");

-- email_table FK → user_company
ALTER TABLE "email_table" DROP CONSTRAINT IF EXISTS "email_table_company_id_client_company_company_id_fk";
ALTER TABLE "email_table" ADD CONSTRAINT "email_table_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");

-- file_metadata FK → user_company
ALTER TABLE "file_metadata" DROP CONSTRAINT IF EXISTS "file_metadata_company_id_client_company_company_id_fk";
ALTER TABLE "file_metadata" ADD CONSTRAINT "file_metadata_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");

-- rfq_items FK → user_company
ALTER TABLE "rfq_items" DROP CONSTRAINT IF EXISTS "quotation_items_company_id_client_company_company_id_fk";
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");

-- quotation_pricing FK → user_company
ALTER TABLE "quotation_pricing" DROP CONSTRAINT IF EXISTS "quotation_pricing_company_id_client_company_company_id_fk";
ALTER TABLE "quotation_pricing" ADD CONSTRAINT "quotation_pricing_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");

-- supplier_search FK → user_company
ALTER TABLE "supplier_search" DROP CONSTRAINT IF EXISTS "supplier_search_company_id_client_company_company_id_fk";
ALTER TABLE "supplier_search" ADD CONSTRAINT "supplier_search_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");

-- supplier_item_status FK → user_company
ALTER TABLE "supplier_item_status" DROP CONSTRAINT IF EXISTS "supplier_item_status_company_id_client_company_company_id_fk";
ALTER TABLE "supplier_item_status" ADD CONSTRAINT "supplier_item_status_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");

-- supplier_item_status FK → rfq_items (was quotation_items)
ALTER TABLE "supplier_item_status" DROP CONSTRAINT IF EXISTS "supplier_item_status_item_id_quotation_items_item_id_fk";
ALTER TABLE "supplier_item_status" ADD CONSTRAINT "supplier_item_status_item_id_rfq_items_item_id_fk"
  FOREIGN KEY ("item_id") REFERENCES "rfq_items"("item_id");

-- workboard_snapshots FK → user_company
ALTER TABLE "workboard_snapshots" DROP CONSTRAINT IF EXISTS "workboard_snapshots_company_id_client_company_company_id_fk";
ALTER TABLE "workboard_snapshots" ADD CONSTRAINT "workboard_snapshots_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");

-- email_connections FK → user_company and user_info
ALTER TABLE "email_connections" DROP CONSTRAINT IF EXISTS "email_connections_company_id_client_company_company_id_fk";
ALTER TABLE "email_connections" ADD CONSTRAINT "email_connections_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");

ALTER TABLE "email_connections" DROP CONSTRAINT IF EXISTS "email_connections_client_id_client_info_client_id_fk";
ALTER TABLE "email_connections" ADD CONSTRAINT "email_connections_user_id_user_info_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "user_info"("user_id");

-- incoming_emails FK → user_company
ALTER TABLE "incoming_emails" DROP CONSTRAINT IF EXISTS "incoming_emails_company_id_client_company_company_id_fk";
ALTER TABLE "incoming_emails" ADD CONSTRAINT "incoming_emails_company_id_user_company_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "user_company"("company_id");
