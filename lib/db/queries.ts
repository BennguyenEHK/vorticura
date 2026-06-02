/**
 * =============================================
 * 🔍 GENERIC DATABASE QUERIES
 * =============================================
 * Purpose: Reusable CRUD operations with workspace isolation
 *
 * Features:
 * - insertData: Generic insert with workspace context injection
 * - getData: Generic select with automatic leftJoin for multi-table queries
 * - updateData: Generic update with multiple column where conditions
 * - deleteData: Generic delete with multiple column where conditions
 *
 * All functions enforce workspace isolation using WorkspaceContext directly
 */

import { eq, SQL, and, count, desc, max, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { WorkspaceContext } from '@/lib/middleware/workspace-context'; // Direct usage, no helper wrapper
import { db } from './client';

// Import all essential tables from schema.ts
import {
  userCompany,      // renamed from clientCompany
  userInfo,         // renamed from clientInfo
  customers,
  emailConnections,
  emailTable,
  fileMetadata,
  rfqItems,         // renamed from quotationItems
  quotationPricing,
  quotations,
  rfqAnalysis,
  sessions,
  sseConnections,
  supplierItemStatus,
  userSessions,
  workboardSnapshots,
  incomingEmails,
  uiReload,
  aiConversations,
} from './schema';

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Build multiple column conditions for WHERE clause
 * Supports dynamic column filtering (e.g., quotation_id AND user_id)
 *
 * @param table - Drizzle table definition
 * @param columns - Object with column names and values { quotation_id: 1, user_id: 2 }
 * @returns Array of SQL conditions to be combined with AND
 *
 * Example:
 * ```typescript
 * multipleCol(quotations, { quotation_id: 1, rfq_reference: 'RFQ-001' })
 * // Returns: [eq(quotations.quotation_id, 1), eq(quotations.rfq_reference, 'RFQ-001')]
 * ```
 */
function multipleCol<T extends PgTable>(
  table: T,
  columns: Record<string, unknown>
): SQL[] {
  const conditions: SQL[] = [];

  // Iterate through each column in the columns object
  for (const [key, value] of Object.entries(columns)) {
    // Skip undefined values — otherwise eq(col, undefined) becomes `col = NULL`,
    // which is UNKNOWN in SQL and silently matches zero rows (the trap that caused
    // last_preview_type updates to no-op in Phase 1 / shared-workspace mode).
    if (value === undefined) continue;
    // Check if the column exists in the table
    if (key in table) {
      // Add eq condition for each column-value pair
      conditions.push(eq((table as any)[key], value as any));
    } else {
      console.warn(`Column "${key}" does not exist in table, skipping...`);
    }
  }

  return conditions;
}

/**
 * Get table reference by name
 * Maps string table names to actual Drizzle table objects
 *
 * @param tableName - Name of the table as string
 * @returns Drizzle table object or throws error if not found
 */
function getTableByName(tableName: string): PgTable {
  const tableMap: Record<string, PgTable> = {
    userCompany,       // renamed from clientCompany
    userInfo,          // renamed from clientInfo
    customers,
    emailConnections,
    emailTable,
    fileMetadata,
    rfqItems,          // renamed from quotationItems
    quotationPricing,
    quotations,
    rfqAnalysis,
    sessions,
    sseConnections,
    supplierItemStatus,
    userSessions,
    workboardSnapshots,
    incomingEmails,
  };

  const table = tableMap[tableName];
  if (!table) {
    throw new Error(`Table "${tableName}" not found. Available tables: ${Object.keys(tableMap).join(', ')}`);
  }

  return table;
}

// =============================================
// 1️⃣ INSERT DATA
// =============================================

/**
 * Generic INSERT function with workspace context injection
 * Automatically adds company_id and client_id from workspace context
 *
 * @param tableName - Name of the table (e.g., 'quotations', 'quotationItems')
 * @param columns - Column names to insert (not used in current implementation, reserved for future)
 * @param dataPayload - Data object to insert
 * @param workspace - WorkspaceContext for tenant isolation
 * @returns Inserted record or null
 *
 * Example:
 * ```typescript
 * const newQuotation = await insertData(
 *   'quotations',
 *   {},
 *   { quotation_name: 'Q-001', rfq_reference: 'RFQ-2024-001' },
 *   workspace
 * );
 * ```
 */
export async function insertData<T extends Record<string, unknown>>(
  tableName: string,
  _columns: Record<string, unknown>, // Reserved for future column filtering (prefixed with _ to mark as intentionally unused)
  dataPayload: T,
  workspace: WorkspaceContext
): Promise<any> {
  try {
    // Get the actual table object from table map
    const table = getTableByName(tableName);

    // Inject workspace context (company_id, client_id) directly using WorkspaceContext
    const dataWithContext = workspace.injectWorkspaceContext(dataPayload);

    // Execute INSERT query with workspace context injected
    const results = await db
      .insert(table as any)
      .values(dataWithContext) // ✅ Type-checked with workspace context
      .returning();

    // Return the first inserted record or null
    return (results as any[])[0] || null;
  } catch (error) {
    // Log error for debugging but sanitize message for security
    console.error('Database insert operation failed:', error);
    throw new Error('Failed to insert data. Please check your input and try again.');
  }
}

// =============================================
// 2️⃣ GET DATA
// =============================================

/**
 * Generic SELECT function with optional LEFT JOIN support
 * Automatically applies workspace filtering (company_id, client_id)
 *
 * LEFT JOIN logic: If table array length >= 2, performs leftJoin with configurable join column
 *
 * @param tableNames - Single table name OR array of table names for JOIN
 * @param columns - Where conditions { quotation_id: 1, status: 'active' }
 * @param workspace - WorkspaceContext for tenant isolation
 * @param options - Optional configuration { joinColumn: 'quotationId' (default), customJoinCondition: SQL condition }
 * @returns Array of matching records
 *
 * Example 1 (Single Table):
 * ```typescript
 * const quotations = await getData('quotations', { quotation_id: 1 }, workspace);
 * ```
 *
 * Example 2 (Multiple Tables with LEFT JOIN - using default quotation_id):
 * ```typescript
 * const quotationsWithItems = await getData(
 *   ['quotations', 'quotationItems'],
 *   { quotation_id: 1 },
 *   workspace
 * );
 * // Performs: SELECT * FROM quotations LEFT JOIN quotationItems ON quotations.quotation_id = quotationItems.quotation_id
 * ```
 *
 * Example 3 (Custom join column):
 * ```typescript
 * const dataWithCustomJoin = await getData(
 *   ['table1', 'table2'],
 *   { some_id: 1 },
 *   workspace,
 *   { joinColumn: 'customId' }
 * );
 * ```
 */
export async function getData(
  tableNames: string | string[],
  columns: Record<string, unknown>,
  workspace: WorkspaceContext,
  options?: { joinColumn?: string; customJoinCondition?: SQL }
): Promise<any[]> {
  try {
    // Normalize table names to array
    const tables = Array.isArray(tableNames) ? tableNames : [tableNames];

    if (tables.length === 0) {
      throw new Error('At least one table name must be provided.');
    }

    // Primary table
    const primaryTable = getTableByName(tables[0]);

    // Build WHERE conditions (workspace filters + user-provided columns)
    const whereConditions = multipleCol(primaryTable, columns);
    const whereClause = workspace.buildWhereClause(primaryTable, whereConditions);

    // =========================
    // CASE 1: Single-table query
    // =========================
    if (tables.length === 1) {
      const results = await db
        .select()
        .from(primaryTable as any)
        .where(whereClause);

      return results;
    }

    // =========================
    // CASE 2: Two-table LEFT JOIN
    // =========================
    if (tables.length === 2) {
      const secondaryTable = getTableByName(tables[1]);

      // Workspace filter (company_id, optional client_id)
      const workspaceFilter = workspace.getDatabaseFilter();

      // Join column (default: quotationId)
      const joinColumn = options?.joinColumn || 'quotationId';

      const joinConditions: SQL[] = [];

      // Custom join condition OR default join column
      if (options?.customJoinCondition) {
        joinConditions.push(options.customJoinCondition);
      } else {
        if (!(joinColumn in primaryTable)) {
          throw new Error(
            `Join column "${joinColumn}" does not exist in table "${tables[0]}"`
          );
        }

        if (!(joinColumn in secondaryTable)) {
          throw new Error(
            `Join column "${joinColumn}" does not exist in table "${tables[1]}"`
          );
        }

        joinConditions.push(
          eq(
            (primaryTable as any)[joinColumn],
            (secondaryTable as any)[joinColumn]
          )
        );
      }

      // Enforce tenant isolation on secondary table (CRITICAL)
      if ('companyId' in secondaryTable) {
        joinConditions.push(
          eq(
            (secondaryTable as any).companyId,
            workspaceFilter.company_id
          )
        );
      }

      if (
        workspaceFilter.user_id !== undefined &&
        'userId' in secondaryTable
      ) {
        joinConditions.push(
          eq(
            (secondaryTable as any).userId,
            workspaceFilter.user_id
          )
        );
      }

      const results = await db
        .select()
        .from(primaryTable as any)
        .leftJoin(
          secondaryTable as any,
          and(...joinConditions)
        )
        .where(whereClause); // primary table workspace filters

      return results;
    }

    // =========================
    // CASE 3: More than 2 tables (not supported yet)
    // =========================
    throw new Error(
      `getData currently supports only 1 or 2 tables. Received: ${tables.length}`
    );
  } catch (error) {
    console.error('Database select operation failed:', error);
    throw new Error(
      'Failed to retrieve data. Please check your query and try again.'
    );
  }
}


// =============================================
// 2️⃣ᵃ COUNT DATA
// =============================================

/**
 * Generic COUNT function for efficient record counting
 * Returns only the count without loading all rows into memory
 * Automatically applies workspace filtering (company_id, client_id)
 *
 * @param tableName - Single table name to count
 * @param columns - Where conditions { quotation_id: 1, status: 'active' }
 * @param workspace - WorkspaceContext for tenant isolation
 * @returns Record count as number
 *
 * Example:
 * ```typescript
 * const count = await getCount('quotations', { status: 'active' }, workspace);
 * // Returns: 42
 * ```
 */
export async function getCount(
  tableName: string,
  columns: Record<string, unknown>,
  workspace: WorkspaceContext
): Promise<number> {
  try {
    // Get the actual table object from table map
    const table = getTableByName(tableName);

    // Build WHERE conditions (workspace filters + user-provided columns)
    const whereConditions = multipleCol(table, columns);
    const whereClause = workspace.buildWhereClause(table, whereConditions); // Direct usage

    // Execute COUNT query efficiently without loading all rows using Drizzle count() function
    const result = await db
      .select({ count: count() })
      .from(table as any)
      .where(whereClause);

    // Extract count from result
    const countValue = result[0]?.count;
    return typeof countValue === 'number' ? countValue : 0;
  } catch (error) {
    // Log error for debugging but sanitize message for security
    console.error('Database count operation failed:', error);
    throw new Error('Failed to count records. Please check your query and try again.');
  }
}

// =============================================
// 3️⃣ UPDATE DATA
// =============================================

/**
 * Generic UPDATE function with multiple column WHERE conditions
 * Supports updating records filtered by multiple columns
 *
 * @param tableName - Name of the table to update
 * @param columns - Where conditions { quotation_id: 1, user_id: 1 }
 * @param dataPayload - Data to update { quotation_name: 'Updated Name' }
 * @param workspace - WorkspaceContext for tenant isolation
 * @returns Updated record or null
 *
 * Example:
 * ```typescript
 * const updated = await updateData(
 *   'quotations',
 *   { quotation_id: 1, client_id: 5 },
 *   { quotation_status: 'completed', total_amount: 5000 },
 *   workspace
 * );
 * ```
 */
export async function updateData<T extends Record<string, unknown>>(
  tableName: string,
  columns: Record<string, unknown>,
  dataPayload: T,
  workspace: WorkspaceContext
): Promise<any> {
  try {
    // Get the actual table object from table map
    const table = getTableByName(tableName);

    // Build WHERE conditions using multipleCol helper
    const whereConditions = multipleCol(table, columns);

    // Execute UPDATE query with workspace filtering (direct WorkspaceContext usage)
    const results = await db
      .update(table as any)
      .set(dataPayload) // ✅ Type-checked update data
      .where(
        workspace.buildWhereClause(table, whereConditions) // Combine workspace filters + user conditions
      )
      .returning();

    // Return the first updated record or null
    return (results as any[])[0] || null;
  } catch (error) {
    // Log error for debugging but sanitize message for security
    console.error('Database update operation failed:', error);
    throw new Error('Failed to update data. Please check your input and try again.');
  }
}

// =============================================
// 4️⃣ DELETE DATA
// =============================================

/**
 * Generic DELETE function with multiple column WHERE conditions
 * Supports deleting records filtered by multiple columns
 *
 * @param tableName - Name of the table to delete from
 * @param columns - Where conditions { quotation_id: 1, status: 'draft' }
 * @param dataPayload - Reserved for future use (currently unused)
 * @param workspace - WorkspaceContext for tenant isolation
 * @returns Deleted record or null
 *
 * Example:
 * ```typescript
 * const deleted = await deleteData(
 *   'quotations',
 *   { quotation_id: 1, quotation_status: 'draft' },
 *   {},
 *   workspace
 * );
 * ```
 */
export async function deleteData(
  tableName: string,
  columns: Record<string, unknown>,
  _dataPayload: Record<string, unknown>, // Reserved for future use (prefixed with _ to mark as intentionally unused)
  workspace: WorkspaceContext
): Promise<any> {
  try {
    // Get the actual table object from table map
    const table = getTableByName(tableName);

    // Build WHERE conditions using multipleCol helper
    const whereConditions = multipleCol(table, columns);

    // Execute DELETE query with workspace filtering (direct WorkspaceContext usage)
    const results = await db
      .delete(table as any)
      .where(
        workspace.buildWhereClause(table, whereConditions) // Combine workspace filters + user conditions
      )
      .returning();

    // Return the first deleted record or null
    return (results as any[])[0] || null;
  } catch (error) {
    // Log error for debugging but sanitize message for security
    console.error('Database delete operation failed:', error);
    throw new Error('Failed to delete data. Please check your input and try again.');
  }
}

// =============================================
// 5️⃣ WORKBOARD SNAPSHOT QUERIES
// =============================================

/**
 * Get the latest snapshot version for a given RFQ
 * Used to auto-increment the version number when creating new snapshots
 */
export async function getLatestSnapshotVersion(
  rfqId: number,
  workspace: WorkspaceContext
): Promise<number> {
  try {
    const filter = workspace.getDatabaseFilter();
    const result = await db
      .select({ maxVersion: max(workboardSnapshots.version) })
      .from(workboardSnapshots)
      .where(
        and(
          eq(workboardSnapshots.rfqId, rfqId),
          eq(workboardSnapshots.companyId, filter.company_id)
        )
      );

    return result[0]?.maxVersion ?? 0;
  } catch (error) {
    console.error('Failed to get latest snapshot version:', error);
    throw new Error('Failed to get latest snapshot version.');
  }
}

/**
 * Insert a new workboard snapshot with workspace context
 */
export async function insertSnapshot(
  data: {
    rfqId: number;
    version: number;
    triggeredBy: string;
    label: string | null;
    panelsSnapshot: unknown;
    workflowSnapshot: unknown;
  },
  workspace: WorkspaceContext
): Promise<any> {
  try {
    const dataWithContext = workspace.injectWorkspaceContext(data);

    const results = await db
      .insert(workboardSnapshots)
      .values(dataWithContext as any)
      .returning();

    return results[0] || null;
  } catch (error) {
    console.error('Failed to insert snapshot:', error);
    throw new Error('Failed to insert snapshot.');
  }
}

/**
 * Get all snapshots for an RFQ, newest first
 */
export async function getSnapshotsByRfq(
  rfqId: number,
  workspace: WorkspaceContext
): Promise<any[]> {
  try {
    const filter = workspace.getDatabaseFilter();
    const results = await db
      .select()
      .from(workboardSnapshots)
      .where(
        and(
          eq(workboardSnapshots.rfqId, rfqId),
          eq(workboardSnapshots.companyId, filter.company_id)
        )
      )
      .orderBy(desc(workboardSnapshots.version));

    return results;
  } catch (error) {
    console.error('Failed to get snapshots by RFQ:', error);
    throw new Error('Failed to get snapshots.');
  }
}

/**
 * Get a single snapshot by ID with workspace isolation
 */
export async function getSnapshotById(
  snapshotId: number,
  workspace: WorkspaceContext
): Promise<any> {
  try {
    const filter = workspace.getDatabaseFilter();
    const results = await db
      .select()
      .from(workboardSnapshots)
      .where(
        and(
          eq(workboardSnapshots.snapshotId, snapshotId),
          eq(workboardSnapshots.companyId, filter.company_id)
        )
      );

    return results[0] || null;
  } catch (error) {
    console.error('Failed to get snapshot by ID:', error);
    throw new Error('Failed to get snapshot.');
  }
}

/**
 * Get RFQ by reference with workspace isolation
 * Returns the rfq_analysis row (including rfq_id, current_stage, etc.)
 */
export async function getRfqByReference(
  rfqReference: string,
  workspace: WorkspaceContext
): Promise<any> {
  try {
    const filter = workspace.getDatabaseFilter();
    const results = await db
      .select()
      .from(rfqAnalysis)
      .where(
        and(
          eq(rfqAnalysis.rfqReference, rfqReference),
          eq(rfqAnalysis.companyId, filter.company_id)
        )
      );

    return results[0] || null;
  } catch (error) {
    console.error('Failed to get RFQ by reference:', error);
    throw new Error('Failed to get RFQ.');
  }
}

// =============================================
// 6️⃣ UI_RELOAD QUERIES
// =============================================

/** Upsert UI layout prefs for (company, user, ui_type). Caller validates size < 512KB. */
export async function upsertUiState(
  uiType: string,
  uiState: Record<string, unknown>,
  workspace: WorkspaceContext,
): Promise<void> {
  const filter = workspace.getDatabaseFilter();
  await db
    .insert(uiReload)
    .values({
      companyId: filter.company_id,
      userId: filter.user_id!,
      uiType,
      uiState,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [uiReload.companyId, uiReload.userId, uiReload.uiType],
      set: { uiState, updatedAt: new Date() },
    });
}

/** Get saved UI layout prefs for (company, user, ui_type). Returns null if none. */
export async function getUiState(
  uiType: string,
  workspace: WorkspaceContext,
): Promise<Record<string, unknown> | null> {
  const filter = workspace.getDatabaseFilter();
  const rows = await db
    .select({ uiState: uiReload.uiState })
    .from(uiReload)
    .where(
      and(
        eq(uiReload.companyId, filter.company_id),
        eq(uiReload.userId, filter.user_id!),
        eq(uiReload.uiType, uiType),
      ),
    )
    .limit(1);
  return (rows[0]?.uiState as Record<string, unknown>) ?? null;
}

// =============================================
// 7️⃣ AI_CONVERSATIONS QUERIES
// =============================================

export async function insertAiConversation(
  data: {
    rfqId: number;
    rfqReference?: string;
    messages: Array<{ role: string; content: string; timestamp: string }>;
    modelId?: string;
    contextType: string;
  },
  workspace: WorkspaceContext,
): Promise<{ id: number }> {
  const filter = workspace.getDatabaseFilter();
  const [row] = await db
    .insert(aiConversations)
    .values({
      companyId: filter.company_id,
      userId: filter.user_id!,
      rfqId: data.rfqId,
      rfqReference: data.rfqReference,
      messages: data.messages,
      modelId: data.modelId,
      contextType: data.contextType,
    })
    .returning({ id: aiConversations.id });
  return row;
}

/** Get AI conversations for an RFQ, excluding expired rows. Optionally filter by contextType. */
export async function getAiConversations(
  rfqId: number,
  workspace: WorkspaceContext,
  contextType?: string,
): Promise<Array<typeof aiConversations.$inferSelect>> {
  const filter = workspace.getDatabaseFilter();
  const conditions: ReturnType<typeof eq>[] = [
    eq(aiConversations.companyId, filter.company_id),
    eq(aiConversations.rfqId, rfqId),
  ];
  if (contextType) conditions.push(eq(aiConversations.contextType, contextType));
  return db
    .select()
    .from(aiConversations)
    .where(and(...conditions, sql`${aiConversations.expiresAt} > now()`))
    .orderBy(desc(aiConversations.createdAt));
}

export async function appendAiMessages(
  conversationId: number,
  newMessages: Array<{ role: string; content: string; timestamp: string }>,
  workspace: WorkspaceContext,
): Promise<void> {
  const filter = workspace.getDatabaseFilter();
  await db
    .update(aiConversations)
    .set({
      messages: sql`${aiConversations.messages} || ${JSON.stringify(newMessages)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.companyId, filter.company_id),
      ),
    );
}

/** Cleanup helper for the cron route — deletes all expired conversations. Returns count deleted. */
export async function deleteExpiredAiConversations(): Promise<number> {
  const result = await db
    .delete(aiConversations)
    .where(sql`${aiConversations.expiresAt} <= now()`)
    .returning({ id: aiConversations.id });
  return result.length;
}

// =============================================
// EXPORT TABLE REFERENCES
// =============================================
// Export all tables for direct access if needed
export {
  userCompany,       // renamed from clientCompany
  userInfo,          // renamed from clientInfo
  customers,
  emailConnections,
  emailTable,
  fileMetadata,
  rfqItems,          // renamed from quotationItems
  quotationPricing,
  quotations,
  rfqAnalysis,
  sessions,
  sseConnections,
  supplierItemStatus,
  userSessions,
  workboardSnapshots,
  uiReload,
  aiConversations,
};

// Functions are exported directly above (insertData, getData, getCount, updateData, deleteData, snapshot queries, ui-reload queries, ai-conversations queries)
