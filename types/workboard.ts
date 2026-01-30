// =============================================
// Workboard Type Definitions
// =============================================
// Types for the dynamic, resizable panel grid system
// Uses Gridstack.js for panel management with auto-fill

// =============================================
// Panel Types
// =============================================

/** Available panel types in the workboard */
export type PanelType =
  | "chat"                     // AI Chat panel
  | "workflow"                 // Workflow tracker panel
  | "pricing"                  // Pricing editor panel
  | "preview"                  // Quotation preview panel
  | "files";                   // Files manager panel (optional)

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
// Layout Types (Gridstack compatible)
// =============================================

/** Single layout item for Gridstack */
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
}

/** Workboard context actions */
export interface WorkboardActions {
  updateLayout: (layout: LayoutItem[]) => void; // Update layout positions
  addPanel: (type: PanelType) => void;          // Add new panel (e.g., AI Chat)
  removePanel: (id: string) => void;            // Remove panel
  toggleMinimize: (id: string) => void;         // Toggle panel minimize
  toggleMaximize: (id: string) => void;         // Toggle panel maximize
  setActivePanel: (id: string | null) => void;  // Set focused panel
  setLocked: (locked: boolean) => void;         // Lock/unlock layout
  setDraggingOver: (dragging: boolean) => void; // Set drag over state
  resetLayout: () => void;                      // Reset to default layout
  saveLayout: () => void;                       // Save layout to localStorage
}

/** Combined workboard context type */
export interface WorkboardContextType extends WorkboardState, WorkboardActions {}

// =============================================
// Grid Configuration
// =============================================

/** Gridstack configuration (compatible with Gridstack.js v12+) */
export interface GridConfig {
  column: number;              // Number of columns (default: 12)
  cellHeight: number;          // Cell height in pixels (row height)
  margin: number;              // Gap between panels in pixels (Gridstack uses single number)
  float: boolean;              // Allow floating items (false = auto-pack)
  animate: boolean;            // Enable animations during drag/resize
  draggableHandle: string;     // CSS selector for drag handle
  resizeHandles: string;       // Resize handles ("e, se, s, sw, w")
}

/** Default grid configuration for Gridstack.js */
export const DEFAULT_GRID_CONFIG: GridConfig = {
  column: 12,                  // 12-column grid layout
  cellHeight: 100,             // 100px per row unit
  margin: 12,                  // 12px gap between panels (better for grab)
  float: false,                // Auto-pack panels (no floating)
  animate: true,               // Smooth animations
  draggableHandle: ".panel-drag-handle",  // Drag by panel header
  resizeHandles: "e, se, s, sw, w",       // All side handles for resize
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
// Default Layouts
// =============================================

/** Default 3-panel layout (before AI Chat drop) */
export const DEFAULT_LAYOUT_3_PANELS: LayoutItem[] = [
  { i: "workflow", x: 6, y: 0, w: 6, h: 2, minW: 3, minH: 1 },
  { i: "pricing",  x: 6, y: 2, w: 6, h: 5, minW: 3, minH: 1 },
  { i: "preview",  x: 0, y: 0, w: 6, h: 7, minW: 3, minH: 1 },
];

/** Default 4-panel layout (after AI Chat drop) */
export const DEFAULT_LAYOUT_4_PANELS: LayoutItem[] = [
  { i: "chat",     x: 6, y: 0, w: 6, h: 2, minW: 3, minH: 1 },
  { i: "workflow", x: 6, y: 2, w: 6, h: 2, minW: 3, minH: 1 },
  { i: "pricing",  x: 6, y: 4, w: 6, h: 3, minW: 3, minH: 1 },
  { i: "preview",  x: 0, y: 0, w: 6, h: 7, minW: 3, minH: 1 },
];

/** Stacked layout for mobile (vertical stack) */
export const STACKED_LAYOUT: LayoutItem[] = [
  { i: "chat",     x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 1 },
  { i: "workflow", x: 0, y: 2, w: 2, h: 2, minW: 2, minH: 1 },
  { i: "pricing",  x: 0, y: 4, w: 2, h: 2, minW: 2, minH: 1 },
  { i: "preview",  x: 0, y: 6, w: 2, h: 2, minW: 2, minH: 1 },
];

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
