"use client";

// =============================================
// Comms Hub Dropdown Component
// =============================================
// Dropdown panel showing communication channels and recent messages
// Appears when clicking the Comms Hub trigger in topbar

import { useEffect, useState, useRef } from "react";
import { X, Plus, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelItem } from "./channel-item";
import type { Channel, Message } from "@/types/comms";

// Props interface
interface CommsHubDropdownProps {
  isOpen: boolean;               // Dropdown visibility
  onClose: () => void;           // Close callback
  workspaceId?: string;          // Filter by workspace
}

/**
 * Format relative time for message timestamps
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return `${Math.floor(diffMins / 1440)}d ago`;
}

/**
 * CommsHubDropdown - Full dropdown panel for Comms Hub
 * Shows channels, status, and recent messages
 */
export function CommsHubDropdown({
  isOpen,
  onClose,
  workspaceId,
}: CommsHubDropdownProps) {
  // State for channels and messages
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Ref for click-outside handling
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch data when dropdown opens
  useEffect(() => {
    if (!isOpen) return;

    async function fetchData() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (workspaceId) params.append("workspaceId", workspaceId);
        params.append("includeMessages", "true");
        params.append("messageLimit", "5");

        const response = await fetch(`/api/comms?${params}`);
        const result = await response.json();

        if (result.success) {
          setChannels(result.data.channels);
          setMessages(result.data.messages);
        }
      } catch (error) {
        console.error("Failed to fetch comms data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [isOpen, workspaceId]);

  // Handle click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Don't render if closed
  if (!isOpen) return null;

  // Separate connected and disconnected channels
  const connectedChannels = channels.filter((ch) => ch.status === "connected");
  const disconnectedChannels = channels.filter((ch) => ch.status !== "connected");

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full right-0 mt-2 w-[360px] max-h-[480px] overflow-hidden rounded-xl border border-border bg-popover shadow-lg z-50"
      role="dialog"
      aria-label="Communications"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="font-semibold text-foreground">Communications</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="overflow-y-auto max-h-[400px]">
        {isLoading ? (
          // Loading skeleton
          <div className="p-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Connected channels section */}
            {connectedChannels.length > 0 && (
              <div className="p-4">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                  Connected
                </h3>
                <div className="space-y-2">
                  {connectedChannels.map((channel) => (
                    <ChannelItem
                      key={channel.id}
                      channel={channel}
                      onSettings={() => {
                        console.log("Settings for:", channel.id);
                        // TODO: Open settings modal
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Disconnected channels section */}
            {disconnectedChannels.length > 0 && (
              <div className="p-4 pt-0">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                  Disconnected
                </h3>
                <div className="space-y-2">
                  {disconnectedChannels.map((channel) => (
                    <ChannelItem
                      key={channel.id}
                      channel={channel}
                      onConnect={() => {
                        console.log("Connect:", channel.id);
                        // TODO: Open connect modal
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Add channel button */}
            <div className="px-4 pb-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  console.log("Add channel");
                  // TODO: Open add channel modal
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Channel
              </Button>
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Recent incoming messages */}
            {messages.length > 0 && (
              <div className="p-4">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                  Recent Incoming
                </h3>
                <div className="space-y-2">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className="p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors cursor-pointer"
                    >
                      {/* Message header */}
                      <div className="flex items-start gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          {/* Sender and time */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {message.isRFQ && (
                                <span className="text-brand mr-1">📧</span>
                              )}
                              {message.fromName || message.from}
                            </span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {formatRelativeTime(message.timestamp)}
                            </span>
                          </div>

                          {/* Subject */}
                          {message.subject && (
                            <p className="text-xs text-foreground truncate mt-0.5">
                              {message.subject}
                            </p>
                          )}

                          {/* Preview */}
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {message.preview}
                          </p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 mt-2 pl-6">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                        >
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-muted-foreground"
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state for messages */}
            {messages.length === 0 && (
              <div className="p-4 text-center">
                <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No recent messages
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
