"use client";

// =============================================
// Workboard Provider — CSS panel width state
// =============================================
// Manages three values:
// - pricingOpen: whether the pricing pane is visible
// - previewWidthPercent: how wide the preview pane is (30–85%)
// - aiChatHeightPercent: how tall the AI chat pane is (20–50%)
// Width preferences are persisted to localStorage.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { WorkboardContextType } from "@/types/workboard";
import {
  DEFAULT_WORKBOARD_STATE,
  WORKBOARD_LAYOUT_STORAGE_KEY,
} from "@/types/workboard";

const WorkboardContext = createContext<WorkboardContextType | null>(null);

export function WorkboardProvider({ children }: { children: ReactNode }) {
  const [pricingOpen, setPricingOpen] = useState(DEFAULT_WORKBOARD_STATE.pricingOpen);
  const [previewWidthPercent, setPreviewWidthPct] = useState(
    DEFAULT_WORKBOARD_STATE.previewWidthPercent
  );
  const [aiChatHeightPercent, setAIChatHeightPct] = useState(
    DEFAULT_WORKBOARD_STATE.aiChatHeightPercent
  );

  // Load saved width preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(WORKBOARD_LAYOUT_STORAGE_KEY);
      if (saved) {
        const { previewWidthPercent: pw, aiChatHeightPercent: ah } = JSON.parse(saved);
        // Clamp on read so tampered/corrupted storage can't break the layout
        if (typeof pw === "number") setPreviewWidthPct(Math.min(85, Math.max(30, pw)));
        if (typeof ah === "number") setAIChatHeightPct(Math.min(50, Math.max(20, ah)));
      }
    } catch {
      // Corrupted storage — silently use defaults
    }
  }, []);

  // Persist width preferences to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(
        WORKBOARD_LAYOUT_STORAGE_KEY,
        JSON.stringify({ previewWidthPercent, aiChatHeightPercent })
      );
    } catch {
      // Storage quota exceeded — silently ignore
    }
  }, [previewWidthPercent, aiChatHeightPercent]);

  // Toggle pricing pane visibility
  const togglePricing = useCallback(() => {
    setPricingOpen((prev) => !prev);
  }, []);

  // Update preview width, clamped to 30–85%
  const setPreviewWidth = useCallback((updater: (prev: number) => number) => {
    setPreviewWidthPct((prev) => Math.min(85, Math.max(30, updater(prev))));
  }, []);

  // Update AI chat height in right column, clamped to 20–50%
  const setAIChatHeight = useCallback((updater: (prev: number) => number) => {
    setAIChatHeightPct((prev) => Math.min(50, Math.max(20, updater(prev))));
  }, []);

  return (
    <WorkboardContext.Provider
      value={{
        pricingOpen,
        previewWidthPercent,
        aiChatHeightPercent,
        togglePricing,
        setPreviewWidth,
        setAIChatHeight,
      }}
    >
      {children}
    </WorkboardContext.Provider>
  );
}

export function useWorkboard(): WorkboardContextType {
  const ctx = useContext(WorkboardContext);
  if (!ctx) throw new Error("useWorkboard must be used within WorkboardProvider");
  return ctx;
}
