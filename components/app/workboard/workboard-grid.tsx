"use client";

// =============================================
// Workboard Grid (Gridstack.js)
// =============================================
// Main grid layout component using Gridstack.js
// Enables drag-to-resize, drag-to-reposition, and auto-fill
// Includes React-Gridstack synchronization for dynamic panels

import { useEffect, useRef, useCallback } from "react";
import { GridStack, GridStackNode } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { useWorkboard } from "./workboard-provider";
import { WorkboardPanel } from "./workboard-panel";
import { WorkboardDropZone } from "./workboard-drop-zone";
import { DEFAULT_GRID_CONFIG } from "@/types/workboard";

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
 * - React-Gridstack state synchronization
 */
export function WorkboardGrid({ className = "" }: WorkboardGridProps) {
  // =============================================
  // Refs for Gridstack instance management
  // =============================================
  const gridRef = useRef<HTMLDivElement>(null);
  const gridInstanceRef = useRef<GridStack | null>(null);
  const isInitializedRef = useRef(false);
  // Track previous panels to detect additions/removals
  const prevPanelsRef = useRef<string[]>([]);
  // Flag to prevent layout update loops during sync
  const isSyncingRef = useRef(false);
  // Track timeout ID for cleanup to prevent memory leaks
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get workboard state and actions from context
  const { layout, panels, isLocked, updateLayout, setActivePanel } =
    useWorkboard();

  // =============================================
  // Panel Content Resolver
  // =============================================

  /**
   * Get the content component for a panel type
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
            <div className="p-4 text-muted-foreground">
              Unknown panel type: {panel.type}
            </div>
          );
      }
    },
    [panels]
  );

  // =============================================
  // Initialize Gridstack (runs once on mount)
  // =============================================

  useEffect(() => {
    // Skip if already initialized or no container
    if (!gridRef.current || isInitializedRef.current) return;

    // Initialize Gridstack with centralized config from types/workboard.ts
    const grid = GridStack.init(
      {
        column: DEFAULT_GRID_CONFIG.column,           // 12-column grid
        cellHeight: DEFAULT_GRID_CONFIG.cellHeight,   // 100px per row unit
        margin: DEFAULT_GRID_CONFIG.margin,           // Gap between panels
        float: DEFAULT_GRID_CONFIG.float,             // Auto-pack panels
        animate: DEFAULT_GRID_CONFIG.animate,         // Smooth animations
        draggable: {
          handle: DEFAULT_GRID_CONFIG.draggableHandle, // Drag by header
        },
        resizable: {
          handles: DEFAULT_GRID_CONFIG.resizeHandles, // Resize from edges
        },
        staticGrid: isLocked,                         // Lock state from context
      },
      gridRef.current
    );

    // Store grid instance for later use
    gridInstanceRef.current = grid;
    isInitializedRef.current = true;
    // Initialize panel tracking
    prevPanelsRef.current = panels.map((p) => p.id);

    // =============================================
    // Handle Gridstack layout changes (user drag/resize)
    // =============================================
    grid.on("change", (_event: Event, items: GridStackNode[]) => {
      // Skip if we're syncing from React state (prevent loops)
      if (isSyncingRef.current) return;

      if (items && items.length > 0) {
        // Convert Gridstack format to our layout format
        const newLayout = items.map((item) => ({
          i: item.id || "",
          x: item.x || 0,
          y: item.y || 0,
          w: item.w || 1,
          h: item.h || 1,
          minW: item.minW,
          minH: item.minH,
        }));
        // Update React state with new positions
        updateLayout(newLayout);
      }
    });

    // Cleanup on unmount
    return () => {
      // Clear any pending timeout to prevent memory leaks
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      // Destroy Gridstack instance
      if (gridInstanceRef.current) {
        gridInstanceRef.current.destroy(false);
        gridInstanceRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, []); // Empty deps - only run once on mount

  // =============================================
  // Sync locked state with Gridstack
  // =============================================

  useEffect(() => {
    if (gridInstanceRef.current) {
      // Toggle static mode (disables drag/resize when locked)
      gridInstanceRef.current.setStatic(isLocked);
    }
  }, [isLocked]);

  // =============================================
  // CRITICAL: Unified sync effect for panels and layout
  // Combines panel registration and layout positioning
  // to avoid race conditions when adding new panels
  // =============================================

  useEffect(() => {
    const grid = gridInstanceRef.current;
    if (!grid || !isInitializedRef.current) return;

    // Get current panel IDs
    const currentPanelIds = panels.map((p) => p.id);
    const prevPanelIds = prevPanelsRef.current;

    // Find newly added panels
    const addedPanelIds = currentPanelIds.filter(
      (id) => !prevPanelIds.includes(id)
    );

    // Find removed panels
    const removedPanelIds = prevPanelIds.filter(
      (id) => !currentPanelIds.includes(id)
    );

    // Set flag to prevent change event loops
    isSyncingRef.current = true;

    // Start batch mode for performance (group all updates)
    grid.batchUpdate(true);

    // STEP 1: Register new panels FIRST (before layout update)
    // This ensures new panels exist in Gridstack before positioning
    addedPanelIds.forEach((panelId) => {
      const element = gridRef.current?.querySelector(
        `[gs-id="${panelId}"]`
      ) as HTMLElement;

      const layoutItem = layout.find((l) => l.i === panelId);

      if (element && layoutItem) {
        const existingItems = grid.getGridItems();
        const isAlreadyTracked = existingItems.some(
          (el) => el.getAttribute("gs-id") === panelId
        );

        if (!isAlreadyTracked) {
          // Register existing DOM element as Gridstack widget
          grid.makeWidget(element, {
            id: panelId,
            x: layoutItem.x,
            y: layoutItem.y,
            w: layoutItem.w,
            h: layoutItem.h,
            minW: layoutItem.minW ?? 2,
            minH: layoutItem.minH ?? 1,
          });
        }
      }
    });

    // STEP 2: Update ALL panel positions (now including newly registered ones)
    layout.forEach((item) => {
      const element = gridRef.current?.querySelector(
        `[gs-id="${item.i}"]`
      ) as HTMLElement;

      if (element) {
        grid.update(element, {
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
        });
      }
    });

    // STEP 3: Remove deleted panels
    removedPanelIds.forEach((panelId) => {
      const existingItems = grid.getGridItems();
      const elementToRemove = existingItems.find(
        (el) => el.getAttribute("gs-id") === panelId
      );

      if (elementToRemove) {
        grid.removeWidget(elementToRemove);
      }
    });

    // End batch mode and apply all updates
    grid.batchUpdate(false);

    // Update tracking ref for next comparison
    prevPanelsRef.current = currentPanelIds;

    // Clear sync flag after a tick
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(() => {
      isSyncingRef.current = false;
    }, 100);
  }, [panels, layout]);

  // =============================================
  // Prepare items for rendering
  // =============================================

  const getGridstackItems = () => {
    return panels.map((panel) => {
      // Find layout position for this panel
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

  // =============================================
  // Render
  // =============================================

  return (
    <WorkboardDropZone className={className}>
      {/* Gridstack container */}
      <div ref={gridRef} className="grid-stack w-full">
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
            {/* Gridstack item content wrapper */}
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
