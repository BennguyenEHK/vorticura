"use client";

// =============================================
// WorkboardLayout — main CSS flex shell
// =============================================
// Replaces react-grid-layout entirely.
// Horizontal flex: preview pane (left) + right column (optional).
// PreviewProvider and WorkflowProvider are provided by the workspace
// page so the header's WorkflowStepper shares the same context.

import { useCallback, useRef } from "react";
import { useWorkboard } from "./workboard-provider";
import { useAIChat } from "@/components/app/ai-chat/ai-chat-provider";
import { ResizeHandle } from "./resize-handle";
import { RightColumn } from "./right-column";
import { PreviewPanelContent } from "./panels/preview-panel-content";
import { WorkspacePreviewHydrator } from "./workspace-preview-hydrator";

interface WorkboardLayoutProps {
  className?: string;
}

export function WorkboardLayout({ className = "" }: WorkboardLayoutProps) {
  const { pricingOpen, previewWidthPercent, setPreviewWidth } = useWorkboard();
  const { state: aiChat } = useAIChat();
  const containerRef = useRef<HTMLDivElement>(null);

  // Right column is visible when either pricing or AI chat is open
  const rightColumnOpen = pricingOpen || aiChat.isOpen;

  // Convert pixel drag delta to percentage of container width
  const handleHorizontalResize = useCallback(
    (deltaPx: number) => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const deltaPct = (deltaPx / containerWidth) * 100;
      setPreviewWidth((prev) => prev + deltaPct);
    },
    [setPreviewWidth]
  );

  return (
    <>
      {/* Seeds WorkflowContext + PreviewContext with DB data on mount */}
      <WorkspacePreviewHydrator />

      {/* Dot-matrix ambient background via .workboard-grid utility class */}
      <div
        ref={containerRef}
        className={`workboard-grid flex overflow-hidden ${className}`}
      >
        {/* Preview pane — left side, expands to full width when right column is closed */}
        <div
          style={{ width: rightColumnOpen ? `${previewWidthPercent}%` : "100%" }}
          className="flex flex-col overflow-hidden min-w-0 transition-[width] duration-200 ease-out"
        >
          <PreviewPanelContent />
        </div>

        {/* Horizontal resize handle — only visible when right column is open */}
        {rightColumnOpen && (
          <ResizeHandle
            direction="horizontal"
            onResize={handleHorizontalResize}
          />
        )}

        {/* Right column — AI chat + pricing vertical stack */}
        {rightColumnOpen && (
          <div
            style={{ width: `${100 - previewWidthPercent}%` }}
            className="flex flex-col min-w-0 overflow-hidden"
          >
            <RightColumn />
          </div>
        )}
      </div>
    </>
  );
}
