// =============================================
// WORKBOARD HISTORY - Snapshot version list with revert
// =============================================

'use client';

import { History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkboardSnapshotRecord } from '@/types/preview';

// ---------------------------------------------
// Props
// ---------------------------------------------

interface WorkboardHistoryProps {
  snapshots: WorkboardSnapshotRecord[];
  onRevert: (snapshotId: number) => void;
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

export function WorkboardHistory({
  snapshots,
  onRevert,
  isLoading,
}: WorkboardHistoryProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading history...
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center text-muted-foreground">
        <History className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">No snapshots yet</p>
        <p className="text-xs mt-1">Accept a workflow step to create one</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1.5 overflow-y-auto max-h-64">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Version History
      </h4>
      {snapshots.map((snapshot) => (
        <div
          key={snapshot.snapshot_id}
          className="flex items-center justify-between gap-2 p-2 rounded-md border border-border hover:bg-accent/50 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              v{snapshot.version}: {snapshot.label || snapshot.triggered_by}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatSnapshotDate(snapshot.created_at)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={() => onRevert(snapshot.snapshot_id)}
            title={`Revert to v${snapshot.version}`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
