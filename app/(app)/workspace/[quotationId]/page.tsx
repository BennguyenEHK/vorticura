// =============================================
// Workspace Page - Quotation Editor
// =============================================
// Dynamic route for editing a specific quotation
// URL: /workspace/[quotationId] (e.g., /workspace/Q-2024-001)
// Uses dynamic WorkboardGrid for resizable/repositionable panels

"use client";

import { use } from "react";
import { Lock, Unlock, RotateCcw, GitBranch, DollarSign, FileText } from "lucide-react";
import { WorkboardGrid, useWorkboard } from "@/components/app/workboard";
import { Button } from "@/components/ui/button";

// =============================================
// Types
// =============================================

interface WorkspacePageProps {
  params: Promise<{
    quotationId: string;  // Dynamic segment from URL
  }>;
}

// =============================================
// Panel Toggle Configuration
// =============================================

/** Config for panel toggle buttons - maps panel id to icon */
const PANEL_TOGGLES = [
  { id: "workflow", icon: GitBranch, label: "Workflow" },
  { id: "pricing", icon: DollarSign, label: "Pricing" },
  { id: "preview", icon: FileText, label: "Preview" },
] as const;

// =============================================
// Workspace Header Component
// =============================================

/**
 * WorkspaceHeader - Header with title and layout controls
 * Includes panel toggle buttons for hiding/showing individual panels
 */
function WorkspaceHeader({ quotationId }: { quotationId: string }) {
  // Get workboard state and actions (including panel visibility controls)
  const { isLocked, setLocked, resetLayout, togglePanelVisibility, isPanelVisible } = useWorkboard();

  return (
    <div className="flex items-center justify-between mb-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Workspace: {quotationId}
        </h1>
        <p className="text-body">
          Drag panel edges to resize, drag headers to reposition
        </p>
      </div>

      {/* Layout controls */}
      <div className="flex items-center gap-2">
        {/* Panel toggle buttons - circular buttons to hide/show panels */}
        {PANEL_TOGGLES.map(({ id, icon: Icon, label }) => {
          const isVisible = isPanelVisible(id);
          return (
            <Button
              key={id}
              variant="ghost"
              size="icon"
              onClick={() => togglePanelVisibility(id)}
              className={`
                h-9 w-9 rounded-full border transition-all duration-200
                ${isVisible
                  ? "bg-primary text-primary-foreground border-primary hover:bg-primary-hover"
                  : "bg-muted text-muted-foreground border-border hover:bg-secondary"
                }
              `}
              aria-label={`${isVisible ? "Hide" : "Show"} ${label} panel`}
              title={`${isVisible ? "Hide" : "Show"} ${label}`}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}

        {/* Separator between toggles and actions */}
        <div className="h-6 w-px bg-border mx-1" />

        {/* Reset layout button */}
        <Button
          variant="outline"
          size="sm"
          onClick={resetLayout}
          className="gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Reset Layout
        </Button>

        {/* Lock/Unlock toggle */}
        <Button
          variant={isLocked ? "default" : "outline"}
          size="sm"
          onClick={() => setLocked(!isLocked)}
          className="gap-2"
        >
          {isLocked ? (
            <>
              <Lock className="w-4 h-4" />
              Locked
            </>
          ) : (
            <>
              <Unlock className="w-4 h-4" />
              Unlocked
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// =============================================
// Workspace Page Component
// =============================================

/**
 * WorkspacePage - Main quotation editing workspace
 * Contains: Dynamic WorkboardGrid with resizable/repositionable panels
 * Features:
 * - Drag edges to resize panels
 * - Drag headers to reposition panels
 * - Drop AI Chat FAB to add chat panel
 * - Lock/unlock layout editing
 * - Reset to default layout
 *
 * @param params - Route params containing quotationId
 */
export default function WorkspacePage({ params }: WorkspacePageProps) {
  // Unwrap params Promise using React.use()
  const { quotationId } = use(params);

  return (
    <div className="space-y-4">
      {/* Page header with controls */}
      <WorkspaceHeader quotationId={quotationId} />

      {/* Dynamic panel grid */}
      <WorkboardGrid className="min-h-[calc(100vh-200px)]" />
    </div>
  );
}
