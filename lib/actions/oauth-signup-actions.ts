'use server'

// =============================================
// OAuth Signup Completion — Server Action
// =============================================
// Called from /onboarding after user fills company info.
// Reads the temp OAuth cookie, creates company + user + email_connection,
// sets the auth cookie, and clears the temp cookie.

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { jwtVerify } from 'jose'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { userInfo, userCompany, emailConnections } from '@/lib/db/schema'
import { encryptToken } from '@/lib/services/email/oauth-helper'
import { generateJWT } from '@/lib/middleware/auth-helpers'
import { setupGmailWatch } from '@/lib/services/email/gmail-client'
import type { JWTPayload } from '@/lib/middleware/auth-helpers'
import type { CompanyInfoFormData } from '@/lib/utils/validation/schemas'

const GMAIL_PUBSUB_TOPIC = process.env.GOOGLE_PUBSUB_TOPIC || ''
const JWT_SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || 'quoteflow-ai-secret-key-change-in-production'
)

/**
 * Complete OAuth signup after user provides company info.
 * Reads the oauth_signup_temp cookie set by the Google callback.
 * On success: calls redirect('/dashboard') so Next.js handles navigation server-side.
 * On failure: returns { error } so the client can display it.
 */
export async function completeOAuthSignup(
  companyData: CompanyInfoFormData
): Promise<{ error: string }> {
  // All DB + cookie work is inside try/catch.
  // redirect() is called OUTSIDE so NEXT_REDIRECT propagates correctly.
  try {
    const cookieStore = await cookies()
    const tempToken = cookieStore.get('oauth_signup_temp')?.value

    if (!tempToken) {
      return { error: 'Session expired. Please sign up again.' }
    }

    // Verify and decode the temp JWT
    let payload: Record<string, unknown>
    try {
      const result = await jwtVerify(tempToken, JWT_SECRET_KEY)
      payload = result.payload as Record<string, unknown>
    } catch {
      return { error: 'Session expired. Please sign up again.' }
    }

    // Create company + user in a single transaction
    const result = await db.transaction(async (tx) => {
      const [company] = await tx
        .insert(userCompany)
        .values({
          companyName: companyData.companyName,
          companyEmail: companyData.companyEmail || (payload.email as string),
          companyAddress: companyData.companyAddress || undefined,
          companyNumber: companyData.companyNumber || undefined,
          companyFax: companyData.companyFax || undefined,
        })
        .returning({ companyId: userCompany.companyId })

      const [user] = await tx
        .insert(userInfo)
        .values({
          companyId: company.companyId,
          username: (payload.name as string) || (payload.email as string),
          email: payload.email as string,
          passwordHash: null, // OAuth-only user
          oauthProvider: 'google',
          oauthProviderId: payload.sub as string,
          userRole: 'admin',
        })
        .returning({
          userId: userInfo.userId,
          companyId: userInfo.companyId,
          username: userInfo.username,
          userRole: userInfo.userRole,
        })

      return { company, user }
    })

    // Save encrypted Gmail tokens to email_connections
    const tokenExpiresAt = new Date(Date.now() + (payload.expires_in as number) * 1000)

    const [connection] = await db
      .insert(emailConnections)
      .values({
        companyId: result.company.companyId,
        userId: result.user.userId,
        provider: 'gmail',
        providerAccountId: payload.sub as string,
        emailAddress: payload.email as string,
        accessToken: encryptToken(payload.access_token as string),
        refreshToken: encryptToken(payload.refresh_token as string),
        tokenExpiresAt,
        scopes: payload.scope as string,
        status: 'active',
      })
      .returning({ connectionId: emailConnections.connectionId })

    // Set up Gmail Pub/Sub watch (non-fatal if it fails)
    if (GMAIL_PUBSUB_TOPIC) {
      try {
        const watchResult = await setupGmailWatch(payload.access_token as string, GMAIL_PUBSUB_TOPIC)
        await db
          .update(emailConnections)
          .set({
            historyId: watchResult.historyId,
            subscriptionExpires: new Date(Number(watchResult.expiration)),
          })
          .where(eq(emailConnections.connectionId, connection.connectionId))
      } catch (watchError) {
        console.error('[completeOAuthSignup] Gmail watch setup failed:', watchError)
      }
    }

    // Generate auth JWT and set auth cookie
    const jwtPayload: JWTPayload = {
      user_id: result.user.userId,
      company_id: result.user.companyId!,
      username: result.user.username,
      role: result.user.userRole || 'user',
    }
    const authToken = await generateJWT(jwtPayload)

    cookieStore.set('auth_token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    // Clear the temp cookie
    cookieStore.delete('oauth_signup_temp')

  } catch (error) {
    console.error('[completeOAuthSignup] failed:', error)
    return { error: 'Failed to complete signup. Please try again.' }
  }

  // redirect() must be outside try/catch — it throws NEXT_REDIRECT internally
  // which Next.js intercepts to perform server-driven navigation
  redirect('/dashboard')
}
