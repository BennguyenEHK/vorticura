// =============================================
// WORKFLOW HISTORY - Displays historical workflow steps from snapshots
// =============================================

'use client';

import { History, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkboardSnapshotRecord } from '@/types/preview';
import type { WorkflowStep } from '@/types/workflow';

// ---------------------------------------------
// Props
// ---------------------------------------------

interface WorkflowHistoryProps {
  snapshots: WorkboardSnapshotRecord[];
  // onRevertWorkflow?: (snapshotId: number) => void; // Optional: if we want to add revert functionality
  isLoading: boolean;
}

// ---------------------------------------------
// Helper: format date
// ---------------------------------------------

function formatSnapshotDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------
// Component
// ---------------------------------------------

export function WorkflowHistory({
  snapshots,
  // onRevertWorkflow,
  isLoading,
}: WorkflowHistoryProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading workflow history...
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center text-muted-foreground">
        <History className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">No workflow snapshots yet</p>
        <p className="text-xs mt-1">Accept a workflow step to create a history entry</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 overflow-y-auto max-h-64">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Workflow History
      </h4>
      {snapshots.map((snapshot) => (
        <div
          key={snapshot.snapshot_id}
          className="border border-border rounded-md p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                v{snapshot.version}: {snapshot.label || `Triggered by ${snapshot.triggered_by}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatSnapshotDate(snapshot.created_at)}
              </p>
            </div>
            {/* {onRevertWorkflow && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={() => onRevertWorkflow(snapshot.snapshot_id)}
                title={`Revert to workflow from v${snapshot.version}`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            )} */}
          </div>
          <div className="space-y-1">
            {snapshot.workflow_snapshot.map((step: WorkflowStep) => (
              <div key={step.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <GitBranch className="w-3 h-3 flex-shrink-0" />
                <span>{step.id}: <span className="capitalize">{step.status.replace('_', ' ')}</span></span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
