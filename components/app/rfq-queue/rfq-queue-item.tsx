"use client";

// =============================================
// RFQ Queue Item — Mission Control queue row
// =============================================
// Each row is a compact ledger entry: square instrument-status icon, mono
// reference, body-grotesque metadata. Active row is marked by a 2px Azimuth
// bar at the left edge — same gesture as the sidebar nav. No glow, no halo.

import Link from "next/link";
import { Circle, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { useWorkspaceData } from "@/hooks/workspace-data-context";
import type { QueuedRFQ, QueueStatus } from "@/types/rfq-queue";

// Props interface
interface RFQQueueItemProps {
  rfq: QueuedRFQ;           // RFQ data to display
  isCollapsed?: boolean;    // Sidebar collapsed state
  isActive?: boolean;       // Currently selected RFQ
}

/**
 * Status icon mapping — driven entirely by Mission Control tokens.
 * Active = verdigris, Waiting = signal, Action = azimuth, Complete = graphite,
 * Error = ember.
 */
const STATUS_ICONS: Record<QueueStatus, { icon: typeof Circle; className: string }> = {
  active:    { icon: Circle,         className: "text-verdigris fill-verdigris" },
  waiting:   { icon: Clock,          className: "text-signal" },
  action:    { icon: AlertCircle,    className: "text-azimuth" },
  completed: { icon: CheckCircle2,   className: "text-graphite" },
  error:     { icon: AlertCircle,    className: "text-ember" },
};

/**
 * RFQQueueItem — A single procurement queue row in the sidebar.
 */
export function RFQQueueItem({
  rfq,
  isCollapsed = false,
  isActive = false,
}: RFQQueueItemProps) {
  const { prefetchWorkspace } = useWorkspaceData();

  // Resolve status icon + tone
  const statusConfig = STATUS_ICONS[rfq.status];
  const StatusIcon = statusConfig.icon;

  // URL-encode rfq_reference so spaces / slashes survive routing
  const workspaceHref = `/workspace/${encodeURIComponent(rfq.rfqReference)}`;

  return (
    <Link
      href={workspaceHref}
      className={`
        relative flex items-start gap-3 px-5 py-2.5
        transition-colors group font-body
        ${isActive
          ? "bg-vellum text-ink"
          : "text-graphite hover:bg-vellum hover:text-ink"
        }
      `}
      title={isCollapsed ? `${rfq.rfqReference}: ${rfq.clientName}` : undefined}
      onMouseEnter={() => {
        // Notify in-page listeners + prefetch the workspace payload
        try {
          const eventDetail = { uiType: 'workspace', rfqReference: rfq.rfqReference };
          console.log('[RFQQueueItem] dispatching in-page uiReload event:', eventDetail);
          window.dispatchEvent(new CustomEvent('quoteflow:uiReload', { detail: eventDetail }));
        } catch (evtErr) {
          console.warn('[RFQQueueItem] failed to dispatch uiReload event:', evtErr);
        }
        prefetchWorkspace(rfq.rfqReference);
      }}
    >
      {/* Active marker — 2px Azimuth bar flush to the left edge */}
      {isActive && (
        <span
          className="absolute left-0 top-0 bottom-0 w-[2px] bg-azimuth"
          aria-hidden="true"
        />
      )}

      {/* Status indicator icon — sits at the same vertical as the reference line */}
      <StatusIcon
        className={`h-3.5 w-3.5 flex-shrink-0 mt-1 ${statusConfig.className}`}
        strokeWidth={1.5}
      />

      {/* Body — multi-line metadata, hidden when collapsed */}
      {!isCollapsed && (
        <div className="flex-1 min-w-0">
          {/* RFQ reference + unread badge */}
          <div className="flex items-center gap-2">
            {/* Mono caps reference — instrument code feel */}
            <span className="font-data text-[11px] tracking-[0.06em] uppercase text-ink truncate">
              {rfq.rfqReference}
            </span>
            {/* Unread count — small Azimuth square (rectangular, not pill) */}
            {rfq.unreadCount > 0 && (
              <span className="flex-shrink-0 h-4 min-w-4 px-1 rounded-[2px] bg-azimuth text-paper font-data text-[10px] flex items-center justify-center">
                {rfq.unreadCount}
              </span>
            )}
          </div>

          {/* Client name — body grotesque */}
          <p className="text-xs text-graphite truncate mt-0.5">{rfq.clientName}</p>
          {/* Client email — mono for technical metadata */}
          <p className="font-data text-[11px] text-graphite truncate" title={rfq.clientEmail}>
            {rfq.clientEmail}
          </p>
          {/* Subject — body grotesque truncated */}
          <p className="text-xs text-graphite truncate" title={rfq.subject}>
            {rfq.subject}
          </p>
          {/* Stage label — italicized graphite for state metadata */}
          <p className="text-xs text-graphite/80 truncate italic">{rfq.stageLabel}</p>
        </div>
      )}
    </Link>
  );
}
