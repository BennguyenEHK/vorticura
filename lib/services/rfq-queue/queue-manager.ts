// =============================================
// RFQ Queue Manager — live, workspace-isolated
// =============================================
// Reads rfq_analysis ⨝ customers for the sidebar queue.
// Priority is derived from updated_at DESC (most recently updated = priority 1).
// All DB access goes through lib/db/queries.ts (no raw Drizzle) and
// all workspace isolation goes through getServerActionWorkspace().

'use server';

// Generic CRUD + join helpers for Drizzle (all workspace-scoped)
import { getData, getCount, updateData, getUiState, getLatestSnapshotVersion, insertSnapshot } from '@/lib/db/queries';
// Resolves authenticated workspace from the server action cookie context
import { getServerActionWorkspace } from '@/lib/middleware/get-workspace';
// In-process pub/sub — steady-state deltas are pushed to SSE subscribers via this bus
import { eventBus } from '@/lib/event-bus';
// Workspace context type — passed to shapeRow so fallbacks (user_id / company_id) are available
import type { WorkspaceContext } from '@/lib/middleware/workspace-context';
import {
  STAGE_CONFIGS,
  type QueuedRFQ,
  type QueueFilters,
  type QueueResponse,
  type QueueStatus,
  type RFQStage,
} from '@/types/rfq-queue';

// ---------------------------------------------
// Stage → QueueStatus mapping (derived, not stored)
// ---------------------------------------------
function statusFromStage(stage: RFQStage): QueueStatus {
  const cfg = STAGE_CONFIGS[stage];
  if (!cfg) return 'active';
  if (stage === 'final_actions') return 'completed';
  if (cfg.isGate) return 'action';
  if (cfg.isAsync) return 'waiting';
  return 'active';
}

// ---------------------------------------------
// Shape-coercion helpers — Drizzle leftJoin returns { rfq_analysis: {...}, customers: {...} | null }
// ---------------------------------------------
interface JoinedRow {
  rfq_analysis?: Record<string, unknown>;
  customers?: Record<string, unknown> | null;
}

// ---------------------------------------------
// Row shaper — single source of truth for JoinedRow → QueuedRFQ
// ---------------------------------------------
// Used by getQueuedRFQs (bulk) and emitQueuedRFQs (single upsert).
// Keeps priority at 0 — callers assign the real priority after sorting.
function shapeRow(row: JoinedRow, workspace: WorkspaceContext): QueuedRFQ {
  const rfq = row.rfq_analysis ?? {};
  const cust = row.customers ?? {};
  // Default to user_validation when DB row has no stage (rare — only for legacy rows)
  const stage = (rfq.currentStage ?? 'user_validation') as RFQStage;
  // Coerce date columns — leftJoin may return ISO strings depending on driver settings
  const updatedAt = rfq.updatedAt ? new Date(rfq.updatedAt as string | Date) : new Date(0);
  const createdAt = rfq.createdAt ? new Date(rfq.createdAt as string | Date) : new Date(0);

  return {
    // Visible
    rfqReference: String(rfq.rfqReference ?? ''),
    clientName: String(cust.companyName ?? '(unknown)'),
    clientEmail: String(cust.email ?? ''),
    subject: String(rfq.subject ?? '(no subject)'),
    stage,
    stageLabel: STAGE_CONFIGS[stage]?.label ?? String(stage),
    unreadCount: Number(rfq.unreadCount ?? 0),
    // Internal
    rfqId: Number(rfq.rfqId ?? 0),
    userId: Number(rfq.userId ?? workspace.user_id),
    companyId: Number(rfq.companyId ?? workspace.company_id),
    status: statusFromStage(stage),
    priority: 0,            // assigned after sort (or overridden to 1 for push payloads)
    createdAt,
    updatedAt,
  } satisfies QueuedRFQ;
}

// ---------------------------------------------
// Primary query — returns the workspace's queue
// ---------------------------------------------
/**
 * Fetch queued RFQs for the authenticated workspace.
 * Workspace is pulled from the auth cookie — the client never passes workspace IDs.
 *
 * @param filters optional stage/status/limit/offset filters (applied in-memory; list is small)
 * @returns QueueResponse with priority derived from rfq_id DESC
 */
export async function getQueuedRFQs(filters?: QueueFilters): Promise<QueueResponse> {
  // Derive workspace from auth cookie — tenant isolation is enforced inside queries.ts
  const workspace = await getServerActionWorkspace();
  if (!workspace) {
    // Unauthenticated → return empty queue instead of throwing (sidebar renders empty state)
    return { items: [], total: 0, hasMore: false };
  }

  const limit = filters?.limit ?? 3;
  const offset = filters?.offset ?? 0;

  // LEFT JOIN rfq_analysis ⨝ customers on rfqId (queries.ts handles workspace filters)
  const rows = (await getData(
    ['rfqAnalysis', 'customers'],
    {},                        // no where filters — all rows for this workspace
    workspace,
    { joinColumn: 'rfqId' },   // rfq_analysis.rfq_id = customers.rfq_id
  )) as JoinedRow[];

  // Shape join rows into QueuedRFQ[] + sort by updated_at DESC (latest update on top).
  // Rationale: the sidebar reflects "what changed most recently" so users always
  // see the RFQ that just progressed / received activity at the top.
  const shaped: QueuedRFQ[] = rows
    .map((row) => shapeRow(row, workspace))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((item, idx) => ({ ...item, priority: idx + 1 }));

  // Apply optional filters in-memory (small list — sidebar shows ≤20 rows)
  let filtered = shaped;
  if (!filters?.includeCompleted) filtered = filtered.filter((r) => r.status !== 'completed');
  if (filters?.status?.length) filtered = filtered.filter((r) => filters.status!.includes(r.status));
  if (filters?.stage?.length) filtered = filtered.filter((r) => filters.stage!.includes(r.stage));

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  return {
    items: page,
    total,
    hasMore: offset + page.length < total,
  };
}

// ---------------------------------------------
// Lightweight counts for sidebar badges
// ---------------------------------------------
/** Total active RFQs in the workspace (for the collapsed-sidebar badge). */
export async function getQueueCount(): Promise<number> {
  const workspace = await getServerActionWorkspace();
  if (!workspace) return 0;
  // getCount already applies workspace filter (company_id / user_id) internally
  return await getCount('rfqAnalysis', {}, workspace);
}

/** Sum of unread_count across the workspace's RFQs. */
export async function getUnreadCount(): Promise<number> {
  const workspace = await getServerActionWorkspace();
  if (!workspace) return 0;

  // Fetch all RFQs and sum unread_count in-memory (small dataset — avoids adding a SUM helper to queries.ts)
  const rows = (await getData('rfqAnalysis', {}, workspace)) as Array<Record<string, unknown>>;
  return rows.reduce((sum, r) => sum + Number(r.unreadCount ?? 0), 0);
}

// ---------------------------------------------
// Push-style upsert — emits a single QueuedRFQ on the 'rfq-queue' channel
// ---------------------------------------------
/**
 * Emit a single queue upsert for the given rfq_id on the 'rfq-queue' channel.
 * Optionally updates rfq_analysis.current_stage before emitting.
 * Server-internal — called from processActions after DB writes. Never called from the UI.
 *
 * SECURITY: `workspace` MUST be the cookie-validated context resolved at the HTTP
 * boundary (data-processor.ts enforces this at line ~181). We do NOT re-resolve
 * from cookies here because this function runs in non-request contexts too
 * (tests, cron, IMAP watcher) where `cookies()` throws outside a request scope.
 */
export async function emitQueuedRFQs(
  rfqId: number,
  ws: WorkspaceContext,
  currentStage?: RFQStage
): Promise<void> {
  // Defensive guard — a missing workspace here indicates a caller bug, not a silent skip
  const workspace = ws;
  console.log('Check for workspace');
  if (!workspace) return;

  // Optional stage transition — log failure and continue so a stale stage never blocks emit.
  // Snapshot policy: when current_stage actually changes, capture a workboard_snapshots row
  // so the user can revert the workspace state to the moment they entered each stage.
  if (currentStage) {
    let previousStage: string | undefined;
    try {
      // Read the existing stage so we can detect a real transition (vs. idempotent re-emit)
      const existingRows = (await getData('rfqAnalysis', { rfqId }, workspace)) as Array<Record<string, unknown>>;
      previousStage = existingRows[0]?.currentStage as string | undefined;
    } catch (err) {
      console.warn(`[emitQueuedRFQs] previous-stage lookup failed for rfq_id=${rfqId}:`, err);
    }

    try {
      await updateData('rfqAnalysis', { rfqId }, { currentStage }, workspace);
    } catch (err) {
      console.warn(`[emitQueuedRFQs] current_stage update failed for rfq_id=${rfqId}:`, err);
    }

    // Snapshot only on a genuine transition (old != new). Snapshot is non-blocking.
    if (previousStage !== currentStage) {
      try {
        await captureStageSnapshot(rfqId, currentStage, workspace);
      } catch (err) {
        console.warn(`[emitQueuedRFQs] snapshot capture failed for rfq_id=${rfqId}:`, err);
      }
    }
  }

  console.log(' retriveing data ');
  // Fetch the single joined row for this rfq_id (workspace filter applied inside getData)
  const rows = (await getData(
    ['rfqAnalysis', 'customers'],
    { rfqId },
    workspace,
    { joinColumn: 'rfqId' },
  )) as JoinedRow[];

  if (rows.length === 0) {
    console.warn(`[emitQueuedRFQs] no joined row found for rfq_id=${rfqId}`);
    return;
  }

  // Shape via the shared helper; force priority=1 as the "promoted" marker (client re-ranks anyway)
  const payload: QueuedRFQ = { ...shapeRow(rows[0], workspace), priority: 1 };

  // Broadcast to all SSE subscribers listening on 'rfq-queue'
  // Log the notification payload to the server terminal for visibility
  // (helps during tests, cron runs, and non-request contexts).
  console.log('[emitQueuedRFQs] emitting rfq-queue payload for rfqId=%d companyId=%d:',
    payload.rfqId, payload.companyId, payload);
  eventBus.emit('rfq-queue', payload);
}

// ---------------------------------------------
// Snapshot helper — Option 1 (snapshot on stage transition)
// ---------------------------------------------
/**
 * Capture a workboard_snapshots row at the moment of a stage transition.
 *  - panelsSnapshot   = ui_reload.uiState for ('workspace', user) (layout/visibility/maximized state)
 *  - workflowSnapshot = the rfq_analysis row (stage, unread, last_preview_type, etc.)
 * Bounded by design: rows ≈ RFQ_count × stage_count. Matches the revert-to-stage UX granularity.
 */
async function captureStageSnapshot(
  rfqId: number,
  newStage: RFQStage,
  workspace: WorkspaceContext,
): Promise<void> {
  // Pull current workboard layout (panels) and the post-transition rfq_analysis row (workflow).
  // Done in parallel — both reads are independent and small.
  const [panelsState, rfqRows] = await Promise.all([
    getUiState('workspace', workspace).catch(() => null),
    getData('rfqAnalysis', { rfqId }, workspace).catch(() => [] as Array<Record<string, unknown>>),
  ]);

  // Compute the next monotonic version for this rfq (avoids races even under concurrent emits)
  const nextVersion = (await getLatestSnapshotVersion(rfqId, workspace)) + 1;

  await insertSnapshot(
    {
      rfqId,
      version: nextVersion,
      triggeredBy: newStage,
      label: `Entered ${STAGE_CONFIGS[newStage]?.label ?? newStage}`,
      panelsSnapshot: panelsState ?? {},
      workflowSnapshot: (rfqRows as Array<Record<string, unknown>>)[0] ?? { currentStage: newStage },
    },
    workspace,
  );
}
