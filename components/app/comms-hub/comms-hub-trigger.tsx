"use client";

// =============================================
// Comms Hub Trigger Component
// =============================================
// Button in topbar that opens the Comms Hub dropdown
// Shows badge with unread count and connection status

import { useState, useEffect } from "react";
import { Radio, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CommsHubStatus } from "@/types/comms";

// Props interface
interface CommsHubTriggerProps {
  isOpen: boolean;               // Dropdown open state
  onClick: () => void;           // Toggle dropdown
  workspaceId?: string;          // Filter by workspace
}

/**
 * CommsHubTrigger - Topbar button for Comms Hub
 * Shows connection status and unread count badge
 */
export function CommsHubTrigger({
  isOpen,
  onClick,
  workspaceId,
}: CommsHubTriggerProps) {
  // State for comms status
  const [status, setStatus] = useState<CommsHubStatus | null>(null);

  // Fetch comms status
  useEffect(() => {
    async function fetchStatus() {
      try {
        const params = new URLSearchParams();
        if (workspaceId) params.append("workspaceId", workspaceId);
        params.append("includeMessages", "false"); // Only need status

        const response = await fetch(`/api/comms?${params}`);
        const result = await response.json();

        if (result.success) {
          setStatus(result.data.status);
        }
      } catch (error) {
        console.error("Failed to fetch comms status:", error);
      }
    }

    fetchStatus();

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  // Determine icon state
  const hasConnected = status && status.connectedChannels > 0;
  const hasError = status?.hasError;
  const unreadCount = status?.totalUnread || 0;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={`h-9 w-9 relative ${isOpen ? "bg-secondary" : ""}`}
      aria-label="Communications hub"
      aria-expanded={isOpen}
      aria-haspopup="true"
    >
      {/* Main icon */}
      <Radio className="h-4 w-4" />

      {/* Connection status indicator (green dot or error) */}
      {status && (
        <span
          className={`
            absolute top-1 right-1 h-2 w-2 rounded-full
            ${hasError
              ? "bg-error"
              : hasConnected
                ? "bg-status-complete-foreground"
                : "bg-muted-foreground"
            }
          `}
          aria-hidden="true"
        />
      )}

      {/* Unread count badge */}
      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center"
          aria-label={`${unreadCount} unread messages`}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Button>
  );
}
