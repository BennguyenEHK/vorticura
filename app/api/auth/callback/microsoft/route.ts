// =============================================
// MICROSOFT OAUTH CALLBACK - /api/auth/callback/microsoft
// =============================================
// Handles the OAuth 2.0 authorization code redirect from Microsoft.
//
// Three modes (determined by state parameter):
//   signup  - Create new company + user, save tokens, start subscription
//   login   - Authenticate existing user, issue JWT
//   connect - Link Microsoft email to existing authenticated account
//
// Errors redirect to /login?error= or /signup?error= instead of
// returning JSON, to provide a seamless browser-based UX.

import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { db } from '@/lib/db/client';
import { userCompany, userInfo, emailConnections, userSessions } from '@/lib/db/schema';
import {
  exchangeMicrosoftCode,
  decodeMicrosoftIdToken,
  decodeOAuthState,
  encryptToken,
} from '@/lib/services/email/oauth-helper';
import { createOutlookSubscription } from '@/lib/services/email/outlook-client';
import {
  generateJWT,
  getWorkspaceFromToken,
} from '@/lib/middleware/auth-helpers';

// =============================================
// CONSTANTS
// =============================================

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/** Sanitize returnUrl to prevent open redirect attacks — only allow relative paths */
function sanitizeReturnUrl(url?: string): string | undefined {
  if (!url) return undefined;
  // Must start with "/" and not contain "//" or "\" (prevents protocol-relative URLs)
  if (/^\/[^/\\]/.test(url) || url === '/') return url;
  return undefined;
}

// =============================================
// GET /api/auth/callback/microsoft
// =============================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // -----------------------------------------
  // Handle OAuth error from Microsoft
  // -----------------------------------------
  if (errorParam) {
    const errorDescription =
      searchParams.get('error_description') || 'Microsoft authentication failed';
    console.error(`[microsoft-callback] OAuth error: ${errorParam} - ${errorDescription}`);
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent(errorDescription)}`
    );
  }

  // -----------------------------------------
  // Validate required parameters
  // -----------------------------------------
  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent('Missing authorization code or state')}`
    );
  }

  // -----------------------------------------
  // Decode state to determine mode
  // -----------------------------------------
  let state: ReturnType<typeof decodeOAuthState>;
  try {
    state = decodeOAuthState(stateParam);
  } catch {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent('Invalid OAuth state parameter')}`
    );
  }

  // Sanitize returnUrl to prevent open redirects
  const safeReturnUrl = sanitizeReturnUrl(state.returnUrl);

  // Route to the appropriate handler based on mode
  try {
    switch (state.mode) {
      case 'signup':
        return await handleSignup(code, safeReturnUrl);
      case 'login':
        return await handleLogin(code, safeReturnUrl);
      case 'connect':
        return await handleConnect(code, request, safeReturnUrl);
      default:
        return NextResponse.redirect(
          `${APP_URL}/login?error=${encodeURIComponent('Invalid OAuth mode')}`
        );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Authentication failed';
    console.error(`[microsoft-callback] ${state.mode} error:`, error);

    const errorPage = state.mode === 'signup' ? '/signup' : '/login';
    return NextResponse.redirect(
      `${APP_URL}${errorPage}?error=${encodeURIComponent(message)}`
    );
  }
}

// =============================================
// SIGNUP MODE
// =============================================

/**
 * Create a new company and user from Microsoft OAuth.
 * - Exchange code for tokens
 * - Decode ID token for profile info
 * - Check for existing user (prevent duplicates)
 * - Create company + user in transaction
 * - Save encrypted tokens to emailConnections
 * - Create Outlook webhook subscription
 * - Issue JWT and set cookie
 */
async function handleSignup(
  code: string,
  returnUrl?: string
): Promise<NextResponse> {
  // Exchange authorization code for tokens
  const tokens = await exchangeMicrosoftCode(code);
  const profile = decodeMicrosoftIdToken(tokens.id_token);

  // Check if a user with this Microsoft account already exists
  const [existingUser] = await db
    .select()
    .from(userInfo)
    .where(
      and(
        eq(userInfo.oauthProvider, 'microsoft'),
        eq(userInfo.oauthProviderId, profile.oid)
      )
    )
    .limit(1);

  if (existingUser) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent(
        'An account with this Microsoft ID already exists. Please log in instead.'
      )}`
    );
  }

  // Create company and user in a transaction to ensure atomicity
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // Create webhook subscription for real-time email notifications
  const webhookUrl = `${APP_URL}/api/webhooks/microsoft`;
  let subscriptionId: string | null = null;
  let subscriptionExpires: Date | null = null;

  try {
    const subscription = await createOutlookSubscription(
      tokens.access_token,
      webhookUrl
    );
    subscriptionId = subscription.id;
    subscriptionExpires = new Date(subscription.expirationDateTime);
  } catch (subError) {
    // Subscription creation is non-fatal — user can still use the app,
    // and we can retry subscription creation later
    console.error(
      '[microsoft-callback] Subscription creation failed (non-fatal):',
      subError
    );
  }

  const result = await db.transaction(async (tx) => {
    // Create the company
    const [company] = await tx
      .insert(userCompany)
      .values({
        companyName: profile.name ? `${profile.name}'s Company` : 'My Company',
        companyEmail: profile.email,
      })
      .returning({ companyId: userCompany.companyId });

    // Create the user (passwordHash is null for OAuth-only users)
    const [user] = await tx
      .insert(userInfo)
      .values({
        companyId: company.companyId,
        username: profile.name || profile.email,
        email: profile.email,
        passwordHash: null,
        oauthProvider: 'microsoft',
        oauthProviderId: profile.oid,
        userRole: 'admin', // First user is admin
        userStatus: 'active',
      })
      .returning({
        userId: userInfo.userId,
        companyId: userInfo.companyId,
        username: userInfo.username,
        userRole: userInfo.userRole,
      });

    // Insert email connection in the same transaction for atomicity
    await tx.insert(emailConnections).values({
      companyId: company.companyId,
      userId: user.userId,
      provider: 'outlook',
      providerAccountId: profile.oid,
      emailAddress: profile.email,
      accessToken: encryptToken(tokens.access_token),
      refreshToken: encryptToken(tokens.refresh_token),
      tokenExpiresAt,
      scopes: tokens.scope,
      subscriptionId,
      subscriptionExpires,
      status: 'active',
    });

    return { company, user };
  });

  const { user } = result;

  // Generate JWT for session
  const token = await generateJWT({
    user_id: user.userId,
    company_id: user.companyId!,
    username: user.username,
    role: user.userRole || 'user',
  });

  // Build redirect response with auth cookie
  const redirectUrl = returnUrl || '/dashboard';
  const response = NextResponse.redirect(`${APP_URL}${redirectUrl}`);

  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // 'lax' (NOT 'strict'): the OAuth flow is a cross-site redirect chain
    // (login.microsoftonline.com → our callback → /dashboard). With 'strict', Chrome
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
// LOGIN MODE
// =============================================

/**
 * Authenticate an existing Microsoft user.
 * - Exchange code for tokens
 * - Decode ID token for profile oid
 * - Look up user by oauthProvider + oauthProviderId
 * - Issue JWT and set cookie
 */
async function handleLogin(
  code: string,
  returnUrl?: string
): Promise<NextResponse> {
  // Exchange authorization code for tokens
  const tokens = await exchangeMicrosoftCode(code);
  const profile = decodeMicrosoftIdToken(tokens.id_token);

  // Look up existing user by Microsoft oid
  const [user] = await db
    .select({
      userId: userInfo.userId,
      companyId: userInfo.companyId,
      username: userInfo.username,
      userRole: userInfo.userRole,
      userStatus: userInfo.userStatus,
    })
    .from(userInfo)
    .where(
      and(
        eq(userInfo.oauthProvider, 'microsoft'),
        eq(userInfo.oauthProviderId, profile.oid)
      )
    )
    .limit(1);

  if (!user) {
    return NextResponse.redirect(
      `${APP_URL}/signup?error=${encodeURIComponent(
        'No account found with this Microsoft ID. Please sign up first.'
      )}`
    );
  }

  // Check if account is active
  if (user.userStatus !== 'active') {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent(
        'Account suspended or deactivated. Please contact support.'
      )}`
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

  // Generate JWT for session
  const token = await generateJWT({
    user_id: user.userId,
    company_id: user.companyId!,
    username: user.username,
    role: user.userRole || 'user',
  });

  // Resolution order: explicit ?returnUrl=  →  saved prevLocation  →  /dashboard.
  // The previous default of returnUrl||'/dashboard' lost the user's last context.
  const redirectUrl = returnUrl || session?.prevLocation || '/dashboard';

  const response = NextResponse.redirect(`${APP_URL}${redirectUrl}`);

  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // 'lax' (NOT 'strict'): the OAuth flow is a cross-site redirect chain
    // (login.microsoftonline.com → our callback → /dashboard). With 'strict', Chrome
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

/**
 * Connect a Microsoft email account to an existing authenticated user.
 * - Verify JWT from cookie (must be authenticated)
 * - Exchange code for tokens
 * - Decode ID token for profile
 * - Save encrypted tokens to emailConnections
 * - Create Outlook webhook subscription
 * - Redirect to settings page
 */
async function handleConnect(
  code: string,
  request: NextRequest,
  returnUrl?: string,
): Promise<NextResponse> {
  // -----------------------------------------
  // Verify authentication — user must be logged in
  // -----------------------------------------
  const cookieStore = await cookies();
  const authToken = cookieStore.get('auth_token')?.value;

  if (!authToken) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent(
        'You must be logged in to connect an email account'
      )}`
    );
  }

  const workspace = await getWorkspaceFromToken(authToken);
  if (!workspace) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent(
        'Session expired. Please log in again.'
      )}`
    );
  }

  // Exchange authorization code for tokens
  const tokens = await exchangeMicrosoftCode(code);
  const profile = decodeMicrosoftIdToken(tokens.id_token);

  // Save encrypted OAuth tokens to emailConnections
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // Create webhook subscription for real-time email notifications
  const webhookUrl = `${APP_URL}/api/webhooks/microsoft`;
  let subscriptionId: string | null = null;
  let subscriptionExpires: Date | null = null;

  try {
    const subscription = await createOutlookSubscription(
      tokens.access_token,
      webhookUrl
    );
    subscriptionId = subscription.id;
    subscriptionExpires = new Date(subscription.expirationDateTime);
  } catch (subError) {
    console.error(
      '[microsoft-callback] Subscription creation failed (non-fatal):',
      subError
    );
  }

  await db
    .insert(emailConnections)
    .values({
      companyId: workspace.company_id,
      userId: workspace.user_id,
      provider: 'outlook',
      providerAccountId: profile.oid,
      emailAddress: profile.email,
      accessToken: encryptToken(tokens.access_token),
      refreshToken: encryptToken(tokens.refresh_token),
      tokenExpiresAt,
      scopes: tokens.scope,
      subscriptionId,
      subscriptionExpires,
      status: 'active',
    })
    .onConflictDoUpdate({
      // If this email is already connected for this company, update tokens
      target: [emailConnections.companyId, emailConnections.emailAddress],
      set: {
        accessToken: encryptToken(tokens.access_token),
        refreshToken: encryptToken(tokens.refresh_token),
        tokenExpiresAt,
        scopes: tokens.scope,
        subscriptionId,
        subscriptionExpires,
        status: 'active',
        lastError: null,
        errorCount: 0,
      },
    });

  // Redirect to settings page where the user can see connected accounts
  const redirectUrl = returnUrl || '/settings';
  return NextResponse.redirect(`${APP_URL}${redirectUrl}`);
}
