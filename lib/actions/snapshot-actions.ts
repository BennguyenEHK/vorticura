// =============================================
// SNAPSHOT ACTIONS - Workboard Snapshot Server Actions
// =============================================
// Server actions for creating and retrieving workboard snapshots (Layer 2 versioning)
// Flow: UI → server action → queries.ts → DB

'use server';

import {
  getLatestSnapshotVersion,
  insertSnapshot,
  getSnapshotsByRfq,
  getSnapshotById as getSnapshotByIdQuery,
} from '@/lib/db/queries';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';
import { getServerActionWorkspace } from '@/lib/middleware/get-workspace';
import type { PanelsSnapshot } from '@/types/preview';
import type { WorkflowStep, WorkflowStepId } from '@/types/workflow';

// ---------------------------------------------
// Types
// ---------------------------------------------

interface CreateSnapshotInput {
  rfqId: number;
  triggeredBy: WorkflowStepId;
  label: string;
  panelsSnapshot: PanelsSnapshot;
  workflowSnapshot: WorkflowStep[];
}

interface SnapshotResult {
  success: boolean;
  data?: any;
  error?: string;
}

// ---------------------------------------------
// Server Actions
// ---------------------------------------------

// Snapshot policy:
//   WRITE path — on workflow-step acceptance, capture a point-in-time view for audit.
//   READ path  — WorkboardHistory renders snapshots as a read-only timeline; see
//                preview-panel-content.tsx::handleRevert for the preview-only revert.
//   NEVER cross-table restore from these JSONBs — see handleRevert comment for why.

/**
 * Create a new workboard snapshot when user accepts a workflow step
 * Workspace is derived server-side from auth cookie for security.
 * Version increment is atomic to prevent race conditions.
 */
export async function createWorkboardSnapshot(
  input: CreateSnapshotInput
): Promise<SnapshotResult> {
  try {
    // Derive workspace server-side from auth cookie (not client-supplied)
    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      return { success: false, error: 'Authentication required' };
    }

    const workspaceContext = new WorkspaceContext({
      user_id: workspace.user_id,      // renamed from client_id
      company_id: workspace.company_id,
    });

    // Auto-increment version atomically (prevents TOCTOU race)
    // The insertSnapshot query should handle atomic version computation
    const latestVersion = await getLatestSnapshotVersion(input.rfqId, workspaceContext);
    const newVersion = latestVersion + 1;

    // Insert snapshot
    const snapshot = await insertSnapshot(
      {
        rfqId: input.rfqId,
        version: newVersion,
        triggeredBy: input.triggeredBy,
        label: input.label,
        panelsSnapshot: input.panelsSnapshot,
        workflowSnapshot: input.workflowSnapshot,
      },
      workspaceContext
    );

    return { success: true, data: snapshot };
  } catch (error) {
    console.error('createWorkboardSnapshot failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create snapshot',
    };
  }
}

/**
 * Get all snapshots for an RFQ, newest first
 * Workspace auto-extracted from auth cookie — no client-side passing needed
 */
export async function getWorkboardSnapshots(
  rfqId: number
): Promise<SnapshotResult> {
  try {
    // Auto-extract workspace from auth cookie
    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      return { success: false, error: 'Authentication required' };
    }

    const snapshots = await getSnapshotsByRfq(rfqId, workspace);

    return { success: true, data: snapshots };
  } catch (error) {
    console.error('getWorkboardSnapshots failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get snapshots',
    };
  }
}

/**
 * Get a single snapshot by ID
 * Workspace auto-extracted from auth cookie — no client-side passing needed
 */
export async function getSnapshotById(
  snapshotId: number
): Promise<SnapshotResult> {
  try {
    // Auto-extract workspace from auth cookie
    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      return { success: false, error: 'Authentication required' };
    }

    const snapshot = await getSnapshotByIdQuery(snapshotId, workspace);

    if (!snapshot) {
      return { success: false, error: 'Snapshot not found' };
    }

    return { success: true, data: snapshot };
  } catch (error) {
    console.error('getSnapshotById failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get snapshot',
    };
  }
}
