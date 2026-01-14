// =============================================
// 🗄️ CORRECTED WORKSPACE DATABASE HELPER
// =============================================
// Purpose: Workspace-aware database wrapper with Drizzle type safety
//
// IMPORTANT: This class builds WHERE clauses, not full queries
// Use it with Drizzle's query builder directly for maximum type safety

import { and, eq, SQL } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { db } from './client';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

/**
 * Workspace Database Helper Class
 * Provides workspace filtering utilities for Drizzle queries
 *
 * Instead of wrapping CRUD operations (which breaks Drizzle's type safety),
 * this helper provides methods to build workspace-aware WHERE clauses
 * that can be used with Drizzle's query builder.
 *
 * Example Usage:
 * ```typescript
 * const helper = new WorkspaceDatabaseHelper(workspace);
 *
 * // SELECT with workspace filtering
 * const results = await db
 *   .select()
 *   .from(quotations)
 *   .where(helper.buildWhereClause(quotations, [
 *     eq(quotations.quotation_id, 123)
 *   ]));
 *
 * // INSERT with workspace context
 * const newQuotation = await db
 *   .insert(quotations)
 *   .values(helper.injectContext({ quotation_name: 'Q-001' }))
 *   .returning();
 * ```
 */
export class WorkspaceDatabaseHelper {
  private workspace: WorkspaceContext;
  private baseFilter: { company_id: number; client_id?: number };

  /**
   * Constructor - Initialize with workspace context
   * @param workspaceContext - WorkspaceContext instance for tenant isolation
   * @throws Error if workspaceContext is null or invalid
   */
  constructor(workspaceContext: WorkspaceContext | null) {
    if (!workspaceContext || !(workspaceContext instanceof WorkspaceContext)) {
      throw new Error('WorkspaceDatabaseHelper requires a valid WorkspaceContext instance');
    }

    this.workspace = workspaceContext;
    this.baseFilter = workspaceContext.getDatabaseFilter(); // Get workspace filter (company_id + optional client_id)
  }

  /**
   * Build workspace WHERE conditions for any table
   * Returns SQL conditions that can be used with Drizzle's where()
   *
   * @param table - Drizzle table definition
   * @param additionalFilters - Additional SQL filters to combine with workspace filters
   * @returns Combined SQL filter or undefined if no filters
   *
   * Usage Example:
   * ```typescript
   * const whereClause = helper.buildWhereClause(quotations, [
   *   eq(quotations.quotation_id, 123)
   * ]);
   *
   * const results = await db
   *   .select()
   *   .from(quotations)
   *   .where(whereClause);  // ✅ Type-safe!
   * ```
   */
  buildWhereClause<T extends PgTable>(
    table: T,
    additionalFilters?: SQL[]
  ): SQL | undefined {
    const filters: SQL[] = [];

    // Add company_id filter (required for all tenant tables)
    if ('company_id' in table) {
      filters.push(eq(table.company_id as any, this.baseFilter.company_id));
    }

    // Add client_id filter if isolation is enabled (Phase 2)
    if (this.baseFilter.client_id !== undefined && 'client_id' in table) {
      filters.push(eq(table.client_id as any, this.baseFilter.client_id));
    }

    // Add user-provided additional filters
    if (additionalFilters && additionalFilters.length > 0) {
      filters.push(...additionalFilters);
    }

    // Combine all filters with AND logic
    return filters.length > 0 ? and(...filters) : undefined;
  }

  /**
   * Inject workspace context into INSERT data
   * Always adds company_id and client_id to ensure proper tenant tracking
   *
   * @param data - Data object to inject context into
   * @returns Data object with company_id and client_id injected
   *
   * Usage Example:
   * ```typescript
   * const newQuotation = await db
   *   .insert(quotations)
   *   .values(helper.injectContext({
   *     quotation_name: 'Q-001',
   *     rfq_reference: 'RFQ-2024-001'
   *   }))
   *   .returning();
   * ```
   */
  injectContext<T extends Record<string, unknown>>(
    data: T
  ): T & { company_id: number; client_id: number } {
    return this.workspace.injectWorkspaceContext(data);
  }

  /**
   * Get the database client for direct queries
   * Use this when you need full Drizzle query builder access
   *
   * @returns Drizzle database client instance
   *
   * Usage Example:
   * ```typescript
   * const dbClient = helper.getDb();
   * const results = await dbClient
   *   .select()
   *   .from(quotations)
   *   .where(helper.buildWhereClause(quotations));
   * ```
   */
  getDb() {
    return db;
  }

  /**
   * Get workspace filter for manual query building
   * Returns the current workspace filter object
   *
   * @returns Workspace filter object { company_id, client_id? }
   */
  getWorkspaceFilter() {
    return { ...this.baseFilter };
  }

  /**
   * Get workspace info for logging/debugging
   * @returns String representation of workspace context
   */
  toString(): string {
    return this.workspace.toString();
  }
}

/**
 * Factory function to create workspace database helper
 * Provides a convenient way to create helper instances
 *
 * @param workspace - WorkspaceContext instance
 * @returns WorkspaceDatabaseHelper instance
 * @throws Error if workspace is null
 *
 * Usage Example:
 * ```typescript
 * const helper = createWorkspaceDatabase(workspace);
 * const results = await helper.getDb()
 *   .select()
 *   .from(quotations)
 *   .where(helper.buildWhereClause(quotations));
 * ```
 */
export function createWorkspaceDatabase(workspace: WorkspaceContext | null): WorkspaceDatabaseHelper {
  if (!workspace) {
    throw new Error('Workspace context is required for database operations');
  }
  return new WorkspaceDatabaseHelper(workspace);
}
