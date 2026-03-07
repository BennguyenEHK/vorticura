"use client";

// =============================================
// Workflow Panel Content
// =============================================
// Content component for the workflow tracker panel
// Shows RFQ processing stages and progress
// Supports "Accept" button on completed steps to trigger snapshots

import { useState, useCallback } from "react";
import { CheckCircle2, Circle, ArrowRight, Clock, Check, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreview } from "@/hooks/preview-context";
import { createWorkboardSnapshot } from "@/lib/actions/snapshot-actions";
import type { WorkflowStep, WorkflowStepId } from "@/types/workflow";
import type { PanelsSnapshot } from "@/types/preview";

// =============================================
// Props
// =============================================

interface WorkflowPanelContentProps {
  className?: string;
  steps?: WorkflowStep[];
  onStepAccepted?: (stepId: WorkflowStepId) => void;
  /** Collect current panel data for snapshot */
  collectPanelsSnapshot?: () => PanelsSnapshot;
  /** Current RFQ ID */
  rfqId?: number;
  /** Workspace context for DB operations */
  workspace?: {
    client_id: number;
    company_id: number;
    username?: string;
    role?: string;
  };
}

// =============================================
// Step label mapping
// =============================================

const STEP_LABELS: Record<WorkflowStepId, string> = {
  analysis: "AI Analysis",
  email: "Email Draft",
  supplier_search: "Supplier Search",
  quotation: "Quotation",
  pricing: "Pricing",
};

// =============================================
// Content Component
// =============================================

/**
 * WorkflowPanelContent - Workflow tracker content
 * Shows: current stage, completed stages, pending stages
 * Accept button on completed steps triggers snapshot creation
 */
export function WorkflowPanelContent({
  className = "",
  steps,
  onStepAccepted,
  collectPanelsSnapshot,
  rfqId,
  workspace,
}: WorkflowPanelContentProps) {
  const [acceptingStep, setAcceptingStep] = useState<WorkflowStepId | null>(null);
  const { state: previewState, actions: previewActions } = usePreview();
  const canUndo = previewState.history.length > 0;
  const canRedo = previewState.future.length > 0;

  // Handle Accept button click
  const handleAccept = useCallback(
    async (step: WorkflowStep) => {
      if (!rfqId || !workspace || !collectPanelsSnapshot) return;

      setAcceptingStep(step.id);
      try {
        const panelsSnapshot = collectPanelsSnapshot();

        await createWorkboardSnapshot({
          rfqId,
          triggeredBy: step.id,
          label: `${STEP_LABELS[step.id]} accepted`,
          panelsSnapshot,
          workflowSnapshot: steps || [],
          workspace,
        });

        onStepAccepted?.(step.id);
      } catch (err) {
        console.error("Failed to create snapshot:", err);
      } finally {
        setAcceptingStep(null);
      }
    },
    [rfqId, workspace, collectPanelsSnapshot, steps, onStepAccepted]
  );

  // If steps are provided, use them; otherwise show placeholder
  const hasSteps = steps && steps.length > 0;

  return (
    <div className={`p-4 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Current Stage</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Track RFQ processing progress
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => previewActions.undo()}
            disabled={!canUndo}
            title={canUndo ? "Undo" : "Nothing to undo"}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => previewActions.redo()}
            disabled={!canRedo}
            title={canRedo ? "Redo" : "Nothing to redo"}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Stage list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {hasSteps
          ? steps.map((step) => {
              const isCompleted = step.status === "completed";
              const isInProgress = step.status === "in_progress";
              const isPending =
                step.status === "pending" || step.status === "skipped";
              const canAccept =
                isCompleted && rfqId && workspace && collectPanelsSnapshot;

              return (
                <div
                  key={step.id}
                  className={`
                    flex items-center gap-3 p-2 rounded-lg
                    ${isInProgress ? "bg-brand/10" : ""}
                    ${isCompleted ? "opacity-70" : ""}
                  `}
                >
                  {/* Status icon */}
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-status-complete-foreground flex-shrink-0" />
                  ) : isInProgress ? (
                    <ArrowRight className="w-5 h-5 text-brand flex-shrink-0 animate-pulse" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  )}

                  {/* Step label */}
                  <span
                    className={`
                      text-sm flex-1
                      ${isInProgress ? "font-medium text-foreground" : ""}
                      ${isCompleted ? "text-muted-foreground line-through" : ""}
                      ${isPending ? "text-muted-foreground" : ""}
                    `}
                  >
                    {STEP_LABELS[step.id] || step.id}
                  </span>

                  {/* Accept button for completed steps */}
                  {canAccept && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      onClick={() => handleAccept(step)}
                      disabled={acceptingStep === step.id}
                    >
                      <Check className="w-3 h-3" />
                      {acceptingStep === step.id ? "Saving..." : "Accept"}
                    </Button>
                  )}

                  {/* Status badge for current */}
                  {isInProgress && (
                    <span className="text-xs bg-brand text-brand-foreground px-2 py-0.5 rounded-full">
                      In Progress
                    </span>
                  )}
                </div>
              );
            })
          : /* Placeholder when no steps provided */
            ["Analysis", "Email", "Supplier Search", "Quotation", "Pricing"].map(
              (label, index) => (
                <div
                  key={label}
                  className="flex items-center gap-3 p-2 rounded-lg"
                >
                  <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">{label}</span>
                </div>
              )
            )}
      </div>

      {/* Footer with estimated time */}
      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Est. completion: 2-3 hours</span>
        </div>
      </div>
    </div>
  );
}
