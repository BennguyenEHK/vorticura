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
  '/',                // Homepage (public landing page)
  '/login',           // Login page
  '/signup',          // Signup page
  '/api/auth',        // All auth endpoints (login, signup, logout, verify, OAuth callbacks)
  '/api/health',      // Health check endpoints
  '/api/webhooks',    // Email webhook endpoints (Gmail Pub/Sub, Microsoft Graph — self-authenticated)
  '/api/cron',        // Vercel cron jobs (authenticated via CRON_SECRET bearer token)
  '/api/preview-stream', // SSE stream + emit bridge (internal/test use)
  '/_next',           // Next.js internal routes
  '/favicon.ico',     // Favicon
];

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Check if a path matches any of the given routes
 * @param pathname - Current request path
 * @param routes - Array of route prefixes to match
 * @returns true if path matches exactly or starts with route prefix
 */
function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some(route => {
    // Exact match for root path '/' to avoid matching all routes
    if (route === '/') {
      return pathname === '/';
    }
    // Prefix match for other routes
    return pathname.startsWith(route);
  });
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
  // Whitelist known static file extensions to avoid false positives on versioned API paths
  const staticExtensions = /\.(css|js|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|map)$/i;
  
  if (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    staticExtensions.test(pathname)
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
    // In production, fail closed: only set CORS headers if ALLOWED_ORIGIN is explicitly configured
    if (process.env.ALLOWED_ORIGIN) {
      response.headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    } else if (process.env.NODE_ENV !== 'production') {
      // Non-production environments can use wildcard for development/testing
      response.headers.set('Access-Control-Allow-Origin', '*');
    }
    // Production without ALLOWED_ORIGIN: omit CORS headers (fail closed)
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
    // Redirect to homepage for page requests (homepage has login/signup CTAs)
    if (!pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/', request.url));
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
    // Redirect to homepage and clear invalid cookie for page requests
    if (!pathname.startsWith('/api/')) {
      const redirectResponse = NextResponse.redirect(new URL('/', request.url));
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
  requestHeaders.set('x-user-id', String(payload.user_id));  // renamed from x-client-id
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
