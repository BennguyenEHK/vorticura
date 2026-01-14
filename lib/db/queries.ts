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
 * All functions enforce workspace isolation using WorkspaceDatabaseHelper
 */

import { eq, SQL, and } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { WorkspaceDatabaseHelper } from './workspace-helper';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';
import { db } from './client';

// Import all essential tables from schema.ts
import {
  clientCompany,
  clientInfo,
  customers,
  emailTable,
  fileMetadata,
  quotationItems,
  quotationPricing,
  quotations,
  rfqAnalysis,
  sessions,
  sseConnections,
  supplierSearch,
  userSessions,
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
    clientCompany,
    clientInfo,
    customers,
    emailTable,
    fileMetadata,
    quotationItems,
    quotationPricing,
    quotations,
    rfqAnalysis,
    sessions,
    sseConnections,
    supplierSearch,
    userSessions,
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
    // Initialize workspace database helper
    const helper = new WorkspaceDatabaseHelper(workspace);

    // Get the actual table object
    const table = getTableByName(tableName);

    // Inject workspace context (company_id, client_id) into data payload
    const dataWithContext = helper.injectContext(dataPayload);

    // Execute INSERT query with workspace context
    const results = await db
      .insert(table as any)
      .values(dataWithContext) // ✅ Type-checked with workspace context
      .returning();

    // Return the first inserted record or null (explicit type assertion to fix type error)
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
 * LEFT JOIN logic: If table array length >= 2, performs leftJoin on quotation_id
 *
 * @param tableNames - Single table name OR array of table names for JOIN
 * @param columns - Where conditions { quotation_id: 1, status: 'active' }
 * @param workspace - WorkspaceContext for tenant isolation
 * @returns Array of matching records
 *
 * Example 1 (Single Table):
 * ```typescript
 * const quotations = await getData('quotations', { quotation_id: 1 }, workspace);
 * ```
 *
 * Example 2 (Multiple Tables with LEFT JOIN):
 * ```typescript
 * const quotationsWithItems = await getData(
 *   ['quotations', 'quotationItems'],
 *   { quotation_id: 1 },
 *   workspace
 * );
 * // Performs: SELECT * FROM quotations LEFT JOIN quotationItems ON quotations.quotation_id = quotationItems.quotation_id
 * ```
 */
export async function getData(
  tableNames: string | string[],
  columns: Record<string, unknown>,
  workspace: WorkspaceContext
): Promise<any[]> {
  try {
    // Initialize workspace database helper
    const helper = new WorkspaceDatabaseHelper(workspace);

    // Convert single table name to array for uniform processing
    const tables = Array.isArray(tableNames) ? tableNames : [tableNames];

    // Get the primary table (first table in array)
    const primaryTable = getTableByName(tables[0]);

    // Build WHERE conditions (workspace filters + user-provided columns)
    const whereConditions = multipleCol(primaryTable, columns);
    const whereClause = helper.buildWhereClause(primaryTable, whereConditions);

    // CASE 1: Single table query (no JOIN)
    if (tables.length === 1) {
      const results = await db
        .select()
        .from(primaryTable as any)
        .where(whereClause);

      return results;
    }

    // CASE 2: Multiple tables - perform LEFT JOIN on quotation_id with workspace isolation
    if (tables.length >= 2) {
      // Get the secondary table for LEFT JOIN
      const secondaryTable = getTableByName(tables[1]);

      // Get workspace filter for security (company_id and optional client_id)
      const workspaceFilter = helper.getWorkspaceFilter();

      // Build JOIN conditions with workspace filtering on BOTH tables (CRITICAL for security)
      const joinConditions: SQL[] = [
        eq((primaryTable as any).quotationId, (secondaryTable as any).quotationId), // Join on quotation_id
      ];

      // Add company_id filter to secondary table (prevents cross-tenant data leakage)
      if ('company_id' in secondaryTable) {
        joinConditions.push(eq((secondaryTable as any).companyId, workspaceFilter.company_id));
      }

      // Add client_id filter to secondary table if workspace isolation is enabled
      if (workspaceFilter.client_id !== undefined && 'client_id' in secondaryTable) {
        joinConditions.push(eq((secondaryTable as any).clientId, workspaceFilter.client_id));
      }

      // Execute LEFT JOIN with workspace-filtered secondary table
      const results = await db
        .select()
        .from(primaryTable as any)
        .leftJoin(
          secondaryTable as any,
          and(...joinConditions) // ✅ Workspace filters applied to JOIN condition
        )
        .where(whereClause); // Primary table workspace filters

      return results;
    }

    return [];
  } catch (error) {
    // Log error for debugging but sanitize message for security
    console.error('Database select operation failed:', error);
    throw new Error('Failed to retrieve data. Please check your query and try again.');
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
    // Initialize workspace database helper
    const helper = new WorkspaceDatabaseHelper(workspace);

    // Get the actual table object
    const table = getTableByName(tableName);

    // Build WHERE conditions using multipleCol helper
    const whereConditions = multipleCol(table, columns);

    // Execute UPDATE query with workspace filtering
    const results = await db
      .update(table as any)
      .set(dataPayload) // ✅ Type-checked update data
      .where(
        helper.buildWhereClause(table, whereConditions) // Combine workspace filters + user conditions
      )
      .returning();

    // Return the first updated record or null (explicit type assertion to fix type error)
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
    // Initialize workspace database helper
    const helper = new WorkspaceDatabaseHelper(workspace);

    // Get the actual table object
    const table = getTableByName(tableName);

    // Build WHERE conditions using multipleCol helper
    const whereConditions = multipleCol(table, columns);

    // Execute DELETE query with workspace filtering
    const results = await db
      .delete(table as any)
      .where(
        helper.buildWhereClause(table, whereConditions) // Combine workspace filters + user conditions
      )
      .returning();

    // Return the first deleted record or null (explicit type assertion to fix type error)
    return (results as any[])[0] || null;
  } catch (error) {
    // Log error for debugging but sanitize message for security
    console.error('Database delete operation failed:', error);
    throw new Error('Failed to delete data. Please check your input and try again.');
  }
}

// =============================================
// EXPORT TABLE REFERENCES
// =============================================
// Export all tables for direct access if needed
export {
  clientCompany,
  clientInfo,
  customers,
  emailTable,
  fileMetadata,
  quotationItems,
  quotationPricing,
  quotations,
  rfqAnalysis,
  sessions,
  sseConnections,
  supplierSearch,
  userSessions,
};
