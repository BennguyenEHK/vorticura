// =============================================
// 👤 CURRENT USER API ROUTE
// =============================================
// Purpose: Get authenticated user's information
// Corresponds to: sse_server.js:467 (GET /api/auth/me)

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceFromToken } from '@/lib/middleware/auth-helpers';
import { db } from '@/lib/db/client';
import { clientInfo, clientCompany } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/auth/me
 * Get current authenticated user information
 * Returns user profile, company details, and workspace context
 */
export async function GET(request: NextRequest) {
  try {
    // Get token from cookie (primary auth method)
    const token = request.cookies.get('auth_token')?.value;

    // Check if token exists
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Verify token and get workspace context
    const workspace = await getWorkspaceFromToken(token);

    // Check if token is valid
    if (!workspace) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Get full user details from database
    const users = await db
      .select({
        clientId: clientInfo.clientId,
        companyId: clientInfo.companyId,
        username: clientInfo.username,
        email: clientInfo.email,
        role: clientInfo.clientRole,
        status: clientInfo.clientStatus,
        lastLogin: clientInfo.lastLogin,
        createdAt: clientInfo.createdAt,
      })
      .from(clientInfo)
      .where(eq(clientInfo.clientId, workspace.client_id))
      .limit(1);

    const user = users[0];

    // Check if user still exists in database
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get company details for workspace info
    const companies = await db
      .select({
        companyId: clientCompany.companyId,
        companyName: clientCompany.companyName,
        companyEmail: clientCompany.companyEmail,
      })
      .from(clientCompany)
      .where(eq(clientCompany.companyId, workspace.company_id))
      .limit(1);

    const company = companies[0];

    // Return comprehensive user information
    return NextResponse.json({
      success: true,
      user: {
        client_id: user.clientId,
        company_id: user.companyId,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        last_login: user.lastLogin,
        created_at: user.createdAt,
      },
      company: company ? {
        company_id: company.companyId,
        company_name: company.companyName,
        company_email: company.companyEmail,
      } : null,
      workspace: workspace.getWorkspaceInfo(), // Get workspace info from context
    });
  } catch (error) {
    // Log error for debugging
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Failed to get user information' },
      { status: 500 }
    );
  }
}
