// =============================================
// PREVIEW PANEL CONTENT - Orchestrator (Rewrite)
// =============================================
// Routes incoming SSE data to the correct document component
// Manages edit mode, undo/redo, and save-to-server
// Pattern: same as AuthForm.tsx switching between login/signup

'use client';

import { useCallback, useState } from 'react';
import { FileText, Mail, Search, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { handleHTTPRequest } from '@/lib/data-processor';

// Hooks
import { usePreviewReducer } from '@/hooks/use-preview-reducer';
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

// ---------------------------------------------
// Main Component
// ---------------------------------------------

interface PreviewPanelContentProps {
  className?: string;
}

export function PreviewPanelContent({ className = '' }: PreviewPanelContentProps) {
  const { state, actions } = usePreviewReducer();
  const [isSaving, setIsSaving] = useState(false);

  // History panel state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<WorkboardSnapshotRecord[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

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
        // TODO: Replace with real rfqId and workspace from context
        // For now uses placeholder — will be wired when RFQ context is available
        const rfqId = (state.activeDocument?.type === 'rfq_analysis'
          ? (state.activeDocument.data as any).rfq_id
          : null) as number | null;

        if (rfqId) {
          const result = await getWorkboardSnapshots(rfqId, {
            client_id: 1,
            company_id: 1,
          });
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

  // Revert to a specific snapshot
  const handleRevert = useCallback(async (snapshotId: number) => {
    try {
      // TODO: Replace with real workspace from context
      const result = await getSnapshotById(snapshotId, {
        client_id: 1,
        company_id: 1,
      });

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

        {state.activeDocument && (
          <DocumentToolbar
            isEditing={state.isEditing}
            canUndo={state.history.length > 0}
            canRedo={state.future.length > 0}
            onToggleEdit={() => actions.toggleEdit()}
            onUndo={() => actions.undo()}
            onRedo={() => actions.redo()}
            onSave={handleSave}
            onDownload={handleDownload}
            onToggleHistory={handleToggleHistory}
            isHistoryOpen={isHistoryOpen}
            isSaving={isSaving}
          />
        )}
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
      <div className="flex-1 overflow-auto bg-secondary p-4">
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
    </div>
  );
}
