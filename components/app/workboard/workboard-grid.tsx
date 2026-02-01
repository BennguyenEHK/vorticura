"use client";

// =============================================
// Workboard Grid (react-grid-layout + Overlap-Based Swap)
// =============================================
// Main grid layout component using react-grid-layout
// Features:
// - Drag-to-resize, drag-to-reposition
// - Custom auto-fill for horizontal gap filling
// - Overlap-based panel swap with size exchange
// Migrated back from Gridstack to fix race conditions (see Grid.md)
//
// Key approach: Uses allowOverlap=true to prevent RGL from pushing panels.
// When panels overlap after drag, we detect and resolve by swapping positions.

import { useMemo, useCallback, useRef, useEffect, useState } from "react";
// Use legacy API for flat props (cols, rowHeight, margin, etc.)
// The new v2 API uses config objects (gridConfig, dragConfig) but legacy supports flat props
import { ReactGridLayout } from "react-grid-layout/legacy";
import { useContainerWidth, type Layout, type LayoutItem as RGLLayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useWorkboard } from "./workboard-provider";
import { WorkboardPanel } from "./workboard-panel";
import { WorkboardDropZone } from "./workboard-drop-zone";
import { DEFAULT_GRID_CONFIG, type LayoutItem } from "@/types/workboard";
import {
  compactAndFill,
  resolveOverlapSwap
} from "@/lib/utils/grid-layout";

// =============================================
// Helper: Convert readonly Layout to mutable LayoutItem[]
// =============================================
// react-grid-layout v2 uses readonly Layout type, but our functions
// need mutable arrays. This helper safely converts between them.
const toMutableLayout = (layout: Layout): LayoutItem[] => {
  return layout.map(item => ({ ...item }));
};

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

  // Store pre-drag layout snapshot for swap detection
  const preDragLayoutRef = useRef<LayoutItem[]>([]);

  // Track which panel is being dragged (for overlap-based swap detection)
  const draggedPanelIdRef = useRef<string | null>(null);

  // Track if user is currently dragging (to capture pre-drag state)
  const [isDragging, setIsDragging] = useState(false);

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
  // Drag Event Handlers (Overlap-Based Swap Implementation)
  // =============================================
  // With allowOverlap=true, RGL doesn't push panels during drag.
  // We detect overlaps after drag and resolve by swapping positions.

  /**
   * Handle drag start - capture pre-drag layout and dragged panel ID
   * EventCallback signature: (layout, oldItem, newItem, placeholder, event, element?) => void
   */
  const handleDragStart = useCallback(
    (
      _layout: Layout,
      oldItem: RGLLayoutItem | null,
      _newItem: RGLLayoutItem | null,
      _placeholder: RGLLayoutItem | null,
      _event: Event,
      _element?: HTMLElement
    ) => {
      // Store current layout before drag begins (convert to mutable)
      preDragLayoutRef.current = layout.map(item => ({ ...item }));
      // Track which panel is being dragged
      draggedPanelIdRef.current = oldItem?.i ?? null;
      setIsDragging(true);
    },
    [layout]
  );

  /**
   * Handle drag stop - resolve overlaps by swapping positions
   * With allowOverlap=true, panels may overlap after drag.
   * We detect overlaps and resolve by moving overlapped panels to dragged panel's old position.
   */
  const handleDragStop = useCallback(
    (
      newLayout: Layout,
      _oldItem: RGLLayoutItem | null,
      _newItem: RGLLayoutItem | null,
      _placeholder: RGLLayoutItem | null,
      _event: Event,
      _element?: HTMLElement
    ) => {
      setIsDragging(false);

      // Convert readonly Layout to mutable LayoutItem[]
      const mutableLayout = toMutableLayout(newLayout);

      // Get the dragged panel ID
      const draggedId = draggedPanelIdRef.current;
      draggedPanelIdRef.current = null; // Reset for next drag

      if (draggedId) {
        // Resolve any overlaps by swapping positions
        const resolvedLayout = resolveOverlapSwap(
          draggedId,
          preDragLayoutRef.current,
          mutableLayout
        );
        updateLayout(resolvedLayout);
      } else {
        // Fallback: no dragged panel ID, use layout as-is
        updateLayout(mutableLayout);
      }
    },
    [updateLayout]
  );

  // =============================================
  // Layout Change Handler
  // =============================================

  /**
   * Handle layout change from react-grid-layout
   * Called continuously during drag/resize operations
   * Swap detection is done in handleDragStop for final positions
   */
  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      // Only update during non-drag operations (resize, etc.)
      // Drag operations are handled by handleDragStop for swap detection
      if (!isDragging) {
        // Convert readonly Layout to mutable LayoutItem[]
        updateLayout(toMutableLayout(newLayout));
      }
    },
    [updateLayout, isDragging]
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
      <div
        ref={containerRef}
        className="w-full"
      >
        {/* Only render grid when mounted and width is available */}
        {/* Using ReactGridLayout from legacy API for flat props support */}
        {mounted && width > 0 && (
          <ReactGridLayout
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
            allowOverlap={DEFAULT_GRID_CONFIG.allowOverlap}
            onLayoutChange={handleLayoutChange}
            onDragStart={handleDragStart}
            onDragStop={handleDragStop}
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
          </ReactGridLayout>
        )}
      </div>
    </WorkboardDropZone>
  );
}
