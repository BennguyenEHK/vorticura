"use client";

// =============================================
// WorkflowStepper — compact horizontal progress
// =============================================
// Reads live steps from WorkflowContext.
// Shows placeholder dots when no RFQ is loaded.

import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { useWorkflow } from "@/hooks/workflow-context";
import type { WorkflowStepId } from "@/types/workflow";

const STEP_LABELS: Record<WorkflowStepId, string> = {
  analysis:        "Analysis",
  email:           "Email",
  supplier_search: "Suppliers",
  quotation:       "Quotation",
  pricing:         "Pricing",
};

const STEP_ORDER: WorkflowStepId[] = [
  "analysis",
  "email",
  "supplier_search",
  "quotation",
  "pricing",
];

/** Horizontal step progress strip for the workspace header */
export function WorkflowStepper() {
  const { steps } = useWorkflow();

  // Placeholder when no RFQ is loaded yet
  if (steps.length === 0) {
    return (
      <div className="flex items-center gap-0.5" aria-label="Workflow progress">
        {STEP_ORDER.map((id, idx) => (
          <span key={id} className="flex items-center gap-0.5">
            <span className="flex items-center gap-1.5">
              <Circle className="w-3.5 h-3.5 text-graphite/30" strokeWidth={1.5} />
              <span className="hidden lg:inline micro-label text-graphite/30">
                {STEP_LABELS[id]}
              </span>
            </span>
            {idx < STEP_ORDER.length - 1 && (
              <span className="w-5 h-px bg-rule mx-1 hidden sm:block" aria-hidden="true" />
            )}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5" aria-label="Workflow progress">
      {steps.map((step, idx) => {
        const isCompleted  = step.status === "completed";
        const isInProgress = step.status === "in_progress";

        return (
          <span key={step.id} className="flex items-center gap-0.5">
            <span
              className={`flex items-center gap-1.5 ${
                isInProgress
                  ? "text-brand"
                  : isCompleted
                  ? "text-status-complete-foreground"
                  : "text-graphite/40"
              }`}
            >
              {isCompleted && (
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              {isInProgress && (
                <ArrowRight className="w-3.5 h-3.5 animate-pulse" strokeWidth={1.5} />
              )}
              {!isCompleted && !isInProgress && (
                <Circle className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              <span className="hidden lg:inline micro-label">
                {STEP_LABELS[step.id]}
              </span>
            </span>

            {idx < steps.length - 1 && (
              <span
                className={`w-5 h-px mx-1 hidden sm:block ${
                  isCompleted ? "bg-status-complete-foreground/40" : "bg-rule"
                }`}
                aria-hidden="true"
              />
            )}
          </span>
        );
      })}
    </div>
  );
}
