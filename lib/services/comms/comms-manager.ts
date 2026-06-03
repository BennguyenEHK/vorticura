// =============================================
// Communications Manager Service
// =============================================
// Real DB-backed channel and message retrieval.
// Channels come from email_connections; messages from rfq_analysis.

import { db, withDbRetry } from "@/lib/db/client";
import { emailConnections, rfqAnalysis, customers } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import type {
  Channel,
  ChannelType,
  ChannelStatus,
  Message,
  CommsHubStatus,
  RecentMessagesRequest,
} from "@/types/comms";

// =============================================
// Mapping helpers
// =============================================

function dbStatusToChannelStatus(dbStatus: string | null): ChannelStatus {
  switch (dbStatus) {
    case "active":  return "connected";
    case "expired": return "error";
    case "paused":  return "disconnected";
    default:        return "disconnected";
  }
}

function providerToName(provider: string | null): string {
  if (provider === "gmail")     return "Gmail";
  if (provider === "microsoft") return "Outlook";
  return "Email";
}

function connectionToChannel(conn: typeof emailConnections.$inferSelect): Channel {
  return {
    id:           String(conn.connectionId),
    type:         "email" as ChannelType,
    name:         providerToName(conn.provider),
    status:       dbStatusToChannelStatus(conn.status),
    identifier:   conn.emailAddress ?? "",
    unreadCount:  0, // unread tracking not yet in schema
    lastSyncAt:   conn.lastSyncAt ?? null,
    workspaceId:  String(conn.companyId),
    createdAt:    conn.createdAt ?? new Date(),
    updatedAt:    conn.updatedAt ?? new Date(),
  };
}

// =============================================
// Channel functions
// =============================================

export async function getChannels(companyId: number): Promise<Channel[]> {
  const conns = await withDbRetry(() =>
    db
      .select()
      .from(emailConnections)
      .where(eq(emailConnections.companyId, companyId))
  );
  return conns.map(connectionToChannel);
}

export async function getChannelById(channelId: string): Promise<Channel | null> {
  const id = parseInt(channelId, 10);
  if (isNaN(id)) return null;
  const [conn] = await withDbRetry(() =>
    db
      .select()
      .from(emailConnections)
      .where(eq(emailConnections.connectionId, id))
      .limit(1)
  );
  return conn ? connectionToChannel(conn) : null;
}

export async function getCommsHubStatus(companyId: number): Promise<CommsHubStatus> {
  const channels = await getChannels(companyId);
  return {
    totalChannels:     channels.length,
    connectedChannels: channels.filter((c) => c.status === "connected").length,
    totalUnread:       0,
    hasError:          channels.some((c) => c.status === "error"),
  };
}

export async function updateChannelStatus(
  channelId: string,
  status: ChannelStatus
): Promise<Channel | null> {
  const id = parseInt(channelId, 10);
  if (isNaN(id)) return null;

  // Map UI status back to DB status
  const dbStatus = status === "connected" ? "active"
    : status === "error" ? "expired"
    : "paused";

  const [updated] = await withDbRetry(() =>
    db
      .update(emailConnections)
      .set({ status: dbStatus })
      .where(eq(emailConnections.connectionId, id))
      .returning()
  );

  return updated ? connectionToChannel(updated) : null;
}

// =============================================
// Message functions
// =============================================

export async function getRecentMessages(
  companyId: number,
  request?: RecentMessagesRequest
): Promise<Message[]> {
  const limit  = request?.limit  ?? 5;
  const offset = request?.offset ?? 0;

  // Find first active connection so we have a 'to' address
  const [activeConn] = await withDbRetry(() =>
    db
      .select({ connectionId: emailConnections.connectionId, emailAddress: emailConnections.emailAddress })
      .from(emailConnections)
      .where(and(
        eq(emailConnections.companyId, companyId),
        eq(emailConnections.status, "active")
      ))
      .limit(1)
  );

  // Recent RFQs joined with customer info for sender details
  const rows = await withDbRetry(() =>
    db
      .select({
        rfqId:           rfqAnalysis.rfqId,
        rfqReference:    rfqAnalysis.rfqReference,
        subject:         rfqAnalysis.subject,
        analysisContent: rfqAnalysis.analysisContent,
        createdAt:       rfqAnalysis.createdAt,
        customerName:    customers.companyName,
        customerEmail:   customers.email,
      })
      .from(rfqAnalysis)
      .leftJoin(customers, eq(customers.rfqId, rfqAnalysis.rfqId))
      .where(eq(rfqAnalysis.companyId, companyId))
      .orderBy(desc(rfqAnalysis.createdAt))
      .limit(limit)
      .offset(offset)
  );

  const channelId = activeConn ? String(activeConn.connectionId) : "";
  const toAddr    = activeConn?.emailAddress ?? "";

  return rows.map((row) => ({
    id:          String(row.rfqId),
    channelId,
    channelType: "email" as ChannelType,
    direction:   "inbound" as const,
    status:      "received" as const,
    from:        row.customerEmail ?? "",
    to:          toAddr,
    fromName:    row.customerName ?? "",
    subject:     row.subject ?? "",
    preview:     row.analysisContent
      ? row.analysisContent.slice(0, 120) + (row.analysisContent.length > 120 ? "…" : "")
      : row.rfqReference ?? "(no preview)",
    timestamp:   row.createdAt ?? new Date(),
    isRFQ:       true,
    rfqId:       row.rfqReference ?? undefined,
    workspaceId: String(companyId),
  }));
}

// markMessageAsRead — RFQ messages have no read/unread state in current schema
export async function markMessageAsRead(_messageId: string): Promise<Message | null> {
  return null;
}

export async function getTotalUnreadCount(_companyId: number): Promise<number> {
  return 0;
}
