// =============================================
// Communications Hub API Route
// =============================================
// GET /api/comms - List channels and messages
// POST /api/comms - Update channel or message status

import { NextRequest, NextResponse } from "next/server";
import {
  getChannels,
  getCommsHubStatus,
  getRecentMessages,
  updateChannelStatus,
  markMessageAsRead,
} from "@/lib/services/comms";
import type { ChannelStatus, RecentMessagesRequest } from "@/types/comms";

/**
 * GET /api/comms
 * Fetches channels, status, and recent messages
 * Query params: workspaceId, includeMessages, messageLimit, unreadOnly
 */
export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspaceId") || undefined;
    const includeMessages = searchParams.get("includeMessages") !== "false"; // Default: true
    const messageLimit = searchParams.get("messageLimit")
      ? parseInt(searchParams.get("messageLimit")!, 10)
      : 5;
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    // Fetch channels
    const channels = await getChannels(workspaceId);

    // Fetch aggregate status
    const status = await getCommsHubStatus(workspaceId);

    // Optionally fetch recent messages
    let messages: Awaited<ReturnType<typeof getRecentMessages>> = [];
    if (includeMessages) {
      const messageRequest: RecentMessagesRequest = {
        workspaceId,
        limit: messageLimit,
        unreadOnly,
      };
      messages = await getRecentMessages(messageRequest);
    }

    return NextResponse.json({
      success: true,
      data: {
        channels,
        status,
        messages,
      },
    });
  } catch (error) {
    console.error("[Comms API] GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch communications data",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/comms
 * Updates channel status or marks message as read
 * Body: { action: "updateChannel" | "markRead", channelId?, messageId?, status? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate action
    if (!body.action) {
      return NextResponse.json(
        {
          success: false,
          error: "action is required (updateChannel or markRead)",
        },
        { status: 400 }
      );
    }

    // Handle channel status update
    if (body.action === "updateChannel") {
      if (!body.channelId || !body.status) {
        return NextResponse.json(
          {
            success: false,
            error: "channelId and status are required for updateChannel",
          },
          { status: 400 }
        );
      }

      const updatedChannel = await updateChannelStatus(
        body.channelId,
        body.status as ChannelStatus
      );

      if (!updatedChannel) {
        return NextResponse.json(
          {
            success: false,
            error: "Channel not found",
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: updatedChannel,
      });
    }

    // Handle mark message as read
    if (body.action === "markRead") {
      if (!body.messageId) {
        return NextResponse.json(
          {
            success: false,
            error: "messageId is required for markRead",
          },
          { status: 400 }
        );
      }

      const updatedMessage = await markMessageAsRead(body.messageId);

      if (!updatedMessage) {
        return NextResponse.json(
          {
            success: false,
            error: "Message not found",
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: updatedMessage,
      });
    }

    // Unknown action
    return NextResponse.json(
      {
        success: false,
        error: "Unknown action",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Comms API] POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update communications",
      },
      { status: 500 }
    );
  }
}
