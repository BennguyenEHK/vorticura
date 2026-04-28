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

import { useMemo, useCallback, useRef, useState } from "react";
// Use legacy API for flat props (cols, rowHeight, margin, etc.)
// The new v2 API uses config objects (gridConfig, dragConfig) but legacy supports flat props
import { ReactGridLayout } from "react-grid-layout/legacy";
import { useContainerWidth, type Layout, type LayoutItem as RGLLayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useWorkboard } from "./workboard-provider";
import { WorkboardPanel } from "./workboard-panel";
import { WorkboardDropZone } from "./workboard-drop-zone";
import { DEFAULT_GRID_CONFIG, type LayoutItem } from "@/types/workboard";
// Grid layout utilities (relocated from lib/utils/generators)
import {
  compactAndFill,
  resolveOverlapSwap,
  resolveOverlapPush,
  resolveOverlapPull,
  resolveOverlapPushRight,
  areLayoutsEqual,
  findAllOverlaps,
  detectChangeType
} from "./utils/grid-layout";

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
import { PreviewProvider } from "@/hooks/preview-context";
import { WorkflowProvider } from "@/hooks/workflow-context";
import { WorkspacePreviewHydrator } from "./workspace-preview-hydrator";

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

  // Unified interaction ref for both drag and resize operations
  const interactionRef = useRef<{
    type: 'drag' | 'resize' | null;
    panelId: string | null;
    preLayout: LayoutItem[];
  }>({ type: null, panelId: null, preLayout: [] });

  // Track if we just finished an interaction (to skip onLayoutChange)
  const justFinishedInteractionRef = useRef(false);

  // Track if user is currently dragging (to capture pre-drag state)
  const [isDragging, setIsDragging] = useState(false);

  // Get workboard state and actions from context
  const { layout, panels, isLocked, updateLayout, setActivePanel, skipOverlapResolutionRef } =
    useWorkboard();

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

      // Store interaction state
      interactionRef.current = {
        type: 'drag',
        panelId: oldItem?.i ?? null,
        preLayout: layout.map(item => ({ ...item }))
      };
      console.log('[DRAG_START] 📸 interactionRef set:', { type: 'drag', panelId: oldItem?.i });

      setIsDragging(true);
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
      console.log('[DRAG_STOP] 🛑 Drag ended');

      // Mark that we just finished - prevents handleLayoutChange from firing
      justFinishedInteractionRef.current = true;

      const mutableLayout = toMutableLayout(newLayout);
      const { panelId, preLayout } = interactionRef.current;

      // Reset interaction state
      interactionRef.current = { type: null, panelId: null, preLayout: [] };

      if (panelId) {
        console.log('[DRAG_STOP] 🔄 Calling resolveOverlapSwap() for panel:', panelId);
        const resolvedLayout = resolveOverlapSwap(panelId, preLayout, mutableLayout);
        updateLayout(resolvedLayout);
      } else {
        updateLayout(mutableLayout);
      }

      setIsDragging(false);
      console.log('='.repeat(60));
    },
    [updateLayout]
  );

  // =============================================
  // Resize Event Handlers (Push-Down Resolution)
  // =============================================

  /**
   * Handle resize start - capture pre-resize layout
   */
  const handleResizeStart = useCallback(
    (
      _layout: Layout,
      oldItem: RGLLayoutItem | null,
      _newItem: RGLLayoutItem | null,
      _placeholder: RGLLayoutItem | null,
      _event: Event,
      _element?: HTMLElement
    ) => {
      console.log('='.repeat(60));
      console.log('[RESIZE_START] 📐 User started resizing panel:', oldItem?.i);

      // Store interaction state
      interactionRef.current = {
        type: 'resize',
        panelId: oldItem?.i ?? null,
        preLayout: layout.map(item => ({ ...item }))
      };
      console.log('[RESIZE_START] 📸 interactionRef set:', { type: 'resize', panelId: oldItem?.i });
      console.log('='.repeat(60));
    },
    [layout]
  );

  /**
   * Handle resize stop - resolve overlaps with appropriate strategy based on resize direction
   * - H extend: Push panels down
   * - H shrink: Pull panels up to fill gap
   * - W extend: Push panels right
   * - W shrink: Fill horizontal gap (compactAndFill)
   */
  const handleResizeStop = useCallback(
    (
      newLayout: Layout,
      _oldItem: RGLLayoutItem | null,
      _newItem: RGLLayoutItem | null,
      _placeholder: RGLLayoutItem | null,
      _event: Event,
      _element?: HTMLElement
    ) => {
      console.log('='.repeat(60));
      console.log('[RESIZE_STOP] 📐 Resize ended');

      // Mark that we just finished - prevents handleLayoutChange from firing
      justFinishedInteractionRef.current = true;

      const mutableLayout = toMutableLayout(newLayout);
      const { panelId, preLayout } = interactionRef.current;

      // Reset interaction state
      interactionRef.current = { type: null, panelId: null, preLayout: [] };

      if (panelId) {
        const oldPanel = preLayout.find(p => p.i === panelId);
        const newPanel = mutableLayout.find(p => p.i === panelId);

        if (oldPanel && newPanel) {
          console.log('[RESIZE_STOP] Panel "%s" resize: w=%d→%d, h=%d→%d',
            panelId, oldPanel.w, newPanel.w, oldPanel.h, newPanel.h);

          // Determine which resolution strategy to use
          if (newPanel.w > oldPanel.w) {
            // W extended - push panels right
            console.log('[RESIZE_STOP] 📐 W EXTENDED - calling resolveOverlapPushRight()');
            const resolved = resolveOverlapPushRight(panelId, mutableLayout, DEFAULT_GRID_CONFIG.cols);
            updateLayout(resolved);
          } else if (newPanel.w < oldPanel.w) {
            // W shrunk - fill horizontal gap (exclude resized panel to prevent re-expansion)
            console.log('[RESIZE_STOP] 📐 W SHRUNK - calling compactAndFill() with excludeId:', panelId);
            const resolved = compactAndFill(mutableLayout, DEFAULT_GRID_CONFIG.cols, panelId);
            updateLayout(resolved);
          } else if (newPanel.h > oldPanel.h) {
            // H extended - push panels down
            console.log('[RESIZE_STOP] 📐 H EXTENDED - calling resolveOverlapPush()');
            const resolved = resolveOverlapPush(panelId, mutableLayout);
            updateLayout(resolved);
          } else if (newPanel.h < oldPanel.h) {
            // H shrunk - pull panels up
            console.log('[RESIZE_STOP] 📐 H SHRUNK - calling resolveOverlapPull()');
            const resolved = resolveOverlapPull(panelId, mutableLayout, preLayout);
            updateLayout(resolved);
          } else {
            // No size change (shouldn't happen, but handle gracefully)
            console.log('[RESIZE_STOP] 📐 No size change detected');
            updateLayout(mutableLayout);
          }
        } else {
          // Fallback to push if we can't find the panel
          console.log('[RESIZE_STOP] 📐 Fallback: calling resolveOverlapPush()');
          const resolvedLayout = resolveOverlapPush(panelId, mutableLayout);
          updateLayout(resolvedLayout);
        }
      } else {
        updateLayout(mutableLayout);
      }

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
   * Also auto-detects overlaps for non-drag/resize changes (e.g., panel toggled on)
   */
  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      console.log('[LAYOUT_CHANGE] 📐 onLayoutChange fired from RGL');

      // Skip if we just finished an interaction - stop handlers already updated layout
      if (justFinishedInteractionRef.current) {
        console.log('[LAYOUT_CHANGE] 🚫 SKIPPING - justFinishedInteractionRef is true');
        requestAnimationFrame(() => {
          justFinishedInteractionRef.current = false;
        });
        return;
      }

      // Skip overlap resolution after panel toggle-on (provider already resolved overlaps)
      if (skipOverlapResolutionRef.current) {
        console.log('[LAYOUT_CHANGE] 🚫 SKIPPING - skipOverlapResolutionRef is true (panel toggle)');
        skipOverlapResolutionRef.current = false;
        return;
      }

      // Skip during active drag (handled by handleDragStop)
      if (isDragging) {
        console.log('[LAYOUT_CHANGE] 🚫 SKIPPING - currently dragging');
        return;
      }

      // Skip during active resize (handled by handleResizeStop)
      if (interactionRef.current.type === 'resize') {
        console.log('[LAYOUT_CHANGE] 🚫 SKIPPING - currently resizing');
        return;
      }

      const mutableNewLayout = toMutableLayout(newLayout);

      // Check if layout actually changed
      if (areLayoutsEqual(layout, mutableNewLayout)) {
        console.log('[LAYOUT_CHANGE] 🚫 SKIPPING - layouts are equal');
        return;
      }

      // NEW: Check for any overlaps in the new layout (auto-detect)
      const overlaps = findAllOverlaps(mutableNewLayout);

      if (overlaps.length > 0) {
        console.log('[LAYOUT_CHANGE] ⚠️ OVERLAPS DETECTED:', overlaps);

        // Find which panel changed (e.g., newly toggled on)
        const { changedId } = detectChangeType(layout, mutableNewLayout);

        if (changedId) {
          console.log('[LAYOUT_CHANGE] 🔄 Resolving overlap by pushing panel:', changedId);
          const resolved = resolveOverlapPush(changedId, mutableNewLayout);
          updateLayout(resolved);
          return;
        }

        // If we can't identify the changed panel, try to resolve using first overlap pair
        const [panel1] = overlaps[0];
        console.log('[LAYOUT_CHANGE] 🔄 Resolving overlap by pushing first panel:', panel1);
        const resolved = resolveOverlapPush(panel1, mutableNewLayout);
        updateLayout(resolved);
        return;
      }

      console.log('[LAYOUT_CHANGE] ✅ Processing layout change (no overlaps)');
      updateLayout(mutableNewLayout);
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
    <PreviewProvider>
      <WorkflowProvider>
      <WorkspacePreviewHydrator />
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
            onResizeStart={handleResizeStart}
            onResizeStop={handleResizeStop}
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
      </WorkflowProvider>
    </PreviewProvider>
  );
}
