// app/(app)/workspace/[rfq_reference]/page.tsx
// =============================================
// Workspace Page — Mission Control workboard
// =============================================
// Dynamic route for editing a specific RFQ.
// URL: /workspace/[rfq_reference]
// Providers wrap both the header AND the layout so
// WorkflowStepper (header) and WorkboardLayout (body)
// share the same PreviewContext and WorkflowContext.

"use client";

import { use } from "react";
import { DollarSign, Undo2, Redo2 } from "lucide-react";
import { WorkboardLayout, useWorkboard, WorkflowStepper } from "@/components/app/workboard";
import { RFQProvider } from "@/hooks/rfq-context";
import { PreviewProvider, usePreview } from "@/hooks/preview-context";
import { WorkflowProvider } from "@/hooks/workflow-context";
import { Button } from "@/components/ui/button";

// =============================================
// Types
// =============================================

interface WorkspacePageProps {
  params: Promise<{ rfq_reference: string }>;
}

// =============================================
// Workspace Header
// =============================================
// Rendered inside PreviewProvider + WorkflowProvider so it can
// consume both contexts (WorkflowStepper + undo/redo).

function WorkspaceHeader({ rfqReference }: { rfqReference: string }) {
  const { pricingOpen, togglePricing } = useWorkboard();
  const { state: previewState, actions: previewActions } = usePreview();

  const canUndo = previewState.history.length > 0;
  const canRedo  = previewState.future.length > 0;

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-rule-strong flex-shrink-0 bg-paper">
      {/* Left: breadcrumb overline + RFQ title + workflow stepper */}
      <div className="flex flex-col gap-1 min-w-0">
        <span className="micro-label text-graphite">VORTICURA · OPS · WORKSPACE</span>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Smaller title than before (was text-[2rem]) */}
          <h1 className="font-data text-ink text-xl tabular-nums tracking-[0.02em] whitespace-nowrap">
            {rfqReference}
          </h1>
          {/* Horizontal step progress — reads from WorkflowContext */}
          <WorkflowStepper />
        </div>
      </div>

      {/* Right: undo/redo + pricing toggle — the only controls remaining */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Undo — acts on the document preview state */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => previewActions.undo()}
          disabled={!canUndo}
          title="Undo"
          aria-label="Undo"
        >
          <Undo2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </Button>

        {/* Redo */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => previewActions.redo()}
          disabled={!canRedo}
          title="Redo"
          aria-label="Redo"
        >
          <Redo2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </Button>

        {/* Hairline separator */}
        <div className="h-5 w-px bg-rule mx-1" aria-hidden="true" />

        {/* Pricing panel toggle — only panel control in the header */}
        <Button
          variant={pricingOpen ? "default" : "outline"}
          size="sm"
          onClick={togglePricing}
          className="gap-1.5"
          aria-label={pricingOpen ? "Close Pricing panel" : "Open Pricing panel"}
        >
          <DollarSign className="w-3.5 h-3.5" strokeWidth={1.5} />
          {pricingOpen ? "Close Pricing" : "Pricing"}
        </Button>
      </div>
    </div>
  );
}

// =============================================
// Page Component
// =============================================

export default function WorkspacePage({ params }: WorkspacePageProps) {
  // Unwrap async params; decode URL-encoded slashes/spaces
  const { rfq_reference } = use(params);
  const rfqReference = decodeURIComponent(rfq_reference);

  return (
    <RFQProvider rfqReference={rfqReference}>
      <PreviewProvider>
        <WorkflowProvider>
          {/*
            -m-6 counteracts the global p-6 wrapper in AppLayoutContent so
            the workboard fills edge-to-edge.
            h-[calc(100vh-64px)]: 64px = topbar height (h-16).
          */}
          <div className="-m-6 flex flex-col h-[calc(100vh-64px)]">
            {/* Workspace header with title, stepper, undo/redo, pricing toggle */}
            <WorkspaceHeader rfqReference={rfqReference} />

            {/* Main workboard — preview left, right column (AI+pricing) optional */}
            <div className="flex-1 min-h-0">
              <WorkboardLayout className="h-full" />
            </div>
          </div>
        </WorkflowProvider>
      </PreviewProvider>
    </RFQProvider>
  );
}
