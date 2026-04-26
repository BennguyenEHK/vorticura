// =============================================
// Workspace Page — Mission Control workboard
// =============================================
// Dynamic route for editing a specific RFQ by its rfq_reference (from email).
// URL: /workspace/[rfq_reference]  (e.g. /workspace/RFQ%20PK%2022501)
// Hosts the resizable WorkboardGrid plus the workspace header with panel toggles.

"use client";

import { use } from "react";
import { Lock, Unlock, RotateCcw, GitBranch, DollarSign, FileText } from "lucide-react";
import { WorkboardGrid, useWorkboard } from "@/components/app/workboard";
import { RFQProvider } from "@/hooks/rfq-context";
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

/** Panel toggle config — drives the icon buttons in the workspace header */
const PANEL_TOGGLES = [
  { id: "workflow", icon: GitBranch,  label: "Workflow" },
  { id: "pricing",  icon: DollarSign, label: "Pricing"  },
  { id: "preview",  icon: FileText,   label: "Preview"  },
] as const;

// =============================================
// Workspace Header Component
// =============================================

/**
 * WorkspaceHeader — Mission Control workspace header.
 * Pairs an editorial title block with a row of instrument controls
 * (panel toggles, reset, lock/unlock) on the right.
 */
function WorkspaceHeader({ rfqReference }: { rfqReference: string }) {
  const { isLocked, setLocked, resetLayout, togglePanelVisibility, isPanelVisible } = useWorkboard();

  return (
    <div className="flex items-end justify-between gap-6 flex-wrap mb-6">
      {/* ===== Editorial title block ===== */}
      <div>
        {/* Mono overline — workspace identifier */}
        <div className="flex items-center gap-3 mb-3">
          <span className="micro-label text-graphite">VORTICURA · OPS</span>
          <span className="h-px w-8 bg-rule-strong" aria-hidden="true" />
          <span className="micro-label text-graphite">WORKSPACE</span>
        </div>

        {/* Serif display headline — RFQ reference reads as a mono inset */}
        <h1 className="font-display text-ink text-[2rem] leading-[1.05] tracking-[-0.015em]">
          <span className="font-data text-ink tabular-nums tracking-[0.02em]">
            {rfqReference}
          </span>
        </h1>

        {/* Body description */}
        <p className="font-body mt-2 text-graphite text-sm leading-[1.55]">
          Drag panel edges to resize, drag headers to reposition.
        </p>
      </div>

      {/* ===== Instrument controls ===== */}
      <div className="flex items-center gap-2">
        {/* Panel toggle row — compact instrument squares (rounded-sm = 6px) */}
        {PANEL_TOGGLES.map(({ id, icon: Icon, label }) => {
          const isVisible = isPanelVisible(id);
          return (
            <Button
              key={id}
              variant={isVisible ? "default" : "outline"}
              size="icon"
              onClick={() => togglePanelVisibility(id)}
              aria-label={`${isVisible ? "Hide" : "Show"} ${label} panel`}
              title={`${isVisible ? "Hide" : "Show"} ${label}`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          );
        })}

        {/* Vertical hairline separator */}
        <div className="h-6 w-px bg-rule mx-1" />

        {/* Reset layout */}
        <Button variant="outline" size="sm" onClick={resetLayout} className="gap-2">
          <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
          Reset
        </Button>

        {/* Lock / Unlock — primary when locked, outline when free */}
        <Button
          variant={isLocked ? "default" : "outline"}
          size="sm"
          onClick={() => setLocked(!isLocked)}
          className="gap-2"
        >
          {isLocked ? (
            <>
              <Lock className="w-4 h-4" strokeWidth={1.5} />
              Locked
            </>
          ) : (
            <>
              <Unlock className="w-4 h-4" strokeWidth={1.5} />
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
 * WorkspacePage — Mission Control workboard for a single RFQ.
 * Wraps everything in the warm paper background so panels (vellum) sit on it
 * with the same paper-vs-vellum contrast used elsewhere.
 */
export default function WorkspacePage({ params }: WorkspacePageProps) {
  // Unwrap async params; decode encoded slashes/spaces in rfq_reference
  const { rfq_reference } = use(params);
  const rfqReference = decodeURIComponent(rfq_reference);

  return (
    <RFQProvider rfqReference={rfqReference}>
      {/* Layout owns the paper background; this wrapper just stacks header + grid. */}
      <div>
        {/* Workspace header */}
        <WorkspaceHeader rfqReference={rfqReference} />

        {/* Resizable panel grid */}
        <WorkboardGrid className="min-h-[calc(100vh-200px)]" />
      </div>
    </RFQProvider>
  );
}
