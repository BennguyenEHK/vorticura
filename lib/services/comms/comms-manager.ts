// =============================================
// Communications Manager Service
// =============================================
// Business logic for managing communication channels
// Handles channel CRUD, connection status, and message retrieval

import type {
  Channel,
  ChannelType,
  ChannelStatus,
  Message,
  CommsHubStatus,
  RecentMessagesRequest,
} from "@/types/comms";

// =============================================
// Mock Data for Development
// =============================================

/**
 * Mock channel data for UI development
 * Will be replaced with database queries
 */
const MOCK_CHANNELS: Channel[] = [
  {
    id: "ch-001",
    type: "email",
    name: "Gmail",
    status: "connected",
    identifier: "sales@company.com",
    unreadCount: 3,
    lastSyncAt: new Date("2026-01-29T10:30:00"),
    workspaceId: "ws-001",
    createdAt: new Date("2026-01-15T09:00:00"),
    updatedAt: new Date("2026-01-29T10:30:00"),
  },
  {
    id: "ch-002",
    type: "whatsapp",
    name: "WhatsApp Business",
    status: "connected",
    identifier: "+1 555-0123",
    unreadCount: 0,
    lastSyncAt: new Date("2026-01-29T10:28:00"),
    workspaceId: "ws-001",
    createdAt: new Date("2026-01-20T14:00:00"),
    updatedAt: new Date("2026-01-29T10:28:00"),
  },
  {
    id: "ch-003",
    type: "sms",
    name: "Phone/SMS",
    status: "disconnected",
    identifier: "",
    unreadCount: 0,
    lastSyncAt: null,
    workspaceId: "ws-001",
    createdAt: new Date("2026-01-25T11:00:00"),
    updatedAt: new Date("2026-01-25T11:00:00"),
  },
];

/**
 * Mock message data for recent incoming display
 */
const MOCK_MESSAGES: Message[] = [
  {
    id: "msg-001",
    channelId: "ch-001",
    channelType: "email",
    direction: "inbound",
    status: "received",
    from: "acme@corp.com",
    to: "sales@company.com",
    fromName: "John Smith",
    subject: "Request for Quotation - Industrial Parts",
    preview: "Dear Sir/Madam, We are looking to procure the following items...",
    timestamp: new Date("2026-01-29T10:25:00"),
    isRFQ: true,
    workspaceId: "ws-001",
  },
  {
    id: "msg-002",
    channelId: "ch-001",
    channelType: "email",
    direction: "inbound",
    status: "received",
    from: "supplier@parts.com",
    to: "sales@company.com",
    fromName: "Parts Supplier Co",
    subject: "RE: Quote Request #RFQ-003",
    preview: "Thank you for your inquiry. Please find attached our quotation...",
    timestamp: new Date("2026-01-29T09:45:00"),
    isRFQ: false,
    rfqId: "RFQ-003",
    workspaceId: "ws-001",
  },
  {
    id: "msg-003",
    channelId: "ch-002",
    channelType: "whatsapp",
    direction: "inbound",
    status: "read",
    from: "+1 555-9876",
    to: "+1 555-0123",
    fromName: "TechStart Purchasing",
    preview: "Hi, just checking on the status of our order RFQ-004?",
    timestamp: new Date("2026-01-29T08:30:00"),
    isRFQ: false,
    rfqId: "RFQ-004",
    workspaceId: "ws-001",
  },
];

// =============================================
// Channel Management Functions
// =============================================

/**
 * Get all channels for a workspace
 * @param workspaceId - Workspace identifier
 * @returns Promise<Channel[]> - List of channels
 */
export async function getChannels(workspaceId?: string): Promise<Channel[]> {
  let channels = [...MOCK_CHANNELS];

  if (workspaceId) {
    channels = channels.filter((ch) => ch.workspaceId === workspaceId);
  }

  return channels;
}

/**
 * Get a single channel by ID
 * @param channelId - Channel identifier
 * @returns Promise<Channel | null>
 */
export async function getChannelById(channelId: string): Promise<Channel | null> {
  const channel = MOCK_CHANNELS.find((ch) => ch.id === channelId);
  return channel || null;
}

/**
 * Get aggregate comms hub status
 * @param workspaceId - Optional workspace filter
 * @returns Promise<CommsHubStatus> - Aggregate status
 */
export async function getCommsHubStatus(
  workspaceId?: string
): Promise<CommsHubStatus> {
  const channels = await getChannels(workspaceId);

  return {
    totalChannels: channels.length,
    connectedChannels: channels.filter((ch) => ch.status === "connected").length,
    totalUnread: channels.reduce((sum, ch) => sum + ch.unreadCount, 0),
    hasError: channels.some((ch) => ch.status === "error"),
  };
}

/**
 * Update channel connection status
 * @param channelId - Channel identifier
 * @param status - New connection status
 * @returns Promise<Channel | null>
 */
export async function updateChannelStatus(
  channelId: string,
  status: ChannelStatus
): Promise<Channel | null> {
  const channelIndex = MOCK_CHANNELS.findIndex((ch) => ch.id === channelId);
  if (channelIndex === -1) return null;

  MOCK_CHANNELS[channelIndex] = {
    ...MOCK_CHANNELS[channelIndex],
    status,
    updatedAt: new Date(),
    lastSyncAt: status === "connected" ? new Date() : MOCK_CHANNELS[channelIndex].lastSyncAt,
  };

  return MOCK_CHANNELS[channelIndex];
}

// =============================================
// Message Functions
// =============================================

/**
 * Get recent messages for comms hub dropdown
 * @param request - Filter options
 * @returns Promise<Message[]> - List of recent messages
 */
export async function getRecentMessages(
  request?: RecentMessagesRequest
): Promise<Message[]> {
  let messages = [...MOCK_MESSAGES];

  // Filter by workspace
  if (request?.workspaceId) {
    messages = messages.filter((m) => m.workspaceId === request.workspaceId);
  }

  // Filter by channel
  if (request?.channelId) {
    messages = messages.filter((m) => m.channelId === request.channelId);
  }

  // Filter by channel type
  if (request?.channelType) {
    messages = messages.filter((m) => m.channelType === request.channelType);
  }

  // Filter unread only
  if (request?.unreadOnly) {
    messages = messages.filter((m) => m.status === "received");
  }

  // Sort by timestamp (newest first)
  messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Apply pagination
  const offset = request?.offset || 0;
  const limit = request?.limit || 10;
  messages = messages.slice(offset, offset + limit);

  return messages;
}

/**
 * Mark message as read
 * @param messageId - Message identifier
 * @returns Promise<Message | null>
 */
export async function markMessageAsRead(messageId: string): Promise<Message | null> {
  const messageIndex = MOCK_MESSAGES.findIndex((m) => m.id === messageId);
  if (messageIndex === -1) return null;

  MOCK_MESSAGES[messageIndex] = {
    ...MOCK_MESSAGES[messageIndex],
    status: "read",
  };

  // Update channel unread count
  const channelId = MOCK_MESSAGES[messageIndex].channelId;
  const channelIndex = MOCK_CHANNELS.findIndex((ch) => ch.id === channelId);
  if (channelIndex !== -1 && MOCK_CHANNELS[channelIndex].unreadCount > 0) {
    MOCK_CHANNELS[channelIndex].unreadCount--;
  }

  return MOCK_MESSAGES[messageIndex];
}

/**
 * Get total unread message count
 * @param workspaceId - Optional workspace filter
 * @returns Promise<number>
 */
export async function getTotalUnreadCount(workspaceId?: string): Promise<number> {
  const channels = await getChannels(workspaceId);
  return channels.reduce((sum, ch) => sum + ch.unreadCount, 0);
}
