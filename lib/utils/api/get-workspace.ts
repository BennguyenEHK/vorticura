// =============================================
// 🔍 API WORKSPACE EXTRACTION HELPER
// =============================================
// Purpose: Extract workspace context from API requests
// Provides convenience wrapper for token extraction
// Corresponds to: auth-middleware.js:24-91

import { NextRequest } from 'next/server';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';
import { getWorkspaceFromToken } from '@/lib/middleware/auth-helpers';

/**
 * Extract workspace context from API request
 * Works with both cookie and Authorization header
 *
 * Token sources (in order of priority):
 * 1. Cookie: auth_token (preferred for browser requests)
 * 2. Header: Authorization: Bearer <token> (for API clients)
 *
 * @param request - Next.js API request object
 * @returns WorkspaceContext or null if not authenticated
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   const workspace = await getWorkspaceFromRequest(request);
 *   if (!workspace) {
 *     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 *   // Use workspace for database operations
 * }
 */
export async function getWorkspaceFromRequest(
  request: NextRequest
): Promise<WorkspaceContext | null> {
  // Try cookie first (preferred method for browser requests)
  let token = request.cookies.get('auth_token')?.value;

  // Fallback to Authorization header (for API clients, mobile apps)
  if (!token) {
    const authHeader = request.headers.get('Authorization');
    // Extract token from "Bearer <token>" format
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7); // Remove "Bearer " prefix (7 characters)
    }
  }

  // No token found in either location
  if (!token) {
    return null;
  }

  // Verify token and create WorkspaceContext
  return getWorkspaceFromToken(token);
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
 *     const workspace = await requireWorkspace(request);
 *     // Proceed with database operations
 *   } catch (error) {
 *     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 * }
 */
export async function requireWorkspace(request: NextRequest): Promise<WorkspaceContext> {
  // Get workspace from request
  const workspace = await getWorkspaceFromRequest(request);

  // Throw error if not authenticated
  if (!workspace) {
    throw new Error('Authentication required');
  }

  return workspace;
}
