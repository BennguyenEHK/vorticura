// types/workboard.ts
// =============================================
// Workboard Type Definitions — CSS Panel Layout
// =============================================

// =============================================
// Panel State
// =============================================

/** Widths and open/close state for the workboard panels */
export interface WorkboardState {
  pricingOpen: boolean;
  previewWidthPercent: number;   // 30–85; how much horizontal space the preview pane takes
  aiChatHeightPercent: number;   // 20–50; how much of the right column height the AI chat takes
}

/** Workboard context — state + actions */
export interface WorkboardContextType {
  pricingOpen: boolean;
  previewWidthPercent: number;
  aiChatHeightPercent: number;
  togglePricing: () => void;
  setPreviewWidth: (updater: (prev: number) => number) => void;
  setAIChatHeight: (updater: (prev: number) => number) => void;
}

// =============================================
// Default State
// =============================================

export const DEFAULT_WORKBOARD_STATE: WorkboardState = {
  pricingOpen: false,
  previewWidthPercent: 65,
  aiChatHeightPercent: 33,
};

// =============================================
// LocalStorage Key
// =============================================

/** Persists panel width preferences across sessions */
export const WORKBOARD_LAYOUT_STORAGE_KEY = "quoteflow-workboard-layout-v2";
