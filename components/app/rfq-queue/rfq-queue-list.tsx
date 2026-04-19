"use client";

// =============================================
// RFQ Queue List Component
// =============================================
// Scrollable list of RFQs in sidebar
// Shows top 4 by default, scrollable for more
// Uses direct service calls instead of API routes

import { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Inbox } from "lucide-react";
import { RFQQueueItem } from "./rfq-queue-item";
import { Button } from "@/components/ui/button";
import type { QueuedRFQ } from "@/types/rfq-queue";
// Import queue manager service directly
import { getQueuedRFQs } from "@/lib/services/rfq-queue/queue-manager";
// SSE hook — streams 'rfq-queue' upserts so the list refreshes without a server round-trip
import { useRfqQueueSSE } from "@/hooks/use-rfq-queue-sse";

// Props interface
interface RFQQueueListProps {
  isCollapsed?: boolean;           // Sidebar collapsed state
  activeRfqReference?: string;     // Currently active RFQ reference (decoded from URL)
  initialLimit?: number;           // Initial visible items (default: 3)
}

/**
 * RFQQueueList - Scrollable list of queued RFQs
 * Calls the `getQueuedRFQs` server action directly.
 * Workspace context is resolved server-side from the auth cookie — no IDs passed from client.
 */
export function RFQQueueList({
  isCollapsed = false,
  activeRfqReference,
  initialLimit = 3,
}: RFQQueueListProps) {
  // State for RFQ list
  const [rfqs, setRfqs] = useState<QueuedRFQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch RFQs via server action (workspace resolved server-side)
  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getQueuedRFQs({
        limit: isExpanded ? 20 : initialLimit,
      });

      // Update state with results
      setRfqs((prev) => {
        const sseOnly = prev.filter(
          (p) => !result.items.some((i) => i.rfqId === p.rfqId)
        );
        const merged = [...result.items, ...sseOnly];
        merged.sort((a, b) => {
          const aPinned = a.queuePriority != null;
          const bPinned = b.queuePriority != null;
          if (aPinned && bPinned) return a.queuePriority! - b.queuePriority!;
          if (aPinned) return -1;
          if (bPinned) return 1;
          // Earliest updates first, latest last (ascending updatedAt)
          return a.updatedAt.getTime() - b.updatedAt.getTime();
        });
        return merged.map((r, i) => ({ ...r, priority: i + 1 }));
      });
      setHasMore(result.hasMore);
      setTotal(result.total);
    } catch (error) {
      console.error("Failed to fetch RFQ queue:", error);
    } finally {
      setIsLoading(false);
    }
  }, [initialLimit, isExpanded]);

  // Fetch on mount and when dependencies change
  // Covers triggers A (first load), B (F5), C (new session) per the SSE plan
  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Upsert handler — receives a single QueuedRFQ from SSE and merges it into state
  // Re-sorts by rfqId DESC and re-assigns priority so the list mirrors getQueuedRFQs semantics
  const upsertRfq = useCallback((incoming: QueuedRFQ) => {
    console.log("START RFQ-INJECTIONS")
    setRfqs((prev) => {
      const idx = prev.findIndex((r) => r.rfqId === incoming.rfqId);
      // Replace existing row in place, otherwise prepend (sort below re-orders regardless)
      const merged =
        idx >= 0
          ? prev.map((r) => (r.rfqId === incoming.rfqId ? incoming : r))
          : [incoming, ...prev];
      merged.sort((a, b) => {
        const aPinned = a.queuePriority != null;
        const bPinned = b.queuePriority != null;
        if (aPinned && bPinned) return a.queuePriority! - b.queuePriority!;
        if (aPinned) return -1;
        if (bPinned) return 1;
        return b.rfqId - a.rfqId;
      });
      const ranked = merged.map((r, i) => ({ ...r, priority: i + 1 }));
      // Only bump total when this is a genuinely new row — avoids double-counting on edits
      if (idx < 0) setTotal((t) => t + 1);
      return ranked;
    });
  }, []);

  // Wire trigger D: SSE drop → auto-reconnect → onopen fires onReconnect → re-seed via fetchQueue
  useRfqQueueSSE({ onUpsert: upsertRfq, onReconnect: fetchQueue });

  // Toggle expanded state
  const toggleExpanded = () => setIsExpanded(!isExpanded);

  // Collapsed view - just show badge with count
  if (isCollapsed) {
    return (
      <div className="flex justify-center py-2">
        {/* relative class anchors the absolute-positioned badge */}
        <div
          className="relative flex items-center justify-center h-10 w-10 rounded-lg bg-sidebar-accent"
          title={`${total} RFQs in queue`}
        >
          <Inbox className="h-5 w-5 text-muted-foreground" />
          {total > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-brand text-brand-foreground text-xs flex items-center justify-center">
              {total}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="px-3 py-4">
        <div className="space-y-2">
          {/* Skeleton loaders */}
          {[...Array(initialLimit)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-lg bg-sidebar-accent animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (rfqs.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <Inbox className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No RFQs in queue</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Scrollable RFQ list */}
      <div
        className={`
          space-y-1 overflow-y-auto
          ${isExpanded ? "max-h-64" : "max-h-auto"}
        `}
      >
        {rfqs.map((rfq) => (
          <RFQQueueItem
            key={rfq.rfqId}
            rfq={rfq}
            isCollapsed={isCollapsed}
            isActive={rfq.rfqReference === activeRfqReference}
          />
        ))}
      </div>

      {/* Expand/collapse button if more items available */}
      {(hasMore || isExpanded) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleExpanded}
          className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Show {total - rfqs.length} more
            </>
          )}
        </Button>
      )}
    </div>
  );
}
