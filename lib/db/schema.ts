/**
 * Database Schema Definitions using Drizzle ORM
 * Generated from quoteflow_database_schema.sql
 *
 * This file contains all table definitions for the QuoteFlow application
 * Total Tables: 13
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  numeric,
  date,
  bigint,
  inet,
  jsonb,
  primaryKey,
  unique,
  check,
  index,
} from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================
// 1. CLIENT_COMPANY TABLE
// ============================================
export const clientCompany = pgTable('client_company', {
  // Primary key - Auto-incrementing company ID
  companyId: serial('company_id').primaryKey(),

  // Company information
  companyName: text('company_name'),
  companyNumber: varchar('company_number', { length: 50 }),
  companyAddress: text('company_address'),
  companyFax: varchar('company_fax', { length: 50 }),
  companyEmail: varchar('company_email', { length: 60 }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================
// 2. CLIENT_INFO TABLE
// ============================================
export const clientInfo = pgTable('client_info', {
  // Primary key - Auto-incrementing client ID
  clientId: serial('client_id').primaryKey(),

  // Foreign key reference to company
  companyId: integer('company_id').references(() => clientCompany.companyId),

  // Authentication credentials
  username: varchar('username', { length: 50 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }), // Nullable for OAuth-only users
  email: varchar('email', { length: 255 }),

  // OAuth provider info (null = traditional email/password signup)
  oauthProvider: varchar('oauth_provider', { length: 20 }),       // 'google' | 'microsoft' | null
  oauthProviderId: varchar('oauth_provider_id', { length: 255 }), // Provider's unique user ID

  // User role and permissions
  clientRole: varchar('client_role', { length: 30 }).default('user'),
  permissions: text('permissions'),

  // Session tracking
  lastLogin: timestamp('last_login', { withTimezone: false }),

  // User status
  clientStatus: varchar('client_status', { length: 20 }).default('active'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================
// 3. RFQ_ANALYSIS TABLE (root entity — entry point)
// ============================================
export const rfqAnalysis = pgTable('rfq_analysis', {
  // Primary key - RENAMED from analysis_id to rfq_id
  rfqId: serial('rfq_id').primaryKey(),

  // Foreign keys — company_id is NOT NULL tenant FK
  companyId: integer('company_id').notNull().references(() => clientCompany.companyId),
  clientId: integer('client_id'),

  // RFQ identification — NOT NULL
  rfqReference: varchar('rfq_reference', { length: 100 }).notNull(),
  subject: text('subject'),

  // Analysis content
  analysisContent: text('analysis_content'),

  // Analysis status
  analysisStatus: varchar('analysis_status', { length: 30 }).default('completed'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================
// 4. QUOTATIONS TABLE — now references parent RFQ
// ============================================
export const quotations = pgTable('quotations', {
  // Primary key - Auto-incrementing quotation ID
  quotationId: serial('quotation_id').primaryKey(),

  // NEW: FK to rfq_analysis (the parent RFQ)
  rfqId: integer('rfq_id').notNull().references(() => rfqAnalysis.rfqId, { onDelete: 'cascade' }),

  // Foreign keys — company_id is NOT NULL tenant FK
  companyId: integer('company_id').notNull().references(() => clientCompany.companyId),
  clientId: integer('client_id'),

  // Quotation identification
  rfqReference: varchar('rfq_reference', { length: 100 }),
  quotationName: text('quotation_name'),

  // REMOVED: quotation_html (JSON-as-Source-of-Truth replaces HTML rendering)

  // Quotation status and versioning
  quotationStatus: varchar('quotation_status', { length: 30 }).default('draft'),
  versionNumber: integer('version_number').default(1),

  // Financial summary
  totalAmount: numeric('total_amount', { precision: 15, scale: 2 }),
  transferCurrencyCode: varchar('transfer_currency_code', { length: 3 }),

  // Commercial terms
  commercialTerms: text('commercial_terms'),

  // Metadata
  generatedDay: date('generated_day'),
  createdBy: varchar('created_by', { length: 100 }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => ({
  // Unique constraint: one quotation per RFQ per version
  uqRfqVersion: unique('uq_quotations_rfq_version').on(table.rfqId, table.versionNumber),
}));

// ============================================
// 5. CUSTOMERS TABLE — PK renamed to customer_id
// ============================================
export const customers = pgTable('customers', {
  // Primary key - RENAMED from quotation_id to customer_id
  customerId: serial('customer_id').primaryKey(),

  // FK to rfq_analysis (customer is known at RFQ stage)
  rfqId: integer('rfq_id').references(() => rfqAnalysis.rfqId, { onDelete: 'cascade' }),

  // Foreign keys — company_id NOT NULL
  companyId: integer('company_id').notNull().references(() => clientCompany.companyId),
  clientId: integer('client_id'),

  // Customer company information
  companyName: varchar('company_name', { length: 255 }).notNull(),
  attentionPerson: text('attention_person'),
  carbonCopyPerson: text('carbon_copy_person').array(), // Array of text

  // Contact information
  email: varchar('email', { length: 255 }),
  customerAddress: text('customer_address'),
  phone: varchar('phone', { length: 50 }),
  faxNumber: varchar('fax_number', { length: 60 }),

  // Customer status
  customerStatus: varchar('customer_status', { length: 20 }).default('active'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================
// 6. EMAIL_TABLE — can belong to either lifecycle stage
// ============================================
export const emailTable = pgTable('email_table', {
  // Primary key - Auto-incrementing email ID
  emailId: serial('email_id').primaryKey(),

  // NEW: FK to rfq_analysis (for RFQ-stage emails)
  rfqId: integer('rfq_id').references(() => rfqAnalysis.rfqId, { onDelete: 'set null' }),

  // Foreign keys
  companyId: integer('company_id').notNull().references(() => clientCompany.companyId),
  quotationId: integer('quotation_id').references(() => quotations.quotationId, { onDelete: 'set null' }),
  clientId: integer('client_id'),

  // Email metadata
  rfqReference: varchar('rfq_reference', { length: 100 }),
  recipientEmail: varchar('recipient_email', { length: 255 }),
  subject: text('subject'),

  // Email content
  emailContent: text('email_content'),

  // Email status and tracking
  emailStatus: varchar('email_status', { length: 30 }).default('draft'),
  sentAt: timestamp('sent_at', { withTimezone: false }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => ({
  // CHECK: every email must belong to at least one stage
  chkEmailHasParent: check('chk_email_has_parent',
    sql`${table.rfqId} IS NOT NULL OR ${table.quotationId} IS NOT NULL`
  ),
}));

// ============================================
// 7. FILE_METADATA TABLE — add RFQ/quotation linkage
// ============================================
export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const fileMetadata = pgTable('file_metadata', {
  // Primary key - Auto-incrementing file ID
  fileId: serial('file_id').primaryKey(),

  // NEW: FK to rfq_analysis (original RFQ attachments)
  rfqId: integer('rfq_id').references(() => rfqAnalysis.rfqId, { onDelete: 'set null' }),

  // NEW: FK to quotations (generated quotation documents)
  quotationId: integer('quotation_id').references(() => quotations.quotationId, { onDelete: 'set null' }),

  // Foreign keys — company_id NOT NULL
  companyId: integer('company_id').notNull().references(() => clientCompany.companyId),
  clientId: integer('client_id'),

  // File information
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 50 }),

  // File content (stored as binary/HTML)
  fileImage: bytea('file_image'),
  fileHtml: text('file_html'),

  // File metadata
  fileSize: bigint('file_size', { mode: 'number' }),
  uploadDate: timestamp('upload_date', { withTimezone: false }).defaultNow(),
  uploadedBy: varchar('uploaded_by', { length: 100 }),

  // File categorization
  fileCategory: varchar('file_category', { length: 50 }),
  fileStatus: varchar('file_status', { length: 20 }).default('active'),
});

// ============================================
// 8. QUOTATION_ITEMS TABLE
// ============================================
export const quotationItems = pgTable('quotation_items', {
  // Primary key - Auto-incrementing item ID
  itemId: serial('item_id').primaryKey(),

  // Foreign keys — company_id NOT NULL, quotation_id FK
  companyId: integer('company_id').notNull().references(() => clientCompany.companyId),
  quotationId: integer('quotation_id').notNull().references(() => quotations.quotationId, { onDelete: 'cascade' }),
  clientId: integer('client_id'),

  // Item descriptions
  companyDescription: text('company_description'),
  bidderDescription: text('bidder_description'),

  // Quantity and pricing
  qty: numeric('qty', { precision: 10, scale: 0 }),
  bidderUnitPrice: numeric('bidder_unit_price', { precision: 12, scale: 2 }),

  // Unit of measure and delivery
  uom: varchar('uom', { length: 20 }),
  deliveryTime: varchar('delivery_time', { length: 50 }),

  // Compliance and currency
  complianceDeviation: text('compliance_deviation'),
  currencyCode: varchar('currency_code', { length: 3 }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
});

// ============================================
// 9. QUOTATION_PRICING TABLE
// ============================================
export const quotationPricing = pgTable('quotation_pricing', {
  // Primary key - Item ID (linked to quotation_items)
  itemId: serial('item_id').primaryKey(),

  // Foreign keys — company_id NOT NULL, quotation_id FK
  companyId: integer('company_id').notNull().references(() => clientCompany.companyId),
  quotationId: integer('quotation_id').notNull().references(() => quotations.quotationId, { onDelete: 'cascade' }),
  clientId: integer('client_id'),

  // Pricing calculations
  shippingCost: numeric('shipping_cost', { precision: 15, scale: 2 }),
  exchangeCurrency: varchar('exchange_currency', { length: 3 }),

  // Rates (stored as decimals, e.g., 0.0750 for 7.5%)
  taxRate: numeric('tax_rate', { precision: 5, scale: 4 }),
  profitRate: numeric('profit_rate', { precision: 5, scale: 4 }),
  discountRate: numeric('discount_rate', { precision: 5, scale: 4 }),

  // Calculated prices
  salesUnitPrice: numeric('sales_unit_price', { precision: 15, scale: 2 }),
  extPrice: numeric('ext_price', { precision: 15, scale: 2 }),
  potentialProfit: numeric('potential_profit', { precision: 12, scale: 2 }),

  // Exchange rate (6 decimal places for precision)
  exchangeRate: numeric('exchange_rate', { precision: 15, scale: 6 }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================
// 10. SESSIONS TABLE
// ============================================
export const sessions = pgTable('sessions', {
  // Primary key - Session ID (string-based UUID)
  sessionId: varchar('session_id', { length: 255 }).primaryKey(),

  // Foreign key
  companyId: integer('company_id'),

  // Session metadata
  sessionName: varchar('session_name', { length: 100 }),
  processPid: integer('process_pid'),

  // Session lifecycle
  startTime: timestamp('start_time', { withTimezone: false }).defaultNow(),
  endTime: timestamp('end_time', { withTimezone: false }),
  sessionStatus: varchar('session_status', { length: 20 }).default('active'),

  // Server configuration
  serverPort: integer('server_port'),
  ngrokUrl: varchar('ngrok_url', { length: 500 }),

  // Session data and creator
  createdBy: varchar('created_by', { length: 100 }),
  sessionData: text('session_data'),
});

// ============================================
// 11. SSE_CONNECTIONS TABLE
// ============================================
export const sseConnections = pgTable('sse_connections', {
  // Primary key - Auto-incrementing connection ID
  connectionId: serial('connection_id').primaryKey(),

  // Foreign keys
  companyId: integer('company_id'),
  sessionId: varchar('session_id', { length: 255 }),

  // Connection metadata
  clientIp: inet('client_ip'),
  userAgent: text('user_agent'),

  // Connection lifecycle
  connectionTime: timestamp('connection_time', { withTimezone: false }).defaultNow(),
  disconnectTime: timestamp('disconnect_time', { withTimezone: false }),
  connectionStatus: varchar('connection_status', { length: 20 }).default('connected'),

  // Heartbeat tracking
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: false }).defaultNow(),
});

// ============================================
// 12. SUPPLIER_SEARCH TABLE — belongs to RFQ stage
// ============================================
export const supplierSearch = pgTable('supplier_search', {
  // Primary key - Auto-incrementing search ID
  searchId: serial('search_id').primaryKey(),

  // CHANGED: quotation_id → rfq_id (supplier search happens during RFQ stage)
  rfqId: integer('rfq_id').notNull().references(() => rfqAnalysis.rfqId, { onDelete: 'cascade' }),

  // Foreign keys — company_id NOT NULL
  companyId: integer('company_id').notNull().references(() => clientCompany.companyId),
  clientId: integer('client_id'),

  // Search identification
  rfqReference: varchar('rfq_reference', { length: 100 }),
  subject: text('subject'),

  // Search content
  searchContent: text('search_content'),

  // Search status
  searchStatus: varchar('search_status', { length: 30 }).default('completed'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================
// 13. SUPPLIER_ITEM_STATUS TABLE
// ============================================
// Tracks per-item availability from each supplier for procurement optimization
// Used by supplier_respond flow: when ALL items reach 'available' → trigger quotation
export const supplierItemStatus = pgTable('supplier_item_status', {
  // Primary key
  id: serial('id').primaryKey(),

  // FK → rfq_analysis (groups all items for one RFQ)
  rfqId: integer('rfq_id').notNull().references(() => rfqAnalysis.rfqId, { onDelete: 'cascade' }),

  // FK → quotation_items (which specific item)
  itemId: integer('item_id').references(() => quotationItems.itemId),

  // Supplier identification
  supplierId: integer('supplier_id'),
  supplierName: varchar('supplier_name', { length: 255 }),

  // Where the supplier was found (search result URL)
  sourceUrl: text('source_url'),

  // Item status: 'pending' | 'available' | 'unavailable'
  status: varchar('status', { length: 20 }).default('pending').notNull(),

  // Supplier's quoted price and delivery for this item
  unitPrice: numeric('unit_price', { precision: 15, scale: 4 }),
  deliveryTime: varchar('delivery_time', { length: 100 }),

  // Supplier notes/comments about this item
  notes: text('notes'),

  // When the supplier responded
  respondedAt: timestamp('responded_at', { withTimezone: false }),

  // Tenant isolation
  companyId: integer('company_id').notNull().references(() => clientCompany.companyId),
  clientId: integer('client_id'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================
// 14. USER_SESSIONS TABLE
// ============================================
export const userSessions = pgTable(
  'user_sessions',
  {
    // Composite primary key (company_id, client_id)
    companyId: integer('company_id').notNull(),
    clientId: integer('client_id').notNull(),

    // Last viewed item tracking
    lastViewedItemId: integer('last_viewed_item_id'),
    lastViewedType: varchar('last_viewed_type', { length: 50 }).default('quotation'),
    lastViewedTypeId: integer('last_viewed_type_id'),
    lastViewedTimestamp: timestamp('last_viewed_timestamp', { withTimezone: false }).defaultNow(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false })
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    // Composite primary key definition
    pk: primaryKey({ columns: [table.companyId, table.clientId] }),
  })
);

// ============================================
// 14. WORKBOARD_SNAPSHOTS TABLE — persistent workboard versioning
// ============================================
export const workboardSnapshots = pgTable('workboard_snapshots', {
  // Primary key
  snapshotId: serial('snapshot_id').primaryKey(),

  // FK to rfq_analysis (which RFQ this snapshot belongs to)
  rfqId: integer('rfq_id').notNull().references(() => rfqAnalysis.rfqId, { onDelete: 'cascade' }),

  // Tenant isolation
  companyId: integer('company_id').notNull().references(() => clientCompany.companyId),
  clientId: integer('client_id'),

  // Snapshot versioning
  version: integer('version').notNull(),

  // The workflow step that triggered this snapshot
  triggeredBy: varchar('triggered_by', { length: 50 }).notNull(),

  // Snapshot label (e.g., "Analysis accepted")
  label: text('label'),

  // Full workboard state as JSON
  panelsSnapshot: jsonb('panels_snapshot').notNull(),
  workflowSnapshot: jsonb('workflow_snapshot').notNull(),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
}, (table) => ({
  uqRfqVersion: unique('uq_workboard_snapshots_rfq_version').on(table.rfqId, table.version),
}));

// ============================================
// 15. EMAIL_CONNECTIONS TABLE — OAuth email integrations
// ============================================
export const emailConnections = pgTable('email_connections', {
  // Primary key
  connectionId: serial('connection_id').primaryKey(),

  // Foreign keys — tenant isolation
  companyId: integer('company_id').notNull().references(() => clientCompany.companyId),
  clientId: integer('client_id').notNull().references(() => clientInfo.clientId),

  // Provider info
  provider: varchar('provider', { length: 20 }).notNull(),          // 'gmail' | 'outlook'
  providerAccountId: varchar('provider_account_id', { length: 255 }), // Google sub / Microsoft oid
  emailAddress: varchar('email_address', { length: 255 }).notNull(),

  // OAuth tokens (encrypted at rest via AES-256-GCM)
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: false }).notNull(),
  scopes: text('scopes'), // Granted OAuth scopes

  // Webhook/push subscription state
  subscriptionId: varchar('subscription_id', { length: 255 }),     // Pub/Sub or Graph subscription ID
  historyId: varchar('history_id', { length: 255 }),               // Gmail: last known historyId
  subscriptionExpires: timestamp('subscription_expires', { withTimezone: false }), // MS: subscription expiry (max 3 days)

  // Connection state
  status: varchar('status', { length: 20 }).default('active'),     // active | paused | expired | revoked
  lastSyncAt: timestamp('last_sync_at', { withTimezone: false }),
  lastError: text('last_error'),
  errorCount: integer('error_count').default(0),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => ({
  // One email address per company
  uqCompanyEmail: unique('uq_email_connections_company_email').on(table.companyId, table.emailAddress),
}));

// ============================================
// TYPE EXPORTS
// ============================================
// Export inferred types for TypeScript usage
export type ClientCompany = typeof clientCompany.$inferSelect;
export type NewClientCompany = typeof clientCompany.$inferInsert;

export type ClientInfo = typeof clientInfo.$inferSelect;
export type NewClientInfo = typeof clientInfo.$inferInsert;

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export type Email = typeof emailTable.$inferSelect;
export type NewEmail = typeof emailTable.$inferInsert;

export type FileMetadata = typeof fileMetadata.$inferSelect;
export type NewFileMetadata = typeof fileMetadata.$inferInsert;

export type QuotationItem = typeof quotationItems.$inferSelect;
export type NewQuotationItem = typeof quotationItems.$inferInsert;

export type QuotationPricing = typeof quotationPricing.$inferSelect;
export type NewQuotationPricing = typeof quotationPricing.$inferInsert;

export type Quotation = typeof quotations.$inferSelect;
export type NewQuotation = typeof quotations.$inferInsert;

export type RfqAnalysis = typeof rfqAnalysis.$inferSelect;
export type NewRfqAnalysis = typeof rfqAnalysis.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type SseConnection = typeof sseConnections.$inferSelect;
export type NewSseConnection = typeof sseConnections.$inferInsert;

export type SupplierSearch = typeof supplierSearch.$inferSelect;
export type NewSupplierSearch = typeof supplierSearch.$inferInsert;

export type SupplierItemStatus = typeof supplierItemStatus.$inferSelect;
export type NewSupplierItemStatus = typeof supplierItemStatus.$inferInsert;

export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;

export type WorkboardSnapshot = typeof workboardSnapshots.$inferSelect;
export type NewWorkboardSnapshot = typeof workboardSnapshots.$inferInsert;

export type EmailConnection = typeof emailConnections.$inferSelect;
export type NewEmailConnection = typeof emailConnections.$inferInsert;
