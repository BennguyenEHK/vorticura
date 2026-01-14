// =============================================
// 🔐 AUTHENTICATION HELPERS
// =============================================
// Purpose: JWT verification and workspace context extraction

import { jwtVerify, SignJWT } from 'jose';
import { WorkspaceContext } from './workspace-context';

// JWT secret key (from environment or default)
// WARNING: Change this in production!
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'quoteflow-ai-secret-key-change-in-production'
);

/**
 * JWTPayload - JWT token payload structure
 * Contains user and tenant information
 */
export interface JWTPayload {
  client_id: number;
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
      typeof payload.client_id === 'number' &&
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
      client_id: payload.client_id,
      company_id: payload.company_id,
      username: payload.username,
      role: payload.role,
    });
  } catch (error) {
    console.error('❌ Failed to create workspace context:', error);
    return null;
  }
}
