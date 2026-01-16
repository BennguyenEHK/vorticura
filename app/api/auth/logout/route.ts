// =============================================
// 🚪 LOGOUT API ROUTE
// =============================================
// Purpose: Clear authentication and log out user
// Corresponds to: api/auth/login.js:~140 (logoutHandler)

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/logout
 * Clear authentication cookie and log out user
 * Used by frontend logout button/action
 */
export async function POST(request: NextRequest) {
  // Create success response
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully',
  });

  // Clear auth cookie by setting maxAge to 0 (expires immediately)
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,  // Expire immediately
    path: '/',
  });

  return response;
}

/**
 * GET /api/auth/logout
 * Support GET request for logout (redirect flow)
 * Useful for logout links that redirect to login page
 */
export async function GET(request: NextRequest) {
  // Redirect to login page after clearing cookie
  const response = NextResponse.redirect(new URL('/login', request.url));

  // Clear auth cookie
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,  // Expire immediately
    path: '/',
  });

  return response;
}
