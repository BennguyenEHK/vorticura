// Shared types for the UI reload subsystem.

export type UiType = 'dashboard' | 'workspace' | 'rfq_queue';

// Matches rfq_analysis.current_stage values.
export type RFQStage =
  | 'ingestion'
  | 'user_validation'
  | 'supplier_discovery'
  | 'supplier_validation'
  | 'outbound_rfq'
  | 'awaiting_response'
  | 'supplier_response'
  | 'awaiting_quotation'
  | 'quotation_processing'
  | 'customer_quotation'
  | 'final_actions';

// What each stage wants the workspace page to fetch.
// "Cumulative" — later stages inherit earlier fetches so the UI never regresses.
export interface PanelFetchIntent {
  preview: boolean;   // analysis + email draft (preview-panel)
  workflow: boolean;  // workflow steps state
  suppliers: boolean; // suppliers_search + supplier_items
  pricing: boolean;   // pricing lines + quotation header
  ai: boolean;        // ai_conversations (always attempted; empty if expired/none)
}

export interface WorkspacePayload {
  stage: RFQStage;
  rfqId: number;
  rfqReference: string;
  layoutPrefs: Record<string, unknown> | null;
  preview: unknown | null;
  workflow: unknown | null;
  suppliers: unknown | null;
  pricing: unknown | null;
  ai: unknown[];
}

export interface DashboardPayload {
  layoutPrefs: Record<string, unknown> | null;
}

export interface RfqQueuePayload {
  layoutPrefs: Record<string, unknown> | null;
  // Queue items themselves are already served by getQueuedRFQs; uiReload only returns prefs.
}

export type UiReloadData =
  | { uiType: 'workspace'; data: WorkspacePayload }
  | { uiType: 'dashboard'; data: DashboardPayload }
  | { uiType: 'rfq_queue'; data: RfqQueuePayload };

export interface UiReloadResult {
  success: boolean;
  data?: UiReloadData['data'];
  uiType?: UiType;
  error?: string;
}
