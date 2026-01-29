"use client";

// =============================================
// Channel Item Component
// =============================================
// Individual communication channel in the Comms Hub dropdown
// Shows channel type, status, and unread count

import { Mail, MessageCircle, Phone, Settings, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Channel, ChannelType, ChannelStatus } from "@/types/comms";

// Props interface
interface ChannelItemProps {
  channel: Channel;              // Channel data
  onConnect?: () => void;        // Connect button callback
  onSettings?: () => void;       // Settings button callback
}

/**
 * Icon mapping for channel types
 */
const CHANNEL_TYPE_ICONS: Record<ChannelType, typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  sms: Phone,
};

/**
 * Status indicator configuration
 */
const STATUS_CONFIG: Record<ChannelStatus, { icon: typeof Check; label: string; className: string }> = {
  connected: {
    icon: Check,
    label: "Connected",
    className: "text-status-complete-foreground",
  },
  disconnected: {
    icon: AlertCircle,
    label: "Not configured",
    className: "text-muted-foreground",
  },
  connecting: {
    icon: Loader2,
    label: "Connecting...",
    className: "text-status-pending-foreground animate-spin",
  },
  error: {
    icon: AlertCircle,
    label: "Connection error",
    className: "text-error",
  },
};

/**
 * ChannelItem - Single channel in the Comms Hub
 * Shows status, unread count, and action buttons
 */
export function ChannelItem({
  channel,
  onConnect,
  onSettings,
}: ChannelItemProps) {
  // Get icons and status config
  const TypeIcon = CHANNEL_TYPE_ICONS[channel.type];
  const statusConfig = STATUS_CONFIG[channel.status];
  const StatusIcon = statusConfig.icon;

  const isConnected = channel.status === "connected";
  const isDisconnected = channel.status === "disconnected";

  return (
    <div className="p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Channel type icon */}
        <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
          <TypeIcon className="h-5 w-5 text-muted-foreground" />
        </div>

        {/* Channel info */}
        <div className="flex-1 min-w-0">
          {/* Name and status */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm text-foreground">
              {channel.name}
            </span>
            <div className="flex items-center gap-1 text-xs">
              <StatusIcon className={`h-3 w-3 ${statusConfig.className}`} />
              <span className={statusConfig.className}>
                {statusConfig.label}
              </span>
            </div>
          </div>

          {/* Identifier (email/phone) */}
          {channel.identifier && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {channel.identifier}
            </p>
          )}

          {/* Actions row */}
          <div className="flex items-center justify-between mt-2">
            {/* Unread badge or connect button */}
            {isConnected ? (
              <div className="flex items-center gap-2">
                {channel.unreadCount > 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-brand-muted text-brand-dark">
                    {channel.unreadCount} new
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No new messages
                  </span>
                )}
              </div>
            ) : isDisconnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onConnect}
                className="h-7 text-xs"
              >
                Connect →
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {statusConfig.label}
              </span>
            )}

            {/* Settings button (only for connected channels) */}
            {isConnected && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onSettings}
                className="h-7 w-7"
                aria-label={`${channel.name} settings`}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
