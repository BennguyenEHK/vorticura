"use client";

// =============================================
// Comms Hub Dropdown Component
// =============================================
// Dropdown panel showing communication channels and recent messages
// Appears when clicking the Comms Hub trigger in topbar

import { useEffect, useState, useRef } from "react";
import { X, Plus, Mail, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelItem } from "./channel-item";
import type { Channel, Message } from "@/types/comms";
import { getOAuthRedirectUrl } from "@/lib/actions/email-connection-actions";

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
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

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

  // Reset provider picker when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setShowProviderPicker(false);
      setConnectingProvider(null);
    }
  }, [isOpen]);

  // Poll Gmail inbox directly (bypasses Pub/Sub — works in local dev)
  async function handleSyncInbox() {
    setSyncing(true);
    try {
      const res  = await fetch('/api/cron/sync-gmail', { method: 'POST' });
      const data = await res.json();
      if (data.totalProcessed > 0) {
        // Re-fetch messages to show newly synced emails
        const params = new URLSearchParams({ includeMessages: 'true', messageLimit: '5' });
        if (workspaceId) params.append('workspaceId', workspaceId);
        const refresh = await fetch(`/api/comms?${params}`);
        const result  = await refresh.json();
        if (result.success) {
          setChannels(result.data.channels);
          setMessages(result.data.messages);
        }
      }
    } catch (err) {
      console.error('Inbox sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }

  // Starts OAuth flow for connecting an email provider (mode: 'connect')
  async function handleConnectProvider(provider: 'gmail' | 'outlook') {
    setConnectingProvider(provider);
    try {
      const url = await getOAuthRedirectUrl(provider, 'connect');
      window.location.href = url;
    } catch (error) {
      console.error('Failed to start OAuth connect:', error);
      setConnectingProvider(null);
    }
  }

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
        <div className="flex items-center gap-1">
          {/* Manual inbox sync — polls Gmail directly (bypasses Pub/Sub for local dev) */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSyncInbox}
            disabled={syncing}
            className="h-8 w-8"
            aria-label="Sync inbox"
            title="Sync inbox"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          </Button>
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
                      onConnect={async () => {
                        // Determine provider from channel name (Gmail or Outlook)
                        const provider = channel.name.toLowerCase().includes('gmail')
                          ? 'gmail'
                          : channel.name.toLowerCase().includes('outlook')
                            ? 'outlook'
                            : null;
                        if (!provider) return; // Non-OAuth channel (WhatsApp/SMS) — not handled yet
                        await handleConnectProvider(provider);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Add Channel — shows provider picker on click */}
            <div className="px-4 pb-2">
              {!showProviderPicker ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowProviderPicker(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Channel
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium mb-2">
                    Select email provider:
                  </p>
                  {/* Gmail option */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleConnectProvider('gmail')}
                    disabled={connectingProvider !== null}
                  >
                    {connectingProvider === 'gmail' ? (
                      <span className="mr-2 h-4 w-4 animate-spin">⟳</span>
                    ) : (
                      <svg className="mr-2 h-4 w-4 flex-shrink-0" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                    )}
                    {connectingProvider === 'gmail' ? 'Redirecting...' : 'Connect Gmail'}
                  </Button>
                  {/* Outlook option */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleConnectProvider('outlook')}
                    disabled={connectingProvider !== null}
                  >
                    {connectingProvider === 'outlook' ? (
                      <span className="mr-2 h-4 w-4 animate-spin">⟳</span>
                    ) : (
                      <svg className="mr-2 h-4 w-4 flex-shrink-0" viewBox="0 0 23 23">
                        <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                        <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                        <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                        <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
                      </svg>
                    )}
                    {connectingProvider === 'outlook' ? 'Redirecting...' : 'Connect Outlook'}
                  </Button>
                  {/* Cancel */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    onClick={() => setShowProviderPicker(false)}
                    disabled={connectingProvider !== null}
                  >
                    Cancel
                  </Button>
                </div>
              )}
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
