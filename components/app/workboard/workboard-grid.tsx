"use client";

// =============================================
// Workboard Grid
// =============================================
// Main grid layout component using react-grid-layout
// Enables drag-to-resize and drag-to-reposition panels

import { useMemo, useCallback, useRef } from "react";
import { GridLayout, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useWorkboard } from "./workboard-provider";
import { WorkboardPanel } from "./workboard-panel";
import { WorkboardDropZone } from "./workboard-drop-zone";
import { DEFAULT_GRID_CONFIG } from "@/types/workboard";
import type { LayoutItem } from "@/types/workboard";

// Panel content components
import { WorkflowPanelContent } from "./panels/workflow-panel-content";
import { PricingPanelContent } from "./panels/pricing-panel-content";
import { PreviewPanelContent } from "./panels/preview-panel-content";
import { AIChatPanel } from "../ai-chat/ai-chat-panel";

// =============================================
// Grid Component
// =============================================

interface WorkboardGridProps {
  className?: string;
}

/**
 * WorkboardGrid - Main grid layout for workboard panels
 * Features:
 * - Drag edges to resize panels
 * - Drag headers to reposition panels
 * - Drop zone for AI Chat FAB
 * - Auto-packing of panels
 */
export function WorkboardGrid({ className = "" }: WorkboardGridProps) {
  // Container ref for width measurement
  const containerRef = useRef<HTMLDivElement>(null);

  // Get container width using react-grid-layout hook
  const { width } = useContainerWidth({ ref: containerRef });

  // Get workboard state and actions from context
  const { layout, panels, isLocked, updateLayout, setActivePanel } =
    useWorkboard();

  // Handle layout change from react-grid-layout
  const handleLayoutChange = useCallback(
    (newLayout: LayoutItem[]) => {
      updateLayout(newLayout);
    },
    [updateLayout]
  );

  // Get content component for panel type
  const getPanelContent = useCallback(
    (panelId: string) => {
      const panel = panels.find((p) => p.id === panelId);
      if (!panel) return null;

      switch (panel.type) {
        case "chat":
          return <AIChatPanel />;
        case "workflow":
          return <WorkflowPanelContent />;
        case "pricing":
          return <PricingPanelContent />;
        case "preview":
          return <PreviewPanelContent />;
        default:
          return (
            <div className="p-4 text-muted-foreground">
              Unknown panel type: {panel.type}
            </div>
          );
      }
    },
    [panels]
  );

  // Memoize layout for performance
  const gridLayout = useMemo(
    () =>
      layout.map((item) => ({
        ...item,
        static: isLocked, // Lock all panels when layout is locked
      })),
    [layout, isLocked]
  );

  return (
    <WorkboardDropZone className={className}>
      {/* Container div for width measurement */}
      <div ref={containerRef} className="w-full">
        {/* Only render grid when width is available */}
        {width > 0 && (
          <GridLayout
            className="workboard-grid"
            layout={gridLayout}
            width={width}
            cols={DEFAULT_GRID_CONFIG.cols}
            rowHeight={DEFAULT_GRID_CONFIG.rowHeight}
            margin={DEFAULT_GRID_CONFIG.margin}
            containerPadding={DEFAULT_GRID_CONFIG.containerPadding}
            isDraggable={!isLocked && DEFAULT_GRID_CONFIG.isDraggable}
            isResizable={!isLocked && DEFAULT_GRID_CONFIG.isResizable}
            draggableHandle={DEFAULT_GRID_CONFIG.draggableHandle}
            resizeHandles={DEFAULT_GRID_CONFIG.resizeHandles}
            compactType={DEFAULT_GRID_CONFIG.compactType}
            preventCollision={DEFAULT_GRID_CONFIG.preventCollision}
            onLayoutChange={handleLayoutChange}
            useCSSTransforms={true}
          >
            {/* Render each panel */}
            {panels.map((panel) => (
              <div
                key={panel.id}
                onClick={() => setActivePanel(panel.id)}
                className="h-full"
              >
                <WorkboardPanel
                  id={panel.id}
                  title={panel.title}
                  icon={panel.icon}
                  isMinimized={panel.isMinimized}
                  isClosable={panel.isClosable}
                >
                  {getPanelContent(panel.id)}
                </WorkboardPanel>
              </div>
            ))}
          </GridLayout>
        )}
      </div>
    </WorkboardDropZone>
  );
}
