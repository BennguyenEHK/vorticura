-- =============================================
-- Migration 0002: Add incoming_emails table
-- =============================================
-- New table for email-watcher gateway: stores raw inbound emails,
-- AI classifies them, then routes to rfq_analysis or supplier_respond pipeline.

CREATE TABLE IF NOT EXISTS "incoming_emails" (
  "id" serial PRIMARY KEY,
  "message_id" varchar(255) UNIQUE,                                  -- dedup key from email headers
  "from_email" varchar(255),
  "from_name" varchar(255),
  "to_recipients" text[],                                            -- TO addresses
  "cc_recipients" text[],                                            -- CC addresses
  "subject" text,
  "email_body_text" text,
  "attachments_parsed" jsonb,                                        -- [{filename, content_type, extracted_text}]
  "classification_type" varchar(30),                                 -- 'rfq_analysis' | 'supplier_respond'
  "classification_confidence" numeric(4, 3),                         -- e.g. 0.950
  "rfq_id" integer REFERENCES "rfq_analysis"("rfq_id") ON DELETE SET NULL,
  "client_id" integer,
  "company_id" integer NOT NULL REFERENCES "client_company"("company_id"),
  "received_at" timestamp,
  "processed_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

-- Index on company_id for tenant-scoped queries
CREATE INDEX IF NOT EXISTS "idx_incoming_emails_company" ON "incoming_emails" ("company_id");
--> statement-breakpoint

-- Index on rfq_id for pipeline lookups
CREATE INDEX IF NOT EXISTS "idx_incoming_emails_rfq" ON "incoming_emails" ("rfq_id");
