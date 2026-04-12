// =============================================
// Workspace Page — RFQ-keyed editor
// =============================================
// Dynamic route for editing a specific RFQ by its rfq_reference (from incoming email).
// URL: /workspace/[rfq_reference]  (e.g. /workspace/RFQ%20PK%2022501)
// Uses dynamic WorkboardGrid for resizable/repositionable panels.

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
    rfq_reference: string;       // Dynamic URL segment — URL-encoded form
  }>;
}

// =============================================
// Panel Toggle Configuration
// =============================================

/** Config for panel toggle buttons — maps panel id to icon */
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
function WorkspaceHeader({ rfqReference }: { rfqReference: string }) {
  // Workboard state (layout lock + panel visibility)
  const { isLocked, setLocked, resetLayout, togglePanelVisibility, isPanelVisible } = useWorkboard();

  return (
    <div className="flex items-center justify-between mb-6">
      {/* Page title — renders the human-friendly rfq_reference */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Workspace: {rfqReference}
        </h1>
        <p className="text-body">
          Drag panel edges to resize, drag headers to reposition
        </p>
      </div>

      {/* Layout controls */}
      <div className="flex items-center gap-2">
        {/* Panel toggle buttons — circular buttons to hide/show panels */}
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

        {/* Separator */}
        <div className="h-6 w-px bg-border mx-1" />

        {/* Reset layout */}
        <Button variant="outline" size="sm" onClick={resetLayout} className="gap-2">
          <RotateCcw className="w-4 h-4" />
          Reset Layout
        </Button>

        {/* Lock/Unlock */}
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
 * WorkspacePage - Main RFQ editing workspace keyed on rfq_reference
 * Features:
 * - Drag edges to resize panels
 * - Drag headers to reposition panels
 * - Drop AI Chat FAB to add chat panel
 * - Lock/unlock layout editing
 * - Reset to default layout
 *
 * @param params - Route params containing rfq_reference (URL-encoded)
 */
export default function WorkspacePage({ params }: WorkspacePageProps) {
  // Unwrap params Promise using React.use(); decode spaces/slashes in rfq_reference
  const { rfq_reference } = use(params);
  const rfqReference = decodeURIComponent(rfq_reference);

  return (
    <div className="space-y-4">
      {/* Page header with controls */}
      <WorkspaceHeader rfqReference={rfqReference} />

      {/* Dynamic panel grid */}
      <WorkboardGrid className="min-h-[calc(100vh-200px)]" />
    </div>
  );
}
