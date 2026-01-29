// =============================================
// Communications Hub Type Definitions
// =============================================
// Types for managing communication channels in topbar
// Supports Email, WhatsApp, and SMS/Phone channels

/**
 * Channel types supported by the Comms Hub
 */
export type ChannelType = "email" | "whatsapp" | "sms";

/**
 * Connection status for a channel
 */
export type ChannelStatus =
  | "connected"      // Successfully connected and active
  | "disconnected"   // Not connected
  | "connecting"     // Currently establishing connection
  | "error";         // Connection failed with error

/**
 * Communication channel configuration
 */
export interface Channel {
  id: string;                    // Unique channel identifier
  type: ChannelType;             // Channel type (email, whatsapp, sms)
  name: string;                  // Display name (e.g., "Gmail", "WhatsApp Business")
  status: ChannelStatus;         // Current connection status
  identifier: string;            // Email address, phone number, etc.
  unreadCount: number;           // Number of unread messages
  lastSyncAt: Date | null;       // Last successful sync timestamp
  config?: ChannelConfig;        // Channel-specific configuration
  workspaceId: string;           // Associated workspace
  createdAt: Date;               // When channel was added
  updatedAt: Date;               // Last configuration update
}

/**
 * Channel-specific configuration (stored encrypted)
 */
export interface ChannelConfig {
  // Email (IMAP/SMTP) config
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;

  // WhatsApp Business API config
  apiKey?: string;
  businessId?: string;

  // SMS/Phone (Twilio) config
  accountSid?: string;
  authToken?: string;

  // Common settings
  autoSync?: boolean;            // Enable automatic sync
  syncInterval?: number;         // Sync interval in minutes
}

/**
 * Message direction
 */
export type MessageDirection = "inbound" | "outbound";

/**
 * Message status
 */
export type MessageStatus =
  | "received"     // Inbound message received
  | "read"         // Message has been read
  | "sent"         // Outbound message sent
  | "delivered"    // Outbound message delivered
  | "failed";      // Message send/receive failed

/**
 * Communication message
 */
export interface Message {
  id: string;                    // Unique message identifier
  channelId: string;             // Source channel ID
  channelType: ChannelType;      // Channel type for icon display
  direction: MessageDirection;   // Inbound or outbound
  status: MessageStatus;         // Current message status

  // Sender/recipient info
  from: string;                  // Sender address/number
  to: string;                    // Recipient address/number
  fromName?: string;             // Sender display name

  // Content
  subject?: string;              // Email subject (optional for SMS/WhatsApp)
  preview: string;               // Message preview/excerpt
  body?: string;                 // Full message body

  // Metadata
  timestamp: Date;               // When message was sent/received
  isRFQ?: boolean;               // Detected as RFQ
  rfqId?: string;                // Linked RFQ if processed

  // Workspace context
  workspaceId: string;
}

/**
 * Comms Hub aggregate status
 */
export interface CommsHubStatus {
  totalChannels: number;         // Total configured channels
  connectedChannels: number;     // Currently connected channels
  totalUnread: number;           // Total unread messages across all channels
  hasError: boolean;             // Any channel has error
}

/**
 * Channel connection request
 */
export interface ConnectChannelRequest {
  type: ChannelType;
  identifier: string;            // Email/phone number
  config: ChannelConfig;
  workspaceId: string;
}

/**
 * Recent messages request
 */
export interface RecentMessagesRequest {
  workspaceId?: string;
  channelId?: string;
  channelType?: ChannelType;
  limit?: number;                // Default: 10
  offset?: number;
  unreadOnly?: boolean;
}

/**
 * Channel icon mapping for UI
 */
export const CHANNEL_ICONS: Record<ChannelType, string> = {
  email: "Mail",
  whatsapp: "MessageCircle",
  sms: "Phone",
};

/**
 * Channel display names
 */
export const CHANNEL_NAMES: Record<ChannelType, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "Phone/SMS",
};

/**
 * Status colors for UI (using design tokens)
 */
export const STATUS_COLORS: Record<ChannelStatus, string> = {
  connected: "text-status-complete-foreground",
  disconnected: "text-muted-foreground",
  connecting: "text-status-pending-foreground",
  error: "text-error",
};
