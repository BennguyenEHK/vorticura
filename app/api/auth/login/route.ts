// =============================================
// 🔑 LOGIN API ROUTE
// =============================================
// Purpose: User authentication endpoint
// Corresponds to: api/auth/login.js:27-153

import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db/client';
import { clientInfo, clientCompany } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateJWT } from '@/lib/middleware/auth-helpers';
import { workspaceConfig } from '@/config/workspace.config';
import { isEmail } from '@/lib/utils/validation/schemas';

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 * - Validates credentials against database
 * - Returns workspace context for frontend
 * - Sets HTTP-only cookie with JWT
 */
export async function POST(request: NextRequest) {
  try {
    // Parse login credentials from request body
    const { identifier, password } = await request.json();

    // Validate input (identifier and password required)
    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Identifier and password are required' },
        { status: 400 }
      );
    }

    // Compute email detection server-side to prevent client manipulation
    const computedIsEmail = isEmail(identifier);

    // Query user from database based on identifier type (email or username)
    const users = await db
      .select({
        clientId: clientInfo.clientId,
        companyId: clientInfo.companyId,
        username: clientInfo.username,
        email: clientInfo.email,
        passwordHash: clientInfo.passwordHash,
        role: clientInfo.clientRole,
        status: clientInfo.clientStatus,
      })
      .from(clientInfo)
      .where(computedIsEmail ? eq(clientInfo.email, identifier) : eq(clientInfo.username, identifier))
      .limit(1);

    const user = users[0];

    // Check if user exists
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Check if account is active
    if (user.status !== 'active') {
      return NextResponse.json(
        { error: 'Account is inactive. Please contact support.' },
        { status: 403 } // 403 Forbidden
      );
    }

    // Defensive check: verify user.passwordHash exists before comparing
    if (!user.passwordHash) {
      console.warn('Login attempt: missing passwordHash');
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Verify password using bcrypt compare
    const isValidPassword = await compare(password, user.passwordHash);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Defensive check: verify user.companyId is present
    if (!user.companyId) {
      return NextResponse.json(
        { error: 'User company context is missing' },
        { status: 400 }
      );
    }

    // Get company information for workspace context
    const companies = await db
      .select({
        companyId: clientCompany.companyId,
        companyName: clientCompany.companyName,
      })
      .from(clientCompany)
      .where(eq(clientCompany.companyId, user.companyId))
      .limit(1);

    const company = companies[0];

    // Update last login timestamp for audit trail
    await db
      .update(clientInfo)
      .set({ lastLogin: new Date() })
      .where(eq(clientInfo.clientId, user.clientId));

    // Generate JWT token with workspace context
    const token = await generateJWT({
      client_id: user.clientId,
      company_id: user.companyId,
      username: user.username,
      role: user.role || 'user',
    });

    // Build response with user and workspace info
    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      user: {
        client_id: user.clientId,
        company_id: user.companyId,
        username: user.username,
        role: user.role,
        email: user.email,
      },
      workspace: {
        type: workspaceConfig.getWorkspaceMode(),           // 'shared' or 'individual'
        company_id: user.companyId,
        client_id: user.clientId,
        company_name: company?.companyName || null,
        isolation_enabled: workspaceConfig.isClientIsolationEnabled(),
      },
    });

    // Set HTTP-only cookie for security
    response.cookies.set('auth_token', token, {
      httpOnly: true,                                    // Cannot be accessed by JavaScript
      secure: process.env.NODE_ENV === 'production',     // HTTPS only in production
      sameSite: 'strict',                                // CSRF protection
      maxAge: 7 * 24 * 60 * 60,                          // 7 days expiration
      path: '/',                                         // Available on all paths
    });

    return response;
  } catch (error) {
    // Log error for debugging (sanitized in response)
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Authentication failed. Please try again.' },
      { status: 500 }
    );
  }
}
