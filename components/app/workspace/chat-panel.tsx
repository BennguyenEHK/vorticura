// =============================================
// Chat Panel Component
// =============================================
// AI Chat panel for the workspace
// Displays a placeholder for the AI chat interface

// =============================================
// Types
// =============================================

interface ChatPanelProps {
  className?: string;  // Optional additional CSS classes
}

// =============================================
// Chat Panel Component
// =============================================

/**
 * ChatPanel - AI Chat panel placeholder for workspace
 * Uses design tokens from globals.css for all styling
 */
export function ChatPanel({ className = "" }: ChatPanelProps) {
  return (
    <div className={`bg-card rounded-lg border border-border p-6 ${className}`}>
      {/* Panel header */}
      <h2 className="text-lg font-semibold text-foreground mb-4">AI Chat</h2>
      {/* Placeholder content */}
      <p className="text-muted-foreground">Chat panel will be implemented here.</p>
    </div>
  );
}
