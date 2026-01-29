// =============================================
// RFQ Queue Manager Service
// =============================================
// Business logic for managing the RFQ queue
// Handles CRUD operations and queue state management

import type {
  QueuedRFQ,
  QueueFilters,
  QueueResponse,
  QueueStatus,
  RFQStage,
} from "@/types/rfq-queue";

// =============================================
// Mock Data for Development
// =============================================

/**
 * Mock RFQ data for UI development
 * Will be replaced with database queries
 */
const MOCK_RFQS: QueuedRFQ[] = [
  {
    id: "RFQ-005",
    clientName: "Acme Corp",
    clientEmail: "procurement@acme.com",
    subject: "Industrial Bearings Request",
    stage: "supplier_discovery",
    status: "active",
    priority: 1,
    createdAt: new Date("2026-01-29T08:30:00"),
    updatedAt: new Date("2026-01-29T10:15:00"),
    workspaceId: "ws-001",
    stageLabel: "Supplier Search",
    unreadCount: 2,
  },
  {
    id: "RFQ-004",
    clientName: "TechStart Inc",
    clientEmail: "orders@techstart.io",
    subject: "Electronic Components",
    stage: "awaiting_response",
    status: "waiting",
    priority: 2,
    createdAt: new Date("2026-01-28T14:20:00"),
    updatedAt: new Date("2026-01-29T09:00:00"),
    workspaceId: "ws-001",
    stageLabel: "Awaiting Response",
    unreadCount: 0,
  },
  {
    id: "RFQ-003",
    clientName: "Global Industries",
    clientEmail: "supply@global-ind.com",
    subject: "Hydraulic Seals Bulk Order",
    stage: "quotation_processing",
    status: "action",
    priority: 3,
    createdAt: new Date("2026-01-27T11:45:00"),
    updatedAt: new Date("2026-01-29T07:30:00"),
    workspaceId: "ws-001",
    quotationId: "Q-2024-003",
    stageLabel: "Processing Quote",
    unreadCount: 1,
  },
  {
    id: "RFQ-002",
    clientName: "MegaBuild Co",
    clientEmail: "purchase@megabuild.com",
    subject: "Construction Materials",
    stage: "awaiting_quotation",
    status: "waiting",
    priority: 4,
    createdAt: new Date("2026-01-26T09:00:00"),
    updatedAt: new Date("2026-01-28T16:45:00"),
    workspaceId: "ws-001",
    stageLabel: "Awaiting Quotation",
    unreadCount: 0,
  },
  {
    id: "RFQ-001",
    clientName: "SmallBiz LLC",
    clientEmail: "info@smallbiz.com",
    subject: "Office Supplies Request",
    stage: "customer_quotation",
    status: "action",
    priority: 5,
    createdAt: new Date("2026-01-25T15:30:00"),
    updatedAt: new Date("2026-01-29T08:00:00"),
    workspaceId: "ws-001",
    quotationId: "Q-2024-001",
    stageLabel: "Final Quotation",
    unreadCount: 0,
  },
];

// =============================================
// Queue Manager Functions
// =============================================

/**
 * Get queued RFQs with optional filters
 * @param filters - Optional filters for the query
 * @returns Promise<QueueResponse> - Paginated RFQ list
 */
export async function getQueuedRFQs(
  filters?: QueueFilters
): Promise<QueueResponse> {
  // Apply filters to mock data (will be database query in production)
  let filtered = [...MOCK_RFQS];

  // Filter by workspace
  if (filters?.workspaceId) {
    filtered = filtered.filter((rfq) => rfq.workspaceId === filters.workspaceId);
  }

  // Filter by status
  if (filters?.status && filters.status.length > 0) {
    filtered = filtered.filter((rfq) => filters.status!.includes(rfq.status));
  }

  // Filter by stage
  if (filters?.stage && filters.stage.length > 0) {
    filtered = filtered.filter((rfq) => filters.stage!.includes(rfq.stage));
  }

  // Exclude completed unless specified
  if (!filters?.includeCompleted) {
    filtered = filtered.filter((rfq) => rfq.status !== "completed");
  }

  // Sort by priority (lower = higher priority)
  filtered.sort((a, b) => a.priority - b.priority);

  // Calculate total before pagination
  const total = filtered.length;

  // Apply pagination
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 4; // Default: show top 4
  filtered = filtered.slice(offset, offset + limit);

  return {
    items: filtered,
    total,
    hasMore: offset + filtered.length < total,
  };
}

/**
 * Get a single RFQ by ID
 * @param id - RFQ identifier
 * @returns Promise<QueuedRFQ | null>
 */
export async function getRFQById(id: string): Promise<QueuedRFQ | null> {
  const rfq = MOCK_RFQS.find((r) => r.id === id);
  return rfq || null;
}

/**
 * Update RFQ status in queue
 * @param id - RFQ identifier
 * @param status - New status
 * @returns Promise<QueuedRFQ | null>
 */
export async function updateRFQStatus(
  id: string,
  status: QueueStatus
): Promise<QueuedRFQ | null> {
  const rfqIndex = MOCK_RFQS.findIndex((r) => r.id === id);
  if (rfqIndex === -1) return null;

  // Update status and timestamp
  MOCK_RFQS[rfqIndex] = {
    ...MOCK_RFQS[rfqIndex],
    status,
    updatedAt: new Date(),
  };

  return MOCK_RFQS[rfqIndex];
}

/**
 * Update RFQ stage (advance or rollback workflow)
 * @param id - RFQ identifier
 * @param stage - New stage
 * @returns Promise<QueuedRFQ | null>
 */
export async function updateRFQStage(
  id: string,
  stage: RFQStage
): Promise<QueuedRFQ | null> {
  const rfqIndex = MOCK_RFQS.findIndex((r) => r.id === id);
  if (rfqIndex === -1) return null;

  // Import stage config to get label
  const { STAGE_CONFIGS } = await import("@/types/rfq-queue");
  const stageConfig = STAGE_CONFIGS[stage];

  // Update stage, label, and timestamp
  MOCK_RFQS[rfqIndex] = {
    ...MOCK_RFQS[rfqIndex],
    stage,
    stageLabel: stageConfig.label,
    updatedAt: new Date(),
  };

  return MOCK_RFQS[rfqIndex];
}

/**
 * Get queue count for badge display
 * @param workspaceId - Optional workspace filter
 * @returns Promise<number> - Count of active RFQs
 */
export async function getQueueCount(workspaceId?: string): Promise<number> {
  let filtered = MOCK_RFQS.filter((rfq) => rfq.status !== "completed");

  if (workspaceId) {
    filtered = filtered.filter((rfq) => rfq.workspaceId === workspaceId);
  }

  return filtered.length;
}

/**
 * Get total unread count across all queued RFQs
 * @param workspaceId - Optional workspace filter
 * @returns Promise<number> - Total unread messages
 */
export async function getUnreadCount(workspaceId?: string): Promise<number> {
  let filtered = MOCK_RFQS;

  if (workspaceId) {
    filtered = filtered.filter((rfq) => rfq.workspaceId === workspaceId);
  }

  return filtered.reduce((sum, rfq) => sum + (rfq.unreadCount || 0), 0);
}
