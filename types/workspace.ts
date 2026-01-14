// =============================================
// 🏢 WORKSPACE TYPE DEFINITIONS
// =============================================
// Purpose: TypeScript types for workspace context and permissions

/**
 * WorkspaceInfo - Complete workspace information for frontend/API responses
 */
export interface WorkspaceInfo {
  // Workspace type: shared (company-level) or individual (user-level)
  type: 'shared' | 'individual';

  // Tenant identifiers
  company_id: number;
  client_id: number;

  // Whether client-level isolation is enabled
  isolation_enabled: boolean;

  // User information
  user: {
    username: string;
    role: string;
  };
}

/**
 * UserContext - Minimal user context for authentication
 */
export interface UserContext {
  client_id: number;
  company_id: number;
  username: string;
  role: string;
}

/**
 * Permission - Available permission types
 * Use 'records' instead of 'quotation' as per requirement
 */
export type Permission =
  | 'view_records'
  | 'create_records'
  | 'update_records'
  | 'delete_records'
  | '*'; // Admin wildcard permission
