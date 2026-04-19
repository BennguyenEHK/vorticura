"use client";

// =============================================
// Workboard Provider
// =============================================
// Context provider for workboard layout state management
// Handles panel positions, sizes, and configurations

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type {
  WorkboardState,
  WorkboardContextType,
  LayoutItem,
  PanelConfig,
  PanelType,
  HiddenPanelInfo,
} from "@/types/workboard";
import {
  DEFAULT_PANELS,
  CHAT_PANEL_CONFIG,
  PANEL_SPAWN_CONFIGS, // Approach B: Dynamic spawn configs
} from "@/types/workboard";
// Grid layout utilities (relocated from lib/utils/generators)
import { findAllOverlaps, resolveOverlapShrinkWidth, compactAndFillAll } from "./utils/grid-layout";
// Server actions for UI reload persistence
import { uiReload, uiSaved } from "@/lib/actions/ui-reload-actions";
// RFQ context for accessing current RFQ ID in workspace
import { useRFQContext } from "@/hooks/rfq-context";

// =============================================
// Context
// =============================================

/** Workboard context with state and actions */
const WorkboardContext = createContext<WorkboardContextType | null>(null);

// =============================================
// Initial State Helper
// =============================================

/**
 * Build initial default layout from panel spawn configs
 * Used for first render before localStorage hydration
 * Returns 3-panel layout: preview (left), workflow + pricing (right)
 */
function buildInitialLayout(): LayoutItem[] {
  return [
    { i: "preview",  ...PANEL_SPAWN_CONFIGS.preview },  // Left side, largest
    { i: "workflow", ...PANEL_SPAWN_CONFIGS.workflow }, // Top right
    { i: "pricing",  ...PANEL_SPAWN_CONFIGS.pricing },  // Bottom right
  ];
}

// =============================================
// Initial State
// =============================================

const initialState: WorkboardState = {
  layout: buildInitialLayout(), // Build from spawn configs instead of hardcoded constant
  panels: DEFAULT_PANELS,
  isLocked: false,
  activePanel: null,
  breakpoint: "lg",
  isDraggingOver: false,
  hiddenPanels: new Map<string, HiddenPanelInfo>(), // Track hidden panels with their saved positions
  maximizedPanelId: null, // No panel is maximized by default
  savedGridHeight: null, // No stored grid height initially
  maximizedPanelOriginalLayout: null, // No stored original layout initially
};

// =============================================
// Provider Component
// =============================================

interface WorkboardProviderProps {
  children: ReactNode;
}

/**
 * WorkboardProvider - Context provider for workboard state
 * Manages: layout positions, panel configs, lock state, active panel
 * Uses RFQContext to detect workspace vs. dashboard context
 */
export function WorkboardProvider({ children }: WorkboardProviderProps) {
  // Initialize with default state (same on server and client to prevent hydration mismatch)
  const [state, setState] = useState<WorkboardState>(initialState);

  // Ref to skip overlap resolution in grid after panel toggle-on
  const skipOverlapResolutionRef = useRef(false);

  // Get current RFQ reference from context (available only in workspace pages)
  const rfqCtx = useRFQContext();
  const rfqReference = rfqCtx?.rfqReference; // string | undefined — undefined on dashboard/other pages

  // Hydrate state from uiReload DB (for workspace) or fallback to defaults
  // Client-side fetch after mount to prevent hydration mismatch
  useEffect(() => {
    const loadLayout = async () => {
      if (rfqReference) {
        // Workspace context: fetch layout from DB via uiReload (server resolves rfqId)
        try {
          const result = await uiReload('workspace', rfqReference);
          if (result.success && result.data && 'layoutPrefs' in result.data && result.data.layoutPrefs) {
            const layoutPrefs = result.data.layoutPrefs as Record<string, unknown>;

            // Parse layout preferences
            if (layoutPrefs.layout && layoutPrefs.panels) {
              const hiddenPanelsMap = new Map<string, HiddenPanelInfo>(
                (layoutPrefs.hiddenPanels as any[]) || []
              );

              // Update state with hydrated values from DB
              // eslint-disable-next-line react-hooks/set-state-in-effect
              setState((prev) => ({
                ...prev,
                layout: layoutPrefs.layout as LayoutItem[],
                panels: layoutPrefs.panels as PanelConfig[],
                hiddenPanels: hiddenPanelsMap,
                maximizedPanelId: (layoutPrefs.maximizedPanelId as string | null) || null,
                savedGridHeight: (layoutPrefs.savedGridHeight as number | null) || null,
                maximizedPanelOriginalLayout: (layoutPrefs.maximizedPanelOriginalLayout as LayoutItem | null) || null,
              }));
            }
          }
        } catch (err) {
          console.warn('Failed to load workspace layout from DB:', err);
          // Fall through to defaults
        }
      }
    };

    loadLayout();
  }, [rfqReference]);

  // =============================================
  // Actions
  // =============================================

  /** Update layout positions */
  const updateLayout = useCallback((layout: LayoutItem[]) => {
    console.log('[updateLayout] 📝 STATE UPDATE REQUESTED');
    console.log('[updateLayout] New layout to set:', layout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
    setState((prev) => {
      console.log('[updateLayout] Previous layout:', prev.layout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
      console.log('[updateLayout] ✅ Setting new layout state (this will trigger re-render)');
      return {
        ...prev,
        layout,
      };
    });
  }, []);

  /** Add a new panel (e.g., AI Chat when docked) - Approach B: Dynamic spawning */
  const addPanel = useCallback((type: PanelType) => {
    setState((prev) => {
      // Check if panel already exists
      if (prev.panels.some((p) => p.type === type)) {
        return prev;
      }

      // Get config for the panel type
      let newPanelConfig: PanelConfig;
      if (type === "chat") {
        newPanelConfig = CHAT_PANEL_CONFIG;
      } else {
        newPanelConfig = {
          id: type,
          type,
          title: type.charAt(0).toUpperCase() + type.slice(1),
          isMinimized: false,
          isMaximized: false,
          isClosable: true,
        };
      }

      // Get spawn configuration for this panel type
      const spawnConfig = PANEL_SPAWN_CONFIGS[type];
      if (!spawnConfig) {
        console.warn(`[addPanel] No spawn config found for panel type: ${type}`);
        return prev;
      }

      // Create new layout item with spawn position
      const newLayoutItem: LayoutItem = {
        i: type, // Panel ID matches type for default panels
        ...spawnConfig,
      };

      // Add new panel to layout
      let newLayout = [...prev.layout, newLayoutItem];

      // Skip overlap resolution in grid (we'll handle it here)
      skipOverlapResolutionRef.current = true;

      // Check for overlaps and resolve by shrinking expanded panels' width
      const overlaps = findAllOverlaps(newLayout);
      if (overlaps.length > 0) {
        console.log(`[addPanel] Overlaps detected for new panel "${type}":`, overlaps);

        // Resolve overlaps by shrinking width (not pushing down)
        newLayout = resolveOverlapShrinkWidth(type, newLayout);
      }

      return {
        ...prev,
        panels: [...prev.panels, newPanelConfig],
        layout: newLayout,
      };
    });
  }, []);

  /** Remove a panel - fills gaps after removal */
  const removePanel = useCallback((id: string) => {
    setState((prev) => {
      const newPanels = prev.panels.filter((p) => p.id !== id);
      let newLayout = prev.layout.filter((l) => l.i !== id);

      console.log(`[removePanel] Removing panel: ${id}`);
      console.log(`[removePanel] Remaining panels:`, newPanels.map(p => p.id));

      // Fill gaps left by removed panel (both horizontal and vertical)
      newLayout = compactAndFillAll(newLayout, 12);

      return {
        ...prev,
        panels: newPanels,
        layout: newLayout,
      };
    });
  }, []);

  /**
   * Toggle panel maximize/restore state
   * - MAXIMIZE: Hides all other panels, current panel expands to fill space
   * - RESTORE: Shows all hidden panels, current panel returns to original position
   */
  const toggleMaximize = useCallback((id: string) => {
    setState((prev) => {
      // Check if this panel is currently maximized
      const isCurrentlyMaximized = prev.maximizedPanelId === id;

      if (isCurrentlyMaximized) {
        // === UN-MAXIMIZE (RESTORE): Show all hidden panels ===
        console.log(`[toggleMaximize] Restoring panel "${id}" - showing all hidden panels`);

        // Skip overlap resolution in grid (we handle it here)
        skipOverlapResolutionRef.current = true;

        // Step 1: Reset maximized panel to its original position/size FIRST
        let newLayout = prev.layout.map((l) => {
          if (l.i === id && prev.maximizedPanelOriginalLayout) {
            // Restore to saved original position/size
            return { ...prev.maximizedPanelOriginalLayout };
          }
          return l;
        });

        // Step 2: Restore each hidden panel from the Map at their saved positions
        let newPanels = [...prev.panels];
        const newHiddenPanels = new Map(prev.hiddenPanels);

        for (const [panelId, savedInfo] of prev.hiddenPanels) {
          // Add panel back to layout at its saved position (no overlap since maximized panel is reset)
          newLayout = [...newLayout, savedInfo.layout];
          // Add panel config back to panels array
          newPanels = [...newPanels, savedInfo.config];
          // Remove from hidden panels Map
          newHiddenPanels.delete(panelId);
        }

        return {
          ...prev,
          layout: newLayout,
          panels: newPanels.map((p) =>
            p.id === id ? { ...p, isMaximized: false } : p
          ),
          hiddenPanels: newHiddenPanels,
          maximizedPanelId: null, // Clear maximized state
          savedGridHeight: null, // Clear stored grid height
          maximizedPanelOriginalLayout: null, // Clear stored original layout
        };
      } else {
        // === MAXIMIZE: Hide all other panels ===
        console.log(`[toggleMaximize] Maximizing panel "${id}" - hiding all other panels`);

        // Step 1: Calculate grid height BEFORE hiding (for vertical fill)
        const gridHeight = prev.layout.reduce((max, l) => Math.max(max, l.y + l.h), 0);

        // Step 2: Store the maximized panel's CURRENT position/size for later restoration
        const currentPanelLayout = prev.layout.find((l) => l.i === id);
        const originalLayout = currentPanelLayout ? { ...currentPanelLayout } : null;

        // Step 3: Save all other visible panels to hiddenPanels Map
        const newHiddenPanels = new Map(prev.hiddenPanels);
        for (const p of prev.panels) {
          if (p.id === id) continue; // Skip the panel being maximized

          const layoutItem = prev.layout.find((l) => l.i === p.id);
          if (layoutItem) {
            // Save position and config for later restoration
            newHiddenPanels.set(p.id, {
              layout: { ...layoutItem },
              config: { ...p },
            });
          }
        }

        // Step 4: Keep only the maximized panel and expand it to fill entire space
        const newLayout: LayoutItem[] = currentPanelLayout
          ? [{
              ...currentPanelLayout,
              x: 0,              // Start from left edge
              y: 0,              // Start from top edge
              w: 12,             // Full width (12 columns)
              h: gridHeight,     // Full height (stored grid height)
            }]
          : [];

        const newPanels = prev.panels.filter((p) => p.id === id);

        return {
          ...prev,
          layout: newLayout,
          panels: newPanels.map((p) => ({ ...p, isMaximized: true })),
          hiddenPanels: newHiddenPanels,
          maximizedPanelId: id, // Track which panel is maximized
          savedGridHeight: gridHeight, // Store grid height for reference
          maximizedPanelOriginalLayout: originalLayout, // Store original layout for restore
        };
      }
    });
  }, []);

  /** Set the currently focused/active panel */
  const setActivePanel = useCallback((id: string | null) => {
    setState((prev) => ({
      ...prev,
      activePanel: id,
    }));
  }, []);

  /** Lock/unlock layout editing */
  const setLocked = useCallback((locked: boolean) => {
    setState((prev) => ({
      ...prev,
      isLocked: locked,
    }));
  }, []);

  /** Set drag over state (for drop zone highlighting) */
  const setDraggingOver = useCallback((dragging: boolean) => {
    setState((prev) => ({
      ...prev,
      isDraggingOver: dragging,
    }));
  }, []);

  /** Reset to default layout - Approach B: Dynamic spawn-based reset */
  const resetLayout = useCallback(() => {
    setState((prev) => {
      console.log('[resetLayout] 🔄 Resetting layout with dynamic spawn configs');
      console.log('[resetLayout] Current visible panels:', prev.panels.map(p => p.id));

      // Build new layout dynamically based on visible panels
      const newLayout: LayoutItem[] = [];

      // PRIORITY 1: Always add preview panel first if visible (largest, left side)
      const previewPanel = prev.panels.find(p => p.type === 'preview');
      if (previewPanel) {
        const previewSpawn = PANEL_SPAWN_CONFIGS.preview;
        newLayout.push({
          i: previewPanel.id,
          ...previewSpawn, // Always x:0, y:0, w:6, h:7
        });
        console.log('[resetLayout] ✅ Preview panel added at spawn position (prioritized)');
      }

      // PRIORITY 2: Add other visible panels using their spawn configs
      prev.panels.forEach(panel => {
        // Skip preview (already added)
        if (panel.type === 'preview') return;

        const spawnConfig = PANEL_SPAWN_CONFIGS[panel.type];
        if (!spawnConfig) {
          console.warn(`[resetLayout] No spawn config for panel type: ${panel.type}`);
          return;
        }

        newLayout.push({
          i: panel.id,
          ...spawnConfig,
        });
        console.log(`[resetLayout] ✅ Panel "${panel.id}" added at spawn position`);
      });

      // Apply overlap resolution to clean up any overlaps
      // (This handles cases where spawn positions overlap)
      let resolvedLayout = newLayout;
      const overlaps = findAllOverlaps(resolvedLayout);

      if (overlaps.length > 0) {
        console.log('[resetLayout] ⚠️ Overlaps detected, resolving...');

        // For each overlapping panel (except preview), resolve by adjusting position
        for (const [panelA, panelB] of overlaps) {
          // Never shrink/move preview panel - it's prioritized
          const targetPanel = panelA === 'preview' ? panelB : panelA;

          console.log(`[resetLayout] Resolving overlap for panel: ${targetPanel}`);
          resolvedLayout = resolveOverlapShrinkWidth(targetPanel, resolvedLayout);
        }
      }

      console.log('[resetLayout] ✅ Reset complete, new layout:',
        resolvedLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));

      return {
        ...prev,
        layout: resolvedLayout,
      };
    });
  }, []);

  /** Save current layout to DB (workspace) */
  const saveLayout = useCallback(() => {
    // Convert Map to array for JSON serialization
    const hiddenPanelsArray = Array.from(state.hiddenPanels.entries());

    const layoutState = {
      layout: state.layout,
      panels: state.panels,
      hiddenPanels: hiddenPanelsArray,
      maximizedPanelId: state.maximizedPanelId,
      savedGridHeight: state.savedGridHeight,
      maximizedPanelOriginalLayout: state.maximizedPanelOriginalLayout,
    };

    // Only persist to DB if we're in workspace context (rfqReference is set)
    if (rfqReference) {
      uiSaved('workspace', layoutState).catch((err) => {
        console.warn('Failed to save workspace layout:', err);
      });
    }
  }, [state.layout, state.panels, state.hiddenPanels, state.maximizedPanelId, state.savedGridHeight, state.maximizedPanelOriginalLayout, rfqReference]);

  /** Toggle panel visibility - hide/show panel while preserving its position */
  const togglePanelVisibility = useCallback((id: string) => {
    setState((prev) => {
      // Check if panel is currently visible
      const isVisible = prev.panels.some((p) => p.id === id);

      if (isVisible) {
        // HIDE: Save current layout position and config, then remove from active panels
        const layoutItem = prev.layout.find((l) => l.i === id);
        const panelConfig = prev.panels.find((p) => p.id === id);

        // Guard: Only proceed if both exist
        if (!layoutItem || !panelConfig) return prev;

        // Create new hidden panels map with this panel added
        const newHiddenPanels = new Map(prev.hiddenPanels);
        newHiddenPanels.set(id, {
          layout: { ...layoutItem },    // Clone to preserve original position
          config: { ...panelConfig },   // Clone to preserve original config
        });

        // Remove panel from layout then fill gaps left by hidden panel
        let newLayout = prev.layout.filter((l) => l.i !== id);
        newLayout = compactAndFillAll(newLayout, 12);

        return {
          ...prev,
          layout: newLayout,
          panels: prev.panels.filter((p) => p.id !== id),  // Remove from panels
          hiddenPanels: newHiddenPanels,
        };
      } else {
        // SHOW: Restore panel from hidden state at its original position
        const savedInfo = prev.hiddenPanels.get(id);

        // Guard: Only proceed if we have saved info
        if (!savedInfo) return prev;

        // Skip overlap resolution in grid's handleLayoutChange to prevent feedback loop
        skipOverlapResolutionRef.current = true;

        // Create new hidden panels map with this panel removed
        const newHiddenPanels = new Map(prev.hiddenPanels);
        newHiddenPanels.delete(id);

        // Create prospective layout with restored panel
        let newLayout = [...prev.layout, savedInfo.layout];

        // Check for overlaps and resolve by shrinking expanded panels' width
        const overlaps = findAllOverlaps(newLayout);
        if (overlaps.length > 0) {
          // Resolve overlaps by shrinking width (not pushing down)
          newLayout = resolveOverlapShrinkWidth(id, newLayout);
        }

        return {
          ...prev,
          layout: newLayout,                            // Use resolved layout (overlap-free)
          panels: [...prev.panels, savedInfo.config],   // Restore to panels
          hiddenPanels: newHiddenPanels,
        };
      }
    });
  }, []);

  /** Check if a panel is currently visible (not hidden) */
  const isPanelVisible = useCallback(
    (id: string) => {
      return state.panels.some((p) => p.id === id);
    },
    [state.panels]
  );

  // Auto-save layout when it changes (including maximize state)
  useEffect(() => {
    const timeout = setTimeout(() => {
      saveLayout();
    }, 500); // Debounce saves

    return () => clearTimeout(timeout);
  }, [state.layout, state.panels, state.maximizedPanelId, saveLayout]);

  // =============================================
  // Context Value
  // =============================================

  const contextValue: WorkboardContextType = {
    ...state,
    updateLayout,
    addPanel,
    removePanel,
    toggleMaximize,         // Toggle panel maximize/restore (hides/shows other panels)
    setActivePanel,
    setLocked,
    setDraggingOver,
    resetLayout,
    saveLayout,
    togglePanelVisibility,  // Toggle panel hide/show
    isPanelVisible,         // Check panel visibility
    skipOverlapResolutionRef, // Skip overlap resolution after panel toggle
  };

  return (
    <WorkboardContext.Provider value={contextValue}>
      {children}
    </WorkboardContext.Provider>
  );
}

// =============================================
// Hook
// =============================================

/**
 * useWorkboard - Hook to access workboard context
 * Must be used within WorkboardProvider
 */
export function useWorkboard(): WorkboardContextType {
  const context = useContext(WorkboardContext);
  if (!context) {
    throw new Error("useWorkboard must be used within a WorkboardProvider");
  }
  return context;
}
