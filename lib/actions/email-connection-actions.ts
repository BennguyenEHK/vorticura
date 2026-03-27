'use server'

import { db } from '@/lib/db/client'
import { emailConnections } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getGoogleAuthURL, getMicrosoftAuthURL } from '@/lib/services/email/oauth-helper'

// =============================================
// Email Connection Server Actions
// =============================================

/**
 * Get all email connections for a company.
 * Returns only safe metadata (no decrypted tokens).
 */
export async function getEmailConnections(companyId: number) {
  const connections = await db
    .select({
      connectionId: emailConnections.connectionId,
      provider: emailConnections.provider,
      emailAddress: emailConnections.emailAddress,
      status: emailConnections.status,
      lastSyncAt: emailConnections.lastSyncAt,
      lastError: emailConnections.lastError,
      errorCount: emailConnections.errorCount,
      createdAt: emailConnections.createdAt,
    })
    .from(emailConnections)
    .where(eq(emailConnections.companyId, companyId))

  return connections
}

/**
 * Disconnect (delete) an email account.
 * Enforces tenant isolation via companyId check.
 */
export async function disconnectEmailAccount(
  connectionId: number,
  companyId: number
): Promise<{ success: boolean }> {
  const result = await db
    .delete(emailConnections)
    .where(
      and(
        eq(emailConnections.connectionId, connectionId),
        eq(emailConnections.companyId, companyId)
      )
    )

  return { success: (result?.rowCount ?? 0) > 0 }
}

/**
 * Pause an email connection (stop syncing).
 */
export async function pauseEmailConnection(
  connectionId: number,
  companyId: number
): Promise<{ success: boolean }> {
  const result = await db
    .update(emailConnections)
    .set({ status: 'paused' })
    .where(
      and(
        eq(emailConnections.connectionId, connectionId),
        eq(emailConnections.companyId, companyId)
      )
    )

  return { success: (result?.rowCount ?? 0) > 0 }
}

/**
 * Resume a paused email connection.
 */
export async function resumeEmailConnection(
  connectionId: number,
  companyId: number
): Promise<{ success: boolean }> {
  const result = await db
    .update(emailConnections)
    .set({ status: 'active' })
    .where(
      and(
        eq(emailConnections.connectionId, connectionId),
        eq(emailConnections.companyId, companyId)
      )
    )

  return { success: (result?.rowCount ?? 0) > 0 }
}

/**
 * Get the OAuth redirect URL for a given provider and mode.
 * Returns the full URL to redirect the user to for OAuth consent.
 */
export async function getOAuthRedirectUrl(
  provider: 'gmail' | 'outlook',
  mode: 'signup' | 'login' | 'connect'
): Promise<string> {
  if (provider === 'gmail') {
    return getGoogleAuthURL(mode)
  } else {
    return getMicrosoftAuthURL(mode)
  }
}
