"use client";

// =============================================
// Sidebar Context Provider
// =============================================
// Manages sidebar collapsed/expanded state across the app.
// Used by: layout.tsx (for main content margin), sidebar.tsx (for width)

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

// =============================================
// Types & Interfaces
// =============================================

// Sidebar context state and actions
interface SidebarContextType {
  collapsed: boolean;           // Current collapsed state
  setCollapsed: (value: boolean) => void;  // Direct state setter
  toggleSidebar: () => void;    // Toggle between states
}

// Provider props
interface SidebarProviderProps {
  children: ReactNode;
  defaultCollapsed?: boolean;   // Optional initial state (default: false = expanded)
}

// =============================================
// Context Creation
// =============================================

// Create context with undefined default (will be set by provider)
const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

// =============================================
// Provider Component
// =============================================

/**
 * SidebarProvider - Wraps app section to provide sidebar state
 *
 * @param children - Components that need access to sidebar state
 * @param defaultCollapsed - Initial collapsed state (default: false)
 */
export function SidebarProvider({
  children,
  defaultCollapsed = false,
}: SidebarProviderProps) {
  // Sidebar collapsed state - false = expanded (240px), true = collapsed (72px)
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Memoized toggle function to prevent unnecessary re-renders
  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  // Context value object
  const value: SidebarContextType = {
    collapsed,
    setCollapsed,
    toggleSidebar,
  };

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}

// =============================================
// Custom Hook
// =============================================

/**
 * useSidebar - Hook to access sidebar context
 * Must be used within a SidebarProvider
 *
 * @returns Sidebar state and control functions
 * @throws Error if used outside SidebarProvider
 */
export function useSidebar(): SidebarContextType {
  const context = useContext(SidebarContext);

  // Ensure hook is used within provider
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }

  return context;
}

// =============================================
// Constants for consistent styling
// =============================================

// Sidebar width values (in pixels) for use in layout calculations
export const SIDEBAR_WIDTH = {
  expanded: 240,   // w-60 = 15rem = 240px
  collapsed: 72,   // w-[72px]
} as const;

// Tailwind classes for sidebar widths
export const SIDEBAR_WIDTH_CLASSES = {
  expanded: "w-60",        // 240px
  collapsed: "w-[72px]",   // 72px
} as const;

// Tailwind classes for main content margin-left
export const MAIN_MARGIN_CLASSES = {
  expanded: "ml-60",       // 240px margin
  collapsed: "ml-[72px]",  // 72px margin
} as const;
