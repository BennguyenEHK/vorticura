// =============================================
// Workspace Page - Quotation Editor
// =============================================
// Dynamic route for editing a specific quotation
// URL: /workspace/[quotationId] (e.g., /workspace/Q-2024-001)

interface WorkspacePageProps {
  params: Promise<{
    quotationId: string;  // Dynamic segment from URL
  }>;
}

/**
 * WorkspacePage - Main quotation editing workspace
 * Will contain: Chat panel, Files panel, Quotation editor, Workflow tracker
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

      {/* Placeholder for workspace panels grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[600px]">
        {/* Chat Panel Placeholder */}
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">AI Chat</h2>
          <p className="text-muted-foreground">Chat panel will be implemented here.</p>
        </div>

        {/* Quotation Editor Placeholder */}
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quotation Editor</h2>
          <p className="text-muted-foreground">Quotation editor will be implemented here.</p>
        </div>

        {/* Files Panel Placeholder */}
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Files</h2>
          <p className="text-muted-foreground">File manager will be implemented here.</p>
        </div>

        {/* Workflow Panel Placeholder */}
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Workflow</h2>
          <p className="text-muted-foreground">Workflow tracker will be implemented here.</p>
        </div>
      </div>
    </div>
  );
}
