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
          if (parsed.layout && parsed.panels) {
            setState((prev) => ({
              ...prev,
              layout: parsed.layout,
              panels: parsed.panels,
            }));
          }
        } catch (e) {
          console.warn("Failed to parse saved workboard layout");
        }
      }
    }
  }, []);

  // =============================================
  // Actions
  // =============================================

  /** Update layout positions */
  const updateLayout = useCallback((layout: LayoutItem[]) => {
    setState((prev) => ({
      ...prev,
      layout,
    }));
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
      localStorage.setItem(
        WORKBOARD_LAYOUT_STORAGE_KEY,
        JSON.stringify({
          layout: state.layout,
          panels: state.panels,
        })
      );
    }
  }, [state.layout, state.panels]);

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
