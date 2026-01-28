// =============================================
// Workflow Panel Component
// =============================================
// Workflow tracker panel for the workspace
// Displays a placeholder for the workflow tracking interface

// =============================================
// Types
// =============================================

interface WorkflowPanelProps {
  className?: string;  // Optional additional CSS classes
}

// =============================================
// Workflow Panel Component
// =============================================

/**
 * WorkflowPanel - Workflow tracker placeholder for workspace
 * Uses design tokens from globals.css for all styling
 */
export function WorkflowPanel({ className = "" }: WorkflowPanelProps) {
  return (
    <div className={`bg-card rounded-lg border border-border p-6 ${className}`}>
      {/* Panel header */}
      <h2 className="text-lg font-semibold text-foreground mb-4">Workflow</h2>
      {/* Placeholder content */}
      <p className="text-muted-foreground">Workflow tracker will be implemented here.</p>
    </div>
  );
}
