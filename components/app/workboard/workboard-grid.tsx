"use client";

// =============================================
// Workboard Grid (Gridstack.js)
// =============================================
// Main grid layout component using Gridstack.js
// Enables drag-to-resize, drag-to-reposition, and auto-fill

import { useEffect, useRef, useCallback } from "react";
import { GridStack, GridStackNode } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import "gridstack/dist/gridstack-extra.min.css";
import { useWorkboard } from "./workboard-provider";
import { WorkboardPanel } from "./workboard-panel";
import { WorkboardDropZone } from "./workboard-drop-zone";

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
 * - Auto-fill available space
 */
export function WorkboardGrid({ className = "" }: WorkboardGridProps) {
  // Refs
  const gridRef = useRef<HTMLDivElement>(null);
  const gridInstanceRef = useRef<GridStack | null>(null);
  const isInitializedRef = useRef(false);

  // Get workboard state and actions from context
  const { layout, panels, isLocked, updateLayout, setActivePanel } =
    useWorkboard();

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

  // Initialize Gridstack
  useEffect(() => {
    if (!gridRef.current || isInitializedRef.current) return;

    // Initialize Gridstack with options
    const grid = GridStack.init(
      {
        column: 12,
        cellHeight: 100,
        margin: 8,
        float: false,
        animate: true,
        draggable: {
          handle: ".panel-drag-handle",
        },
        resizable: {
          handles: "e, se, s, sw, w",
        },
        staticGrid: isLocked,
      },
      gridRef.current
    );

    gridInstanceRef.current = grid;
    isInitializedRef.current = true;

    // Handle layout changes
    grid.on("change", (_event: Event, items: GridStackNode[]) => {
      if (items && items.length > 0) {
        const newLayout = items.map((item) => ({
          i: item.id || "",
          x: item.x || 0,
          y: item.y || 0,
          w: item.w || 1,
          h: item.h || 1,
          minW: item.minW,
          minH: item.minH,
        }));
        updateLayout(newLayout);
      }
    });

    return () => {
      if (gridInstanceRef.current) {
        gridInstanceRef.current.destroy(false);
        gridInstanceRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, []);

  // Update static/locked state
  useEffect(() => {
    if (gridInstanceRef.current) {
      gridInstanceRef.current.setStatic(isLocked);
    }
  }, [isLocked]);

  // Convert layout to Gridstack format
  const getGridstackItems = () => {
    return panels.map((panel) => {
      const layoutItem = layout.find((l) => l.i === panel.id);
      return {
        id: panel.id,
        x: layoutItem?.x ?? 0,
        y: layoutItem?.y ?? 0,
        w: layoutItem?.w ?? 6,
        h: layoutItem?.h ?? 3,
        minW: layoutItem?.minW ?? 2,
        minH: layoutItem?.minH ?? 1,
        panel,
      };
    });
  };

  const items = getGridstackItems();

  return (
    <WorkboardDropZone className={className}>
      <div
        ref={gridRef}
        className="grid-stack w-full"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="grid-stack-item"
            gs-id={item.id}
            gs-x={item.x}
            gs-y={item.y}
            gs-w={item.w}
            gs-h={item.h}
            gs-min-w={item.minW}
            gs-min-h={item.minH}
            onClick={() => setActivePanel(item.id)}
          >
            <div className="grid-stack-item-content h-full">
              <WorkboardPanel
                id={item.panel.id}
                title={item.panel.title}
                icon={item.panel.icon}
                isMinimized={item.panel.isMinimized}
                isClosable={item.panel.isClosable}
              >
                {getPanelContent(item.id)}
              </WorkboardPanel>
            </div>
          </div>
        ))}
      </div>
    </WorkboardDropZone>
  );
}
