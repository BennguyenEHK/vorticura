"use client";

// =============================================
// Panel Header — Mission Control instrument bar
// =============================================
// Sits at the top of every workboard panel. Carries:
// - Drag grip (left)
// - Mono ALL-CAPS panel title (instrument label gesture)
// - Maximize/restore + close controls (ghost buttons, hairline tray)
// Uses paper fill with a hairline rule beneath — separates header from body
// without a heavy bar.

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

const iconMap: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
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
  title: string;                 // Panel title (will be rendered ALL CAPS)
  icon?: string;                 // Lucide icon name
  isClosable?: boolean;          // Legacy prop (every panel has a close button now)
  isMinimized?: boolean;         // Reserved for future minimize control
}

/**
 * PanelHeader — Mission Control instrument bar.
 * Title renders as a mono ALL-CAPS micro-label (panel-as-instrument).
 * Close behavior:
 *   - Chat panel: undocks back to FAB
 *   - Other panels: hides (toggle visible from the workspace header)
 */
export function PanelHeader({
  id,
  title,
  icon,
}: PanelHeaderProps) {
  // Workboard actions for maximize/restore and hide
  const { toggleMaximize, removePanel, togglePanelVisibility, maximizedPanelId } = useWorkboard();

  // AI Chat actions for undock-to-FAB behavior
  const { setDocked } = useAIChat();

  // Resolve the icon component from its name
  const IconComponent = icon ? iconMap[icon] : null;

  // Chat panel has different close semantics (undock instead of hide)
  const isChatPanel = id === "chat";

  // Track whether this panel is currently maximized
  const isMaximized = maximizedPanelId === id;

  /**
   * Close handler:
   * - Chat: undock to FAB (return to floating mode)
   * - Other panels: hide with position preserved
   */
  const handleClose = () => {
    if (isChatPanel) {
      setDocked(false);
      removePanel(id);
    } else {
      togglePanelVisibility(id);
    }
  };

  return (
    <div
      className={`
        panel-drag-handle
        flex items-center justify-between
        px-3 py-2
        border-b border-rule
        bg-paper
        cursor-grab
        active:cursor-grabbing
        select-none
      `}
    >
      {/* Left side: drag grip + icon + mono caps title */}
      <div className="flex items-center gap-2.5">
        {/* Drag grip — graphite tone, indicates this row is the drag handle */}
        <GripVertical className="w-4 h-4 text-graphite" strokeWidth={1.5} />

        {/* Panel icon — single-weight Lucide stroke */}
        {IconComponent && (
          <IconComponent className="w-4 h-4 text-graphite" strokeWidth={1.5} />
        )}

        {/* Panel title — mono ALL-CAPS, wide tracking (instrument label) */}
        <span className="micro-label text-ink">{title}</span>
      </div>

      {/* Right side: maximize/restore + close — both ghost buttons */}
      <div className="flex items-center gap-1">
        {/* Maximize/restore */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => {
            e.stopPropagation(); // Prevent triggering a drag start
            toggleMaximize(id);
          }}
          aria-label={isMaximized ? "Restore panel" : "Maximize panel"}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Minimize2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
        </Button>

        {/* Close — hover state shifts to ember (oxidized red) for "warning lamp" feel */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-ember/10 hover:text-ember"
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          aria-label={isChatPanel ? "Close panel" : "Hide panel"}
          title={isChatPanel ? "Close" : "Hide"}
        >
          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
