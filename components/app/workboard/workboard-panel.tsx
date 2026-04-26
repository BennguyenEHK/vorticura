"use client";

// =============================================
// Workboard Panel — Mission Control card
// =============================================
// Each grid panel is a vellum-on-paper surface with a single hairline rule
// border. Sharp 6px corners, no drop shadow, no rounded-2xl. Depth comes from
// the warm vellum fill against the paper page — exactly the gesture that
// distinguishes a "considered" surface from a v0 template.

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
 * WorkboardPanel — Vellum surface, hairline rule, sharp corners, no shadow.
 * Header carries the drag handle and the maximize/close instrument controls.
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
        bg-vellum text-ink
        rounded-sm border border-rule
        flex flex-col overflow-hidden
        transition-colors duration-200
        ${className}
      `}
    >
      {/* Panel header with drag handle + controls */}
      <PanelHeader
        id={id}
        title={title}
        icon={icon}
        isMinimized={isMinimized}
        isClosable={isClosable}
      />

      {/* Panel body — hidden when minimized */}
      {!isMinimized && (
        <div className="flex-1 overflow-auto min-h-0">{children}</div>
      )}
    </div>
  );
}
