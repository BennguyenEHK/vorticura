"use client";

// =============================================
// Panel Header
// =============================================
// Header component for workboard panels
// Contains: drag handle, title, minimize/close controls
//
// Close button behavior:
// - Chat panel: Undocks to FAB (removePanel + setDocked)
// - Other panels: Hides panel (togglePanelVisibility) - can restore via toggle icons

import {
  GripVertical,
  Maximize2,
  Minimize2,
  X,
  Bot,
  GitBranch,
  DollarSign,
  FileText,
  FolderOpen,
} from "lucide-react";
import { useWorkboard } from "./workboard-provider";
import { useAIChat } from "../ai-chat/ai-chat-provider";
import { Button } from "@/components/ui/button";

// =============================================
// Icon Map
// =============================================

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot,
  GitBranch,
  DollarSign,
  FileText,
  FolderOpen,
};

// =============================================
// Header Component
// =============================================

interface PanelHeaderProps {
  id: string;                    // Panel identifier
  title: string;                 // Panel title
  icon?: string;                 // Lucide icon name
  isClosable?: boolean;          // Legacy prop - no longer used (all panels have close button)
}

/**
 * PanelHeader - Header for workboard panels
 * Features:
 * - Drag handle (grip icon)
 * - Panel title with icon
 * - Minimize button
 * - Close button (all panels - hides or undocks based on panel type)
 */
export function PanelHeader({
  id,
  title,
  icon,
  // isClosable is now ignored - all panels have close button
}: PanelHeaderProps) {
  // Get workboard actions and state for maximize/restore functionality
  const { toggleMaximize, removePanel, togglePanelVisibility, maximizedPanelId } = useWorkboard();

  // Get AI Chat actions for undocking
  const { setDocked } = useAIChat();

  // Get icon component from icon name
  const IconComponent = icon ? iconMap[icon] : null;

  // Determine if this is the chat panel (different close behavior)
  const isChatPanel = id === "chat";

  // Check if this panel is currently maximized
  const isMaximized = maximizedPanelId === id;

  /**
   * Handle close/hide panel
   * - Chat panel: Undock to FAB mode (removePanel + setDocked)
   * - Other panels: Hide panel with position preserved (togglePanelVisibility)
   */
  const handleClose = () => {
    if (isChatPanel) {
      // Chat panel: undock it (return to floating FAB)
      setDocked(false);
      removePanel(id);
    } else {
      // Other panels: hide with position preserved (can restore via toggle icons)
      togglePanelVisibility(id);
    }
  };

  return (
    <div
      className={`
        panel-drag-handle
        flex items-center justify-between
        px-3 py-2
        border-b border-border
        bg-muted/50
        cursor-grab
        active:cursor-grabbing
        select-none
      `}
    >
      {/* Left side: drag handle + icon + title */}
      <div className="flex items-center gap-2">
        {/* Drag handle icon - indicates draggable area */}
        <GripVertical className="w-4 h-4 text-muted-foreground" />

        {/* Panel icon - visual identifier */}
        {IconComponent && (
          <IconComponent className="w-4 h-4 text-muted-foreground" />
        )}

        {/* Panel title */}
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>

      {/* Right side: action buttons */}
      <div className="flex items-center gap-1">
        {/* Maximize/Restore button - expands panel to fill space or restores to original */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation(); // Prevent drag start
            toggleMaximize(id);
          }}
          aria-label={isMaximized ? "Restore panel" : "Maximize panel"}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {/* Show Minimize2 when maximized (click to restore), Maximize2 when normal (click to maximize) */}
          {isMaximized ? (
            <Minimize2 className="w-3 h-3" />
          ) : (
            <Maximize2 className="w-3 h-3" />
          )}
        </Button>

        {/* Close button - all panels have this now */}
        {/* Chat: "Close panel" (undocks to FAB) */}
        {/* Others: "Hide panel" (can restore via toggle icons in header) */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation(); // Prevent drag start
            handleClose();
          }}
          aria-label={isChatPanel ? "Close panel" : "Hide panel"}
          title={isChatPanel ? "Close" : "Hide"}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
