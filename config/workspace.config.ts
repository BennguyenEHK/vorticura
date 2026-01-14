// =============================================
// 🏢 WORKSPACE CONFIGURATION
// =============================================
// Purpose: Configure workspace isolation mode for multi-tenant SaaS
// - Phase 1 (Shared): Filter by company_id only
// - Phase 2 (Individual): Filter by company_id + client_id

type WorkspaceMode = 'shared' | 'individual';

/**
 * WorkspaceConfig Class
 * Manages workspace isolation settings for tenant filtering
 */
class WorkspaceConfig {
  // Default workspace mode (can be overridden by environment variable)
  private WORKSPACE_MODE: WorkspaceMode = 'shared';

  // Default client isolation setting (can be overridden by environment variable)
  private ENABLE_CLIENT_ISOLATION = false;

  /**
   * Get current workspace mode from environment or default
   * @returns 'shared' or 'individual'
   */
  getWorkspaceMode(): WorkspaceMode {
    return (process.env.WORKSPACE_MODE as WorkspaceMode) || this.WORKSPACE_MODE;
  }

  /**
   * Check if client-level isolation is enabled
   * When true: Filters by company_id + client_id
   * When false: Filters by company_id only
   * @returns boolean
   */
  isClientIsolationEnabled(): boolean {
    return process.env.ENABLE_CLIENT_ISOLATION === 'true' || this.ENABLE_CLIENT_ISOLATION;
  }

  /**
   * Get configuration summary for logging/debugging
   * @returns Configuration object with current settings
   */
  getConfigSummary() {
    return {
      workspace_mode: this.getWorkspaceMode(),
      client_isolation_enabled: this.isClientIsolationEnabled(),
      phase: this.isClientIsolationEnabled() ? 'Phase 2 (Individual)' : 'Phase 1 (Shared)',
      filtering: this.isClientIsolationEnabled() ? 'company_id + client_id' : 'company_id only',
    };
  }
}

// Export singleton instance
export const workspaceConfig = new WorkspaceConfig();
