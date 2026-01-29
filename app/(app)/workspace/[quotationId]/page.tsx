// =============================================
// Workspace Page - Quotation Editor
// =============================================
// Dynamic route for editing a specific quotation
// URL: /workspace/[quotationId] (e.g., /workspace/Q-2024-001)
// Uses dynamic WorkboardGrid for resizable/repositionable panels

"use client";

import { use } from "react";
import { Lock, Unlock, RotateCcw } from "lucide-react";
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
// Workspace Header Component
// =============================================

/**
 * WorkspaceHeader - Header with title and layout controls
 */
function WorkspaceHeader({ quotationId }: { quotationId: string }) {
  // Get workboard state and actions
  const { isLocked, setLocked, resetLayout } = useWorkboard();

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
