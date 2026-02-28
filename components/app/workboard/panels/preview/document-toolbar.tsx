// =============================================
// DOCUMENT TOOLBAR - Edit/Save, Undo/Redo, Download
// =============================================

'use client';

import { Edit, Save, Undo2, Redo2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DocumentToolbarProps {
  isEditing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToggleEdit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onDownload: () => void;
  isSaving?: boolean;
}

export function DocumentToolbar({
  isEditing,
  canUndo,
  canRedo,
  onToggleEdit,
  onUndo,
  onRedo,
  onSave,
  onDownload,
  isSaving = false,
}: DocumentToolbarProps) {
  return (
    <div className="flex items-center gap-1">
      {/* Undo/Redo (only visible in edit mode) */}
      {isEditing && (
        <>
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
        </>
      )}

      {/* Edit / Save toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={isEditing ? onSave : onToggleEdit}
        disabled={isSaving}
        title={isEditing ? 'Save changes' : 'Edit document'}
      >
        {isEditing ? (
          <Save className="w-3.5 h-3.5 text-green-600" />
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
        disabled={isEditing}
        title="Download document"
      >
        <Download className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
