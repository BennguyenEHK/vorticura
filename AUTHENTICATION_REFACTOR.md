# AUTHENTICATION REFACTOR - Implementation Guide

## Overview

This refactor integrates bcryptjs and JWT (jose) for secure authentication and workspace context management in `quoteflow_ai`, corresponding to the old `make_sales_sse_sever` structure.

## Prerequisites

Install npm dependencies:

```bash
npm install bcryptjs jose
npm install -D @types/bcryptjs
```

---

## File Correspondence Table

| # | New File (quoteflow_ai) | Old File (make_sales_sse_sever) | Action |
|---|-------------------------|--------------------------------|--------|
| 1 | `middleware.ts` | `sse_server.js:397` + `auth-middleware.js:24-91` | **UPDATE** |
| 2 | `app/api/auth/signup/route.ts` | `api/auth/signup.js:41-261` | **CREATE** |
| 3 | `app/api/auth/login/route.ts` | `api/auth/login.js:27-153` | **CREATE** |
| 4 | `app/api/auth/logout/route.ts` | `api/auth/login.js:~140` | **CREATE** |
| 5 | `app/api/auth/me/route.ts` | `sse_server.js:467` | **CREATE** |
| 6 | `app/api/auth/verify/route.ts` | `sse_server.js:458` | **CREATE** |
| 7 | `lib/services/auth/workspace-service.ts` | Extended workspace logic | **CREATE** |
| 8 | `lib/utils/api/get-workspace.ts` | `auth-middleware.js:24-91` | **CREATE** |
| 9 | `lib/middleware/auth-helpers.ts` | Add cookie utilities | **UPDATE** |

---

## Environment Variables Required

Add to `.env.local`:

```env
# JWT Configuration
JWT_SECRET=your-secure-jwt-secret-min-32-chars

# Workspace Configuration
WORKSPACE_MODE=shared
ENABLE_CLIENT_ISOLATION=false
```

---

## 1. UPDATE: `middleware.ts`

**Purpose:** Global route protection with JWT validation and workspace context injection
**Corresponds to:** `sse_server.js:397` + `auth-middleware.js:24-91`

```typescript
// middleware.ts
// Global Next.js Middleware - Authentication & Workspace Context

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// JWT secret for verification (must match auth-helpers.ts)
const JWT_SECRET = new TextEncoder().encode(
  (() => {
    const secret = process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production') {
      if (!secret || secret.trim() === '') {
        throw new Error(
          'FATAL: JWT_SECRET environment variable is required in production. ' +
          'Please set process.env.JWT_SECRET before starting the application.'
        );
      }
      return secret;
    }
    // Non-production (dev/test): use provided secret or fallback
    return secret || 'quoteflow-ai-secret-key-change-in-production';
  })()
);

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/api/auth',
  '/api/health',
  '/_next',
  '/favicon.ico',
];

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/dashboard',
  '/quotations',
  '/workflow',
  '/files',
  '/chat',
  '/api/database',
  '/api/quotations',
  '/api/sessions',
  '/api/events',
];

/**
 * Check if a path matches any of the given routes
 */
function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some(route => pathname.startsWith(route));
}

/**
 * Verify JWT token and extract payload
 */
async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as {
      client_id: number;
      company_id: number;
      username: string;
      role: string;
    };
  } catch {
    return null;
  }
}

/**
 * Main middleware function
 * Handles authentication, route protection, and workspace context
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets
  if (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Create response object
  const response = NextResponse.next();

  // Add CORS headers for API routes
  if (pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    response.headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  // Allow public routes without authentication
  if (matchesRoute(pathname, PUBLIC_ROUTES)) {
    return response;
  }

  // Check for protected routes
  if (matchesRoute(pathname, PROTECTED_ROUTES)) {
    // Get token from cookie or Authorization header
    const token =
      request.cookies.get('auth_token')?.value ||
      request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      // Redirect to login for page requests
      if (!pathname.startsWith('/api/')) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      // Return 401 for API requests
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    // Verify token
    const payload = await verifyToken(token);

    if (!payload) {
      // Clear invalid cookie and redirect
      if (!pathname.startsWith('/api/')) {
        const redirectResponse = NextResponse.redirect(new URL('/login', request.url));
        redirectResponse.cookies.delete('auth_token');
        return redirectResponse;
      }
      return NextResponse.json(
        { error: 'Invalid or expired token', code: 'INVALID_TOKEN' },
        { status: 401 }
      );
    }

    // Inject workspace context into request headers for API routes
    // These headers will be read by API route handlers
    response.headers.set('x-client-id', String(payload.client_id));
    response.headers.set('x-company-id', String(payload.company_id));
    response.headers.set('x-username', payload.username);
    response.headers.set('x-user-role', payload.role);
  }

  return response;
}

/**
 * Configure which routes this middleware runs on
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.css|.*\\.js).*)',
  ],
};
```

---

## 2. CREATE: `app/api/auth/signup/route.ts`

**Purpose:** User registration endpoint
**Corresponds to:** `api/auth/signup.js:41-261`

```typescript
// app/api/auth/signup/route.ts
// User Registration API Route

import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db/client';
import { clientInfo, clientCompany } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateJWT } from '@/lib/middleware/auth-helpers';

/**
 * Signup request body interface
 */
interface SignupRequest {
  username: string;
  password: string;
  email?: string;
  company_name: string;
  company_email?: string;
  company_address?: string;
  company_number?: string;
}

/**
 * POST /api/auth/signup
 * Register a new user and company
 * Corresponds to: api/auth/signup.js:41-261
 */
export async function POST(request: NextRequest) {
  try {
    const body: SignupRequest = await request.json();

    // Validate required fields
    if (!body.username || !body.password || !body.company_name) {
      return NextResponse.json(
        { error: 'Username, password, and company name are required' },
        { status: 400 }
      );
    }

    // Validate username length
    if (body.username.length < 3 || body.username.length > 50) {
      return NextResponse.json(
        { error: 'Username must be between 3 and 50 characters' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if username already exists
    const existingUser = await db
      .select({ clientId: clientInfo.clientId })
      .from(clientInfo)
      .where(eq(clientInfo.username, body.username))
      .limit(1);

    if (existingUser.length > 0) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 409 }
      );
    }

    // Hash password (corresponds to signup.js:173-174)
    const passwordHash = await hash(body.password, 10);

    // Create company and user inside a transaction to ensure both succeed or both fail
    const [newUser] = await db.transaction(async (tx) => {
      // Create company first (corresponds to signup.js:~100)
      const [newCompany] = await tx
        .insert(clientCompany)
        .values({
          companyName: body.company_name,
          companyEmail: body.company_email || null,
          companyAddress: body.company_address || null,
          companyNumber: body.company_number || null,
        })
        .returning();

      // Create user with company reference (corresponds to signup.js:~150)
      const [createdUser] = await tx
        .insert(clientInfo)
        .values({
          companyId: newCompany.companyId,
          username: body.username,
          passwordHash: passwordHash,
          email: body.email || null,
          clientRole: 'admin', // First user of company is admin
          clientStatus: 'active',
          lastLogin: new Date(),
        })
        .returning();

      return [createdUser];
    });

    // Generate JWT token for auto-login (corresponds to signup.js:~200)
    const token = await generateJWT({
      client_id: newUser.clientId,
      company_id: newCompany.companyId,
      username: newUser.username,
      role: newUser.clientRole || 'admin',
    });

    // Create response with auth cookie (corresponds to login.js:88-93)
    const response = NextResponse.json({
      success: true,
      message: 'Account created successfully',
      user: {
        client_id: newUser.clientId,
        company_id: newCompany.companyId,
        username: newUser.username,
        role: newUser.clientRole,
      },
      workspace: {
        type: 'shared',
        company_id: newCompany.companyId,
        client_id: newUser.clientId,
        company_name: newCompany.companyName,
      },
    });

    // Set HTTP-only cookie (corresponds to login.js:88-93)
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Failed to create account. Please try again.' },
      { status: 500 }
    );
  }
}
```

---

## 3. CREATE: `app/api/auth/login/route.ts`

**Purpose:** Custom login endpoint
**Corresponds to:** `api/auth/login.js:27-153`

```typescript
// app/api/auth/login/route.ts
// Custom Login API Route

import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db/client';
import { clientInfo, clientCompany } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateJWT } from '@/lib/middleware/auth-helpers';
import { workspaceConfig } from '@/config/workspace.config';

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 * Corresponds to: api/auth/login.js:27-153
 */
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Query user from database (corresponds to login.js:42-46)
    const users = await db
      .select({
        clientId: clientInfo.clientId,
        companyId: clientInfo.companyId,
        username: clientInfo.username,
        passwordHash: clientInfo.passwordHash,
        role: clientInfo.clientRole,
        status: clientInfo.clientStatus,
        email: clientInfo.email,
      })
      .from(clientInfo)
      .where(eq(clientInfo.username, username))
      .limit(1);

    const user = users[0];

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Check account status
    if (user.status !== 'active') {
      return NextResponse.json(
        { error: 'Account is inactive. Please contact support.' },
        { status: 403 }
      );
    }

    // Verify password (corresponds to login.js:69)
    const isValidPassword = await compare(password, user.passwordHash);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Get company information
    const companies = await db
      .select({
        companyId: clientCompany.companyId,
        companyName: clientCompany.companyName,
      })
      .from(clientCompany)
      .where(eq(clientCompany.companyId, user.companyId!))
      .limit(1);

    const company = companies[0];

    // Update last login timestamp
    await db
      .update(clientInfo)
      .set({ lastLogin: new Date() })
      .where(eq(clientInfo.clientId, user.clientId));

    // Generate JWT token (corresponds to login.js:80-85)
    const token = await generateJWT({
      client_id: user.clientId,
      company_id: user.companyId!,
      username: user.username,
      role: user.role || 'user',
    });

    // Build response (corresponds to login.js:~100)
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
        type: workspaceConfig.getWorkspaceMode(),
        company_id: user.companyId,
        client_id: user.clientId,
        company_name: company?.companyName || null,
        isolation_enabled: workspaceConfig.isClientIsolationEnabled(),
      },
    });

    // Set HTTP-only cookie (corresponds to login.js:88-93)
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Authentication failed. Please try again.' },
      { status: 500 }
    );
  }
}
```

---

## 4. CREATE: `app/api/auth/logout/route.ts`

**Purpose:** Logout endpoint
**Corresponds to:** `api/auth/login.js:~140` (logoutHandler)

```typescript
// app/api/auth/logout/route.ts
// Logout API Route

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/logout
 * Clear authentication cookie and log out user
 * Corresponds to: api/auth/login.js:~140 (logoutHandler)
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully',
  });

  // Clear auth cookie
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0, // Expire immediately
    path: '/',
  });

  return response;
}

/**
 * GET /api/auth/logout
 * Support GET request for logout (redirect flow)
 */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url));

  // Clear auth cookie
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });

  return response;
}
```

---

## 5. CREATE: `app/api/auth/me/route.ts`

**Purpose:** Get current user info
**Corresponds to:** `sse_server.js:467` (GET /api/auth/me)

```typescript
// app/api/auth/me/route.ts
// Current User API Route

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceFromToken } from '@/lib/middleware/auth-helpers';
import { db } from '@/lib/db/client';
import { clientInfo, clientCompany } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/auth/me
 * Get current authenticated user information
 * Corresponds to: sse_server.js:467 (GET /api/auth/me)
 */
export async function GET(request: NextRequest) {
  try {
    // Get token from cookie
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Verify token and get workspace context
    const workspace = await getWorkspaceFromToken(token);

    if (!workspace) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Get full user details
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

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get company details
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
      workspace: workspace.getWorkspaceInfo(),
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Failed to get user information' },
      { status: 500 }
    );
  }
}
```

---

## 6. CREATE: `app/api/auth/verify/route.ts`

**Purpose:** Verify authentication token
**Corresponds to:** `sse_server.js:458` (GET /api/auth/verify)

```typescript
// app/api/auth/verify/route.ts
// Token Verification API Route

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceFromToken } from '@/lib/middleware/auth-helpers';

/**
 * GET /api/auth/verify
 * Verify if the current token is valid
 * Corresponds to: sse_server.js:458 (GET /api/auth/verify)
 */
export async function GET(request: NextRequest) {
  try {
    // Get token from cookie or Authorization header
    const token =
      request.cookies.get('auth_token')?.value ||
      request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({
        valid: false,
        error: 'No token provided',
      });
    }

    // Verify token
    const workspace = await getWorkspaceFromToken(token);

    if (!workspace) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid or expired token',
      });
    }

    return NextResponse.json({
      valid: true,
      user: {
        client_id: workspace.client_id,
        company_id: workspace.company_id,
        username: workspace.username,
        role: workspace.role,
      },
      workspace: workspace.getWorkspaceInfo(),
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json({
      valid: false,
      error: 'Verification failed',
    });
  }
}
```

---

## 7. CREATE: `lib/services/auth/workspace-service.ts`

**Purpose:** Workspace business logic utilities
**Corresponds to:** `utils/auth_account/workspace-context.js` (extended functionality)

```typescript
// lib/services/auth/workspace-service.ts
// Workspace Business Logic Service

import { WorkspaceContext } from '@/lib/middleware/workspace-context';
import { WorkspaceDatabaseHelper } from '@/lib/db/workspace-helper';
import { db } from '@/lib/db/client';
import { clientInfo, clientCompany, userSessions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { workspaceConfig } from '@/config/workspace.config';

/**
 * WorkspaceService Class
 * Provides high-level workspace operations for business logic
 */
export class WorkspaceService {
  private workspace: WorkspaceContext;
  private dbHelper: WorkspaceDatabaseHelper;

  constructor(workspace: WorkspaceContext) {
    this.workspace = workspace;
    this.dbHelper = new WorkspaceDatabaseHelper(workspace);
  }

  /**
   * Get all users in the same company
   * Only available to admin/manager roles
   */
  async getCompanyUsers() {
    if (!this.workspace.hasPermission('view_records')) {
      throw new Error('Permission denied');
    }

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
   */
  async getCompanyDetails() {
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
   */
  async updateLastViewed(itemId: number, itemType: string = 'quotation') {
    // Upsert user session
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
        target: [userSessions.companyId, userSessions.clientId],
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
   * Used for session restoration
   */
  async getLastViewed() {
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
   */
  getWorkspaceSummary() {
    return {
      ...this.workspace.getWorkspaceInfo(),
      config: workspaceConfig.getConfigSummary(),
    };
  }

  /**
   * Get database helper for CRUD operations
   */
  getDbHelper() {
    return this.dbHelper;
  }
}

/**
 * Factory function to create workspace service
 */
export function createWorkspaceService(workspace: WorkspaceContext): WorkspaceService {
  return new WorkspaceService(workspace);
}
```

---

## 8. CREATE: `lib/utils/api/get-workspace.ts`

**Purpose:** Helper to extract workspace from API request
**Corresponds to:** `auth-middleware.js:24-91` (context extraction)

```typescript
// lib/utils/api/get-workspace.ts
// API Workspace Extraction Helper

import { NextRequest } from 'next/server';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';
import { getWorkspaceFromToken } from '@/lib/middleware/auth-helpers';

/**
 * Extract workspace context from API request
 * Works with both cookie and Authorization header
 *
 * @param request - Next.js API request
 * @returns WorkspaceContext or null if not authenticated
 *
 * Usage in API route:
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const workspace = await getWorkspaceFromRequest(request);
 *   if (!workspace) {
 *     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 *   // Use workspace for database operations
 * }
 * ```
 */
export async function getWorkspaceFromRequest(
  request: NextRequest
): Promise<WorkspaceContext | null> {
  // Try cookie first (preferred method)
  let token = request.cookies.get('auth_token')?.value;

  // Fallback to Authorization header
  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return null;
  }

  return getWorkspaceFromToken(token);
}

/**
 * Require workspace context - throws if not authenticated
 * Use in API routes that require authentication
 *
 * @param request - Next.js API request
 * @returns WorkspaceContext
 * @throws Error if not authenticated
 */
export async function requireWorkspace(request: NextRequest): Promise<WorkspaceContext> {
  const workspace = await getWorkspaceFromRequest(request);

  if (!workspace) {
    throw new Error('Authentication required');
  }

  return workspace;
}
```

---

## 9. UPDATE: `lib/middleware/auth-helpers.ts`

**Purpose:** Add cookie management utilities
**Corresponds to:** `api/auth/login.js:88-93` (cookie setup)

**Add the following to the END of the existing file:**

```typescript
// =============================================
// COOKIE UTILITIES (Add to existing file)
// =============================================

/**
 * Cookie configuration for auth token
 * Corresponds to: login.js:88-93
 */
export const AUTH_COOKIE_CONFIG = {
  name: 'auth_token',
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    path: '/',
  },
};

/**
 * Set auth cookie on response
 */
export function setAuthCookie(response: Response, token: string): void {
  const cookieValue = `${AUTH_COOKIE_CONFIG.name}=${token}; Path=${AUTH_COOKIE_CONFIG.options.path}; Max-Age=${AUTH_COOKIE_CONFIG.options.maxAge}; ${AUTH_COOKIE_CONFIG.options.httpOnly ? 'HttpOnly;' : ''} ${AUTH_COOKIE_CONFIG.options.secure ? 'Secure;' : ''} SameSite=${AUTH_COOKIE_CONFIG.options.sameSite}`;

  response.headers.append('Set-Cookie', cookieValue);
}

/**
 * Clear auth cookie on response
 */
export function clearAuthCookie(response: Response): void {
  const cookieValue = `${AUTH_COOKIE_CONFIG.name}=; Path=/; Max-Age=0; HttpOnly; SameSite=strict`;
  response.headers.append('Set-Cookie', cookieValue);
}
```

---

## Directory Structure After Implementation

```
quoteflow_ai/
├── middleware.ts                          # UPDATE (add auth logic)
├── drizzle.config.ts                      # EXISTS
├── lib/
│   ├── middleware/
│   │   ├── workspace-context.ts           # EXISTS
│   │   └── auth-helpers.ts                # UPDATE (add cookies)
│   ├── db/
│   │   ├── client.ts                      # EXISTS
│   │   ├── schema.ts                      # EXISTS
│   │   ├── queries.ts                     # EXISTS
│   │   ├── workspace-helper.ts            # EXISTS
│   │   └── migrations/
│   │       └── migrate.ts                 # EXISTS
│   ├── services/
│   │   └── auth/
│   │       └── workspace-service.ts       # CREATE
│   └── utils/
│       └── api/
│           └── get-workspace.ts           # CREATE
├── app/
│   └── api/
│       └── auth/
│           ├── signup/
│           │   └── route.ts               # CREATE
│           ├── login/
│           │   └── route.ts               # CREATE
│           ├── logout/
│           │   └── route.ts               # CREATE
│           ├── me/
│           │   └── route.ts               # CREATE
│           └── verify/
│               └── route.ts               # CREATE
├── config/
│   └── workspace.config.ts                # EXISTS
└── types/
    ├── workspace.ts                       # EXISTS
    └── database.ts                        # EXISTS
```

---

## Verification Steps After Implementation

### 1. Test Login Flow
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass"}'
```

### 2. Test Signup Flow
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"newuser","password":"newpass123","company_name":"Test Corp"}'
```

### 3. Test Token Verification
```bash
curl http://localhost:3000/api/auth/verify \
  -H "Cookie: auth_token=<token>"
```

### 4. Test Get Current User
```bash
curl http://localhost:3000/api/auth/me \
  -H "Cookie: auth_token=<token>"
```

### 5. Test Protected Route
```bash
curl -X POST http://localhost:3000/api/database/select \
  -H "Cookie: auth_token=<token>" \
  -H "Content-Type: application/json" \
  -d '{"table":"quotations","where":{}}'
```

### 6. Test Logout
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Cookie: auth_token=<token>"
```

---

## Summary

| Action | Files | Count |
|--------|-------|-------|
| **CREATE** | `app/api/auth/*/route.ts` (5 files: signup, login, logout, me, verify), `lib/services/auth/workspace-service.ts`, `lib/utils/api/get-workspace.ts` | 7 |
| **UPDATE** | `middleware.ts`, `lib/middleware/auth-helpers.ts` | 2 |
| **TOTAL** | | 9 |
