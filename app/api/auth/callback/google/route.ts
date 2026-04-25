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
import { SignJWT } from 'jose';

import { db } from '@/lib/db/client';
// userSessions added for prev-location lookup (parity with POST /api/auth/login)
import { userInfo, userCompany, emailConnections, userSessions } from '@/lib/db/schema';
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
const GMAIL_PUBSUB_TOPIC = process.env.GOOGLE_PUBSUB_TOPIC || '';

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
// First stage of OAuth signup: verify the Google identity isn't already registered,
// then stash the OAuth tokens + profile in a short-lived signed cookie and redirect
// the user to /onboarding to collect company info. The DB account is only created
// once the onboarding form is submitted (see lib/actions/oauth-signup-actions.ts).

async function handleSignup(
  tokens: Awaited<ReturnType<typeof exchangeGoogleCode>>,
  profile: ReturnType<typeof decodeGoogleIdToken>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  returnUrl?: string,
) {
  // Check if a user with this Google ID already exists
  const [existingUser] = await db
    .select()
    .from(userInfo)
    .where(
      and(
        eq(userInfo.oauthProvider, 'google'),
        eq(userInfo.oauthProviderId, profile.sub),
      ),
    )
    .limit(1);

  if (existingUser) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent('Account already exists. Please log in instead.')}`,
    );
  }

  // Store OAuth tokens + profile in a signed temp cookie (15-min TTL).
  // The onboarding page will read this to create the full account after
  // company info is collected.
  const JWT_SECRET_KEY = new TextEncoder().encode(
    process.env.JWT_SECRET || 'quoteflow-ai-secret-key-change-in-production',
  );

  const tempToken = await new SignJWT({
    sub: profile.sub,
    email: profile.email,
    name: profile.name,
    picture: profile.picture ?? null,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    scope: tokens.scope,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .setIssuedAt()
    .sign(JWT_SECRET_KEY);

  const response = NextResponse.redirect(`${APP_URL}/onboarding`);
  response.cookies.set('oauth_signup_temp', tempToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // 'lax' required: the redirect to /onboarding is part of a cross-site OAuth
    // flow (originated from accounts.google.com). 'strict' silently drops the
    // cookie on that GET request. 'lax' is safe here — httpOnly + signed JWT.
    sameSite: 'lax',
    maxAge: 15 * 60, // 15 minutes
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
      userId: userInfo.userId,
      companyId: userInfo.companyId,
      username: userInfo.username,
      userRole: userInfo.userRole,
    })
    .from(userInfo)
    .where(
      and(
        eq(userInfo.oauthProvider, 'google'),
        eq(userInfo.oauthProviderId, profile.sub),
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
    .update(userInfo)
    .set({ lastLogin: new Date() })
    .where(eq(userInfo.userId, user.userId));

  // Look up the user's last in-app location so OAuth login lands them where they left off,
  // matching the behaviour of the password-based POST /api/auth/login route.
  const [session] = await db
    .select({ prevLocation: userSessions.prevLocation })
    .from(userSessions)
    .where(
      and(
        eq(userSessions.companyId, user.companyId!),
        eq(userSessions.userId, user.userId),
      ),
    )
    .limit(1);

  // Generate JWT and set auth cookie
  const jwtPayload: JWTPayload = {
    user_id: user.userId,
    company_id: user.companyId!,
    username: user.username,
    role: user.userRole || 'user',
  };

  const token = await generateJWT(jwtPayload);

  // Resolution order: explicit ?returnUrl=  →  saved prevLocation  →  /dashboard.
  // The previous default of returnUrl||'/dashboard' lost the user's last context.
  const redirectUrl = returnUrl || session?.prevLocation || '/dashboard';

  const response = NextResponse.redirect(`${APP_URL}${redirectUrl}`);
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // 'lax' (NOT 'strict'): the OAuth flow is a cross-site redirect chain
    // (accounts.google.com → our callback → /dashboard). With 'strict', Chrome
    // drops the cookie on the redirect-following request, the middleware then
    // sees no auth_token and bounces the user back to '/'. 'lax' allows the
    // cookie on top-level GET navigations and is the industry standard for
    // OAuth-issued session cookies (Auth0, Clerk, Supabase all use 'lax').
    sameSite: 'lax',
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
      userId: workspace.user_id,
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
