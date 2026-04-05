// =============================================
// ✅ TOKEN VERIFICATION API ROUTE
// =============================================
// Purpose: Verify if the current token is valid
// Corresponds to: sse_server.js:458 (GET /api/auth/verify)

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceFromToken } from '@/lib/middleware/auth-helpers';

/**
 * GET /api/auth/verify
 * Verify if the current token is valid
 * Used by frontend to check authentication status
 * Returns minimal user info if valid
 */
export async function GET(request: NextRequest) {
  try {
    // Get token from cookie or Authorization header
    const token =
      request.cookies.get('auth_token')?.value ||                    // Try cookie first
      request.headers.get('Authorization')?.replace('Bearer ', '');   // Fallback to header

    // Check if token exists
    if (!token) {
      return NextResponse.json({
        valid: false,
        error: 'No token provided',
      });
    }

    // Verify token and get workspace context
    const workspace = await getWorkspaceFromToken(token);

    // Check if token is valid
    if (!workspace) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid or expired token',
      });
    }

    // Return validation result with minimal user info
    return NextResponse.json({
      valid: true,
      user: {
        user_id: workspace.user_id,
        company_id: workspace.company_id,
        username: workspace.username,
        role: workspace.role,
      },
      workspace: workspace.getWorkspaceInfo(), // Include workspace info
    });
  } catch (error) {
    // Log error for debugging
    console.error('Token verification error:', error);
    return NextResponse.json({
      valid: false,
      error: 'Verification failed',
    });
  }
}
