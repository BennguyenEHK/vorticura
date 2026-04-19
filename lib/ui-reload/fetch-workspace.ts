// =============================================
// WORKSPACE DATA FETCHER - Stage-aware parallel loader
// =============================================
// Orchestrator for fetching workspace domain data by RFQ reference.
// Fetches only the panels needed for the current RFQ stage using getFetchIntent from stage-map.
// Uses Promise.all for parallel getData calls.

'use server';

import { getRfqByReference, getData } from '@/lib/db/queries';
import { getServerActionWorkspace } from '@/lib/middleware/get-workspace';
import { getFetchIntent } from './stage-map';
import type { WorkspacePayload, PanelFetchIntent } from '@/types/ui-reload';

// =============================================
// Types
// =============================================

interface FetchWorkspaceInput {
  rfqReference: string;
}

interface FetchWorkspaceResult {
  success: boolean;
  data?: WorkspacePayload;
  error?: string;
}

// =============================================
// Main Fetcher
// =============================================

/**
 * Fetch workspace domain data by RFQ reference.
 * Stage-aware: only fetches panels needed at the current RFQ stage.
 * Parallel execution: uses Promise.all for independent panel fetches.
 *
 * @param input - { rfqReference: string }
 * @returns WorkspacePayload with stage, rfqId, and fetched panels
 */
export async function fetchWorkspace(
  input: FetchWorkspaceInput
): Promise<FetchWorkspaceResult> {
  try {
    // Derive workspace server-side from auth cookie
    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      return { success: false, error: 'Authentication required' };
    }

    const { rfqReference } = input;

    // =============================================
    // STEP 1: Fetch RFQ metadata (rfq_id, current_stage)
    // =============================================
    const rfq = await getRfqByReference(rfqReference, workspace);
    if (!rfq) {
      return { success: false, error: 'RFQ not found' };
    }

    const rfqId = rfq.rfqId;
    const currentStage = rfq.currentStage || 'ingestion';
    const layoutPrefs = rfq.layoutPrefs || null; // If persisted on rfq_analysis table

    // =============================================
    // STEP 2: Determine fetch intent for current stage
    // =============================================
    const fetchIntent: PanelFetchIntent = getFetchIntent(currentStage);

    // =============================================
    // STEP 3: Parallel panel fetches
    // =============================================
    const [preview, workflow, suppliers, pricing, ai] = await Promise.all([
      // Preview (rfq_analysis + email draft)
      fetchIntent.preview
        ? getData('rfqAnalysis', { rfqId }, workspace)
            .then((results) => results[0] || null)
            .catch((err) => {
              console.error('Failed to fetch preview:', err);
              return null;
            })
        : Promise.resolve(null),

      // Workflow (workflow state — likely stored on rfq_analysis or a separate table)
      // For now, fetch rfq_analysis again if needed; structure can be extended per requirements
      fetchIntent.workflow
        ? getData('rfqAnalysis', { rfqId }, workspace)
            .then((results) => results[0] || null)
            .catch((err) => {
              console.error('Failed to fetch workflow:', err);
              return null;
            })
        : Promise.resolve(null),

      // Suppliers (supplierSearch + supplierItemStatus)
      fetchIntent.suppliers
        ? Promise.all([
            getData('supplierSearch', { rfqId }, workspace).catch((err) => {
              console.error('Failed to fetch supplier search:', err);
              return [];
            }),
            getData('supplierItemStatus', { rfqId }, workspace).catch((err) => {
              console.error('Failed to fetch supplier item status:', err);
              return [];
            }),
          ])
            .then(([searches, items]) => ({
              searches,
              items,
            }))
            .catch((err) => {
              console.error('Failed to fetch suppliers:', err);
              return null;
            })
        : Promise.resolve(null),

      // Pricing (quotationPricing + quotations metadata)
      fetchIntent.pricing
        ? Promise.all([
            getData('quotationPricing', { rfqId }, workspace).catch((err) => {
              console.error('Failed to fetch quotation pricing:', err);
              return [];
            }),
            // Also fetch quotations to get header info
            getData('quotations', { rfqId }, workspace).catch((err) => {
              console.error('Failed to fetch quotations:', err);
              return [];
            }),
          ])
            .then(([pricing, quotations]) => ({
              pricing,
              quotations,
            }))
            .catch((err) => {
              console.error('Failed to fetch pricing:', err);
              return null;
            })
        : Promise.resolve(null),

      // AI (ai_conversations — assumed stored on a future table or in rfq_analysis)
      // For now, return empty array; extend once ai_conversations table exists
      fetchIntent.ai
        ? Promise.resolve([])
            .catch((err) => {
              console.error('Failed to fetch AI conversations:', err);
              return [];
            })
        : Promise.resolve([]),
    ]);

    // =============================================
    // STEP 4: Build and return WorkspacePayload
    // =============================================
    const payload: WorkspacePayload = {
      stage: currentStage as any, // Already validated by stage-map
      rfqId,
      rfqReference,
      layoutPrefs,
      preview,
      workflow,
      suppliers,
      pricing,
      ai: ai || [],
    };

    return { success: true, data: payload };
  } catch (error) {
    console.error('fetchWorkspace failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch workspace',
    };
  }
}
