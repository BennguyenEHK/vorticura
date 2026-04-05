// =============================================
// 🔑 LOGIN API ROUTE
// =============================================
// Purpose: User authentication endpoint
// Corresponds to: api/auth/login.js:27-153

import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db/client';
import { userInfo, userCompany } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateJWT } from '@/lib/middleware/auth-helpers';
import { workspaceConfig } from '@/config/workspace.config';
// Validation helper (relocated from lib/utils/validation)
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
        userId: userInfo.userId,
        companyId: userInfo.companyId,
        username: userInfo.username,
        email: userInfo.email,
        passwordHash: userInfo.passwordHash,
        oauthProvider: userInfo.oauthProvider, // Check if user signed up via OAuth
        role: userInfo.userRole,
        status: userInfo.userStatus,
      })
      .from(userInfo)
      .where(computedIsEmail ? eq(userInfo.email, identifier) : eq(userInfo.username, identifier))
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

    // OAuth-only users have no password — return generic error to prevent user enumeration
    if (!user.passwordHash) {
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
        companyId: userCompany.companyId,
        companyName: userCompany.companyName,
      })
      .from(userCompany)
      .where(eq(userCompany.companyId, user.companyId))
      .limit(1);

    const company = companies[0];

    // Update last login timestamp for audit trail
    await db
      .update(userInfo)
      .set({ lastLogin: new Date() })
      .where(eq(userInfo.userId, user.userId));

    // Generate JWT token with workspace context
    const token = await generateJWT({
      user_id: user.userId,
      company_id: user.companyId,
      username: user.username,
      role: user.role || 'user',
    });

    // Build response with user and workspace info
    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      user: {
        user_id: user.userId,
        company_id: user.companyId,
        username: user.username,
        role: user.role,
        email: user.email,
      },
      workspace: {
        type: workspaceConfig.getWorkspaceMode(),           // 'shared' or 'individual'
        company_id: user.companyId,
        user_id: user.userId,
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
