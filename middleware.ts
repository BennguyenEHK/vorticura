// =============================================
// 🛡️ GLOBAL NEXT.JS MIDDLEWARE
// =============================================
// Purpose: Authentication, route protection, and workspace context
// Corresponds to: sse_server.js:397 + auth-middleware.js:24-91

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from '@/lib/middleware/auth-helpers'; // Use centralized JWT verification

// =============================================
// ROUTE CONFIGURATION
// =============================================

// Routes that don't require authentication (public access)
const PUBLIC_ROUTES = [
  '/login',           // Login page
  '/signup',          // Signup page
  '/api/auth',        // All auth endpoints (login, signup, logout, verify)
  '/api/health',      // Health check endpoints
  '/_next',           // Next.js internal routes
  '/favicon.ico',     // Favicon
];

// Routes that require authentication (protected)
const PROTECTED_ROUTES = [
  '/dashboard',       // Dashboard pages
  '/quotations',      // Quotation pages
  '/workflow',        // Workflow pages
  '/files',           // File management pages
  '/chat',            // Chat pages
  '/api/database',    // Database API endpoints
  '/api/quotations',  // Quotation API endpoints
  '/api/sessions',    // Session API endpoints
  '/api/events',      // SSE events endpoint
  '/api/stats',       // Statistics endpoint
];

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Check if a path matches any of the given routes
 * @param pathname - Current request path
 * @param routes - Array of route prefixes to match
 * @returns true if path starts with any route prefix
 */
function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some(route => pathname.startsWith(route));
}

// Note: verifyToken removed - now using verifyJWT from auth-helpers.ts

// =============================================
// MAIN MIDDLEWARE FUNCTION
// =============================================

/**
 * Main middleware function
 * Handles authentication, route protection, and workspace context
 * Runs on every request matching the config.matcher pattern
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets (performance optimization)
  if (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname.includes('.')  // Files with extensions (images, css, etc.)
  ) {
    return NextResponse.next();
  }

  // Create response object for modifications
  const response = NextResponse.next();

  // =============================================
  // CORS HEADERS FOR API ROUTES
  // =============================================

  if (pathname.startsWith('/api/')) {
    // Handle preflight OPTIONS request (CORS)
    if (request.method === 'OPTIONS') {
      const originHeader: Record<string, string> = {};
      if (process.env.ALLOWED_ORIGIN) {
        originHeader['Access-Control-Allow-Origin'] = process.env.ALLOWED_ORIGIN;
        originHeader['Access-Control-Allow-Credentials'] = 'true';
      } else {
        originHeader['Access-Control-Allow-Origin'] = '*';
      }

      return new NextResponse(null, {
        status: 204,
        headers: {
          ...originHeader,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400', // Cache preflight for 24 hours
        },
      });
    }

    // Add CORS headers to all API responses
    if (process.env.ALLOWED_ORIGIN) {
      response.headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    } else {
      response.headers.set('Access-Control-Allow-Origin', '*');
      // Note: credentials cannot be used with wildcard origin
    }
  }

  // =============================================
  // PUBLIC ROUTES (NO AUTH REQUIRED)
  // =============================================

  if (matchesRoute(pathname, PUBLIC_ROUTES)) {
    return response;
  }

  // =============================================
  // PROTECTED ROUTES AND DEFAULT AUTH ENFORCEMENT
  // =============================================

  // If not a public route, treat as protected and require authentication
  // Get token from cookie (primary) or Authorization header (fallback)
  const token =
    request.cookies.get('auth_token')?.value ||
    request.headers.get('Authorization')?.replace('Bearer ', '');

  // No token provided
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

  // Verify token using centralized verifyJWT from auth-helpers.ts
  const payload = await verifyJWT(token);

  // Token invalid or expired
  if (!payload) {
    // Redirect to login and clear invalid cookie for page requests
    if (!pathname.startsWith('/api/')) {
      const redirectResponse = NextResponse.redirect(new URL('/login', request.url));
      redirectResponse.cookies.delete('auth_token'); // Clear invalid token
      return redirectResponse;
    }
    // Return 401 for API requests
    return NextResponse.json(
      { error: 'Invalid or expired token', code: 'INVALID_TOKEN' },
      { status: 401 }
    );
  }

  // =============================================
  // INJECT WORKSPACE CONTEXT INTO REQUEST HEADERS
  // =============================================

  // Create new headers from request and add workspace context
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-client-id', String(payload.client_id));
  requestHeaders.set('x-company-id', String(payload.company_id));
  requestHeaders.set('x-username', payload.username);
  requestHeaders.set('x-user-role', payload.role);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

// =============================================
// MIDDLEWARE CONFIGURATION
// =============================================

/**
 * Configure which routes this middleware runs on
 * Excludes static files and Next.js internal routes
 */
export const config = {
  matcher: [
    // Match all routes except static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.css|.*\\.js).*)',
  ],
};
