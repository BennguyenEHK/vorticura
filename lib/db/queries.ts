// =============================================
// 📊 TYPE-SAFE QUERY BUILDERS
// =============================================
// Purpose: Reusable database queries with automatic workspace filtering
// Provides both generic CRUD functions and specialized query builders

import { eq, and, desc, asc, SQL } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { db } from './client';
import {
  // Tenant & User Tables
  clientCompany,
  clientInfo,

  // Quotation System Tables
  quotations,
  quotationItems,
  quotationPricing,
  customers,

  // Workflow Tables
  emailTable,
  rfqAnalysis,
  supplierSearch,

  // File Management Tables
  fileMetadata,

  // Session & Connection Tables
  userSessions,
  sseConnections,
  sessions,
} from './schema';
import { WorkspaceDatabaseHelper } from './workspace-helper';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

// Import types for better type safety
import type {
  Quotation,
  NewQuotation,
  QuotationItem,
  NewQuotationItem,
  QuotationPricing,
  NewQuotationPricing,
} from './schema';

// =============================================
// 🛠️ GENERIC CRUD FUNCTIONS
// =============================================

/**
 * 1️⃣ insertData - Generic INSERT with workspace context injection
 *
 * @param table - Drizzle table definition
 * @param columns - Columns object (used for type checking, can be empty {})
 * @param dataPayload - Data to insert
 * @param workspace - WorkspaceContext for tenant isolation
 * @returns Inserted record with all fields
 *
 * Usage Example:
 * ```typescript
 * const newQuotation = await insertData(
 *   quotations,
 *   {},
 *   { quotation_name: 'Q-001', rfq_reference: 'RFQ-001' },
 *   workspace
 * );
 * ```
 */
export async function insertData<T extends PgTable>(
  table: T,
  columns: Record<string, unknown>, // Column filters (not used for INSERT, kept for API consistency)
  dataPayload: Partial<T['$inferInsert']>,
  workspace: WorkspaceContext
): Promise<T['$inferSelect']> {
  // Create workspace helper for context injection
  const helper = new WorkspaceDatabaseHelper(workspace);

  // Inject workspace context (company_id + client_id)
  const dataWithContext = helper.injectContext(dataPayload as Record<string, unknown>);

  console.log(`📝 INSERT into ${table} with workspace context:`, {
    company_id: dataWithContext.company_id,
    client_id: dataWithContext.client_id,
  });

  // Execute INSERT with workspace context
  const result = await db
    .insert(table)
    .values(dataWithContext as T['$inferInsert'])
    .returning();

  return result[0] as T['$inferSelect'];
}

/**
 * 2️⃣ getData - Generic SELECT with workspace filtering and optional JOIN support
 *
 * @param table - Drizzle table definition (can be array for JOIN operations)
 * @param columns - WHERE clause columns as key-value pairs
 * @param workspace - WorkspaceContext for tenant isolation
 * @returns Array of records matching the criteria
 *
 * Usage Examples:
 *
 * Simple SELECT:
 * ```typescript
 * const allQuotations = await getData(quotations, {}, workspace);
 * ```
 *
 * SELECT with WHERE:
 * ```typescript
 * const draft = await getData(
 *   quotations,
 *   { quotation_status: 'draft' },
 *   workspace
 * );
 * ```
 *
 * SELECT with JOIN (when table is array with length >= 2):
 * ```typescript
 * const withItems = await getData(
 *   [quotations, quotationItems],
 *   { quotation_id: 123 },
 *   workspace
 * );
 * ```
 */
export async function getData<T extends PgTable>(
  table: T | T[], // Support single table or array for JOINs
  columns: Record<string, unknown>, // WHERE clause columns
  workspace: WorkspaceContext
): Promise<any[]> { // Using 'any[]' for flexibility with JOINs
  // Create workspace helper
  const helper = new WorkspaceDatabaseHelper(workspace);

  // Check if JOIN operation is needed (table length >= 2)
  if (Array.isArray(table) && table.length >= 2) {
    // JOIN operation
    const [primaryTable, ...joinTables] = table;

    console.log(`📊 SELECT with JOIN from table with ${joinTables.length} join(s)`);

    // Build WHERE filters from columns
    const additionalFilters: SQL[] = Object.entries(columns).map(([key, value]) =>
      eq((primaryTable as any)[key], value)
    );

    // Execute query with LEFT JOIN
    // Note: Due to Drizzle's complex JOIN typing, we use 'as any' for dynamic joins
    let query: any = db
      .select()
      .from(primaryTable as any)
      .$dynamic();

    // Add LEFT JOINs for additional tables
    for (const joinTable of joinTables) {
      // Assume join on common columns (quotation_id, company_id, etc.)
      // This is a simplified join - customize based on your schema relationships
      query = query.leftJoin(
        joinTable as any,
        and(
          eq((primaryTable as any).quotationId, (joinTable as any).quotationId),
          eq((primaryTable as any).companyId, (joinTable as any).companyId)
        )
      );
    }

    // Apply WHERE clause with workspace filtering
    const results = await query.where(
      helper.buildWhereClause(primaryTable, additionalFilters)
    );

    return results;
  } else {
    // Simple SELECT operation
    const targetTable = Array.isArray(table) ? table[0] : table;

    console.log(`📊 SELECT from table with filters:`, columns);

    // Build WHERE filters from columns
    const additionalFilters: SQL[] = Object.entries(columns).map(([key, value]) =>
      eq((targetTable as any)[key], value)
    );

    // Execute query with workspace filtering
    const results = await db
      .select()
      .from(targetTable as any)
      .where(helper.buildWhereClause(targetTable, additionalFilters));

    return results;
  }
}

/**
 * 3️⃣ updateData - Generic UPDATE with workspace filtering and multiple column support
 *
 * @param table - Drizzle table definition
 * @param columns - WHERE clause columns as key-value pairs (supports multiple columns)
 * @param dataPayload - Data to update
 * @param workspace - WorkspaceContext for tenant isolation
 * @returns Updated records
 *
 * Usage Examples:
 *
 * Update with single column:
 * ```typescript
 * const updated = await updateData(
 *   quotations,
 *   { quotation_id: 1 },
 *   { quotation_status: 'approved' },
 *   workspace
 * );
 * ```
 *
 * Update with multiple columns:
 * ```typescript
 * const updated = await updateData(
 *   quotationItems,
 *   { quotation_id: 1, item_id: 5 },
 *   { qty: 100, bidder_unit_price: 50.00 },
 *   workspace
 * );
 * ```
 */
export async function updateData<T extends PgTable>(
  table: T,
  columns: Record<string, unknown>, // WHERE clause columns (supports multiple)
  dataPayload: Partial<T['$inferInsert']>,
  workspace: WorkspaceContext
): Promise<T['$inferSelect'][]> {
  // Create workspace helper
  const helper = new WorkspaceDatabaseHelper(workspace);

  console.log(`✏️ UPDATE ${table} with filters:`, columns);

  // Build WHERE filters from columns (support multiple columns)
  const additionalFilters: SQL[] = buildMultipleColumnFilters(table, columns);

  // Execute UPDATE with workspace filtering
  const results = await db
    .update(table)
    .set(dataPayload as Partial<T['$inferInsert']>)
    .where(helper.buildWhereClause(table, additionalFilters))
    .returning();

  return results as T['$inferSelect'][];
}

/**
 * 4️⃣ deleteData - Generic DELETE with workspace filtering and multiple column support
 *
 * @param table - Drizzle table definition
 * @param columns - WHERE clause columns as key-value pairs (supports multiple columns)
 * @param dataPayload - Not used for DELETE (kept for API consistency, can be empty {})
 * @param workspace - WorkspaceContext for tenant isolation
 * @returns Deleted records
 *
 * Usage Examples:
 *
 * Delete with single column:
 * ```typescript
 * const deleted = await deleteData(
 *   quotations,
 *   { quotation_id: 1 },
 *   {},
 *   workspace
 * );
 * ```
 *
 * Delete with multiple columns:
 * ```typescript
 * const deleted = await deleteData(
 *   quotationItems,
 *   { quotation_id: 1, item_id: 5 },
 *   {},
 *   workspace
 * );
 * ```
 */
export async function deleteData<T extends PgTable>(
  table: T,
  columns: Record<string, unknown>, // WHERE clause columns (supports multiple)
  dataPayload: Record<string, unknown>, // Not used for DELETE
  workspace: WorkspaceContext
): Promise<T['$inferSelect'][]> {
  // Create workspace helper
  const helper = new WorkspaceDatabaseHelper(workspace);

  console.log(`🗑️ DELETE from ${table} with filters:`, columns);

  // Build WHERE filters from columns (support multiple columns)
  const additionalFilters: SQL[] = buildMultipleColumnFilters(table, columns);

  // Execute DELETE with workspace filtering
  const results = await db
    .delete(table)
    .where(helper.buildWhereClause(table, additionalFilters))
    .returning();

  return results as T['$inferSelect'][];
}

// =============================================
// 🔧 HELPER FUNCTIONS
// =============================================

/**
 * Build multiple column filters for WHERE clause
 * Supports injecting multiple columns (len >= 2)
 *
 * @param table - Drizzle table definition
 * @param columns - Columns object with key-value pairs
 * @returns Array of SQL filter conditions
 */
function buildMultipleColumnFilters<T extends PgTable>(
  table: T,
  columns: Record<string, unknown>
): SQL[] {
  const filters: SQL[] = [];

  // Iterate through all columns and create eq() conditions
  for (const [key, value] of Object.entries(columns)) {
    if (value !== undefined && key in table) {
      filters.push(eq((table as any)[key], value));
    }
  }

  return filters;
}

// =============================================
// 📄 SPECIALIZED QUOTATION QUERIES (Examples)
// =============================================

/**
 * Get all quotations for workspace (type-safe)
 */
export async function getQuotations(workspace: WorkspaceContext) {
  const helper = new WorkspaceDatabaseHelper(workspace);

  return await db
    .select()
    .from(quotations)
    .where(helper.buildWhereClause(quotations)) // ✅ Auto workspace filter
    .orderBy(desc(quotations.createdAt));
}

/**
 * Get quotation by ID with workspace filtering (type-safe)
 */
export async function getQuotationById(
  quotationId: number,
  workspace: WorkspaceContext
) {
  const helper = new WorkspaceDatabaseHelper(workspace);

  const results = await db
    .select()
    .from(quotations)
    .where(
      helper.buildWhereClause(quotations, [
        eq(quotations.quotationId, quotationId) // ✅ Type-safe column reference
      ])
    );

  return results[0] || null;
}

/**
 * Get quotation with all related data (type-safe)
 */
export async function getQuotationWithItems(
  quotationId: number,
  workspace: WorkspaceContext
) {
  const helper = new WorkspaceDatabaseHelper(workspace);

  // Get quotation
  const quotation = await getQuotationById(quotationId, workspace);
  if (!quotation) return null;

  // Get items (fully type-safe)
  const items = await db
    .select()
    .from(quotationItems)
    .where(
      helper.buildWhereClause(quotationItems, [
        eq(quotationItems.quotationId, quotationId)
      ])
    )
    .orderBy(asc(quotationItems.itemId));

  // Get pricing (fully type-safe)
  const pricing = await db
    .select()
    .from(quotationPricing)
    .where(
      helper.buildWhereClause(quotationPricing, [
        eq(quotationPricing.quotationId, quotationId)
      ])
    );

  return {
    ...quotation,
    items, // ✅ Typed as QuotationItem[]
    pricing, // ✅ Typed as QuotationPricing[]
  };
}

/**
 * Insert new quotation (type-safe)
 */
export async function createQuotation(
  data: Partial<NewQuotation>,
  workspace: WorkspaceContext
) {
  const helper = new WorkspaceDatabaseHelper(workspace);

  // Inject workspace context
  const quotationData = helper.injectContext(data as Record<string, unknown>);

  const result = await db
    .insert(quotations)
    .values(quotationData as NewQuotation) // ✅ Type-checked against schema
    .returning();

  return result[0];
}

/**
 * Update quotation (type-safe)
 */
export async function updateQuotation(
  quotationId: number,
  data: Partial<NewQuotation>,
  workspace: WorkspaceContext
) {
  const helper = new WorkspaceDatabaseHelper(workspace);

  const results = await db
    .update(quotations)
    .set(data) // ✅ Type-checked
    .where(
      helper.buildWhereClause(quotations, [
        eq(quotations.quotationId, quotationId)
      ])
    )
    .returning();

  return results[0] || null;
}

/**
 * Delete quotation (type-safe)
 */
export async function deleteQuotation(
  quotationId: number,
  workspace: WorkspaceContext
) {
  const helper = new WorkspaceDatabaseHelper(workspace);

  const results = await db
    .delete(quotations)
    .where(
      helper.buildWhereClause(quotations, [
        eq(quotations.quotationId, quotationId)
      ])
    )
    .returning();

  return results[0] || null;
}

// =============================================
// 📧 EMAIL QUERIES
// =============================================

/**
 * Get emails by quotation ID
 */
export async function getEmailsByQuotation(
  quotationId: number,
  workspace: WorkspaceContext
) {
  const helper = new WorkspaceDatabaseHelper(workspace);

  return await db
    .select()
    .from(emailTable)
    .where(
      helper.buildWhereClause(emailTable, [
        eq(emailTable.quotationId, quotationId)
      ])
    )
    .orderBy(desc(emailTable.createdAt));
}

// =============================================
// 🗂️ FILE QUERIES
// =============================================

/**
 * Get active files by category
 */
export async function getActiveFiles(
  workspace: WorkspaceContext,
  category?: string
) {
  const helper = new WorkspaceDatabaseHelper(workspace);

  const additionalFilters: SQL[] = [
    eq(fileMetadata.fileStatus, 'active')
  ];

  // Add category filter if provided
  if (category) {
    additionalFilters.push(eq(fileMetadata.fileCategory, category));
  }

  return await db
    .select()
    .from(fileMetadata)
    .where(helper.buildWhereClause(fileMetadata, additionalFilters))
    .orderBy(desc(fileMetadata.uploadDate));
}

// =============================================
// 💾 SESSION QUERIES
// =============================================

/**
 * Get user session by session ID
 */
export async function getUserSession(
  companyId: number,
  clientId: number,
  workspace: WorkspaceContext
) {
  const helper = new WorkspaceDatabaseHelper(workspace);

  const results = await db
    .select()
    .from(userSessions)
    .where(
      helper.buildWhereClause(userSessions, [
        eq(userSessions.companyId, companyId),
        eq(userSessions.clientId, clientId)
      ])
    );

  return results[0] || null;
}
