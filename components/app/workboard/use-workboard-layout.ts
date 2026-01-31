"use client";

// =============================================
// useWorkboardLayout Hook
// =============================================
// Custom hook for persisting workboard layout to localStorage

import { useCallback, useEffect, useState } from "react";
import type { LayoutItem, PanelConfig } from "@/types/workboard";
import {
  DEFAULT_LAYOUT_3_PANELS,
  DEFAULT_PANELS,
  WORKBOARD_LAYOUT_STORAGE_KEY,
} from "@/types/workboard";

// =============================================
// Types
// =============================================

interface SavedLayout {
  layout: LayoutItem[];
  panels: PanelConfig[];
  version: number;
}

interface UseWorkboardLayoutReturn {
  layout: LayoutItem[];
  panels: PanelConfig[];
  isLoaded: boolean;
  saveLayout: (layout: LayoutItem[], panels: PanelConfig[]) => void;
  resetLayout: () => void;
  clearSavedLayout: () => void;
}

// =============================================
// Constants
// =============================================

const CURRENT_VERSION = 4; // Increment when layout structure changes (v4: react-grid-layout + auto-fill)

// =============================================
// Hook
// =============================================

/**
 * useWorkboardLayout - Hook for loading/saving workboard layout
 *
 * @returns Layout state and persistence functions
 */
export function useWorkboardLayout(): UseWorkboardLayoutReturn {
  // State for layout and panels
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT_3_PANELS);
  const [panels, setPanels] = useState<PanelConfig[]>(DEFAULT_PANELS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved layout from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = localStorage.getItem(WORKBOARD_LAYOUT_STORAGE_KEY);
      if (saved) {
        const parsed: SavedLayout = JSON.parse(saved);

        // Check version compatibility
        if (parsed.version === CURRENT_VERSION) {
          setLayout(parsed.layout);
          setPanels(parsed.panels);
        } else {
          // Version mismatch, use defaults
          console.info(
            "Workboard layout version mismatch, using defaults"
          );
        }
      }
    } catch (e) {
      console.warn("Failed to load workboard layout from localStorage", e);
    }

    setIsLoaded(true);
  }, []);

  // Save layout to localStorage
  const saveLayout = useCallback(
    (newLayout: LayoutItem[], newPanels: PanelConfig[]) => {
      if (typeof window === "undefined") return;

      const toSave: SavedLayout = {
        layout: newLayout,
        panels: newPanels,
        version: CURRENT_VERSION,
      };

      try {
        localStorage.setItem(
          WORKBOARD_LAYOUT_STORAGE_KEY,
          JSON.stringify(toSave)
        );
        setLayout(newLayout);
        setPanels(newPanels);
      } catch (e) {
        console.warn("Failed to save workboard layout to localStorage", e);
      }
    },
    []
  );

  // Reset to default layout
  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT_3_PANELS);
    setPanels(DEFAULT_PANELS);

    if (typeof window !== "undefined") {
      const toSave: SavedLayout = {
        layout: DEFAULT_LAYOUT_3_PANELS,
        panels: DEFAULT_PANELS,
        version: CURRENT_VERSION,
      };
      localStorage.setItem(
        WORKBOARD_LAYOUT_STORAGE_KEY,
        JSON.stringify(toSave)
      );
    }
  }, []);

  // Clear saved layout from localStorage
  const clearSavedLayout = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(WORKBOARD_LAYOUT_STORAGE_KEY);
    }
    setLayout(DEFAULT_LAYOUT_3_PANELS);
    setPanels(DEFAULT_PANELS);
  }, []);

  return {
    layout,
    panels,
    isLoaded,
    saveLayout,
    resetLayout,
    clearSavedLayout,
  };
}
