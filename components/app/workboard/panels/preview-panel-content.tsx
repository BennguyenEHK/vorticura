// =============================================
// PREVIEW PANEL CONTENT - Orchestrator (Rewrite)
// =============================================
// Routes incoming SSE data to the correct document component
// Manages edit mode, undo/redo, and save-to-server
// Pattern: same as AuthForm.tsx switching between login/signup

'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { FileText, Mail, Search, BarChart3, MessageSquarePlus, Check, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { handleHTTPRequest } from '@/lib/data-processor';

// Hooks
import { usePreview } from '@/hooks/preview-context';
import { usePreviewSSE } from '@/hooks/use-preview-sse';

// Document components
import {
  QuotationDocument,
  EmailDocument,
  RfqAnalysisDocument,
  SupplierSearchDocument,
  DocumentToolbar,
  WorkboardHistory,
  BlankDocument,
} from './preview';

import { getWorkboardSnapshots, getSnapshotById } from '@/lib/actions/snapshot-actions';
import type { DocumentData, WorkboardSnapshotRecord } from '@/types/preview';
import type { DataType } from '@/lib/utils/validator';

// ---------------------------------------------
// Data type tab configuration
// Same pattern as AuthForm config object
// ---------------------------------------------

const DATA_TYPE_TABS: Array<{
  type: DataType;
  label: string;
  icon: typeof FileText;
  color: string;
}> = [
  { type: 'quotation', label: 'Quotation', icon: FileText, color: 'text-doc-quotation' },
  { type: 'email', label: 'Email', icon: Mail, color: 'text-doc-email' },
  { type: 'rfq_analysis', label: 'RFQ Analysis', icon: BarChart3, color: 'text-doc-analysis' },
  { type: 'supplier_search', label: 'Suppliers', icon: Search, color: 'text-doc-supplier' },
];

// Object mapping: data_type → { accept: action_type, reject: action_type }
// 'proceed' = universal action meaning "accept and move to next pipeline step"
const ACCEPT_REJECT_MAP: Record<string, { accept: string; reject: string }> = {
  rfq_analysis:    { accept: 'proceed', reject: 'reanalyze' },
  quotation:       { accept: 'proceed', reject: 'update' },
  email:           { accept: 'send',    reject: 're_generate' },
  supplier_search: { accept: 'proceed', reject: 'research' },
  supplier_respond: { accept: 'proceed', reject: 'proceed' }, // TBD — optimization strategy not finalized
};

interface InlineNote {
  id: string;
  selectedText: string;
  note: string;
  timestamp: Date;
}

// ---------------------------------------------
// Main Component
// ---------------------------------------------

interface PreviewPanelContentProps {
  className?: string;
}

export function PreviewPanelContent({ className = '' }: PreviewPanelContentProps) {
  const { state, actions } = usePreview();
  const [isSaving, setIsSaving] = useState(false);

  // History panel state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<WorkboardSnapshotRecord[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // --- Feedback & approval state ---
  const [inlineNotes, setInlineNotes] = useState<InlineNote[]>([]);
  const [generalFeedback, setGeneralFeedback] = useState('');
  const [isFeedbackExpanded, setIsFeedbackExpanded] = useState(false);

  // Text selection state for floating tooltip
  const [selection, setSelection] = useState<{ text: string; position: { top: number; left: number } } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [showNotePopover, setShowNotePopover] = useState(false);

  // Refs for content area and note input
  const contentRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  // SSE: receive documents from server and load into reducer
  const handleDocumentReceived = useCallback(
    (doc: DocumentData) => {
      actions.loadDocument(doc);
    },
    [actions]
  );

  usePreviewSSE({
    onDocumentReceived: handleDocumentReceived,
    onError: (err) => actions.setError(err),
  });

  // Save: send current JSON state to server via manual_update
  const handleSave = useCallback(async () => {
    if (!state.activeDocument) return;

    setIsSaving(true);
    try {
      const doc = state.activeDocument;

      // Build ProcessorInput for manual_update based on document type
      await handleHTTPRequest({
        data_type: doc.type,
        action_type: 'manual_update',
        quotation_id:
          doc.type === 'quotation'
            ? doc.data.quotation_id ?? undefined
            : undefined,
        modify_content: {
          // Send the full JSON data as the update payload
          ...('quotation_items' in doc.data
            ? {
                quotation_data: doc.data as unknown as Record<string, unknown>,
                customer_info: doc.data.customer_info as unknown as Record<string, unknown>,
                quotation_items: doc.data.quotation_items as unknown as Array<Record<string, unknown>>,
              }
            : {}),
        },
      });

      // Exit edit mode on success
      actions.toggleEdit();
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [state.activeDocument, actions]);

  // Download: generate print-friendly version
  const handleDownload = useCallback(() => {
    if (!state.activeDocument) return;
    // Open print dialog with current document
    window.print();
  }, [state.activeDocument]);

  // Toggle history panel and load snapshots
  const handleToggleHistory = useCallback(async () => {
    const opening = !isHistoryOpen;
    setIsHistoryOpen(opening);

    if (opening) {
      setIsHistoryLoading(true);
      try {
        // Extract rfq_id from active document (any type may carry it)
        const rfqId = (state.activeDocument?.data as any)?.rfq_id as number | null;

        if (rfqId) {
          // Workspace auto-extracted from auth cookie in server action
          const result = await getWorkboardSnapshots(rfqId);
          if (result.success && result.data) {
            setSnapshots(result.data as WorkboardSnapshotRecord[]);
          }
        }
      } catch (err) {
        console.error('Failed to load snapshots:', err);
      } finally {
        setIsHistoryLoading(false);
      }
    }
  }, [isHistoryOpen, state.activeDocument]);

  // Revert to a specific snapshot — PREVIEW-ONLY, by design.
  // Snapshots are an audit/time-travel record, not a state-machine rollback. We do not
  // restore rfq_analysis / rfq_items / suppliers_search / quotations from snapshot JSONB:
  // irreversible side-effects (emails sent, quotes delivered) can't be undone, and schema
  // drift makes older JSONB unsafe to re-apply. If users need a "go back" semantics,
  // introduce a stage-reset action that re-runs a stage — do NOT expand this function.
  const handleRevert = useCallback(async (snapshotId: number) => {
    try {
      // Workspace auto-extracted from auth cookie in server action
      const result = await getSnapshotById(snapshotId);

      if (result.success && result.data) {
        const snapshot = result.data;

        // Load panels snapshot into preview reducer
        if (snapshot.panelsSnapshot?.preview) {
          actions.loadDocument(snapshot.panelsSnapshot.preview as DocumentData);
        }

        // Close history panel after revert
        setIsHistoryOpen(false);
      }
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : 'Revert failed');
    }
  }, [actions]);

  // Computed: check if there's any feedback to send
  const hasFeedback = inlineNotes.length > 0 || generalFeedback.trim().length > 0;
  const totalNotesCount = inlineNotes.length + (generalFeedback.trim() ? 1 : 0);

  // Text selection handler for inline feedback
  const handleTextSelection = useCallback(() => {
    // While the popover is open, don't mutate selection — user is interacting with the note input
    if (showNotePopover) return;
    const windowSelection = window.getSelection();
    const selectedText = windowSelection?.toString().trim();
    if (!selectedText || !contentRef.current) {
      setSelection(null);
      return;
    }
    const anchorNode = windowSelection?.anchorNode;
    if (!anchorNode || !contentRef.current.contains(anchorNode)) {
      setSelection(null);
      return;
    }
    const range = windowSelection?.getRangeAt(0);
    if (!range) return;
    const rect = range.getBoundingClientRect();
    const contentRect = contentRef.current.getBoundingClientRect();
    const TOOLTIP_HEIGHT = 40;
    const PADDING = 8;
    const spaceAbove = rect.top - contentRect.top;
    const scrollTop = contentRef.current.scrollTop;
    const top = spaceAbove > TOOLTIP_HEIGHT + PADDING
      ? rect.top - contentRect.top + scrollTop - TOOLTIP_HEIGHT - PADDING
      : rect.bottom - contentRect.top + scrollTop + PADDING;
    const left = Math.max(PADDING, Math.min(
      rect.left - contentRect.left + (rect.width / 2) - 55,
      contentRect.width - 110 - PADDING
    ));
    setSelection({ text: selectedText, position: { top, left } });
  }, [showNotePopover]);

  // Listen for text selection on content area
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.addEventListener('mouseup', handleTextSelection);
    return () => el.removeEventListener('mouseup', handleTextSelection);
  }, [handleTextSelection]);

  // Focus note input when popover opens
  useEffect(() => {
    if (showNotePopover && noteInputRef.current) noteInputRef.current.focus();
  }, [showNotePopover]);

  // Save inline note
  const handleSaveNote = useCallback(() => {
    if (selection && noteInput.trim()) {
      setInlineNotes(prev => [...prev, {
        id: Math.random().toString(36).substring(2, 9),
        selectedText: selection.text,
        note: noteInput.trim(),
        timestamp: new Date(),
      }]);
      setNoteInput('');
      setShowNotePopover(false);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  }, [selection, noteInput]);

  // Cancel note input
  const handleCancelNote = useCallback(() => {
    setNoteInput('');
    setShowNotePopover(false);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  // Remove an inline note
  const handleRemoveNote = useCallback((id: string) => {
    setInlineNotes(prev => prev.filter(n => n.id !== id));
  }, []);

  // Accept: always use ACCEPT_REJECT_MAP action (proceed/send) per spec
  // manual_update is handled separately by handleSave — accept = advance pipeline
  const handleAccept = useCallback(async () => {
    if (!state.activeDocument) return;
    const docType = state.activeDocument.type;
    const mapping = ACCEPT_REJECT_MAP[docType];
    if (!mapping) return;

    // Always use the mapped accept action (proceed/send) — never override
    const actionType = mapping.accept;

    try {
      await handleHTTPRequest({
        data_type: docType,
        action_type: actionType as any,
        quotation_id: 'quotation_id' in (state.activeDocument.data as any) ? (state.activeDocument.data as any).quotation_id : undefined,
        rfq_id: 'rfq_id' in (state.activeDocument.data as any) ? (state.activeDocument.data as any).rfq_id : undefined,
      });
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : 'Action failed');
    }
  }, [state.activeDocument, actions]);

  // Reject: send feedback + regenerate action
  const handleReject = useCallback(async () => {
    if (!hasFeedback) return;
    if (!state.activeDocument) return;
    const docType = state.activeDocument.type;
    const mapping = ACCEPT_REJECT_MAP[docType];
    if (!mapping) return;

    try {
      // Build ai_comments payload from UI feedback state
      const aiComments = {
        general_feedback: generalFeedback || '',
        inline_notes: inlineNotes.map((n) => ({
          id: n.id,
          selected_text: n.selectedText,   // camelCase → snake_case for backend
          comment: n.note,                 // UI 'note' → backend 'comment'
          position: { start: 0, end: 0 },  // placeholder — positional data not tracked in UI
          timestamp: n.timestamp.toISOString(),
        })),
      };

      await handleHTTPRequest({
        data_type: docType,
        action_type: mapping.reject as any,
        quotation_id: 'quotation_id' in (state.activeDocument.data as any) ? (state.activeDocument.data as any).quotation_id : undefined,
        rfq_id: 'rfq_id' in (state.activeDocument.data as any) ? (state.activeDocument.data as any).rfq_id : undefined,
        ai_comments: aiComments,           // structured feedback for backend
      });

      // Clear feedback after submission
      setInlineNotes([]);
      setGeneralFeedback('');
      setIsFeedbackExpanded(false);
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : 'Regenerate failed');
    }
  }, [state.activeDocument, generalFeedback, inlineNotes, hasFeedback, actions]);

  // Determine active tab from current document type
  const activeType = state.activeDocument?.type || null;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* ============================================================ */}
      {/* HEADER: Title + Editing indicator                              */}
      {/* ============================================================ */}
      <div className="px-4 pt-3 pb-2">
        <h3 className="text-sm font-medium text-foreground">Document Preview</h3>
        {state.isEditing && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Editing — changes tracked for undo/redo
          </p>
        )}
      </div>

      {/* ============================================================ */}
      {/* DATA TYPE TABS + TOOLBAR — Tabs left, actions right           */}
      {/* ============================================================ */}
      <div className="flex items-center justify-between px-4 pb-2 border-b border-border">
        <div className="flex items-center gap-1">
          {DATA_TYPE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeType === tab.type;

            return (
              <Button
                key={tab.type}
                variant={isActive ? 'default' : 'ghost'}
                size="sm"
                className={`h-7 text-xs gap-1 ${isActive ? '' : 'text-muted-foreground'}`}
                disabled={!state.activeDocument || state.activeDocument.type !== tab.type}
              >
                <Icon className={`w-3 h-3 ${isActive ? '' : tab.color}`} />
                {tab.label}
              </Button>
            );
          })}
        </div>

        <DocumentToolbar
          isEditing={state.isEditing}
          canUndo={state.history.length > 0}
          canRedo={state.future.length > 0}
          hasDocument={!!state.activeDocument}
          onToggleEdit={() => actions.toggleEdit()}
          onUndo={() => actions.undo()}
          onRedo={() => actions.redo()}
          onSave={handleSave}
          onDownload={handleDownload}
          onToggleHistory={handleToggleHistory}
          isHistoryOpen={isHistoryOpen}
          isSaving={isSaving}
        />
      </div>

      {/* ============================================================ */}
      {/* HISTORY PANEL (collapsible)                                   */}
      {/* ============================================================ */}
      {isHistoryOpen && (
        <div className="border-b border-border bg-muted/30">
          <WorkboardHistory
            snapshots={snapshots}
            onRevert={handleRevert}
            isLoading={isHistoryLoading}
          />
        </div>
      )}

      {/* ============================================================ */}
      {/* DOCUMENT CONTENT — Routes to correct component               */}
      {/* ============================================================ */}
      <div ref={contentRef} className="flex-1 overflow-auto bg-background p-4 relative select-text">
        {/* Floating "Add Note" tooltip on text selection */}
        {selection && !showNotePopover && (
          <div
            className="absolute z-10 animate-in fade-in-0 zoom-in-95 duration-150"
            style={{ top: Math.max(0, selection.position.top), left: Math.max(0, selection.position.left) }}
            // Block mousedown from collapsing the text selection before click fires
            onMouseDown={(e) => e.preventDefault()}
          >
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-primary text-primary-foreground shadow-lg"
              // preventDefault on mousedown keeps the selection alive — browser would otherwise collapse it on button press
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowNotePopover(true)}
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Add Note
            </Button>
          </div>
        )}

        {/* Note input popover */}
        {showNotePopover && selection && (
          <div
            className="absolute z-20 w-64 bg-popover border border-border rounded-lg shadow-xl p-3 animate-in fade-in-0 zoom-in-95 duration-150"
            style={{ top: Math.max(0, selection.position.top), left: Math.max(0, Math.min(selection.position.left, 200)) }}
            // Keep selection alive for popover chrome clicks — textarea still receives focus normally
            onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
          >
            <div className="mb-2">
              <p className="text-xs text-muted-foreground mb-1">Selected:</p>
              <p className="text-xs text-foreground bg-muted/50 px-2 py-1 rounded border-l-2 border-primary truncate">
                &quot;{selection.text.substring(0, 50)}{selection.text.length > 50 ? '...' : ''}&quot;
              </p>
            </div>
            <textarea ref={noteInputRef} value={noteInput} onChange={e => setNoteInput(e.target.value)}
              placeholder="Your feedback..."
              className="w-full h-16 px-2 py-1.5 text-xs bg-card border border-border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
            <div className="flex justify-end gap-1.5 mt-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancelNote}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" onClick={handleSaveNote} disabled={!noteInput.trim()}>Save</Button>
            </div>
          </div>
        )}

        {state.isLoading && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading document...
          </div>
        )}

        {state.error && (
          <div className="flex items-center justify-center h-full text-error text-sm">
            {state.error}
          </div>
        )}

        {!state.activeDocument && !state.isLoading && !state.error && (
          <BlankDocument />
        )}

        {/* Route to correct document component based on data_type */}
        {state.activeDocument && (
          <>
            {state.activeDocument.type === 'quotation' && (
              <QuotationDocument
                data={state.activeDocument.data}
                isEditing={state.isEditing}
                onFieldChange={actions.updateField}
              />
            )}

            {state.activeDocument.type === 'email' && (
              <EmailDocument
                data={state.activeDocument.data}
                isEditing={state.isEditing}
                onFieldChange={actions.updateField}
              />
            )}

            {state.activeDocument.type === 'rfq_analysis' && (
              <RfqAnalysisDocument
                data={state.activeDocument.data}
                isEditing={state.isEditing}
                onFieldChange={actions.updateField}
              />
            )}

            {state.activeDocument.type === 'supplier_search' && (
              <SupplierSearchDocument
                data={state.activeDocument.data}
                isEditing={state.isEditing}
                onFieldChange={actions.updateField}
              />
            )}
          </>
        )}
      </div>

      {/* ============================================================ */}
      {/* FOOTER: Feedback section + Accept/Reject actions             */}
      {/* ============================================================ */}
      {state.activeDocument && (
        <div className="px-4 pb-3 pt-2 border-t border-border space-y-3">
          {/* Collapsible feedback section */}
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted transition-colors"
              onClick={() => setIsFeedbackExpanded(!isFeedbackExpanded)}
            >
              <span className="text-xs font-medium text-foreground flex items-center gap-2">
                <MessageSquarePlus className="w-3.5 h-3.5 text-muted-foreground" />
                Feedback
                {totalNotesCount > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full min-w-[1.25rem] text-center">
                    {totalNotesCount}
                  </span>
                )}
              </span>
              {isFeedbackExpanded
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {isFeedbackExpanded && (
              <div className="p-3 border-t border-border bg-card space-y-3">
                {/* Inline notes list */}
                {inlineNotes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Inline Notes ({inlineNotes.length})</p>
                    {inlineNotes.map(note => (
                      <div key={note.id} className="flex items-start gap-2 p-2 bg-muted/50 rounded-md border-l-2 border-primary">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground truncate">&quot;{note.selectedText.substring(0, 30)}...&quot;</p>
                          <p className="text-xs text-foreground mt-0.5">{note.note}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => handleRemoveNote(note.id)}>
                          <X className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {/* General feedback textarea */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Overall Comments</p>
                  <textarea
                    value={generalFeedback}
                    onChange={e => setGeneralFeedback(e.target.value)}
                    placeholder="Add general feedback for the AI to consider..."
                    className="w-full h-20 px-3 py-2 text-xs bg-card border border-border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action buttons row */}
          <div className="flex items-center gap-2">
            {!isFeedbackExpanded && totalNotesCount > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <MessageSquarePlus className="w-3.5 h-3.5" />
                {totalNotesCount} note{totalNotesCount > 1 ? 's' : ''}
              </span>
            )}
            <div className="flex-1" />
            {hasFeedback ? (
              <Button variant="outline" size="sm" onClick={handleReject} className="gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerate
              </Button>
            ) : (
              <Button size="sm" onClick={handleAccept} className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                <Check className="w-3.5 h-3.5" />
                Accept
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
