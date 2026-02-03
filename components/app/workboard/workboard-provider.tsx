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
  DEFAULT_LAYOUT_3_PANELS,
  DEFAULT_LAYOUT_4_PANELS,
  DEFAULT_PANELS,
  CHAT_PANEL_CONFIG,
  WORKBOARD_LAYOUT_STORAGE_KEY,
} from "@/types/workboard";

// =============================================
// Context
// =============================================

/** Workboard context with state and actions */
const WorkboardContext = createContext<WorkboardContextType | null>(null);

// =============================================
// Initial State
// =============================================

const initialState: WorkboardState = {
  layout: DEFAULT_LAYOUT_3_PANELS,
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
  // Initialize state with defaults
  const [state, setState] = useState<WorkboardState>(initialState);

  // Load saved layout from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
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

          setState((prev) => ({
            ...prev,
            layout: parsed.layout,
            panels: parsed.panels,
            hiddenPanels: hiddenPanelsMap,
          }));
        } catch (e) {
          console.warn("Failed to parse saved workboard layout");
          localStorage.removeItem(WORKBOARD_LAYOUT_STORAGE_KEY);
        }
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

  /** Add a new panel (e.g., AI Chat when docked) */
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

      // Use 4-panel layout when adding chat
      const newLayout =
        type === "chat" ? DEFAULT_LAYOUT_4_PANELS : prev.layout;

      return {
        ...prev,
        panels: [...prev.panels, newPanelConfig],
        layout: newLayout,
      };
    });
  }, []);

  /** Remove a panel */
  const removePanel = useCallback((id: string) => {
    setState((prev) => {
      const newPanels = prev.panels.filter((p) => p.id !== id);
      const newLayout = prev.layout.filter((l) => l.i !== id);

      // If removing chat panel, reset to 3-panel layout
      if (id === "chat") {
        return {
          ...prev,
          panels: newPanels,
          layout: DEFAULT_LAYOUT_3_PANELS,
        };
      }

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

  /** Reset to default layout */
  const resetLayout = useCallback(() => {
    // Check if chat panel exists
    const hasChat = state.panels.some((p) => p.type === "chat");
    setState((prev) => ({
      ...prev,
      layout: hasChat ? DEFAULT_LAYOUT_4_PANELS : DEFAULT_LAYOUT_3_PANELS,
    }));
  }, [state.panels]);

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

        return {
          ...prev,
          layout: prev.layout.filter((l) => l.i !== id),   // Remove from layout
          panels: prev.panels.filter((p) => p.id !== id),  // Remove from panels
          hiddenPanels: newHiddenPanels,
        };
      } else {
        // SHOW: Restore panel from hidden state at its original position
        const savedInfo = prev.hiddenPanels.get(id);

        // Guard: Only proceed if we have saved info
        if (!savedInfo) return prev;

        // Create new hidden panels map with this panel removed
        const newHiddenPanels = new Map(prev.hiddenPanels);
        newHiddenPanels.delete(id);

        return {
          ...prev,
          layout: [...prev.layout, savedInfo.layout],   // Restore to layout
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
