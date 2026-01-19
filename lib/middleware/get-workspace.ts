// =============================================
// 🔍 WORKSPACE EXTRACTION FROM MIDDLEWARE HEADERS
// =============================================
// Purpose: Extract workspace context from middleware-injected headers
// Location: lib/middleware/get-workspace.ts

import { NextRequest } from 'next/server';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

/**
 * Get workspace context from middleware-injected headers (RECOMMENDED)
 * This is the EFFICIENT method - no token re-verification needed
 *
 * Middleware already verified the token and injected these headers:
 * - x-client-id
 * - x-company-id
 * - x-username
 * - x-user-role
 *
 * @param request - Next.js API request object
 * @returns WorkspaceContext or null if headers missing
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   const workspace = getWorkspaceFromHeaders(request);
 *   if (!workspace) {
 *     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 *   // Use workspace for database operations
 * }
 */
export function getWorkspaceFromHeaders(request: NextRequest): WorkspaceContext | null {
  // Read headers injected by middleware.ts
  const clientIdStr = request.headers.get('x-client-id');
  const companyIdStr = request.headers.get('x-company-id');
  const username = request.headers.get('x-username');
  const role = request.headers.get('x-user-role');

  // Validate required headers exist
  if (!clientIdStr || !companyIdStr || !username || !role) {
    return null;
  }

  // Parse numeric IDs with radix 10 for safety
  const client_id = parseInt(clientIdStr, 10);
  const company_id = parseInt(companyIdStr, 10);

  // Validate parsing succeeded (prevent NaN injection)
  if (isNaN(client_id) || isNaN(company_id)) {
    return null;
  }

  // Create WorkspaceContext from header values (NO token verification needed!)
  return new WorkspaceContext({
    client_id,
    company_id,
    username,
    role,
  });
}

/**
 * Require workspace context - throws if not authenticated
 * Use in API routes that require authentication
 * Provides cleaner code by throwing instead of returning null
 *
 * @param request - Next.js API request object
 * @returns WorkspaceContext (guaranteed non-null)
 * @throws Error if not authenticated
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   try {
 *     const workspace = requireWorkspace(request);
 *     // Proceed with database operations
 *   } catch (error) {
 *     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 * }
 */
export function requireWorkspace(request: NextRequest): WorkspaceContext {
  // Use efficient header-based extraction (middleware already verified token)
  const workspace = getWorkspaceFromHeaders(request);

  // Throw error if not authenticated
  if (!workspace) {
    throw new Error('Authentication required');
  }

  return workspace;
}
