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
} from './preview';

import type { DocumentData } from '@/types/preview';
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
  { type: 'quotation', label: 'Quotation', icon: FileText, color: 'text-blue-600' },
  { type: 'email', label: 'Email', icon: Mail, color: 'text-purple-600' },
  { type: 'rfq_analysis', label: 'RFQ Analysis', icon: BarChart3, color: 'text-amber-600' },
  { type: 'supplier_search', label: 'Suppliers', icon: Search, color: 'text-green-600' },
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

  // Determine active tab from current document type
  const activeType = state.activeDocument?.type || null;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* ============================================================ */}
      {/* HEADER: Title + Toolbar                                       */}
      {/* ============================================================ */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">Document Preview</h3>
          {state.isEditing && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Editing — changes tracked for undo/redo
            </p>
          )}
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
            isSaving={isSaving}
          />
        )}
      </div>

      {/* ============================================================ */}
      {/* DATA TYPE TABS — Filter by document type                     */}
      {/* Same pattern as AuthForm switching between login/signup      */}
      {/* ============================================================ */}
      <div className="flex items-center gap-1 px-4 pb-2 border-b border-border">
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

      {/* ============================================================ */}
      {/* DOCUMENT CONTENT — Routes to correct component               */}
      {/* ============================================================ */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        {state.isLoading && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading document...
          </div>
        )}

        {state.error && (
          <div className="flex items-center justify-center h-full text-red-500 text-sm">
            {state.error}
          </div>
        )}

        {!state.activeDocument && !state.isLoading && !state.error && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">Generated documents will appear here</p>
          </div>
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
