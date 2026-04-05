// =============================================
// 🔐 AUTHENTICATION HELPERS
// =============================================
// Purpose: JWT verification and workspace context extraction

import { jwtVerify, SignJWT } from 'jose';
import { WorkspaceContext } from './workspace-context';

// JWT secret key (from environment or default)
// Fail fast in production if secret is missing; allow dev fallback with warning
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
if (!rawJwtSecret && process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line no-console
  console.warn('⚠️ Using development fallback JWT_SECRET. Do NOT use this in production.');
}
const JWT_SECRET = new TextEncoder().encode(rawJwtSecret || 'quoteflow-ai-secret-key-change-in-production');

/**
 * JWTPayload - JWT token payload structure
 * Contains user and tenant information
 */
export interface JWTPayload {
  user_id: number;     // renamed from client_id
  company_id: number;
  username: string;
  role: string;
  [key: string]: unknown; // Allow additional properties for jose compatibility
}

/**
 * Verify JWT token and extract payload
 * @param token - JWT token string
 * @returns Decoded payload or null if verification fails
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    // Verify token signature and decode payload
    const { payload } = await jwtVerify(token, JWT_SECRET);

    // Validate required fields
    if (
      typeof payload.user_id === 'number' &&
      typeof payload.company_id === 'number' &&
      typeof payload.username === 'string' &&
      typeof payload.role === 'string'
    ) {
      return payload as JWTPayload;
    }

    return null;
  } catch (error) {
    console.error('❌ JWT verification failed:', error);
    return null;
  }
}

/**
 * Generate JWT token for user
 * @param user - User payload to encode
 * @param expiresIn - Token expiration time (default: 7 days)
 * @returns Signed JWT token string
 */
export async function generateJWT(user: JWTPayload, expiresIn: string = '7d'): Promise<string> {
  // Create and sign JWT with HS256 algorithm
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);

  return token;
}

/**
 * Extract workspace context from JWT token
 * @param token - JWT token string
 * @returns WorkspaceContext instance or null if extraction fails
 */
export async function getWorkspaceFromToken(token: string): Promise<WorkspaceContext | null> {
  // Verify token and extract payload
  const payload = await verifyJWT(token);
  if (!payload) return null;

  try {
    // Create workspace context from payload
    return new WorkspaceContext({
      user_id: payload.user_id,
      company_id: payload.company_id,
      username: payload.username,
      role: payload.role,
    });
  } catch (error) {
    console.error('❌ Failed to create workspace context:', error);
    return null;
  }
}

// =============================================
// 🍪 COOKIE UTILITIES
// =============================================
// Purpose: Cookie configuration and management for auth tokens
// Corresponds to: api/auth/login.js:88-93

/**
 * Cookie configuration for auth token
 * Defines security settings for HTTP-only authentication cookie
 */
export const AUTH_COOKIE_CONFIG = {
  name: 'auth_token',
  options: {
    httpOnly: true,                                    // Cannot be accessed by JavaScript (XSS protection)
    secure: process.env.NODE_ENV === 'production',     // HTTPS only in production
    sameSite: 'strict' as const,                       // CSRF protection
    maxAge: 7 * 24 * 60 * 60,                          // 7 days in seconds
    path: '/',                                         // Available on all paths
  },
};

/**
 * Set auth cookie on response
 * Use this for manual cookie setting on Response objects
 * @param response - Response object to add cookie header to
 * @param token - JWT token string to set as cookie value
 */
export function setAuthCookie(response: Response, token: string): void {
  // Build cookie string manually for Response.headers
  const cookieValue = `${AUTH_COOKIE_CONFIG.name}=${token}; Path=${AUTH_COOKIE_CONFIG.options.path}; Max-Age=${AUTH_COOKIE_CONFIG.options.maxAge}; ${AUTH_COOKIE_CONFIG.options.httpOnly ? 'HttpOnly;' : ''} ${AUTH_COOKIE_CONFIG.options.secure ? 'Secure;' : ''} SameSite=${AUTH_COOKIE_CONFIG.options.sameSite}`;

  // Append to Set-Cookie header
  response.headers.append('Set-Cookie', cookieValue);
}

/**
 * Clear auth cookie on response
 * Use this for logout functionality
 * @param response - Response object to clear cookie on
 */
export function clearAuthCookie(response: Response): void {
  // Build deletion cookie using same attributes as original cookie
  const cookieParts = [
    `${AUTH_COOKIE_CONFIG.name}=`,
    `Path=${AUTH_COOKIE_CONFIG.options.path}`,
    'Max-Age=0',
  ];

  if (AUTH_COOKIE_CONFIG.options.httpOnly) {
    cookieParts.push('HttpOnly');
  }
  if (AUTH_COOKIE_CONFIG.options.secure) {
    cookieParts.push('Secure');
  }
  cookieParts.push(`SameSite=${AUTH_COOKIE_CONFIG.options.sameSite}`);

  const cookieValue = cookieParts.join('; ');
  response.headers.append('Set-Cookie', cookieValue);
}
