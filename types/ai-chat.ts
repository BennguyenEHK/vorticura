// =============================================
// AI Chat Type Definitions
// =============================================
// Types for the floating AI chat system with drag & drop

// =============================================
// Message Types
// =============================================

/** Role of the message sender */
export type MessageRole = "user" | "assistant" | "system";

/** Individual chat message */
export interface Message {
  id: string;                  // Unique message ID
  role: MessageRole;           // Who sent the message
  content: string;             // Message text content
  timestamp: Date;             // When the message was sent
  isLoading?: boolean;         // Loading state for streaming responses
}

// =============================================
// Position Types
// =============================================

/** 2D position coordinates */
export interface Position {
  x: number;                   // X coordinate in pixels
  y: number;                   // Y coordinate in pixels
}

/** FAB position presets */
export type FABPositionPreset =
  | "bottom-right"             // Default position
  | "bottom-left"
  | "top-right"
  | "top-left"
  | "custom";                  // User-dragged position

// =============================================
// Chat State Types
// =============================================

/** AI Chat global state */
export interface AIChatState {
  isPopoverOpen: boolean;      // Side chatbox visibility
  isDocked: boolean;           // Docked in Workboard grid
  isDragging: boolean;         // Currently being dragged
  unreadCount: number;         // Badge notification count
  position: Position;          // FAB position (for custom position)
  positionPreset: FABPositionPreset; // Position preset name
  messages: Message[];         // Chat history (placeholder)
}

/** AI Chat context actions */
export interface AIChatActions {
  togglePopover: () => void;           // Open/close popover
  setDocked: (docked: boolean) => void; // Dock/undock from workboard
  setDragging: (dragging: boolean) => void; // Set dragging state
  setPosition: (position: Position) => void; // Update FAB position
  addMessage: (message: Omit<Message, "id" | "timestamp">) => void; // Add new message
  clearUnread: () => void;             // Clear unread count
  incrementUnread: () => void;         // Increment unread count
}

/** Combined AI Chat context type */
export interface AIChatContextType extends AIChatState, AIChatActions {}

// =============================================
// Default Values
// =============================================

/** Default initial state for AI Chat */
export const DEFAULT_AI_CHAT_STATE: AIChatState = {
  isPopoverOpen: false,
  isDocked: false,
  isDragging: false,
  unreadCount: 0,
  position: { x: 0, y: 0 },    // Will be calculated based on window
  positionPreset: "bottom-right",
  messages: [],
};

// =============================================
// FAB Configuration
// =============================================

/** FAB (Floating Action Button) configuration */
export interface FABConfig {
  size: number;                // Button size in pixels (default: 48)
  iconSize: number;            // Icon size in pixels (default: 24)
  badgeSize: number;           // Badge size in pixels (default: 18)
  offset: number;              // Offset from screen edge (default: 24)
}

/** Default FAB configuration */
export const DEFAULT_FAB_CONFIG: FABConfig = {
  size: 48,
  iconSize: 24,
  badgeSize: 18,
  offset: 24,
};

// =============================================
// Popover Configuration
// =============================================

/** Popover dimensions */
export interface PopoverConfig {
  width: number;               // Popover width in pixels (default: 320)
  height: number;              // Popover height in pixels (default: 384)
  offset: number;              // Offset from FAB (default: 8)
}

/** Default popover configuration */
export const DEFAULT_POPOVER_CONFIG: PopoverConfig = {
  width: 320,                  // w-80 in Tailwind
  height: 384,                 // h-96 in Tailwind
  offset: 8,
};
