"use client";

// =============================================
// Workboard Grid (react-grid-layout + Auto-Fill)
// =============================================
// Main grid layout component using react-grid-layout
// Enables drag-to-resize, drag-to-reposition with custom auto-fill
// Migrated back from Gridstack to fix race conditions (see Grid.md)

import { useMemo, useCallback, useRef, useEffect } from "react";
import { useContainerWidth, GridLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useWorkboard } from "./workboard-provider";
import { WorkboardPanel } from "./workboard-panel";
import { WorkboardDropZone } from "./workboard-drop-zone";
import { DEFAULT_GRID_CONFIG, type LayoutItem } from "@/types/workboard";
import { compactAndFill } from "@/lib/utils/grid-layout";

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
 *
 * Features:
 * - Drag edges to resize panels
 * - Drag headers to reposition panels
 * - Drop zone for AI Chat FAB
 * - Custom auto-fill to expand panels into empty gaps
 * - React-native implementation (no sync issues like Gridstack)
 */
export function WorkboardGrid({ className = "" }: WorkboardGridProps) {
  // Use built-in hook for container width measurement
  const { width, containerRef, mounted } = useContainerWidth();

  // Track if this is the initial render to skip auto-fill
  const isInitialRenderRef = useRef(true);

  // Track previous panel count for detecting additions/removals
  const prevPanelCountRef = useRef<number>(0);

  // Get workboard state and actions from context
  const { layout, panels, isLocked, updateLayout, setActivePanel } =
    useWorkboard();

  // =============================================
  // Auto-Fill Effect
  // =============================================

  /**
   * Apply auto-fill when panels are removed
   * This fills horizontal gaps left by removed panels
   */
  useEffect(() => {
    // Skip on initial render
    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false;
      prevPanelCountRef.current = panels.length;
      return;
    }

    // Detect if a panel was removed (count decreased)
    const panelRemoved = panels.length < prevPanelCountRef.current;
    prevPanelCountRef.current = panels.length;

    // Run auto-fill when a panel is removed
    if (panelRemoved && layout.length > 0) {
      const filledLayout = compactAndFill(layout, DEFAULT_GRID_CONFIG.cols);

      // Only update if layout actually changed
      const hasChanged = filledLayout.some((item) => {
        const orig = layout.find((l) => l.i === item.i);
        return orig && (orig.w !== item.w || orig.x !== item.x);
      });

      if (hasChanged) {
        updateLayout(filledLayout);
      }
    }
  }, [panels.length, layout, updateLayout]);

  // =============================================
  // Layout Change Handler
  // =============================================

  /**
   * Handle layout change from react-grid-layout
   * Called when user drags or resizes panels
   */
  const handleLayoutChange = useCallback(
    (newLayout: LayoutItem[]) => {
      // Update state with new layout
      updateLayout(newLayout);
    },
    [updateLayout]
  );

  // =============================================
  // Panel Content Resolver
  // =============================================

  /**
   * Get content component for panel type
   * Maps panel.type to the corresponding React component
   */
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
            <div className="flex h-full items-center justify-center p-4 text-muted-foreground">
              Unknown panel type: {panel.type}
            </div>
          );
      }
    },
    [panels]
  );

  // =============================================
  // Memoized Layout for Grid
  // =============================================

  /**
   * Prepare layout items with lock state applied
   * Converts our LayoutItem format to react-grid-layout format
   */
  const gridLayout = useMemo(
    () =>
      layout.map((item) => ({
        ...item,
        static: isLocked, // Lock all panels when layout is locked
      })),
    [layout, isLocked]
  );

  // =============================================
  // Render
  // =============================================

  return (
    <WorkboardDropZone className={className}>
      {/* Container div with ref for width measurement */}
      <div ref={containerRef} className="w-full">
        {/* Only render grid when mounted and width is available */}
        {mounted && width > 0 && (
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
