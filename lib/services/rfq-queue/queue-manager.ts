// =============================================
// RFQ Queue Manager — live, workspace-isolated
// =============================================
// Reads rfq_analysis ⨝ customers for the sidebar queue.
// Priority is derived from updated_at DESC (most recent = priority 1).
// All DB access goes through lib/db/queries.ts (no raw Drizzle) and
// all workspace isolation goes through getServerActionWorkspace().

'use server';

import { getData, getCount } from '@/lib/db/queries';
import { getServerActionWorkspace } from '@/lib/middleware/get-workspace';
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
// Primary query — returns the workspace's queue
// ---------------------------------------------
/**
 * Fetch queued RFQs for the authenticated workspace.
 * Workspace is pulled from the auth cookie — the client never passes workspace IDs.
 *
 * @param filters optional stage/status/limit/offset filters (applied in-memory; list is small)
 * @returns QueueResponse with priority derived from updated_at DESC
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

  // Shape join rows into QueuedRFQ[] + sort by updated_at DESC (priority = row index + 1)
  const shaped: QueuedRFQ[] = rows
    .map((row) => {
      const rfq = row.rfq_analysis ?? {};
      const cust = row.customers ?? {};
      const stage = (rfq.currentStage ?? 'user_validation') as RFQStage;
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
        priority: 0,            // assigned after sort
        createdAt,
        updatedAt,
      } satisfies QueuedRFQ;
    })
    // Sort newest-first → the most recently touched RFQ lands at priority 1
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
