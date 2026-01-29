"use client";

// =============================================
// AI Chat Floating Action Button (FAB)
// =============================================
// Draggable floating button that opens AI Chat popover
// Can be dragged to Workboard to dock as a panel

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Bot, Sparkles } from "lucide-react";
import { useAIChat } from "./ai-chat-provider";
import { DEFAULT_FAB_CONFIG } from "@/types/ai-chat";

// =============================================
// FAB Component
// =============================================

/**
 * AIChatFab - Floating Action Button for AI Chat
 * Features:
 * - Click to toggle popover
 * - Drag to workboard to dock
 * - Badge shows unread count
 */
export function AIChatFab() {
  // Get AI Chat state and actions from context
  const { isDocked, isDragging, unreadCount, togglePopover, setDragging } =
    useAIChat();

  // Set up draggable from @dnd-kit
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: "ai-chat-fab",
    data: {
      type: "ai-chat-fab", // Identifies this draggable for drop targets
    },
  });

  // Calculate transform style for drag movement
  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: 9999, // Ensure FAB is above everything while dragging
      }
    : undefined;

  // Don't render if docked in workboard
  if (isDocked) {
    return null;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        fixed bottom-6 right-6 z-50
        ${isDragging ? "cursor-grabbing" : "cursor-grab"}
      `}
      {...listeners}
      {...attributes}
    >
      {/* Main FAB button */}
      <button
        onClick={togglePopover}
        className={`
          relative
          w-12 h-12
          rounded-full
          bg-brand text-brand-foreground
          shadow-lg
          flex items-center justify-center
          transition-all duration-200
          hover:bg-brand-hover hover:scale-105
          active:scale-95
          focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2
          ${isDragging ? "scale-110 shadow-xl" : ""}
        `}
        aria-label="Open AI Chat"
      >
        {/* Bot icon - using Sparkles for AI theme */}
        <Bot className="w-6 h-6" />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            className={`
              absolute -top-1 -right-1
              min-w-[18px] h-[18px]
              rounded-full
              bg-destructive text-destructive-foreground
              text-xs font-medium
              flex items-center justify-center
              px-1
            `}
            aria-label={`${unreadCount} unread messages`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Drag hint tooltip (shown while dragging) */}
      {isDragging && (
        <div
          className={`
            absolute -top-10 left-1/2 -translate-x-1/2
            px-2 py-1
            bg-foreground text-background
            text-xs rounded-md
            whitespace-nowrap
            shadow-md
          `}
        >
          Drop on Workboard
        </div>
      )}
    </div>
  );
}
