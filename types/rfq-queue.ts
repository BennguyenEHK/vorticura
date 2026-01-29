// =============================================
// RFQ Queue Type Definitions
// =============================================
// Types for managing the RFQ queue in sidebar
// Supports the 11-stage procurement workflow

/**
 * RFQ Stage enum - Maps to the 11 procurement stages
 * from Dashboard_factor.md specification
 */
export type RFQStage =
  | "ingestion"           // Stage 1: Customer email received
  | "user_validation"     // Stage 2: Gate 1 - Approve/Reject AI report
  | "supplier_discovery"  // Stage 3: AI searches suppliers
  | "supplier_validation" // Stage 4: Gate 2 - Approve/Reject suppliers
  | "outbound_rfq"        // Stage 5: Send RFQ to suppliers
  | "awaiting_response"   // Stage 6: Waiting period 1 (async)
  | "supplier_response"   // Stage 7: Gate 3 - Confirm availability
  | "awaiting_quotation"  // Stage 8: Waiting period 2 (async)
  | "quotation_processing"// Stage 9: Gate 4 - Review pricing
  | "customer_quotation"  // Stage 10: Gate 5 - Generate final quote
  | "final_actions";      // Stage 11: Send to customer, order goods

/**
 * Queue status for visual indicators
 */
export type QueueStatus =
  | "active"    // Currently being worked on (green dot)
  | "waiting"   // In async waiting period (yellow/amber)
  | "action"    // Requires user action at a gate (blue)
  | "completed" // Finished processing (checkmark)
  | "error";    // Has issues that need attention (red)

/**
 * Queued RFQ item - Represents a single RFQ in the sidebar queue
 */
export interface QueuedRFQ {
  id: string;                    // Unique RFQ identifier (e.g., "RFQ-005")
  clientName: string;            // Customer/company name
  clientEmail: string;           // Customer email address
  subject: string;               // RFQ subject/title
  stage: RFQStage;               // Current workflow stage
  status: QueueStatus;           // Visual status indicator
  priority: number;              // Queue position (lower = higher priority)
  createdAt: Date;               // When RFQ was received
  updatedAt: Date;               // Last activity timestamp
  workspaceId: string;           // Associated workspace
  quotationId?: string;          // Linked quotation if created
  stageLabel?: string;           // Human-readable stage description
  unreadCount?: number;          // New messages/updates count
}

/**
 * Queue filters for fetching RFQs
 */
export interface QueueFilters {
  workspaceId?: string;          // Filter by workspace
  status?: QueueStatus[];        // Filter by status(es)
  stage?: RFQStage[];            // Filter by stage(s)
  limit?: number;                // Max items to return (default: 4)
  offset?: number;               // Pagination offset
  includeCompleted?: boolean;    // Include completed RFQs (default: false)
}

/**
 * Queue API response
 */
export interface QueueResponse {
  items: QueuedRFQ[];            // Array of queued RFQs
  total: number;                 // Total count (for pagination)
  hasMore: boolean;              // More items available
}

/**
 * Stage configuration for UI display
 */
export interface StageConfig {
  stage: RFQStage;
  label: string;                 // Display label
  shortLabel: string;            // Abbreviated label for collapsed sidebar
  description: string;           // Tooltip/help text
  isGate: boolean;               // Requires user approval
  isAsync: boolean;              // Async waiting period
}

/**
 * Stage configurations mapping
 */
export const STAGE_CONFIGS: Record<RFQStage, StageConfig> = {
  ingestion: {
    stage: "ingestion",
    label: "RFQ Received",
    shortLabel: "Received",
    description: "Customer email RFQ has been received and is being processed",
    isGate: false,
    isAsync: false,
  },
  user_validation: {
    stage: "user_validation",
    label: "AI Report Review",
    shortLabel: "Review",
    description: "Review and validate AI-generated analysis report",
    isGate: true,
    isAsync: false,
  },
  supplier_discovery: {
    stage: "supplier_discovery",
    label: "Supplier Search",
    shortLabel: "Search",
    description: "AI is searching for potential suppliers",
    isGate: false,
    isAsync: false,
  },
  supplier_validation: {
    stage: "supplier_validation",
    label: "Supplier Review",
    shortLabel: "Suppliers",
    description: "Review and approve supplier list",
    isGate: true,
    isAsync: false,
  },
  outbound_rfq: {
    stage: "outbound_rfq",
    label: "Sending RFQ",
    shortLabel: "Sending",
    description: "Sending RFQ to selected suppliers",
    isGate: false,
    isAsync: false,
  },
  awaiting_response: {
    stage: "awaiting_response",
    label: "Awaiting Response",
    shortLabel: "Waiting",
    description: "Waiting for supplier availability confirmation",
    isGate: false,
    isAsync: true,
  },
  supplier_response: {
    stage: "supplier_response",
    label: "Supplier Response",
    shortLabel: "Response",
    description: "Supplier has responded - confirm availability",
    isGate: true,
    isAsync: false,
  },
  awaiting_quotation: {
    stage: "awaiting_quotation",
    label: "Awaiting Quotation",
    shortLabel: "Waiting",
    description: "Waiting for supplier quotation",
    isGate: false,
    isAsync: true,
  },
  quotation_processing: {
    stage: "quotation_processing",
    label: "Processing Quote",
    shortLabel: "Processing",
    description: "Review supplier pricing and apply markup",
    isGate: true,
    isAsync: false,
  },
  customer_quotation: {
    stage: "customer_quotation",
    label: "Final Quotation",
    shortLabel: "Final",
    description: "Generate and review customer quotation",
    isGate: true,
    isAsync: false,
  },
  final_actions: {
    stage: "final_actions",
    label: "Complete",
    shortLabel: "Done",
    description: "Send quotation and order goods",
    isGate: false,
    isAsync: false,
  },
};
