"use client";

// =============================================
// RFQ Queue List Component
// =============================================
// Scrollable list of RFQs in sidebar
// Shows top 4 by default, scrollable for more

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Inbox } from "lucide-react";
import { RFQQueueItem } from "./rfq-queue-item";
import { Button } from "@/components/ui/button";
import type { QueuedRFQ, QueueResponse } from "@/types/rfq-queue";

// Props interface
interface RFQQueueListProps {
  isCollapsed?: boolean;     // Sidebar collapsed state
  activeRFQId?: string;      // Currently active RFQ ID
  workspaceId?: string;      // Filter by workspace
  initialLimit?: number;     // Initial visible items (default: 4)
}

/**
 * RFQQueueList - Scrollable list of queued RFQs
 * Fetches from API and displays with scroll-to-load-more
 */
export function RFQQueueList({
  isCollapsed = false,
  activeRFQId,
  workspaceId,
  initialLimit = 4,
}: RFQQueueListProps) {
  // State for RFQ list
  const [rfqs, setRfqs] = useState<QueuedRFQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch RFQs from API
  useEffect(() => {
    async function fetchQueue() {
      setIsLoading(true);
      try {
        // Build query params
        const params = new URLSearchParams();
        if (workspaceId) params.append("workspaceId", workspaceId);
        params.append("limit", isExpanded ? "20" : String(initialLimit));

        const response = await fetch(`/api/rfq-queue?${params}`);
        const result = await response.json();

        if (result.success) {
          setRfqs(result.data.items);
          setHasMore(result.data.hasMore);
          setTotal(result.data.total);
        }
      } catch (error) {
        console.error("Failed to fetch RFQ queue:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchQueue();
  }, [workspaceId, initialLimit, isExpanded]);

  // Toggle expanded state
  const toggleExpanded = () => setIsExpanded(!isExpanded);

  // Collapsed view - just show badge with count
  if (isCollapsed) {
    return (
      <div className="px-3 py-2">
        <div
          className="flex items-center justify-center h-10 w-10 rounded-lg bg-sidebar-accent"
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
            key={rfq.id}
            rfq={rfq}
            isCollapsed={isCollapsed}
            isActive={rfq.id === activeRFQId}
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
