"use client";

// =============================================
// Workflow Panel Content
// =============================================
// Content component for the workflow tracker panel
// Shows RFQ processing stages and progress

import { CheckCircle2, Circle, ArrowRight, Clock } from "lucide-react";

// =============================================
// Mock Data
// =============================================

// Workflow stages for RFQ processing
const workflowStages = [
  { id: "received", label: "RFQ Received", status: "completed" },
  { id: "ai-analysis", label: "AI Analysis", status: "completed" },
  { id: "supplier-search", label: "Supplier Search", status: "current" },
  { id: "send-rfq", label: "Send to Suppliers", status: "pending" },
  { id: "await-response", label: "Await Response", status: "pending" },
  { id: "receive-quotes", label: "Receive Quotations", status: "pending" },
  { id: "customer-quote", label: "Customer Quotation", status: "pending" },
];

// =============================================
// Content Component
// =============================================

interface WorkflowPanelContentProps {
  className?: string;
}

/**
 * WorkflowPanelContent - Workflow tracker content
 * Shows: current stage, completed stages, pending stages
 */
export function WorkflowPanelContent({
  className = "",
}: WorkflowPanelContentProps) {
  return (
    <div className={`p-4 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">Current Stage</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Track RFQ processing progress
        </p>
      </div>

      {/* Stage list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {workflowStages.map((stage, index) => (
          <div
            key={stage.id}
            className={`
              flex items-center gap-3 p-2 rounded-lg
              ${stage.status === "current" ? "bg-brand/10" : ""}
              ${stage.status === "completed" ? "opacity-70" : ""}
            `}
          >
            {/* Status icon */}
            {stage.status === "completed" ? (
              <CheckCircle2 className="w-5 h-5 text-status-complete-foreground flex-shrink-0" />
            ) : stage.status === "current" ? (
              <ArrowRight className="w-5 h-5 text-brand flex-shrink-0 animate-pulse" />
            ) : (
              <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            )}

            {/* Stage label */}
            <span
              className={`
                text-sm flex-1
                ${stage.status === "current" ? "font-medium text-foreground" : ""}
                ${stage.status === "completed" ? "text-muted-foreground line-through" : ""}
                ${stage.status === "pending" ? "text-muted-foreground" : ""}
              `}
            >
              {stage.label}
            </span>

            {/* Status badge for current */}
            {stage.status === "current" && (
              <span className="text-xs bg-brand text-brand-foreground px-2 py-0.5 rounded-full">
                In Progress
              </span>
            )}
          </div>
        ))}
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
