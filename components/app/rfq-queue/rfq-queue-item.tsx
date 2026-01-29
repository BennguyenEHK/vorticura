"use client";

// =============================================
// RFQ Queue Item Component
// =============================================
// Individual RFQ item in the sidebar queue
// Shows client name, stage, and status indicator

import Link from "next/link";
import { Circle, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import type { QueuedRFQ, QueueStatus } from "@/types/rfq-queue";

// Props interface
interface RFQQueueItemProps {
  rfq: QueuedRFQ;           // RFQ data to display
  isCollapsed?: boolean;    // Sidebar collapsed state
  isActive?: boolean;       // Currently selected RFQ
}

/**
 * Status icon mapping based on queue status
 * Uses design tokens for colors
 */
const STATUS_ICONS: Record<QueueStatus, { icon: typeof Circle; className: string }> = {
  active: {
    icon: Circle,
    className: "text-status-complete-foreground fill-status-complete-foreground", // Green
  },
  waiting: {
    icon: Clock,
    className: "text-status-draft", // Amber
  },
  action: {
    icon: AlertCircle,
    className: "text-brand", // Sky blue - needs attention
  },
  completed: {
    icon: CheckCircle2,
    className: "text-muted-foreground", // Gray
  },
  error: {
    icon: AlertCircle,
    className: "text-error", // Red
  },
};

/**
 * RFQQueueItem - Single RFQ in the queue list
 * Links to workspace for that RFQ
 */
export function RFQQueueItem({
  rfq,
  isCollapsed = false,
  isActive = false,
}: RFQQueueItemProps) {
  // Get status icon and styling
  const statusConfig = STATUS_ICONS[rfq.status];
  const StatusIcon = statusConfig.icon;

  // Build href to workspace (uses quotationId if available, otherwise rfq.id)
  const workspaceHref = rfq.quotationId
    ? `/workspace/${rfq.quotationId}`
    : `/workspace/${rfq.id}`;

  return (
    <Link
      href={workspaceHref}
      className={`
        flex items-center gap-3 px-3 py-2 rounded-lg
        transition-all group relative
        ${isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        }
      `}
      title={isCollapsed ? `${rfq.id}: ${rfq.clientName}` : undefined}
    >
      {/* Status indicator icon */}
      <StatusIcon className={`h-4 w-4 flex-shrink-0 ${statusConfig.className}`} />

      {/* Content - hidden when collapsed */}
      {!isCollapsed && (
        <div className="flex-1 min-w-0">
          {/* RFQ ID and client name */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {rfq.id}
            </span>
            {/* Unread badge */}
            {rfq.unreadCount && rfq.unreadCount > 0 && (
              <span className="flex-shrink-0 h-4 min-w-4 px-1 rounded-full bg-brand text-brand-foreground text-xs flex items-center justify-center">
                {rfq.unreadCount}
              </span>
            )}
          </div>

          {/* Client name */}
          <p className="text-xs text-muted-foreground truncate">
            {rfq.clientName}
          </p>

          {/* Stage label */}
          <p className="text-xs text-muted-foreground truncate">
            {rfq.stageLabel}
          </p>
        </div>
      )}

      {/* Active indicator bar */}
      {isActive && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r bg-brand"
          style={{
            boxShadow: "0 0 8px oklch(0.685 0.169 237.323 / 0.3)",
          }}
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
