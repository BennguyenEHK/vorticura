// =============================================
// DOCUMENT TOOLBAR - Edit/Save, Undo/Redo, Download
// =============================================

'use client';

import { Edit, Save, Undo2, Redo2, Download, History, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DocumentToolbarProps {
  isEditing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasDocument: boolean;
  onToggleEdit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onDownload: () => void;
  onToggleHistory?: () => void;
  isHistoryOpen?: boolean;
  onToggleWorkflowHistory?: () => void; // New prop for workflow history
  isWorkflowHistoryOpen?: boolean;      // New prop for workflow history state
  isSaving?: boolean;
}

export function DocumentToolbar({
  isEditing,
  canUndo,
  canRedo,
  hasDocument,
  onToggleEdit,
  onUndo,
  onRedo,
  onSave,
  onDownload,
  onToggleHistory,
  isHistoryOpen = false,
  onToggleWorkflowHistory,
  isWorkflowHistoryOpen = false,
  isSaving = false,
}: DocumentToolbarProps) {
  return (
    <div className="flex items-center gap-1">
      {/* Undo/Redo — always visible, disabled when unavailable */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onUndo}
        disabled={!canUndo}
        title={`Undo (${canUndo ? 'available' : 'nothing to undo'})`}
      >
        <Undo2 className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onRedo}
        disabled={!canRedo}
        title={`Redo (${canRedo ? 'available' : 'nothing to redo'})`}
      >
        <Redo2 className="w-3.5 h-3.5" />
      </Button>

      {/* Edit / Save toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={isEditing ? onSave : onToggleEdit}
        disabled={!hasDocument || isSaving}
        title={isEditing ? 'Save changes' : 'Edit document'}
      >
        {isEditing ? (
          <Save className="w-3.5 h-3.5 text-success" />
        ) : (
          <Edit className="w-3.5 h-3.5" />
        )}
      </Button>

      {/* Download */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onDownload}
        disabled={!hasDocument || isEditing}
        title="Download document"
      >
        <Download className="w-3.5 h-3.5" />
      </Button>

      {/* History toggle */}
      {onToggleHistory && (
        <Button
          variant={isHistoryOpen ? 'default' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={onToggleHistory}
          title={isHistoryOpen ? 'Close document history' : 'View document history'}
        >
          <History className="w-3.5 h-3.5" />
        </Button>
      )}

      {/* Workflow History toggle */}
      {onToggleWorkflowHistory && (
        <Button
          variant={isWorkflowHistoryOpen ? 'default' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={onToggleWorkflowHistory}
          title={isWorkflowHistoryOpen ? 'Close workflow history' : 'View workflow history'}
        >
          <GitBranch className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
