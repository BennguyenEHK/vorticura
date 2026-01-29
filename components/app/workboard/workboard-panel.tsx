"use client";

// =============================================
// Workboard Panel
// =============================================
// Generic panel wrapper component
// Provides consistent styling and panel header

import { type ReactNode } from "react";
import { PanelHeader } from "./panel-header";

// =============================================
// Panel Component
// =============================================

interface WorkboardPanelProps {
  id: string;                    // Panel identifier
  title: string;                 // Panel title for header
  icon?: string;                 // Lucide icon name
  isMinimized?: boolean;         // Collapsed state
  isClosable?: boolean;          // Show close button
  children: ReactNode;           // Panel content
  className?: string;            // Additional classes
}

/**
 * WorkboardPanel - Generic wrapper for workboard panels
 * Features:
 * - Consistent card styling
 * - Header with drag handle
 * - Minimize/close controls
 * - Overflow handling
 */
export function WorkboardPanel({
  id,
  title,
  icon,
  isMinimized = false,
  isClosable = false,
  children,
  className = "",
}: WorkboardPanelProps) {
  return (
    <div
      className={`
        h-full
        bg-card rounded-lg border border-border
        shadow-sm
        flex flex-col
        transition-all duration-200
        ${className}
      `}
    >
      {/* Panel header with drag handle */}
      <PanelHeader
        id={id}
        title={title}
        icon={icon}
        isMinimized={isMinimized}
        isClosable={isClosable}
      />

      {/* Panel content - hidden when minimized */}
      {!isMinimized && (
        <div className="flex-1 overflow-auto min-h-0">{children}</div>
      )}
    </div>
  );
}
