import type { RFQStage, PanelFetchIntent } from '@/types/ui-reload';

// Canonical per-stage fetch intent.
// Cumulative policy: once a panel has been populated, later stages keep fetching it.
// `suppliers` was intentionally removed — suppliers is not a panel; preview content
// is driven by rfq_analysis.last_preview_type via the tableMap in fetch-workspace.ts.
export const STAGE_FETCH_INTENT: Record<RFQStage, PanelFetchIntent> = {
  ingestion:            { preview: true,  workflow: true, pricing: false, ai: true },
  user_validation:      { preview: true,  workflow: true, pricing: false, ai: true },
  supplier_discovery:   { preview: true,  workflow: true, pricing: false, ai: true },
  supplier_validation:  { preview: true,  workflow: true, pricing: false, ai: true },
  outbound_rfq:         { preview: true,  workflow: true, pricing: false, ai: true },
  awaiting_response:    { preview: true,  workflow: true, pricing: false, ai: true },
  supplier_response:    { preview: true,  workflow: true, pricing: false, ai: true },
  awaiting_quotation:   { preview: true,  workflow: true, pricing: true,  ai: true },
  quotation_processing: { preview: true,  workflow: true, pricing: true,  ai: true },
  customer_quotation:   { preview: true,  workflow: true, pricing: true,  ai: true },
  final_actions:        { preview: true,  workflow: true, pricing: true,  ai: true },
};

const DEFAULT_INTENT: PanelFetchIntent = {
  preview: true, workflow: true, pricing: false, ai: true,
};

export function getFetchIntent(stage: RFQStage | string | null | undefined): PanelFetchIntent {
  if (!stage) return DEFAULT_INTENT;
  return STAGE_FETCH_INTENT[stage as RFQStage] ?? DEFAULT_INTENT;
}
