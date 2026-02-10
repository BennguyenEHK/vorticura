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
  WORKBOARD_LAYOUT_STORAGE_KEY,
  PANEL_SPAWN_CONFIGS, // Approach B: Dynamic spawn configs
} from "@/types/workboard";
import { findAllOverlaps, resolveOverlapShrinkWidth, compactAndFillAll } from "@/lib/utils/generators/grid-layout";

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
 */
export function WorkboardProvider({ children }: WorkboardProviderProps) {
  // Initialize with default state (same on server and client to prevent hydration mismatch)
  const [state, setState] = useState<WorkboardState>(initialState);

  // Ref to skip overlap resolution in grid after panel toggle-on
  const skipOverlapResolutionRef = useRef(false);

  // Hydrate state from localStorage AFTER mount (client-only, prevents hydration mismatch)
  // This is the standard Next.js pattern for localStorage-dependent state
  useEffect(() => {
    const savedLayout = localStorage.getItem(WORKBOARD_LAYOUT_STORAGE_KEY);
    if (savedLayout) {
      try {
        const parsed = JSON.parse(savedLayout);

        // Guard: If layout or panels is empty, clear corrupted state and keep defaults
        if (!parsed.layout?.length || !parsed.panels?.length) {
          localStorage.removeItem(WORKBOARD_LAYOUT_STORAGE_KEY);
          return;
        }

        // Restore hiddenPanels Map from array
        const hiddenPanelsMap = new Map<string, HiddenPanelInfo>(
          parsed.hiddenPanels || []
        );

        // Update state with hydrated values from localStorage
        // This is the standard Next.js pattern for localStorage hydration - must happen after mount
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState((prev) => ({
          ...prev,
          layout: parsed.layout,
          panels: parsed.panels,
          hiddenPanels: hiddenPanelsMap,
        }));
      } catch {
        // Failed to parse saved layout - clear corrupted state
        console.warn("Failed to parse saved workboard layout");
        localStorage.removeItem(WORKBOARD_LAYOUT_STORAGE_KEY);
      }
    }
  }, []);

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

  /** Toggle panel minimize state */
  const toggleMinimize = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      panels: prev.panels.map((p) =>
        p.id === id
          ? { ...p, isMinimized: !p.isMinimized, isMaximized: false }
          : p
      ),
    }));
  }, []);

  /** Toggle panel maximize state */
  const toggleMaximize = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      panels: prev.panels.map((p) =>
        p.id === id
          ? { ...p, isMaximized: !p.isMaximized, isMinimized: false }
          : p
      ),
    }));
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

  /** Save current layout to localStorage */
  const saveLayout = useCallback(() => {
    if (typeof window !== "undefined") {
      // Convert Map to array for JSON serialization
      const hiddenPanelsArray = Array.from(state.hiddenPanels.entries());

      localStorage.setItem(
        WORKBOARD_LAYOUT_STORAGE_KEY,
        JSON.stringify({
          layout: state.layout,
          panels: state.panels,
          hiddenPanels: hiddenPanelsArray,
        })
      );
    }
  }, [state.layout, state.panels, state.hiddenPanels]);

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

  // Auto-save layout when it changes
  useEffect(() => {
    const timeout = setTimeout(() => {
      saveLayout();
    }, 500); // Debounce saves

    return () => clearTimeout(timeout);
  }, [state.layout, state.panels, saveLayout]);

  // =============================================
  // Context Value
  // =============================================

  const contextValue: WorkboardContextType = {
    ...state,
    updateLayout,
    addPanel,
    removePanel,
    toggleMinimize,
    toggleMaximize,
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
