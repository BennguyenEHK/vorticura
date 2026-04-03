'use server'

import { db } from '@/lib/db/client'
import { emailConnections } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getGoogleAuthURL, getMicrosoftAuthURL } from '@/lib/services/email/oauth-helper'
import { getServerActionWorkspace } from '@/lib/middleware/get-workspace'

// =============================================
// Email Connection Server Actions
// =============================================

// Status constants to avoid magic strings
const CONNECTION_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  EXPIRED: 'expired',
} as const;

/**
 * Get all email connections for a company.
 * Returns only safe metadata (no decrypted tokens).
 * Requires authentication.
 */
export async function getEmailConnections(companyId: number) {
  try {
    // Verify authent authentication
    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      throw new Error('Authentication required');
    }

    // Verify user has access to the requested companyId
    if (workspace.company_id !== companyId) {
      throw new Error('Access denied: you do not have access to this company');
    }

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

    return connections;
  } catch (error) {
    console.error('[Email Connections] getEmailConnections failed:', error);
    throw error;
  }
}

/**
 * Disconnect (delete) an email account.
 * Requires authentication and ownership verification.
 */
export async function disconnectEmailAccount(
  connectionId: number,
  companyId: number
): Promise<{ success: boolean }> {
  try {
    // Verify authentication
    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      throw new Error('Authentication required');
    }

    // Verify user has access to the company
    if (workspace.company_id !== companyId) {
      throw new Error('Access denied: you do not have access to this company');
    }

    const result = await db
      .delete(emailConnections)
      .where(
        and(
          eq(emailConnections.connectionId, connectionId),
          eq(emailConnections.companyId, companyId)
        )
      )

    return { success: (result?.rowCount ?? 0) > 0 }
  } catch (error) {
    console.error('[Email Connections] disconnectEmailAccount failed:', error);
    throw error;
  }
}

/**
 * Pause an email connection (stop syncing).
 */
export async function pauseEmailConnection(
  connectionId: number,
  companyId: number
): Promise<{ success: boolean }> {
  try {
    // Verify authentication
    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      throw new Error('Authentication required');
    }

    // Verify ownership
    if (workspace.company_id !== companyId) {
      throw new Error('Access denied: you do not have access to this company');
    }

    const result = await db
      .update(emailConnections)
      .set({ status: CONNECTION_STATUS.PAUSED })
      .where(
        and(
          eq(emailConnections.connectionId, connectionId),
          eq(emailConnections.companyId, companyId)
        )
      )

    return { success: (result?.rowCount ?? 0) > 0 }
  } catch (error) {
    console.error('[Email Connections] pauseEmailConnection failed:', error);
    throw error;
  }
}

/**
 * Resume a paused email connection.
 */
export async function resumeEmailConnection(
  connectionId: number,
  companyId: number
): Promise<{ success: boolean }> {
  try {
    // Verify authentication
    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      throw new Error('Authentication required');
    }

    // Verify ownership
    if (workspace.company_id !== companyId) {
      throw new Error('Access denied: you do not have access to this company');
    }

    const result = await db
      .update(emailConnections)
      .set({ status: CONNECTION_STATUS.ACTIVE })
      .where(
        and(
          eq(emailConnections.connectionId, connectionId),
          eq(emailConnections.companyId, companyId)
        )
      )

    return { success: (result?.rowCount ?? 0) > 0 }
  } catch (error) {
    console.error('[Email Connections] resumeEmailConnection failed:', error);
    throw error;
  }
}

/**
 * Get the OAuth redirect URL for a given provider and mode.
 * Returns the full URL to redirect the user to for OAuth consent.
 */
export async function getOAuthRedirectUrl(
  provider: 'gmail' | 'outlook',
  mode: 'signup' | 'login' | 'connect'
): Promise<string> {
  // Validate provider parameter
  if (provider !== 'gmail' && provider !== 'outlook') {
    throw new Error(`Invalid OAuth provider: ${provider}. Supported: gmail, outlook`);
  }

  if (provider === 'gmail') {
    return getGoogleAuthURL(mode)
  } else {
    return getMicrosoftAuthURL(mode)
  }
}
