// =============================================
// Quotation Editor Panel Component
// =============================================
// Quotation editor panel for the workspace
// Displays a placeholder for the quotation editing interface

// =============================================
// Types
// =============================================

interface QuotationEditorPanelProps {
  className?: string;  // Optional additional CSS classes
}

// =============================================
// Quotation Editor Panel Component
// =============================================

/**
 * QuotationEditorPanel - Quotation editor placeholder for workspace
 * Uses design tokens from globals.css for all styling
 */
export function QuotationEditorPanel({ className = "" }: QuotationEditorPanelProps) {
  return (
    <div className={`bg-card rounded-lg border border-border p-6 ${className}`}>
      {/* Panel header */}
      <h2 className="text-lg font-semibold text-foreground mb-4">Quotation Editor</h2>
      {/* Placeholder content */}
      <p className="text-muted-foreground">Quotation editor will be implemented here.</p>
    </div>
  );
}
