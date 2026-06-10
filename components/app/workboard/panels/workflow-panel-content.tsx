"use client";

// =============================================
// Workflow Panel Content
// =============================================
// Reads live WorkflowStep[] from WorkflowContext (seeded on mount by WorkspacePreviewHydrator).
// Props removed — rfqId from RFQContext, preview doc from PreviewContext.
// Falls back to static placeholder list when no RFQ is loaded (e.g., dashboard).

import { useState, useCallback } from "react";
import { CheckCircle2, Circle, ArrowRight, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreview } from "@/hooks/preview-context";
import { useWorkflow } from "@/hooks/workflow-context";
import { useRFQContext } from "@/hooks/rfq-context";
import { createWorkboardSnapshot } from "@/lib/actions/snapshot-actions";
import type { WorkflowStep, WorkflowStepId } from "@/types/workflow";

// Human-readable step labels for each pipeline stage
const STEP_LABELS: Record<WorkflowStepId, string> = {
  analysis:        "AI Analysis",
  email:           "Email Draft",
  supplier_search: "Supplier Search",
  quotation:       "Quotation",
  pricing:         "Pricing",
};

// Fallback placeholder labels rendered when no RFQ is loaded
const PLACEHOLDER_LABELS = ["Analysis", "Email", "Supplier Search", "Quotation", "Pricing"];

export function WorkflowPanelContent({ className = "" }: { className?: string }) {
  const [acceptingStep, setAcceptingStep]            = useState<WorkflowStepId | null>(null);
  const { steps }                                     = useWorkflow();   // live steps from context
  const rfqCtx                                        = useRFQContext();
  const rfqId                                         = rfqCtx?.rfqId;
  const { state: previewState } = usePreview();

  // Creates a DB audit snapshot when the user manually accepts a completed step
  const handleAccept = useCallback(async (step: WorkflowStep) => {
    if (!rfqId) return;
    setAcceptingStep(step.id);
    try {
      // Build panels snapshot from current preview doc (pricing panel not yet wired)
      const panelsSnapshot = {
        preview: previewState.activeDocument,
        pricing: null,
      };
      await createWorkboardSnapshot({
        rfqId,
        triggeredBy:      step.id,
        label:            `${STEP_LABELS[step.id]} accepted`,
        panelsSnapshot:   panelsSnapshot as any,
        workflowSnapshot: steps,
      });
    } catch (err) {
      console.error("Failed to create snapshot:", err);
    } finally {
      setAcceptingStep(null);
    }
  }, [rfqId, steps, previewState.activeDocument]);

  const hasSteps = steps.length > 0;

  return (
    <div className={`p-4 h-full flex flex-col ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">Current Stage</h3>
        <p className="text-xs text-muted-foreground mt-1">Track RFQ processing progress</p>
      </div>

      {/* Step list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {hasSteps ? steps.map((step) => {
          const isCompleted  = step.status === "completed";
          const isInProgress = step.status === "in_progress";
          const isPending    = step.status === "pending" || step.status === "skipped";
          const isSaving     = acceptingStep === step.id;

          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 p-2 rounded-lg ${isInProgress ? "bg-brand/10" : ""} ${isCompleted ? "opacity-70" : ""}`}
            >
              {/* Status icon */}
              {isCompleted  && <CheckCircle2 className="w-5 h-5 text-status-complete-foreground flex-shrink-0" />}
              {isInProgress && <ArrowRight   className="w-5 h-5 text-brand flex-shrink-0 animate-pulse" />}
              {isPending    && <Circle       className="w-5 h-5 text-muted-foreground flex-shrink-0" />}

              {/* Step label — line-through when completed */}
              <span className={`text-sm flex-1 ${
                isInProgress ? "font-medium text-foreground" :
                isCompleted  ? "text-muted-foreground line-through" :
                               "text-muted-foreground"
              }`}>
                {STEP_LABELS[step.id]}
              </span>

              {/* Accept button — only on completed steps with a loaded RFQ */}
              {isCompleted && rfqId && (
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-6 text-xs gap-1 transition-all duration-300 ${
                    isSaving
                      ? "border-neon-emerald text-neon-emerald bg-neon-emerald/10 animate-neon-pulse"
                      : ""
                  }`}
                  onClick={() => handleAccept(step)}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    /* Futuristic neon spinner while saving snapshot to DB */
                    <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
                  ) : (
                    <><span className="text-[10px]">✓</span> Accept</>
                  )}
                </Button>
              )}

              {/* In-progress badge */}
              {isInProgress && (
                <span className="text-xs bg-brand text-brand-foreground px-2 py-0.5 rounded-full">
                  In Progress
                </span>
              )}
            </div>
          );
        }) : (
          /* Static placeholder when no RFQ is loaded */
          PLACEHOLDER_LABELS.map((label) => (
            <div key={label} className="flex items-center gap-3 p-2 rounded-lg">
              <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground">{label}</span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Est. completion: 2-3 hours</span>
        </div>
      </div>
    </div>
  );
}
