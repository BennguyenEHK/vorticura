'use server'

import { db } from '@/lib/db/client';
import { uiReload as uiReloadTable, rfqAnalysis, aiConversations } from '@/lib/db/schema';
import { getServerActionWorkspace } from '@/lib/middleware/get-workspace';
import { getFetchIntent } from '@/lib/ui-reload/stage-map';
import { eq, and } from 'drizzle-orm';
import type {
  UiType,
  RFQStage,
  WorkspacePayload,
  DashboardPayload,
  RfqQueuePayload,
  UiReloadResult,
} from '@/types/ui-reload';

/**
 * uiReload: Fetch UI state based on uiType
 * Routes to workspace/dashboard/rfq_queue fetch logic
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
    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    const { company_id, user_id } = workspace;

    switch (uiType) {
      case 'workspace': {
        if (!rfqReference) {
          return {
            success: false,
            error: 'rfqReference required for workspace UI reload',
          };
        }
        const data = await fetchWorkspacePayload(company_id, user_id, rfqReference);
        return {
          success: true,
          data,
          uiType: 'workspace',
        };
      }

      case 'dashboard': {
        const data = await fetchDashboardPayload(company_id, user_id);
        return {
          success: true,
          data,
          uiType: 'dashboard',
        };
      }

      case 'rfq_queue': {
        const data = await fetchRfqQueuePayload(company_id, user_id);
        return {
          success: true,
          data,
          uiType: 'rfq_queue',
        };
      }

      default:
        return {
          success: false,
          error: `Unknown UI type: ${uiType}`,
        };
    }
  } catch (error) {
    console.error('uiReload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * uiSaved: Persist UI state (layout prefs, scroll position, etc)
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
// PRIVATE FETCH HELPERS
// =============================================

/**
 * Fetch workspace payload: RFQ state + panels based on stage.
 * Resolves rfqId from rfqReference server-side — callers never pass raw numeric IDs.
 */
async function fetchWorkspacePayload(
  companyId: number,
  userId: number,
  rfqReference: string,
): Promise<WorkspacePayload> {
  // Look up RFQ by reference string with tenant isolation
  const rfq = await db
    .select()
    .from(rfqAnalysis)
    .where(
      and(
        eq(rfqAnalysis.rfqReference, rfqReference),
        eq(rfqAnalysis.companyId, companyId)
      )
    )
    .limit(1);

  if (!rfq.length) {
    throw new Error(`RFQ "${rfqReference}" not found`);
  }

  const rfqId = rfq[0].rfqId;

  const rfqRecord = rfq[0];
  const stage = (rfqRecord.currentStage || 'user_validation') as RFQStage;
  const intent = getFetchIntent(stage);

  // Fetch layout prefs
  const uiState = await db
    .select({ uiState: uiReloadTable.uiState })
    .from(uiReloadTable)
    .where(
      and(
        eq(uiReloadTable.companyId, companyId),
        eq(uiReloadTable.userId, userId),
        eq(uiReloadTable.uiType, 'workspace')
      )
    )
    .limit(1);

  const layoutPrefs = uiState.length ? (uiState[0].uiState as Record<string, unknown>) : null;

  // Fetch AI conversations (always attempted, empty if none/expired)
  const aiConversationRecords = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.companyId, companyId),
        eq(aiConversations.userId, userId),
        eq(aiConversations.rfqId, rfqId)
      )
    )
    .limit(1);

  const ai = aiConversationRecords.length
    ? [aiConversationRecords[0]]
    : [];

  // For now, return null for panels requiring further fetching
  // (preview, workflow, suppliers, pricing would be fetched by dedicated endpoints)
  return {
    stage,
    rfqId,
    rfqReference: rfqRecord.rfqReference,
    layoutPrefs,
    preview: intent.preview ? null : null,
    workflow: intent.workflow ? null : null,
    suppliers: intent.suppliers ? null : null,
    pricing: intent.pricing ? null : null,
    ai,
  };
}

/**
 * Fetch dashboard payload: layout prefs
 */
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

  return {
    layoutPrefs,
  };
}

/**
 * Fetch RFQ queue payload: layout prefs
 */
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

  return {
    layoutPrefs,
  };
}
