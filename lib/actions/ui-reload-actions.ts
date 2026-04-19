'use server'

import { db } from '@/lib/db/client';
import { uiReload as uiReloadTable } from '@/lib/db/schema';
import { getServerActionWorkspace } from '@/lib/middleware/get-workspace';
import { fetchWorkspace } from '@/lib/ui-reload/fetch-workspace';
import { eq, and } from 'drizzle-orm';
import type {
  UiType,
  DashboardPayload,
  RfqQueuePayload,
  UiReloadResult,
} from '@/types/ui-reload';

/**
 * uiReload: Fetch UI state based on uiType.
 * Workspace fetching is fully delegated to fetch-workspace.ts (single source of truth);
 * dashboard / rfq_queue continue to read their layout prefs directly from ui_reload.
 *
 * @param uiType - UI page type: 'workspace' | 'dashboard' | 'rfq_queue'
 * @param rfqReference - (workspace only) URL-decoded RFQ reference string; server resolves rfq_id
 * @returns UiReloadResult with data matching UiType
 */
export async function uiReload(
  uiType: UiType,
  rfqReference?: string
): Promise<UiReloadResult> {
  try {
    console.log(`[uiReload] start uiType=${uiType} rfqReference=${rfqReference}`);

    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      const unauthorizedResult: UiReloadResult = { success: false, error: 'Unauthorized' };
      console.log('[uiReload] result:', unauthorizedResult);
      return unauthorizedResult;
    }

    const { company_id, user_id } = workspace;

    let result: UiReloadResult;

    switch (uiType) {
      case 'workspace': {
        if (!rfqReference) {
          result = { success: false, error: 'rfqReference required for workspace UI reload' };
          break;
        }
        // Delegate to fetchWorkspace — it bundles ui_reload layoutPrefs + aiConversations + preview
        const ws = await fetchWorkspace({ rfqReference });
        if (!ws.success || !ws.data) {
          result = { success: false, error: ws.error ?? 'fetchWorkspace failed' };
        } else {
          result = { success: true, data: ws.data, uiType: 'workspace' };
        }
        break;
      }

      case 'dashboard': {
        const data = await fetchDashboardPayload(company_id, user_id);
        result = { success: true, data, uiType: 'dashboard' };
        break;
      }

      case 'rfq_queue': {
        const data = await fetchRfqQueuePayload(company_id, user_id);
        result = { success: true, data, uiType: 'rfq_queue' };
        break;
      }

      default: {
        result = { success: false, error: `Unknown UI type: ${uiType}` };
        break;
      }
    }

    console.log('[uiReload] result:', result);
    return result;
  } catch (error) {
    console.error('uiReload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * uiSaved: Persist UI state (layout prefs, scroll position, etc).
 *
 * @param uiType - UI page type
 * @param state - UI state to persist (typically layout preferences)
 * @returns UiReloadResult with success/error
 */
export async function uiSaved(
  uiType: UiType,
  state: Record<string, unknown>
): Promise<UiReloadResult> {
  try {
    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    const { company_id, user_id } = workspace;

    // Upsert ui_reload state
    await db
      .insert(uiReloadTable)
      .values({
        companyId: company_id,
        userId: user_id,
        uiType,
        uiState: state,
      })
      .onConflictDoUpdate({
        target: [uiReloadTable.companyId, uiReloadTable.userId, uiReloadTable.uiType],
        set: {
          uiState: state,
          updatedAt: new Date(),
        },
      });

    return {
      success: true,
      uiType,
    };
  } catch (error) {
    console.error('uiSaved error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================
// PRIVATE FETCH HELPERS — dashboard / rfq_queue only
// (workspace fetching is delegated to fetchWorkspace in lib/ui-reload/fetch-workspace.ts)
// =============================================

/** Dashboard payload: layout prefs from ui_reload */
async function fetchDashboardPayload(
  companyId: number,
  userId: number
): Promise<DashboardPayload> {
  const uiState = await db
    .select({ uiState: uiReloadTable.uiState })
    .from(uiReloadTable)
    .where(
      and(
        eq(uiReloadTable.companyId, companyId),
        eq(uiReloadTable.userId, userId),
        eq(uiReloadTable.uiType, 'dashboard')
      )
    )
    .limit(1);

  const layoutPrefs = uiState.length ? (uiState[0].uiState as Record<string, unknown>) : null;

  return { layoutPrefs };
}

/** RFQ queue payload: layout prefs from ui_reload */
async function fetchRfqQueuePayload(
  companyId: number,
  userId: number
): Promise<RfqQueuePayload> {
  const uiState = await db
    .select({ uiState: uiReloadTable.uiState })
    .from(uiReloadTable)
    .where(
      and(
        eq(uiReloadTable.companyId, companyId),
        eq(uiReloadTable.userId, userId),
        eq(uiReloadTable.uiType, 'rfq_queue')
      )
    )
    .limit(1);

  const layoutPrefs = uiState.length ? (uiState[0].uiState as Record<string, unknown>) : null;

  return { layoutPrefs };
}
