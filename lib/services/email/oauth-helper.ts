// =============================================
// OAUTH HELPER - Token Management & Encryption
// =============================================
// Google + Microsoft OAuth URL builders, token exchange, refresh,
// and AES-256-GCM token encryption/decryption for secure storage.

import crypto from 'crypto';

// =============================================
// ENVIRONMENT VALIDATION
// =============================================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Token encryption key — must be exactly 32 bytes (64 hex chars) for AES-256-GCM
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';
if (!TOKEN_ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
  throw new Error('TOKEN_ENCRYPTION_KEY is required in production (32-byte hex key for AES-256-GCM)');
}

// =============================================
// STATE ENCODING (CSRF protection)
// =============================================

/** OAuth state parameter — encoded as base64 JSON */
export interface OAuthState {
  mode: 'signup' | 'login' | 'connect'; // Why the user is authenticating
  returnUrl?: string;                     // Where to redirect after callback
  nonce: string;                          // Random value for CSRF protection
}

/** Encode OAuth state as URL-safe base64 string */
export function encodeOAuthState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString('base64url');
}

/** Decode OAuth state from base64 string */
export function decodeOAuthState(encoded: string): OAuthState {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
  } catch (error) {
    throw new Error(
      `Invalid OAuth state: base64 decode or JSON parse failed. ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/** Generate a random nonce for CSRF protection */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

// =============================================
// GOOGLE OAUTH
// =============================================

/** Google OAuth scopes by mode */
const GOOGLE_SCOPES = {
  // Full scopes for signup (need profile info + email reading, modifying labels, and sending)
  signup: [
    'openid', 'email', 'profile',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify', // required by markGmailRead() to remove UNREAD label
    'https://www.googleapis.com/auth/gmail.send',
  ],
  // Login only needs identity verification — no mailbox access needed
  login: ['openid', 'email', 'profile'],
  // Connect needs email reading, modifying labels, and sending (user already has account)
  connect: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify', // required by markGmailRead() to remove UNREAD label
    'https://www.googleapis.com/auth/gmail.send',
  ],
};

/**
 * Build Google OAuth consent URL.
 * @param mode - 'signup' | 'login' | 'connect' determines scopes and redirect behavior
 * @param returnUrl - Optional URL to redirect after callback completes
 */
export function getGoogleAuthURL(mode: 'signup' | 'login' | 'connect', returnUrl?: string): string {
  const state = encodeOAuthState({ mode, returnUrl, nonce: generateNonce() });
  const scopes = GOOGLE_SCOPES[mode].join(' ');
  const redirectUri = `${APP_URL}/api/auth/callback/google`;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state,
    access_type: 'offline',    // Required to get refresh_token
    prompt: 'consent',          // Force consent to always get refresh_token
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Token response from Google OAuth token endpoint */
export interface GoogleTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;       // Seconds until access_token expires
  id_token: string;         // JWT containing user profile info
  token_type: string;
  scope: string;
}

/**
 * Exchange authorization code for tokens.
 * @param code - Authorization code from Google OAuth callback
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const redirectUri = `${APP_URL}/api/auth/callback/google`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google token exchange failed: ${error}`);
  }

  return response.json();
}

/**
 * Refresh an expired Google access token.
 * @param refreshToken - The refresh_token stored in email_connections
 */
export async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google token refresh failed: ${error}`);
  }

  return response.json();
}

/** Decoded Google ID token payload (JWT claims) */
export interface GoogleIdTokenPayload {
  sub: string;      // Google's unique user ID
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}

/**
 * Decode Google ID token JWT to extract user profile.
 * Uses simple base64 decode (signature already verified by Google during exchange).
 * @param idToken - JWT from Google token response
 */
export function decodeGoogleIdToken(idToken: string): GoogleIdTokenPayload {
  // JWT format: header.payload.signature — we only need the payload
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid Google ID token format');

  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    email_verified: payload.email_verified,
  };
}

// =============================================
// MICROSOFT OAUTH
// =============================================

/** Microsoft OAuth scopes by mode */
const MICROSOFT_SCOPES = {
  // Full scopes for signup (need profile info + email reading + sending)
  signup: ['openid', 'email', 'profile', 'Mail.Read', 'Mail.Send', 'offline_access'],
  // Login only needs identity verification
  login: ['openid', 'email', 'profile'],
  // Connect needs email reading + sending
  connect: ['Mail.Read', 'Mail.Send', 'offline_access'],
};

/**
 * Build Microsoft OAuth consent URL.
 * @param mode - 'signup' | 'login' | 'connect' determines scopes and redirect behavior
 * @param returnUrl - Optional URL to redirect after callback completes
 */
export function getMicrosoftAuthURL(mode: 'signup' | 'login' | 'connect', returnUrl?: string): string {
  const state = encodeOAuthState({ mode, returnUrl, nonce: generateNonce() });
  const scopes = MICROSOFT_SCOPES[mode].join(' ');
  const redirectUri = `${APP_URL}/api/auth/callback/microsoft`;

  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state,
    response_mode: 'query',
  });

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

/** Token response from Microsoft OAuth token endpoint */
export interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  id_token: string;
  token_type: string;
  scope: string;
}

/**
 * Exchange authorization code for tokens.
 * @param code - Authorization code from Microsoft OAuth callback
 */
export async function exchangeMicrosoftCode(code: string): Promise<MicrosoftTokenResponse> {
  const redirectUri = `${APP_URL}/api/auth/callback/microsoft`;

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Microsoft token exchange failed: ${error}`);
  }

  return response.json();
}

/**
 * Refresh an expired Microsoft access token.
 * @param refreshToken - The refresh_token stored in email_connections
 */
export async function refreshMicrosoftToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Microsoft token refresh failed: ${error}`);
  }

  return response.json();
}

/** Decoded Microsoft ID token payload (JWT claims) */
export interface MicrosoftIdTokenPayload {
  oid: string;      // Microsoft's unique user ID (object ID)
  email: string;
  name: string;
  preferred_username?: string;
}

/**
 * Decode Microsoft ID token JWT to extract user profile.
 * Uses simple base64 decode (signature verified by Microsoft during exchange).
 * @param idToken - JWT from Microsoft token response
 */
export function decodeMicrosoftIdToken(idToken: string): MicrosoftIdTokenPayload {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid Microsoft ID token format');

  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
  return {
    oid: payload.oid || payload.sub,
    email: payload.email || payload.preferred_username,
    name: payload.name,
    preferred_username: payload.preferred_username,
  };
}

// =============================================
// TOKEN ENCRYPTION (AES-256-GCM)
// =============================================

/**
 * Encrypt a plaintext token for secure database storage.
 * Uses AES-256-GCM which provides both confidentiality and integrity.
 * Output format: iv_hex:authTag_hex:ciphertext_hex
 *
 * @param plaintext - The OAuth token to encrypt
 * @returns Encrypted string in format "iv:authTag:ciphertext" (all hex)
 */
export function encryptToken(plaintext: string): string {
  // Validate TOKEN_ENCRYPTION_KEY exists and is exactly 64 hex characters (32 bytes)
  if (!TOKEN_ENCRYPTION_KEY) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        'WARNING: TOKEN_ENCRYPTION_KEY is not set in development mode. Using insecure zero-byte fallback. ' +
        'Set TOKEN_ENCRYPTION_KEY=<64-hex-chars> in .env.local for secure token encryption.'
      );
      const keyHex = '0'.repeat(64);
      const key = Buffer.from(keyHex, 'hex');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf-8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    } else {
      throw new Error('TOKEN_ENCRYPTION_KEY is required (must be 64 hex characters for AES-256-GCM)');
    }
  }

  if (TOKEN_ENCRYPTION_KEY.length !== 64) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes), got ${TOKEN_ENCRYPTION_KEY.length} characters`
    );
  }

  const key = Buffer.from(TOKEN_ENCRYPTION_KEY, 'hex');

  // Generate random 12-byte IV (recommended size for GCM)
  const iv = crypto.randomBytes(12);

  // Create cipher and encrypt
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);

  // Get the authentication tag (16 bytes)
  const authTag = cipher.getAuthTag();

  // Return as "iv:authTag:ciphertext" — all hex-encoded
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an encrypted token from database storage.
 * Reverses AES-256-GCM encryption.
 *
 * @param encryptedStr - Encrypted string in format "iv:authTag:ciphertext" (hex)
 * @returns Original plaintext token
 */
export function decryptToken(encryptedStr: string): string {
  // Guard against null/undefined — indicates schema drift or a missing DB column
  if (encryptedStr == null) {
    throw new Error('Token value is null or undefined — the connection row is missing its token column. Re-authenticate the email account to fix this.');
  }
  // Validate TOKEN_ENCRYPTION_KEY exists and is exactly 64 hex characters (32 bytes)
  if (!TOKEN_ENCRYPTION_KEY) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required for token decryption (must be 64 hex characters for AES-256-GCM)');
  }

  if (TOKEN_ENCRYPTION_KEY.length !== 64) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes), got ${TOKEN_ENCRYPTION_KEY.length} characters`
    );
  }

  const key = Buffer.from(TOKEN_ENCRYPTION_KEY, 'hex');

  // Split the stored format into components
  const [ivHex, authTagHex, ciphertextHex] = encryptedStr.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Invalid encrypted token format — expected iv:authTag:ciphertext');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  // Create decipher and set auth tag
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  // Decrypt and return plaintext
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf-8');
}
