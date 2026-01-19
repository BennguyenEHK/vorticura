// =============================================
// 🔐 WORKSPACE CONTEXT MANAGER
// =============================================
// Purpose: Manage user workspace context for tenant isolation
// Provides: getDatabaseFilter, injectWorkspaceContext, buildWhereClause
// Replaces: utils/auth_account/workspace-context.js + workspace-helper.ts

import { workspaceConfig } from '@/config/workspace.config';
import { and, eq, SQL } from 'drizzle-orm'; // Drizzle ORM for SQL building
import { PgTable } from 'drizzle-orm/pg-core'; // PostgreSQL table type

/**
 * WorkspaceContext Class
 * Encapsulates user authentication and workspace information
 * Provides methods to generate database filters based on workspace mode
 */
export class WorkspaceContext {
  public readonly client_id: number;
  public readonly company_id: number;
  public readonly username: string;
  public readonly role: string;
  public readonly created_at: Date;

  /**
   * Constructor - Initialize workspace context with user data
   * @param user - User object with tenant identifiers
   */
  constructor(user: {
    client_id: number;
    company_id: number;
    username?: string;
    role?: string;
  }) {
    // Validate required fields for tenant isolation (allow falsy but valid ids like 0)
    if (user.client_id == null || user.company_id == null) {
      throw new Error('WorkspaceContext requires client_id and company_id');
    }

    this.client_id = user.client_id;
    this.company_id = user.company_id;
    this.username = user.username || 'Unknown';
    this.role = user.role || 'user';
    this.created_at = new Date();
  }

  /**
   * Build database filter conditions based on workspace mode
   * Phase 1 (Shared): Returns { company_id: 1 }
   * Phase 2 (Individual): Returns { company_id: 1, client_id: 5 }
   * @returns Filter object for database queries
   */
  getDatabaseFilter(): { company_id: number; client_id?: number } {
    const filter: { company_id: number; client_id?: number } = {
      company_id: this.company_id,
    };

    // Add client_id when isolation is enabled (Phase 2)
    if (workspaceConfig.isClientIsolationEnabled()) {
      filter.client_id = this.client_id;
    }

    return filter;
  }

  /**
   * Inject workspace context into data for INSERT operations
   * Always adds both company_id and client_id to ensure proper tenant tracking
   * @param data - Data object to inject context into
   * @returns Data object with workspace context injected
   */
  injectWorkspaceContext<T extends Record<string, unknown>>(data: T): T & { company_id: number; client_id: number } {
    return {
      ...data,
      company_id: this.company_id,
      client_id: this.client_id,
    };
  }

  /**
   * Get workspace information for frontend/API responses
   * @returns Workspace information object
   */
  getWorkspaceInfo() {
    return {
      type: workspaceConfig.getWorkspaceMode(),
      company_id: this.company_id,
      client_id: this.client_id,
      isolation_enabled: workspaceConfig.isClientIsolationEnabled(),
      user: {
        username: this.username,
        role: this.role,
      },
    };
  }

  /**
   * Check if user has permission for a specific action
   * Changed from 'quotation' to 'records' as per requirement
   * @param action - Permission action to check
   * @returns Boolean indicating if user has permission
   */
  hasPermission(action: string): boolean {
    // Admin has all permissions
    if (this.role === 'admin') return true;

    // Define role-based permissions (using 'records' instead of 'quotation')
    const permissions: Record<string, string[]> = {
      user: ['view_records', 'create_records', 'update_records'],
      manager: ['view_records', 'create_records', 'update_records', 'delete_records'],
      admin: ['*'], // Wildcard permission for admin
    };

    const userPermissions = permissions[this.role] || [];
    return userPermissions.includes(action) || userPermissions.includes('*');
  }

  /**
   * Verify if data belongs to user's workspace
   * Ensures tenant isolation by checking ownership
   * @param data - Data object with tenant identifiers
   * @returns Boolean indicating if data belongs to workspace
   */
  verifyOwnership(data: { company_id: number; client_id?: number }): boolean {
    // Always check company_id
    if (data.company_id !== this.company_id) return false;

    // Check client_id if isolation enabled and client_id exists in data
    if (workspaceConfig.isClientIsolationEnabled() && data.client_id) {
      return data.client_id === this.client_id;
    }

    return true;
  }

  /**
   * Get context summary for logging/debugging
   * @returns String representation of workspace context
   */
  toString(): string {
    const mode = workspaceConfig.getWorkspaceMode();
    const filter = this.getDatabaseFilter();
    const filterStr = Object.entries(filter)
      .map(([key, val]) => `${key}=${val}`)
      .join(', ');

    return `WorkspaceContext[${mode}](user=${this.username}, ${filterStr})`;
  }

  /**
   * Build workspace WHERE clause for Drizzle queries
   * Combines workspace filters (company_id, client_id) with additional conditions
   * @param table - Drizzle table definition to build WHERE clause for
   * @param additionalFilters - Optional array of additional SQL conditions
   * @returns Combined SQL filter or undefined if no filters
   *
   * @example
   * const whereClause = workspace.buildWhereClause(quotations, [
   *   eq(quotations.quotation_id, 123)
   * ]);
   * const results = await db.select().from(quotations).where(whereClause);
   */
  buildWhereClause<T extends PgTable>(
    table: T,
    additionalFilters?: SQL[]
  ): SQL | undefined {
    const filters: SQL[] = [];
    const baseFilter = this.getDatabaseFilter(); // Get workspace filter { company_id, client_id? }

    // Validate that tenant columns exist on the provided table
    if (baseFilter.company_id !== undefined && !('company_id' in table)) {
      console.warn(
        `buildWhereClause: table is missing 'company_id' column required by workspace filter. ` +
        `Table must include company_id for proper tenant isolation. ` +
        `Check getDatabaseFilter() and ensure the table schema defines company_id.`
      );
    }
    
    if (baseFilter.client_id !== undefined && !('client_id' in table)) {
      console.warn(
        `buildWhereClause: table is missing 'client_id' column required by workspace filter. ` +
        `Table must include client_id for client-level tenant isolation. ` +
        `Check getDatabaseFilter() and ensure the table schema defines client_id.`
      );
    }

    // Add company_id filter (required for all tenant tables)
    if ('company_id' in table) {
      filters.push(eq((table as Record<string, unknown>).company_id as Parameters<typeof eq>[0], baseFilter.company_id));
    }

    // Add client_id filter if isolation is enabled (Phase 2)
    if (baseFilter.client_id !== undefined && 'client_id' in table) {
      filters.push(eq((table as Record<string, unknown>).client_id as Parameters<typeof eq>[0], baseFilter.client_id));
    }

    // Add user-provided additional filters
    if (additionalFilters && additionalFilters.length > 0) {
      filters.push(...additionalFilters);
    }

    // Combine all filters with AND logic, return undefined if no filters
    return filters.length > 0 ? and(...filters) : undefined;
  }
}
