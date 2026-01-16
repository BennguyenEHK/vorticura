// =============================================
// 🏢 WORKSPACE SERVICE
// =============================================
// Purpose: High-level workspace business logic
// Provides company-level operations and session management
// Corresponds to: utils/auth_account/workspace-context.js (extended)

import { WorkspaceContext } from '@/lib/middleware/workspace-context';
import { WorkspaceDatabaseHelper } from '@/lib/db/workspace-helper';
import { db } from '@/lib/db/client';
import { clientInfo, clientCompany, userSessions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { workspaceConfig } from '@/config/workspace.config';

/**
 * WorkspaceService Class
 * Provides high-level workspace operations for business logic
 * - Company user management
 * - Session persistence (last viewed item)
 * - Workspace configuration access
 */
export class WorkspaceService {
  private workspace: WorkspaceContext;   // Current user's workspace context
  private dbHelper: WorkspaceDatabaseHelper; // Database helper with workspace filtering

  /**
   * Constructor - Initialize with workspace context
   * @param workspace - WorkspaceContext instance from authenticated user
   */
  constructor(workspace: WorkspaceContext) {
    this.workspace = workspace;
    this.dbHelper = new WorkspaceDatabaseHelper(workspace);
  }

  /**
   * Get all users in the same company
   * Only available to users with view_records permission
   * @returns Array of user objects (sanitized, no passwords)
   * @throws Error if permission denied
   */
  async getCompanyUsers() {
    // Check permission before querying
    if (!this.workspace.hasPermission('view_records')) {
      throw new Error('Permission denied');
    }

    // Query all users in the same company
    const users = await db
      .select({
        clientId: clientInfo.clientId,
        username: clientInfo.username,
        email: clientInfo.email,
        role: clientInfo.clientRole,
        status: clientInfo.clientStatus,
        lastLogin: clientInfo.lastLogin,
      })
      .from(clientInfo)
      .where(eq(clientInfo.companyId, this.workspace.company_id));

    return users;
  }

  /**
   * Get company details
   * @returns Company object or null if not found
   */
  async getCompanyDetails() {
    // Query company by ID from workspace context
    const companies = await db
      .select()
      .from(clientCompany)
      .where(eq(clientCompany.companyId, this.workspace.company_id))
      .limit(1);

    return companies[0] || null;
  }

  /**
   * Update user's last viewed item
   * Used for session persistence across devices
   * @param itemId - ID of the viewed item (e.g., quotation_id)
   * @param itemType - Type of item (default: 'quotation')
   */
  async updateLastViewed(itemId: number, itemType: string = 'quotation') {
    // Upsert user session (insert or update on conflict)
    await db
      .insert(userSessions)
      .values({
        companyId: this.workspace.company_id,
        clientId: this.workspace.client_id,
        lastViewedItemId: itemId,
        lastViewedType: itemType,
        lastViewedTimestamp: new Date(),
      })
      .onConflictDoUpdate({
        target: [userSessions.companyId, userSessions.clientId], // Unique constraint
        set: {
          lastViewedItemId: itemId,
          lastViewedType: itemType,
          lastViewedTimestamp: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Get user's last viewed item
   * Used for session restoration on page load
   * @returns Session object or null if no session exists
   */
  async getLastViewed() {
    // Query user session by company_id and client_id
    const sessions = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.companyId, this.workspace.company_id),
          eq(userSessions.clientId, this.workspace.client_id)
        )
      )
      .limit(1);

    return sessions[0] || null;
  }

  /**
   * Get workspace configuration summary
   * Combines workspace info with global config
   * @returns Combined workspace and config summary
   */
  getWorkspaceSummary() {
    return {
      ...this.workspace.getWorkspaceInfo(),     // User's workspace info
      config: workspaceConfig.getConfigSummary(), // Global config settings
    };
  }

  /**
   * Get database helper for CRUD operations
   * @returns WorkspaceDatabaseHelper instance
   */
  getDbHelper() {
    return this.dbHelper;
  }

  /**
   * Get raw workspace context
   * @returns WorkspaceContext instance
   */
  getWorkspace() {
    return this.workspace;
  }
}

/**
 * Factory function to create workspace service
 * Provides convenient instantiation
 * @param workspace - WorkspaceContext instance
 * @returns WorkspaceService instance
 */
export function createWorkspaceService(workspace: WorkspaceContext): WorkspaceService {
  return new WorkspaceService(workspace);
}
