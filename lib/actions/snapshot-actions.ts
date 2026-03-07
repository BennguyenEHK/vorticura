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
  workspace: {
    client_id: number;
    company_id: number;
    username?: string;
    role?: string;
  };
}

interface SnapshotResult {
  success: boolean;
  data?: any;
  error?: string;
}

// ---------------------------------------------
// Server Actions
// ---------------------------------------------

/**
 * Create a new workboard snapshot when user accepts a workflow step
 * Auto-increments version number per RFQ
 */
export async function createWorkboardSnapshot(
  input: CreateSnapshotInput
): Promise<SnapshotResult> {
  try {
    const workspace = new WorkspaceContext(input.workspace);

    // Auto-increment version
    const latestVersion = await getLatestSnapshotVersion(input.rfqId, workspace);
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
      workspace
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
 */
export async function getWorkboardSnapshots(
  rfqId: number,
  workspaceInput: {
    client_id: number;
    company_id: number;
    username?: string;
    role?: string;
  }
): Promise<SnapshotResult> {
  try {
    const workspace = new WorkspaceContext(workspaceInput);
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
 */
export async function getSnapshotById(
  snapshotId: number,
  workspaceInput: {
    client_id: number;
    company_id: number;
    username?: string;
    role?: string;
  }
): Promise<SnapshotResult> {
  try {
    const workspace = new WorkspaceContext(workspaceInput);
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
