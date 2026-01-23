CREATE TABLE "client_company" (
	"company_id" serial PRIMARY KEY NOT NULL,
	"company_name" text,
	"company_number" varchar(50),
	"company_address" text,
	"company_fax" varchar(50),
	"company_email" varchar(60),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "client_info" (
	"client_id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"username" varchar(50) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"email" varchar(255),
	"client_role" varchar(30) DEFAULT 'user',
	"permissions" text,
	"last_login" timestamp,
	"client_status" varchar(20) DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"quotation_id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"client_id" integer,
	"company_name" varchar(255) NOT NULL,
	"attention_person" text,
	"carbon_copy_person" text[],
	"email" varchar(255),
	"customer_address" text,
	"phone" varchar(50),
	"fax_number" varchar(60),
	"customer_status" varchar(20) DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_table" (
	"email_id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"quotation_id" integer,
	"client_id" integer,
	"rfq_reference" varchar(100),
	"recipient_email" varchar(255),
	"subject" text,
	"email_content" text,
	"email_status" varchar(30) DEFAULT 'draft',
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "file_metadata" (
	"file_id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"client_id" integer,
	"file_name" varchar(255) NOT NULL,
	"file_type" varchar(50),
	"file_image" "bytea",
	"file_html" text,
	"file_size" bigint,
	"upload_date" timestamp DEFAULT now(),
	"uploaded_by" varchar(100),
	"file_category" varchar(50),
	"file_status" varchar(20) DEFAULT 'active'
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"item_id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"quotation_id" integer NOT NULL,
	"client_id" integer,
	"company_description" text,
	"bidder_description" text,
	"qty" numeric(10, 0),
	"bidder_unit_price" numeric(12, 2),
	"uom" varchar(20),
	"delivery_time" varchar(50),
	"compliance_deviation" text,
	"currency_code" varchar(3),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quotation_pricing" (
	"item_id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"quotation_id" integer NOT NULL,
	"client_id" integer,
	"shipping_cost" numeric(15, 2),
	"exchange_currency" varchar(3),
	"tax_rate" numeric(5, 4),
	"profit_rate" numeric(5, 4),
	"discount_rate" numeric(5, 4),
	"sales_unit_price" numeric(15, 2),
	"ext_price" numeric(15, 2),
	"potential_profit" numeric(12, 2),
	"exchange_rate" numeric(15, 6),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"quotation_id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"client_id" integer,
	"rfq_reference" varchar(100),
	"quotation_name" text,
	"quotation_html" text,
	"quotation_status" varchar(30) DEFAULT 'draft',
	"version_number" integer DEFAULT 1,
	"total_amount" numeric(15, 2),
	"transfer_currency_code" varchar(3),
	"commercial_terms" text,
	"generated_day" date,
	"created_by" varchar(100),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rfq_analysis" (
	"analysis_id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"quotation_id" integer,
	"client_id" integer,
	"rfq_reference" varchar(100),
	"subject" text,
	"analysis_content" text,
	"analysis_status" varchar(30) DEFAULT 'completed',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_id" varchar(255) PRIMARY KEY NOT NULL,
	"company_id" integer,
	"session_name" varchar(100),
	"process_pid" integer,
	"start_time" timestamp DEFAULT now(),
	"end_time" timestamp,
	"session_status" varchar(20) DEFAULT 'active',
	"server_port" integer,
	"ngrok_url" varchar(500),
	"created_by" varchar(100),
	"session_data" text
);
--> statement-breakpoint
CREATE TABLE "sse_connections" (
	"connection_id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"session_id" varchar(255),
	"client_ip" "inet",
	"user_agent" text,
	"connection_time" timestamp DEFAULT now(),
	"disconnect_time" timestamp,
	"connection_status" varchar(20) DEFAULT 'connected',
	"last_heartbeat" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplier_search" (
	"search_id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"quotation_id" integer,
	"client_id" integer,
	"rfq_reference" varchar(100),
	"subject" text,
	"search_content" text,
	"search_status" varchar(30) DEFAULT 'completed',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"company_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"last_viewed_item_id" integer,
	"last_viewed_type" varchar(50) DEFAULT 'quotation',
	"last_viewed_type_id" integer,
	"last_viewed_timestamp" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_sessions_company_id_client_id_pk" PRIMARY KEY("company_id","client_id")
);
