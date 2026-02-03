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
  resolveOverlapSwap,
  areLayoutsEqual
} from "@/lib/utils/generators/grid-layout";

// =============================================
// Helper: Convert readonly Layout to mutable LayoutItem[]
// =============================================
// react-grid-layout v2 uses readonly Layout type, but our functions
// need mutable arrays. This helper safely converts between them.
const toMutableLayout = (layout: Layout): LayoutItem[] => {
  console.log('[toMutableLayout] Converting readonly Layout to mutable LayoutItem[]');
  console.log('[toMutableLayout] Input layout items:', layout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
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

  // Track if we just finished a drag (to skip onLayoutChange after handleDragStop)
  const justFinishedDragRef = useRef(false);

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
      console.log('='.repeat(60));
      console.log('[DRAG_START] 🚀 User started dragging a panel');
      console.log('[DRAG_START] Panel being dragged:', oldItem?.i);
      console.log('[DRAG_START] Panel original position:', oldItem ? { x: oldItem.x, y: oldItem.y, w: oldItem.w, h: oldItem.h } : null);

      // Store current layout before drag begins (convert to mutable)
      preDragLayoutRef.current = layout.map(item => ({ ...item }));
      console.log('[DRAG_START] 📸 Snapshot saved to preDragLayoutRef:');
      console.log('[DRAG_START] preDragLayoutRef.current:', preDragLayoutRef.current.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));

      // Track which panel is being dragged
      draggedPanelIdRef.current = oldItem?.i ?? null;
      console.log('[DRAG_START] draggedPanelIdRef set to:', draggedPanelIdRef.current);

      setIsDragging(true);
      console.log('[DRAG_START] isDragging set to: true');
      console.log('='.repeat(60));
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
      console.log('='.repeat(60));
      console.log('[DRAG_STOP] 🛑 User released the panel (drag ended)');
      console.log('[DRAG_STOP] newLayout from RGL:', newLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));

      // Mark that we just finished drag - prevents handleLayoutChange from firing
      justFinishedDragRef.current = true;
      console.log('[DRAG_STOP] justFinishedDragRef set to: true (to prevent infinite loop)');

      // Convert readonly Layout to mutable LayoutItem[]
      console.log('[DRAG_STOP] Converting newLayout to mutable...');
      const mutableLayout = toMutableLayout(newLayout);
      console.log('[DRAG_STOP] mutableLayout created:', mutableLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));

      // Get the dragged panel ID
      const draggedId = draggedPanelIdRef.current;
      console.log('[DRAG_STOP] draggedId retrieved:', draggedId);

      draggedPanelIdRef.current = null; // Reset for next drag
      console.log('[DRAG_STOP] draggedPanelIdRef reset to: null');

      if (draggedId) {
        console.log('[DRAG_STOP] 🔄 Calling resolveOverlapSwap()...');
        console.log('[DRAG_STOP] Arguments: draggedId =', draggedId);
        console.log('[DRAG_STOP] Arguments: preDragLayoutRef (old) =', preDragLayoutRef.current.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
        console.log('[DRAG_STOP] Arguments: mutableLayout (new) =', mutableLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));

        // Resolve any overlaps by swapping positions
        const resolvedLayout = resolveOverlapSwap(
          draggedId,
          preDragLayoutRef.current,
          mutableLayout
        );
        console.log('[DRAG_STOP] ✅ resolvedLayout returned:', resolvedLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
        console.log('[DRAG_STOP] Calling updateLayout() with resolved layout...');
        updateLayout(resolvedLayout);
        console.log('[DRAG_STOP] updateLayout() called successfully');
      } else {
        // Fallback: no dragged panel ID, use layout as-is
        console.log('[DRAG_STOP] ⚠️ No draggedId found, using layout as-is');
        updateLayout(mutableLayout);
      }

      // Set isDragging to false AFTER updateLayout to prevent intermediate re-renders
      setIsDragging(false);
      console.log('[DRAG_STOP] isDragging set to: false (after updateLayout)');
      console.log('='.repeat(60));
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
      console.log('[LAYOUT_CHANGE] 📐 onLayoutChange fired from RGL');
      console.log('[LAYOUT_CHANGE] newLayout:', newLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
      console.log('[LAYOUT_CHANGE] Current state: isDragging =', isDragging, ', justFinishedDragRef =', justFinishedDragRef.current);

      // Skip if we just finished a drag - handleDragStop already updated layout
      // This prevents infinite loop: handleDragStop -> updateLayout -> onLayoutChange -> updateLayout...
      if (justFinishedDragRef.current) {
        console.log('[LAYOUT_CHANGE] 🚫 SKIPPING - justFinishedDragRef is true (preventing infinite loop)');
        // Defer reset to next frame to guard against multiple onLayoutChange calls per render cycle
        requestAnimationFrame(() => {
          console.log('[LAYOUT_CHANGE] Resetting justFinishedDragRef to false (next frame)');
          justFinishedDragRef.current = false;
        });
        return;
      }

      // Only update during non-drag operations (resize, etc.)
      // Drag operations are handled by handleDragStop for swap detection
      if (!isDragging) {
        // Convert readonly Layout to mutable LayoutItem[]
        const mutableNewLayout = toMutableLayout(newLayout);

        // Check if layout actually changed to prevent unnecessary updates
        if (areLayoutsEqual(layout, mutableNewLayout)) {
          console.log('[LAYOUT_CHANGE] 🚫 SKIPPING - layouts are equal (no change)');
          return;
        }

        console.log('[LAYOUT_CHANGE] ✅ Processing layout change (not dragging, not just finished drag)');
        console.log('[LAYOUT_CHANGE] Calling updateLayout() with new layout');
        updateLayout(mutableNewLayout);
      } else {
        console.log('[LAYOUT_CHANGE] 🚫 SKIPPING - currently dragging (isDragging = true)');
      }
    },
    [updateLayout, isDragging, layout]
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
    () => {
      console.log('[gridLayout] 🔄 useMemo recalculating gridLayout');
      console.log('[gridLayout] Input layout:', layout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
      console.log('[gridLayout] isLocked:', isLocked);
      const result = layout.map((item) => ({
        ...item,
        static: isLocked, // Lock all panels when layout is locked
      }));
      console.log('[gridLayout] Output gridLayout (with static applied):', result.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h, static: item.static })));
      return result;
    },
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
