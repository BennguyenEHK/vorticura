// Shared types for the UI reload subsystem.

import type { WorkflowStep } from '@/types/workflow';

export type UiType = 'dashboard' | 'workspace' | 'rfq_queue';

// Matches rfq_analysis.current_stage values.
export type RFQStage =
  | 'report_analysis'
  | 'supplier_discovery'
  | 'items_ordering'
  | 'quotation_processing';

// What each stage wants the workspace page to fetch.
// "Cumulative" — later stages inherit earlier fetches so the UI never regresses.
// Note: suppliers is NOT a panel and was removed — use the preview tableMap instead.
export interface PanelFetchIntent {
  preview: boolean;   // analysis | suppliers_search | email | quotation (driven by lastPreviewType)
  workflow: boolean;  // workflow steps state
  pricing: boolean;   // pricing lines + quotation header
  ai: boolean;        // ai_conversations (always attempted; empty if expired/none)
}

// Preview type tag persisted on rfq_analysis.last_preview_type — drives tableMap lookup
export type PreviewType = 'analysis' | 'suppliers_search' | 'email' | 'quotation';

export interface WorkspacePayload {
  stage: RFQStage;
  rfqId: number;
  rfqReference: string;
  layoutPrefs: Record<string, unknown> | null;
  // The active preview type that produced `preview`; null when no record exists yet.
  previewType: PreviewType | null;
  preview: unknown | null;
  workflow: unknown | null;
  workflowSteps: WorkflowStep[];   // Computed from currentStage — drives WorkflowPanelContent
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
