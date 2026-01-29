"use client";

// =============================================
// Workboard Drop Zone
// =============================================
// Drop target wrapper for AI Chat FAB
// Shows visual feedback when FAB is being dragged over

import { type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useWorkboard } from "./workboard-provider";
import { Bot } from "lucide-react";

// =============================================
// Drop Zone Component
// =============================================

interface WorkboardDropZoneProps {
  children: ReactNode;
  className?: string;
}

/**
 * WorkboardDropZone - Drop target for AI Chat FAB
 * Features:
 * - Visual highlight when FAB is dragged over
 * - Dashed border indicator
 * - Drop text instruction
 */
export function WorkboardDropZone({
  children,
  className = "",
}: WorkboardDropZoneProps) {
  // Get workboard state
  const { isDraggingOver } = useWorkboard();

  // Set up droppable from @dnd-kit
  const { isOver, setNodeRef } = useDroppable({
    id: "workboard-drop-zone",
    data: {
      accepts: ["ai-chat-fab"], // Only accept AI Chat FAB
    },
  });

  // Show highlight when FAB is being dragged over
  const showDropHighlight = isOver || isDraggingOver;

  return (
    <div
      ref={setNodeRef}
      className={`
        relative
        min-h-[500px]
        ${className}
      `}
    >
      {/* Drop highlight overlay */}
      {showDropHighlight && (
        <div
          className={`
            absolute inset-0 z-10
            border-2 border-dashed border-brand
            bg-brand/5
            rounded-lg
            flex items-center justify-center
            pointer-events-none
            animate-pulse
          `}
        >
          <div className="flex flex-col items-center gap-2 text-brand">
            <Bot className="w-12 h-12" />
            <span className="text-lg font-medium">Drop AI Chat Here</span>
            <span className="text-sm text-muted-foreground">
              Create a new chat panel in the workboard
            </span>
          </div>
        </div>
      )}

      {/* Grid content */}
      {children}
    </div>
  );
}
