"use client";

// =============================================
// Panel Header
// =============================================
// Header component for workboard panels
// Contains: drag handle, title, minimize/close controls

import {
  GripVertical,
  Minus,
  Square,
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
  isMinimized?: boolean;         // Collapsed state
  isClosable?: boolean;          // Show close button
}

/**
 * PanelHeader - Header for workboard panels
 * Features:
 * - Drag handle (grip icon)
 * - Panel title with icon
 * - Minimize button
 * - Close button (for closable panels)
 */
export function PanelHeader({
  id,
  title,
  icon,
  isMinimized = false,
  isClosable = false,
}: PanelHeaderProps) {
  // Get workboard actions
  const { toggleMinimize, removePanel } = useWorkboard();

  // Get AI Chat actions for undocking
  const { setDocked } = useAIChat();

  // Get icon component
  const IconComponent = icon ? iconMap[icon] : null;

  // Handle close/remove panel
  const handleClose = () => {
    // If this is the chat panel, undock it (return to FAB)
    if (id === "chat") {
      setDocked(false);
    }
    removePanel(id);
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
        {/* Drag handle icon */}
        <GripVertical className="w-4 h-4 text-muted-foreground" />

        {/* Panel icon */}
        {IconComponent && (
          <IconComponent className="w-4 h-4 text-muted-foreground" />
        )}

        {/* Panel title */}
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>

      {/* Right side: action buttons */}
      <div className="flex items-center gap-1">
        {/* Minimize button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation(); // Prevent drag start
            toggleMinimize(id);
          }}
          aria-label={isMinimized ? "Expand panel" : "Minimize panel"}
        >
          {isMinimized ? (
            <Square className="w-3 h-3" />
          ) : (
            <Minus className="w-3 h-3" />
          )}
        </Button>

        {/* Close button (only for closable panels) */}
        {isClosable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation(); // Prevent drag start
              handleClose();
            }}
            aria-label="Close panel"
          >
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
