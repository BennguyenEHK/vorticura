// =============================================
// GOOGLE OAUTH CALLBACK — Authorization Code Handler
// =============================================
// Handles the redirect from Google's OAuth consent screen.
// Supports three modes (encoded in the `state` parameter):
//
//   signup  — Create new account with Google identity + connect Gmail
//   login   — Authenticate existing Google-linked account
//   connect — Link Gmail to an existing authenticated session
//
// Flow:
//   Google OAuth → GET /api/auth/callback/google?code=...&state=...
//   → exchange code → decode ID token → mode-specific logic → redirect

import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { db } from '@/lib/db/client';
import { clientInfo, clientCompany, emailConnections } from '@/lib/db/schema';
import {
  exchangeGoogleCode,
  decodeGoogleIdToken,
  decodeOAuthState,
  encryptToken,
} from '@/lib/services/email/oauth-helper';
import { setupGmailWatch } from '@/lib/services/email/gmail-client';
import { generateJWT, getWorkspaceFromToken } from '@/lib/middleware/auth-helpers';
import type { JWTPayload } from '@/lib/middleware/auth-helpers';

// =============================================
// ENVIRONMENT
// =============================================

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const GMAIL_PUBSUB_TOPIC = process.env.GMAIL_PUBSUB_TOPIC || '';

/** Sanitize returnUrl to prevent open redirect attacks — only allow relative paths */
function sanitizeReturnUrl(url?: string): string | undefined {
  if (!url) return undefined;
  // Must start with "/" and not contain "//" or "\" (prevents protocol-relative URLs)
  if (/^\/[^/\\]/.test(url) || url === '/') return url;
  return undefined;
}

// =============================================
// GET /api/auth/callback/google
// =============================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // -----------------------------------------
  // Handle OAuth errors (user denied consent, etc.)
  // -----------------------------------------
  if (errorParam) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent(`Google auth error: ${errorParam}`)}`,
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent('Missing authorization code or state')}`,
    );
  }

  // -----------------------------------------
  // Decode state to determine the auth mode
  // -----------------------------------------
  let state: ReturnType<typeof decodeOAuthState>;
  try {
    state = decodeOAuthState(stateParam);
  } catch {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent('Invalid OAuth state')}`,
    );
  }

  const { mode } = state;
  const errorRedirect = mode === 'signup' ? '/signup' : '/login';

  try {
    // -----------------------------------------
    // Exchange authorization code for tokens
    // -----------------------------------------
    const tokens = await exchangeGoogleCode(code);
    const profile = decodeGoogleIdToken(tokens.id_token);

    // Route to the appropriate handler based on mode
    const safeReturnUrl = sanitizeReturnUrl(state.returnUrl);

    switch (mode) {
      case 'signup':
        return await handleSignup(tokens, profile, safeReturnUrl);
      case 'login':
        return await handleLogin(profile, safeReturnUrl);
      case 'connect':
        return await handleConnect(request, tokens, profile, safeReturnUrl);
      default:
        return NextResponse.redirect(
          `${APP_URL}${errorRedirect}?error=${encodeURIComponent('Invalid auth mode')}`,
        );
    }
  } catch (error) {
    console.error(`[google-callback] ${mode} failed:`, error);
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return NextResponse.redirect(
      `${APP_URL}${errorRedirect}?error=${encodeURIComponent(message)}`,
    );
  }
}

// =============================================
// SIGNUP MODE
// =============================================
// Create a new company + user account with Google identity, save Gmail tokens,
// and set up Pub/Sub watch for incoming emails.

async function handleSignup(
  tokens: Awaited<ReturnType<typeof exchangeGoogleCode>>,
  profile: ReturnType<typeof decodeGoogleIdToken>,
  returnUrl?: string,
) {
  // Check if a user with this Google ID already exists
  const [existingUser] = await db
    .select()
    .from(clientInfo)
    .where(
      and(
        eq(clientInfo.oauthProvider, 'google'),
        eq(clientInfo.oauthProviderId, profile.sub),
      ),
    )
    .limit(1);

  if (existingUser) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent('Account already exists. Please log in instead.')}`,
    );
  }

  // Create company and user in a transaction
  const result = await db.transaction(async (tx) => {
    // Create the company (use Google profile name as company name initially)
    const [company] = await tx
      .insert(clientCompany)
      .values({
        companyName: profile.name ? `${profile.name}'s Company` : 'My Company',
        companyEmail: profile.email,
      })
      .returning({ companyId: clientCompany.companyId });

    // Create the user with Google OAuth identity (no password)
    const [user] = await tx
      .insert(clientInfo)
      .values({
        companyId: company.companyId,
        username: profile.name || profile.email,
        email: profile.email,
        passwordHash: null, // OAuth-only user — no password
        oauthProvider: 'google',
        oauthProviderId: profile.sub,
        clientRole: 'admin', // First user in company is admin
      })
      .returning({
        clientId: clientInfo.clientId,
        companyId: clientInfo.companyId,
        username: clientInfo.username,
        clientRole: clientInfo.clientRole,
      });

    return { company, user };
  });

  // Save encrypted OAuth tokens to email_connections
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  const [connection] = await db
    .insert(emailConnections)
    .values({
      companyId: result.company.companyId,
      clientId: result.user.clientId,
      provider: 'gmail',
      providerAccountId: profile.sub,
      emailAddress: profile.email,
      accessToken: encryptToken(tokens.access_token),
      refreshToken: encryptToken(tokens.refresh_token),
      tokenExpiresAt,
      scopes: tokens.scope,
      status: 'active',
    })
    .returning({ connectionId: emailConnections.connectionId });

  // Set up Gmail Pub/Sub watch for real-time push notifications
  if (GMAIL_PUBSUB_TOPIC) {
    try {
      const watchResult = await setupGmailWatch(tokens.access_token, GMAIL_PUBSUB_TOPIC);
      await db
        .update(emailConnections)
        .set({
          historyId: watchResult.historyId,
          subscriptionExpires: new Date(Number(watchResult.expiration)),
        })
        .where(eq(emailConnections.connectionId, connection.connectionId));
    } catch (watchError) {
      // Non-fatal: user can still use the app, watch can be retried
      console.error('[google-callback] Gmail watch setup failed:', watchError);
    }
  }

  // Generate JWT and set auth cookie
  const jwtPayload: JWTPayload = {
    client_id: result.user.clientId,
    company_id: result.user.companyId!,
    username: result.user.username,
    role: result.user.clientRole || 'user',
  };

  const token = await generateJWT(jwtPayload);
  const redirectUrl = returnUrl || '/dashboard';

  const response = NextResponse.redirect(`${APP_URL}${redirectUrl}`);
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  });

  return response;
}

// =============================================
// LOGIN MODE
// =============================================
// Authenticate an existing user by their Google identity.
// Does NOT exchange/store Gmail tokens — login only needs identity verification.

async function handleLogin(
  profile: ReturnType<typeof decodeGoogleIdToken>,
  returnUrl?: string,
) {
  // Look up user by Google OAuth provider ID
  const [user] = await db
    .select({
      clientId: clientInfo.clientId,
      companyId: clientInfo.companyId,
      username: clientInfo.username,
      clientRole: clientInfo.clientRole,
    })
    .from(clientInfo)
    .where(
      and(
        eq(clientInfo.oauthProvider, 'google'),
        eq(clientInfo.oauthProviderId, profile.sub),
      ),
    )
    .limit(1);

  if (!user) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent('No account found. Please sign up first.')}`,
    );
  }

  // Update last login timestamp
  await db
    .update(clientInfo)
    .set({ lastLogin: new Date() })
    .where(eq(clientInfo.clientId, user.clientId));

  // Generate JWT and set auth cookie
  const jwtPayload: JWTPayload = {
    client_id: user.clientId,
    company_id: user.companyId!,
    username: user.username,
    role: user.clientRole || 'user',
  };

  const token = await generateJWT(jwtPayload);
  const redirectUrl = returnUrl || '/dashboard';

  const response = NextResponse.redirect(`${APP_URL}${redirectUrl}`);
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return response;
}

// =============================================
// CONNECT MODE
// =============================================
// Link Gmail to an existing authenticated session.
// Requires a valid auth_token cookie — redirects to login if missing/invalid.

async function handleConnect(
  request: NextRequest,
  tokens: Awaited<ReturnType<typeof exchangeGoogleCode>>,
  profile: ReturnType<typeof decodeGoogleIdToken>,
  returnUrl?: string,
) {
  // Verify the user is authenticated via cookie
  const cookieStore = await cookies();
  const authToken = cookieStore.get('auth_token')?.value;

  if (!authToken) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent('Please log in before connecting Gmail')}`,
    );
  }

  const workspace = await getWorkspaceFromToken(authToken);
  if (!workspace) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent('Session expired. Please log in again.')}`,
    );
  }

  // Save encrypted OAuth tokens to email_connections
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  const [connection] = await db
    .insert(emailConnections)
    .values({
      companyId: workspace.company_id,
      clientId: workspace.client_id,
      provider: 'gmail',
      providerAccountId: profile.sub,
      emailAddress: profile.email,
      accessToken: encryptToken(tokens.access_token),
      refreshToken: encryptToken(tokens.refresh_token),
      tokenExpiresAt,
      scopes: tokens.scope,
      status: 'active',
    })
    .onConflictDoUpdate({
      // If this email is already connected for this company, update the tokens
      target: [emailConnections.companyId, emailConnections.emailAddress],
      set: {
        accessToken: encryptToken(tokens.access_token),
        refreshToken: encryptToken(tokens.refresh_token),
        tokenExpiresAt,
        scopes: tokens.scope,
        status: 'active',
        lastError: null,
        errorCount: 0,
      },
    })
    .returning({ connectionId: emailConnections.connectionId });

  // Set up Gmail Pub/Sub watch for real-time push notifications
  if (GMAIL_PUBSUB_TOPIC) {
    try {
      const watchResult = await setupGmailWatch(tokens.access_token, GMAIL_PUBSUB_TOPIC);
      await db
        .update(emailConnections)
        .set({
          historyId: watchResult.historyId,
          subscriptionExpires: new Date(Number(watchResult.expiration)),
        })
        .where(eq(emailConnections.connectionId, connection.connectionId));
    } catch (watchError) {
      console.error('[google-callback] Gmail watch setup failed:', watchError);
    }
  }

  // Redirect to settings page (or custom return URL)
  const redirectUrl = returnUrl || '/settings';
  return NextResponse.redirect(`${APP_URL}${redirectUrl}`);
}
