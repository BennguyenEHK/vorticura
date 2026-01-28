// =============================================
// Workspace Page - Quotation Editor
// =============================================
// Dynamic route for editing a specific quotation
// URL: /workspace/[quotationId] (e.g., /workspace/Q-2024-001)
// Uses extracted panel components from @/components/app/workspace

import {
  ChatPanel,
  QuotationEditorPanel,
  FilesPanel,
  WorkflowPanel,
} from "@/components/app/workspace";

// =============================================
// Types
// =============================================

interface WorkspacePageProps {
  params: Promise<{
    quotationId: string;  // Dynamic segment from URL
  }>;
}

// =============================================
// Workspace Page Component
// =============================================

/**
 * WorkspacePage - Main quotation editing workspace
 * Contains: Chat panel, Files panel, Quotation editor, Workflow tracker
 * Uses extracted panel components for modularity
 *
 * @param params - Route params containing quotationId
 */
export default async function WorkspacePage({ params }: WorkspacePageProps) {
  // Await params in Next.js 15 (params is now a Promise)
  const { quotationId } = await params;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Workspace: {quotationId}
        </h1>
        <p className="text-body">
          Edit and manage your quotation in the workspace panels.
        </p>
      </div>

      {/* Workspace panels grid - 2x2 layout on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[600px]">
        {/* AI Chat Panel */}
        <ChatPanel />

        {/* Quotation Editor Panel */}
        <QuotationEditorPanel />

        {/* Files Panel */}
        <FilesPanel />

        {/* Workflow Panel */}
        <WorkflowPanel />
      </div>
    </div>
  );
}
