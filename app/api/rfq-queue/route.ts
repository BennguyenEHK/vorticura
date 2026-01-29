// =============================================
// RFQ Queue API Route
// =============================================
// GET /api/rfq-queue - List queued RFQs
// POST /api/rfq-queue - Update RFQ in queue

import { NextRequest, NextResponse } from "next/server";
import {
  getQueuedRFQs,
  getQueueCount,
  updateRFQStatus,
  updateRFQStage,
} from "@/lib/services/rfq-queue";
import type { QueueFilters, QueueStatus, RFQStage } from "@/types/rfq-queue";

/**
 * GET /api/rfq-queue
 * Fetches queued RFQs with optional filters
 * Query params: workspaceId, status, stage, limit, offset, includeCompleted
 */
export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;

    // Build filters from query params
    const filters: QueueFilters = {
      workspaceId: searchParams.get("workspaceId") || undefined,
      limit: searchParams.get("limit")
        ? parseInt(searchParams.get("limit")!, 10)
        : 4, // Default: show top 4
      offset: searchParams.get("offset")
        ? parseInt(searchParams.get("offset")!, 10)
        : 0,
      includeCompleted: searchParams.get("includeCompleted") === "true",
    };

    // Parse status filter (comma-separated)
    const statusParam = searchParams.get("status");
    if (statusParam) {
      filters.status = statusParam.split(",") as QueueStatus[];
    }

    // Parse stage filter (comma-separated)
    const stageParam = searchParams.get("stage");
    if (stageParam) {
      filters.stage = stageParam.split(",") as RFQStage[];
    }

    // Fetch queued RFQs
    const response = await getQueuedRFQs(filters);

    // Also get total queue count for badge
    const queueCount = await getQueueCount(filters.workspaceId);

    return NextResponse.json({
      success: true,
      data: response,
      meta: {
        queueCount,
      },
    });
  } catch (error) {
    console.error("[RFQ Queue API] GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch RFQ queue",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/rfq-queue
 * Updates an RFQ's status or stage in the queue
 * Body: { rfqId, status?, stage? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required field
    if (!body.rfqId) {
      return NextResponse.json(
        {
          success: false,
          error: "rfqId is required",
        },
        { status: 400 }
      );
    }

    let updatedRFQ = null;

    // Update status if provided
    if (body.status) {
      updatedRFQ = await updateRFQStatus(body.rfqId, body.status as QueueStatus);
    }

    // Update stage if provided
    if (body.stage) {
      updatedRFQ = await updateRFQStage(body.rfqId, body.stage as RFQStage);
    }

    // Check if RFQ was found
    if (!updatedRFQ) {
      return NextResponse.json(
        {
          success: false,
          error: "RFQ not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedRFQ,
    });
  } catch (error) {
    console.error("[RFQ Queue API] POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update RFQ",
      },
      { status: 500 }
    );
  }
}
