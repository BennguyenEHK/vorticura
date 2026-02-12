// =============================================
// Workboard Type Definitions
// =============================================
// Types for the dynamic, resizable panel grid system
// Uses react-grid-layout with custom auto-fill for gap filling

import type React from "react";

// =============================================
// Panel Types
// =============================================

/** Available panel types in the workboard */
export type PanelType =
  | "chat"                     // AI Chat panel
  | "workflow"                 // Workflow tracker panel
  | "pricing"                  // Pricing editor panel
  | "preview";                  // Quotation preview panel

/** Panel configuration metadata */
export interface PanelConfig {
  id: string;                  // Unique panel identifier
  type: PanelType;             // Type of panel content
  title: string;               // Panel header title
  isMinimized: boolean;        // Collapsed to header only
  isMaximized: boolean;        // Expanded to full grid
  isClosable: boolean;         // Can be closed/removed
  icon?: string;               // Lucide icon name for header
}

// =============================================
// Hidden Panel Types (for toggle visibility)
// =============================================

/** Stored info for a hidden panel - preserves layout position for restoration */
export interface HiddenPanelInfo {
  layout: LayoutItem;          // Saved position/size before hiding
  config: PanelConfig;         // Saved panel configuration
}

// =============================================
// Layout Types (react-grid-layout compatible)
// =============================================

/** Single layout item for react-grid-layout */
export interface LayoutItem {
  i: string;                   // Panel ID (matches PanelConfig.id)
  x: number;                   // Grid column (0-11 in 12-col grid)
  y: number;                   // Grid row position
  w: number;                   // Width in grid units
  h: number;                   // Height in grid units
  minW?: number;               // Minimum width
  minH?: number;               // Minimum height
  maxW?: number;               // Maximum width
  maxH?: number;               // Maximum height
  static?: boolean;            // If true, cannot be moved/resized
  isDraggable?: boolean;       // Override draggable per item
  isResizable?: boolean;       // Override resizable per item
}

/** Responsive layouts for different breakpoints */
export interface ResponsiveLayouts {
  lg: LayoutItem[];            // Large screens (>= 1200px)
  md: LayoutItem[];            // Medium screens (>= 996px)
  sm: LayoutItem[];            // Small screens (>= 768px)
  xs: LayoutItem[];            // Extra small screens (>= 480px)
}

// =============================================
// Workboard State
// =============================================

/** Workboard global state */
export interface WorkboardState {
  layout: LayoutItem[];        // Current layout configuration
  panels: PanelConfig[];       // Panel metadata array
  isLocked: boolean;           // Disable resize/reposition when true
  activePanel: string | null;  // Currently focused panel ID
  breakpoint: string;          // Current responsive breakpoint
  isDraggingOver: boolean;     // AI Chat FAB is being dragged over
  hiddenPanels: Map<string, HiddenPanelInfo>; // Panels hidden via toggle (preserves position)
  maximizedPanelId: string | null; // Track which panel is currently maximized (null = none)
}

/** Workboard context actions */
export interface WorkboardActions {
  updateLayout: (layout: LayoutItem[]) => void; // Update layout positions
  addPanel: (type: PanelType) => void;          // Add new panel (e.g., AI Chat)
  removePanel: (id: string) => void;            // Remove panel
  toggleMaximize: (id: string) => void;         // Toggle panel maximize/restore (hides/shows other panels)
  setActivePanel: (id: string | null) => void;  // Set focused panel
  setLocked: (locked: boolean) => void;         // Lock/unlock layout
  setDraggingOver: (dragging: boolean) => void; // Set drag over state
  resetLayout: () => void;                      // Reset to default layout
  saveLayout: () => void;                       // Save layout to localStorage
  togglePanelVisibility: (id: string) => void;  // Toggle panel hide/show (preserves position)
  isPanelVisible: (id: string) => boolean;      // Check if panel is currently visible
  skipOverlapResolutionRef: React.MutableRefObject<boolean>; // Skip overlap resolution after panel toggle
}

/** Combined workboard context type */
export interface WorkboardContextType extends WorkboardState, WorkboardActions {}

// =============================================
// Grid Configuration
// =============================================

/** react-grid-layout configuration */
export interface GridConfig {
  cols: number;                // Number of columns (default: 12)
  rowHeight: number;           // Base row height in pixels
  margin: [number, number];    // Gap between panels [x, y]
  containerPadding: [number, number]; // Outer padding [x, y]
  isDraggable: boolean;        // Enable drag globally
  isResizable: boolean;        // Enable resize globally
  draggableHandle: string;     // CSS selector for drag handle
  resizeHandles: Array<"s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne">;
  compactType: "vertical" | "horizontal" | null; // Auto-pack direction (null = no compaction)
  preventCollision: boolean;   // Prevent overlap during drag
  allowOverlap: boolean;       // Allow panels to overlap (enables swap behavior)
}

/** Default grid configuration for react-grid-layout */
export const DEFAULT_GRID_CONFIG: GridConfig = {
  cols: 12,
  rowHeight: 100,
  margin: [8, 8],
  containerPadding: [0, 0],
  isDraggable: true,
  isResizable: true,
  draggableHandle: ".panel-drag-handle",
  resizeHandles: ["se", "e", "s"],
  compactType: null,           // Disable compaction to allow free positioning
  preventCollision: false,
  allowOverlap: true,          // Enable overlap for swap-based repositioning
};

// =============================================
// Responsive Breakpoints
// =============================================

/** Breakpoint widths in pixels */
export const BREAKPOINTS = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480,
} as const;

/** Columns per breakpoint */
export const COLS = {
  lg: 12,
  md: 8,
  sm: 4,
  xs: 2,
} as const;

// =============================================
// Panel Spawn Configurations (Approach B)
// =============================================

/**
 * Individual spawn positions for each panel type
 * Used for dynamic layout construction with overlap resolution
 *
 * Philosophy:
 * - Preview panel always gets priority (largest, left side)
 * - Other panels spawn on the right side
 * - Overlap resolution algorithms adjust positions dynamically
 */
export const PANEL_SPAWN_CONFIGS: Record<PanelType, Omit<LayoutItem, "i">> = {
  // Preview panel - Always prioritized, left side, largest
  preview: { x: 0, y: 0, w: 6, h: 7, minW: 3, minH: 1 },

  // Workflow panel - Top right
  workflow: { x: 6, y: 0, w: 6, h: 2, minW: 3, minH: 1 },

  // Pricing panel - Middle right
  chat: { x: 6, y: 2, w: 6, h: 2, minW: 3, minH: 1 },

  // AI Chat panel - Bottom right
  pricing: { x: 6, y: 4, w: 6, h: 3, minW: 3, minH: 1 },


};

// =============================================
// Default Panel Configurations
// =============================================

/** Default panel configurations */
export const DEFAULT_PANELS: PanelConfig[] = [
  { id: "workflow", type: "workflow", title: "Workflow", isMinimized: false, isMaximized: false, isClosable: false, icon: "GitBranch" },
  { id: "pricing",  type: "pricing",  title: "Pricing",  isMinimized: false, isMaximized: false, isClosable: false, icon: "DollarSign" },
  { id: "preview",  type: "preview",  title: "Preview",  isMinimized: false, isMaximized: false, isClosable: false, icon: "FileText" },
];

/** Chat panel configuration (added when AI Chat is docked) */
export const CHAT_PANEL_CONFIG: PanelConfig = {
  id: "chat",
  type: "chat",
  title: "AI Chat",
  isMinimized: false,
  isMaximized: false,
  isClosable: true,            // Can undock back to FAB
  icon: "Bot",
};

// =============================================
// LocalStorage Keys
// =============================================

/** LocalStorage key for saving workboard layout */
export const WORKBOARD_LAYOUT_STORAGE_KEY = "quoteflow-workboard-layout";

/** LocalStorage key for AI Chat FAB position */
export const AI_CHAT_POSITION_STORAGE_KEY = "quoteflow-ai-chat-position";

// =============================================
// Swap Detection Types
// =============================================

/** Result of swap detection between panels */
export interface SwapResult {
  layout: LayoutItem[];           // Layout with swapped sizes applied
  swapped: boolean;               // Whether a swap was detected
  panelA?: string;                // First panel involved in swap
  panelB?: string;                // Second panel involved in swap
}
