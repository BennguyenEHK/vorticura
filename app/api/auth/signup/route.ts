// =============================================
// 📝 SIGNUP API ROUTE
// =============================================
// Purpose: User registration endpoint
// Corresponds to: api/auth/signup.js:41-261

import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db/client';
import { userInfo, userCompany } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateJWT } from '@/lib/middleware/auth-helpers';

/**
 * Signup request body interface
 * Defines the expected structure of registration data
 * Matches CLIENT_COMPANY and CLIENT_INFO table schemas
 */
interface SignupRequest {
  username: string;        // Required: unique username (3-50 chars)
  full_name: string;       // Required: user's full name for Attn: self-exclusion
  password: string;        // Required: minimum 8 characters
  email?: string;          // Optional: user email
  company_name: string;    // Required: company name for new company creation
  company_email?: string;  // Optional: company contact email (max 60 chars)
  company_address?: string; // Optional: company address
  company_number?: string;  // Optional: company phone number (max 50 chars)
  company_fax?: string;     // Optional: company fax number (max 50 chars)
}

/**
 * POST /api/auth/signup
 * Register a new user and company
 * - Creates new company record
 * - Creates new user linked to company (as admin)
 * - Returns JWT token in HTTP-only cookie
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: SignupRequest = await request.json();

    // Validate required fields
    if (!body.username || !body.password || !body.company_name || !body.full_name) {
      return NextResponse.json(
        { error: 'Username, full name, password, and company name are required' },
        { status: 400 }
      );
    }

    // Validate username length (3-50 characters)
    if (body.username.length < 3 || body.username.length > 50) {
      return NextResponse.json(
        { error: 'Username must be between 3 and 50 characters' },
        { status: 400 }
      );
    }

    // Validate password strength (minimum 8 characters)
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if username already exists in database
    const existingUser = await db
      .select({ userId: userInfo.userId })
      .from(userInfo)
      .where(eq(userInfo.username, body.username))
      .limit(1);

    if (existingUser.length > 0) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 409 } // 409 Conflict
      );
    }

    // Hash password with bcrypt (10 rounds)
    const passwordHash = await hash(body.password, 10);

    // Wrap company and user creation in a single transaction
    let newCompany: typeof userCompany.$inferInsert & { companyId: number };
    let newUser: typeof userInfo.$inferInsert & { userId: number };

    try {
      [newCompany, newUser] = await db.transaction(async (tx) => {
        // Create company first (company must exist before user)
        const [company] = await tx
          .insert(userCompany)
          .values({
            companyName: body.company_name,
            companyEmail: body.company_email || null,
            companyAddress: body.company_address || null,
            companyNumber: body.company_number || null,
            companyFax: body.company_fax || null, // Include company fax
          })
          .returning();

        // Create user with company reference (first user becomes admin)
        const [user] = await tx
          .insert(userInfo)
          .values({
            companyId: company.companyId,
            username: body.username,
            fullName: body.full_name,
            passwordHash: passwordHash,
            email: body.email || null,
            userRole: 'admin', // First user of company is admin
            userStatus: 'active',
            lastLogin: new Date(),
          })
          .returning();

        return [company, user];
      });
    } catch (error) {
      console.error('Transaction failed during signup:', error);
      return NextResponse.json(
        { error: 'Failed to create account. Please try again.' },
        { status: 500 }
      );
    }

    // Generate JWT token for auto-login after signup
    const token = await generateJWT({
      user_id: newUser.userId,
      company_id: newCompany.companyId,
      username: newUser.username,
      role: newUser.userRole || 'admin',
    });

    // Create response with user data
    const response = NextResponse.json({
      success: true,
      message: 'Account created successfully',
      user: {
        user_id: newUser.userId,
        company_id: newCompany.companyId,
        username: newUser.username,
        role: newUser.userRole,
      },
      workspace: {
        type: 'shared',
        company_id: newCompany.companyId,
        user_id: newUser.userId,
        company_name: newCompany.companyName,
      },
    });

    // Set HTTP-only cookie for security (prevents XSS attacks)
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
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Failed to create account. Please try again.' },
      { status: 500 }
    );
  }
}
