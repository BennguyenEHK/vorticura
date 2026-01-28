// =============================================
// Files Panel Component
// =============================================
// File manager panel for the workspace
// Displays a placeholder for the file management interface

// =============================================
// Types
// =============================================

interface FilesPanelProps {
  className?: string;  // Optional additional CSS classes
}

// =============================================
// Files Panel Component
// =============================================

/**
 * FilesPanel - File manager placeholder for workspace
 * Uses design tokens from globals.css for all styling
 */
export function FilesPanel({ className = "" }: FilesPanelProps) {
  return (
    <div className={`bg-card rounded-lg border border-border p-6 ${className}`}>
      {/* Panel header */}
      <h2 className="text-lg font-semibold text-foreground mb-4">Files</h2>
      {/* Placeholder content */}
      <p className="text-muted-foreground">File manager will be implemented here.</p>
    </div>
  );
}
