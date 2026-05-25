// =============================================
// RFQ Queue Type Definitions
// =============================================
// Types for managing the RFQ queue in sidebar
// Supports the 4-stage procurement workflow

/**
 * RFQ Stage enum - Maps to the 4 procurement stages
 * from Dashboard_factor.md specification
 */
export type RFQStage =
  | "report_analysis"     // Stage 1: AI analysis review gate
  | "supplier_discovery"  // Stage 2: AI supplier search
  | "items_ordering"      // Stage 3: Supplier contact + awaiting responses
  | "quotation_processing"; // Stage 4: Generate + send customer quote

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
 * Queued RFQ item — single row in the sidebar queue.
 *
 * Visible (rendered in UI): rfqReference, clientName, clientEmail, subject, stage, stageLabel, unreadCount
 * Internal (not rendered): rfqId, userId, companyId, status, priority, createdAt, updatedAt
 *
 * Tenant isolation is enforced server-side via WorkspaceContext.
 * `rfqReference` is the user-facing + URL identifier (e.g. "RFQ PK 22501").
 */
export interface QueuedRFQ {
  // ───── Visible ─────
  rfqReference: string;          // Primary user-facing identifier from incoming email
  clientName: string;            // customers.company_name
  clientEmail: string;           // customers.email
  subject: string;               // rfq_analysis.subject
  stage: RFQStage;               // rfq_analysis.current_stage
  stageLabel: string;            // STAGE_CONFIGS[stage].label
  unreadCount: number;           // rfq_analysis.unread_count

  // ───── Internal ─────
  rfqId: number;                 // rfq_analysis.rfq_id — DB primary key
  userId: number;                // workspace isolation (user_id)
  companyId: number;             // workspace isolation (company_id)
  status: QueueStatus;           // derived from stage (isGate/isAsync)
  priority: number;              // 1 = top; derived from updated_at DESC row index
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Queue filters — workspace is NOT a filter (always from WorkspaceContext).
 */
export interface QueueFilters {
  status?: QueueStatus[];        // Filter by status(es)
  stage?: RFQStage[];            // Filter by stage(s)
  limit?: number;                // Max items to return (default: 3)
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
  report_analysis: {
    stage: "report_analysis",
    label: "RFQ Analysis",
    shortLabel: "Analysis",
    description: "Review and validate AI-generated RFQ analysis report",
    isGate: true,
    isAsync: false,
  },
  supplier_discovery: {
    stage: "supplier_discovery",
    label: "Supplier Search",
    shortLabel: "Suppliers",
    description: "AI is searching for potential suppliers",
    isGate: false,
    isAsync: false,
  },
  items_ordering: {
    stage: "items_ordering",
    label: "Items Ordering",
    shortLabel: "Ordering",
    description: "Contacting suppliers and awaiting availability responses",
    isGate: false,
    isAsync: true,
  },
  quotation_processing: {
    stage: "quotation_processing",
    label: "Quotation",
    shortLabel: "Quote",
    description: "Review pricing, generate and send customer quotation",
    isGate: true,
    isAsync: false,
  },
};
