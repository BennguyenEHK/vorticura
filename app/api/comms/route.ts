// =============================================
// Communications Hub API Route
// =============================================
// GET /api/comms - List channels and messages
// POST /api/comms - Update channel or message status
//
// Auth context (company_id, user_id) is injected by Next.js middleware
// as x-company-id / x-user-id request headers.

import { NextRequest, NextResponse } from "next/server";
import {
  getChannels,
  getCommsHubStatus,
  getRecentMessages,
  updateChannelStatus,
  markMessageAsRead,
} from "@/lib/services/comms";
import type { ChannelStatus, RecentMessagesRequest } from "@/types/comms";

/** Parse company_id from middleware-injected header — returns null if missing/invalid */
function getCompanyId(request: NextRequest): number | null {
  const raw = request.headers.get("x-company-id");
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return isNaN(id) ? null : id;
}

/**
 * GET /api/comms
 * Fetches real channels (from email_connections) and recent messages (from rfq_analysis).
 */
export async function GET(request: NextRequest) {
  const companyId = getCompanyId(request);
  if (!companyId) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const includeMessages = searchParams.get("includeMessages") !== "false";
    const messageLimit = parseInt(searchParams.get("messageLimit") ?? "5", 10);
    const unreadOnly   = searchParams.get("unreadOnly") === "true";

    const [channels, status] = await Promise.all([
      getChannels(companyId),
      getCommsHubStatus(companyId),
    ]);

    let messages: Awaited<ReturnType<typeof getRecentMessages>> = [];
    if (includeMessages) {
      const req: RecentMessagesRequest = { limit: messageLimit, unreadOnly };
      messages = await getRecentMessages(companyId, req);
    }

    return NextResponse.json({ success: true, data: { channels, status, messages } });
  } catch (error) {
    console.error("[Comms API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch communications data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/comms
 * Updates channel status or marks a message as read.
 */
export async function POST(request: NextRequest) {
  const companyId = getCompanyId(request);
  if (!companyId) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    if (!body.action) {
      return NextResponse.json(
        { success: false, error: "action is required (updateChannel or markRead)" },
        { status: 400 }
      );
    }

    if (body.action === "updateChannel") {
      if (!body.channelId || !body.status) {
        return NextResponse.json(
          { success: false, error: "channelId and status are required" },
          { status: 400 }
        );
      }
      const updated = await updateChannelStatus(body.channelId, body.status as ChannelStatus);
      if (!updated) {
        return NextResponse.json({ success: false, error: "Channel not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.action === "markRead") {
      if (!body.messageId) {
        return NextResponse.json(
          { success: false, error: "messageId is required" },
          { status: 400 }
        );
      }
      const updated = await markMessageAsRead(body.messageId);
      if (!updated) {
        return NextResponse.json({ success: false, error: "Message not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[Comms API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update communications" },
      { status: 500 }
    );
  }
}
