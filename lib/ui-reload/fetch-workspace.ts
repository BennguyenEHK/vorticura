
// =============================================
// WORKSPACE DATA FETCHER - Stage-aware parallel loader
// =============================================
// SOURCE OF TRUTH for the workspace UI hydration payload.
// - Reads rfq_analysis (incl. last_preview_type) to drive preview content selection.
// - Resolves preview content via tableMap → email_content / search_content / analysis_content / quotation.
// - Bundles ui_reload.layoutPrefs and ai_conversations (no separate fetcher in ui-reload-actions).

'use server';

import { getRfqByReference, getData, getUiState, getAiConversations } from '@/lib/db/queries';
import { getServerActionWorkspace } from '@/lib/middleware/get-workspace';
import { loadProcessorInput } from '@/lib/data-loader';
import { buildItemsOrderingPreview } from './items-ordering-builder';
import { getFetchIntent } from './stage-map';
import { DEFAULT_WORKFLOW_STEPS, STEP_TO_STAGE_MAP } from '@/types/workflow';
import type { WorkflowStep } from '@/types/workflow';
import type { WorkspacePayload, PanelFetchIntent, PreviewType, RFQStage } from '@/types/ui-reload';

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

// Preview type → DB table descriptor.
// Tells fetch-workspace which table + column carries the preview content for each type.
// `null` (unset / unknown) defaults to rfq_analysis (per spec).
// items_ordering is excluded — it fetches from multiple tables handled inline in fetchPreviewByType
const PREVIEW_TABLE_MAP: Partial<Record<PreviewType, { table: string; idColumn: string }>> = {
  analysis:         { table: 'rfqAnalysis',    idColumn: 'rfqId' },
  suppliers_search: { table: 'supplierSearch', idColumn: 'rfqId' },
  email:            { table: 'emailTable',     idColumn: 'rfqId' },
  quotation:        { table: 'quotations',     idColumn: 'rfqId' },
};

// =============================================
// Workflow Step Computation
// =============================================

// Canonical stage order — determines step status by comparing indices
const STAGE_ORDER: RFQStage[] = [
  'report_analysis', 'supplier_discovery', 'items_ordering', 'quotation_processing',
];

/**
 * Maps currentStage → WorkflowStep[].
 * Steps whose target stage is before currentStage → completed.
 * Steps whose target stage equals currentStage    → in_progress.
 * Steps whose target stage is after currentStage  → pending.
 */
function computeWorkflowSteps(currentStage: string): WorkflowStep[] {
  const currentIdx = STAGE_ORDER.indexOf(currentStage as RFQStage);
  return DEFAULT_WORKFLOW_STEPS.map((step): WorkflowStep => {
    const stepIdx = STAGE_ORDER.indexOf(STEP_TO_STAGE_MAP[step.id]);
    const status: WorkflowStep['status'] =
      currentIdx < stepIdx  ? 'pending'
      : currentIdx === stepIdx ? 'in_progress'
      : 'completed';
    return { ...step, status };
  });
}

// =============================================
// Main Fetcher
// =============================================

/**
 * Fetch workspace domain data by RFQ reference.
 * Stage-aware: only fetches panels needed at the current RFQ stage.
 * Preview-aware: pulls from the table indicated by last_preview_type.
 * Parallel execution: uses Promise.all for independent panel fetches.
 */
export async function fetchWorkspace(
  input: FetchWorkspaceInput
): Promise<FetchWorkspaceResult> {
  try {
    // Workspace context derived server-side from auth cookie (tenant isolation)
    const workspace = await getServerActionWorkspace();
    if (!workspace) {
      return { success: false, error: 'Authentication required' };
    }

    const { rfqReference } = input;

    // ── STEP 1: Fetch RFQ metadata (rfq_id, current_stage, last_preview_type) ──
    const rfq = await getRfqByReference(rfqReference, workspace);
    if (!rfq) {
      return { success: false, error: 'RFQ not found' };
    }

    const rfqId = rfq.rfqId as number;
    const currentStage = (rfq.currentStage || 'report_analysis') as string; // default to stage 1
    // Default to 'analysis' when never persisted — matches the rfq_analysis fallback rule.
    const lastPreviewType = ((rfq.lastPreviewType as string | null) || 'analysis') as PreviewType;

    // ── STEP 2: Determine fetch intent for current stage ──
    const fetchIntent: PanelFetchIntent = getFetchIntent(currentStage);

    // ── STEP 3: Parallel fetches for preview, workflow, pricing, ui_reload, aiConversations ──
    const [preview, workflow, pricing, layoutPrefs, ai] = await Promise.all([
      // Preview — driven by last_preview_type via PREVIEW_TABLE_MAP (defaults to rfq_analysis)
      fetchIntent.preview ? fetchPreviewByType(lastPreviewType, rfqId, workspace) : Promise.resolve(null),

      // Workflow state — currently piggy-backs on rfq_analysis (current_stage, unread_count, etc.)
      fetchIntent.workflow
        ? Promise.resolve({
            currentStage,
            unreadCount: rfq.unreadCount ?? 0,
            updatedAt: rfq.updatedAt ?? null,
          })
        : Promise.resolve(null),

      // Pricing (quotationPricing + quotations header) — only when stage gates allow it
      fetchIntent.pricing
        ? Promise.all([
            getData('quotationPricing', { rfqId }, workspace).catch(() => []),
            getData('quotations', { rfqId }, workspace).catch(() => []),
          ]).then(([pricingRows, quotations]) => ({ pricing: pricingRows, quotations }))
        : Promise.resolve(null),

      // Layout prefs from ui_reload (consolidated here — ui-reload-actions no longer fetches)
      getUiState('workspace', workspace).catch(() => null),

      // AI conversations (always attempted, empty if expired/none) — consolidated here too
      fetchIntent.ai
        ? getAiConversations(rfqId, workspace).catch(() => [])
        : Promise.resolve([]),
    ]);

    // ── STEP 4: Build and return WorkspacePayload ──
    const payload: WorkspacePayload = {
      stage: currentStage as WorkspacePayload['stage'],
      rfqId,
      rfqReference,
      layoutPrefs: layoutPrefs as Record<string, unknown> | null,
      previewType: lastPreviewType,
      preview,
      workflow,
      workflowSteps: computeWorkflowSteps(currentStage),
      pricing,
      ai: ai as unknown[],
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

// =============================================
// Preview Fetcher — tableMap dispatch
// =============================================

/**
 * Fetch preview content for the requested previewType.
 * - 'quotation' → delegate to data-loader.loadQuotationManualUpdateInput for the full shape.
 * - 'analysis' → return DocumentData-shaped payload with rfq_analysis + rfq_items.
 * - 'suppliers_search' → return DocumentData-shaped payload with supplier_search + items_source.
 * - 'email' → return DocumentData-shaped payload with email fields.
 */
async function fetchPreviewByType(
  previewType: PreviewType,
  rfqId: number,
  workspace: Parameters<typeof getData>[2],
): Promise<unknown | null> {
  // Quotation preview = fresh quotation_ui_manual JSON shape (drives the manual-edit panel)
  if (previewType === 'quotation') {
    try {
      const built = await loadProcessorInput({
        data_type: 'quotation',
        action_type: 'manual_update',
        rfq_id: rfqId,
        workspace,
      });
      return built.quotation_data ?? built ?? null;
    } catch (err) {
      console.warn('[fetchWorkspace] quotation preview load failed:', err);
      return null;
    }
  }

  // Analysis preview: fetch rfq_analysis + rfq_items in parallel
  if (previewType === 'analysis') {
    try {
      const [analysisRows, itemRows] = await Promise.all([
        getData('rfqAnalysis', { rfqId }, workspace),
        getData('rfqItems', { rfqId }, workspace),
      ]);
      const analysis = analysisRows[0];
      if (!analysis) return null;
      // currency_code lives on supplier_item_status now; at the analysis stage
      // (pre-supplier) we display rfq_analysis.required_currency as the buyer's
      // requested transfer currency.
      const requiredCurrency = String(analysis.requiredCurrency ?? 'USD');
      return {
        rfq_analysis: {
          subject: analysis.subject,
          analysis_content: analysis.analysisContent,
        },
        rfq_items: (itemRows || []).map((item: Record<string, unknown>) => ({
          item_id: item.itemId,
          company_requirement: {
            company_description: item.companyDescription,
            qty: item.qty,
            uom: item.uom,
          },
          currency_code: requiredCurrency,
          agent_item_summary: item.agentItemSummary ?? null,  // AI 4-axis summary (null until enriched)
        })),
        rfq_id: rfqId,
      };
    } catch (err) {
      console.warn(`[fetchWorkspace] analysis preview load failed:`, err);
      return null;
    }
  }

  // Suppliers search preview: fetch supplier_search + supplier items in parallel
  if (previewType === 'suppliers_search') {
    try {
      const [searchRows, itemRows, rfqItemRows] = await Promise.all([
        getData('supplierSearch', { rfqId }, workspace),
        getData('supplierItemStatus', { rfqId }, workspace),
        // rfq_items carries agent_item_summary — we surface its `identification`
        // axis in the parent item row of the supplier-search panel.
        getData('rfqItems', { rfqId }, workspace),
      ]);
      const search = searchRows[0];
      if (!search) return null;

      // Build itemId → identification[] map from rfq_items.agent_item_summary.
      // Defensive: agentItemSummary is jsonb and may be null / partially shaped.
      const identificationByItem = new Map<number, string[]>();
      for (const ri of (rfqItemRows || []) as Array<Record<string, unknown>>) {
        const summary = ri.agentItemSummary as { identification?: unknown } | null;
        const ident = summary && Array.isArray(summary.identification)
          ? (summary.identification as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
          : [];
        if (ident.length) identificationByItem.set(Number(ri.itemId), ident);
      }

      return {
        suppliers_search: {
          subject: search.subject,
          search_content: search.searchContent,
        },
        items_source: (itemRows || []).map((item: Record<string, unknown>) => {
          // Alternatives are tagged by a `via_alt:` prefix the search pipeline
          // writes into notes (supplier-search-actions.ts). That prefix is the
          // only signal distinguishing a primary Source from an Alternative.
          const notes = String(item.notes ?? '');
          const category: 'source' | 'alternative' =
            notes.trimStart().startsWith('via_alt') ? 'alternative' : 'source';
          return {
            item_id: item.itemId,
            supplier_name: item.supplierName,
            bidder_description: item.bidderDescription,
            bidder_unit_price: Number(item.bidderUnitPrice ?? 0),
            currency_code: item.currencyCode ?? 'USD',  // From supplier_item_status (per-supplier proposal)
            delivery_time: item.deliveryTime,
            contact_email: item.contactEmail,
            contact_phone: item.contactPhone,
            source_url: item.sourceUrl,
            status: item.status,
            // Redesign fields
            category,
            notes,
            compliance_deviation: String(item.complianceDeviation ?? ''),
            available_qty: item.availableQty == null ? null : Number(item.availableQty),
            selling_unit: (item.sellingUnit as 'per_unit' | 'per_pack' | null) ?? null,
            pack_size: item.packSize == null ? null : Number(item.packSize),
            match_reasoning: (item.matchReasoning as string | null) ?? null,
            // Multi-page hybrid extraction signals
            page_type: (item.pageType as 'product' | 'tech_spec' | null) ?? null,
            requires_quote: item.requiresQuote === true,
            // Item-level identification (shared across all supplier rows of an item)
            item_identification: identificationByItem.get(Number(item.itemId)) ?? null,
          };
        }),
        rfq_id: rfqId,
      };
    } catch (err) {
      console.warn(`[fetchWorkspace] suppliers_search preview load failed:`, err);
      return null;
    }
  }

  // Email preview: fetch email_table
  if (previewType === 'email') {
    try {
      const rows = await getData('emailTable', { rfqId }, workspace);
      const email = rows[0];
      if (!email) return null;
      return {
        to: email.recipientEmail,
        subject: email.subject,
        body: email.emailContent,
        rfq_id: rfqId,  // required for Accept → send pipeline (mirrors analysis/suppliers_search shapes)
      };
    } catch (err) {
      console.warn(`[fetchWorkspace] email preview load failed:`, err);
      return null;
    }
  }

  // Items ordering: delegate to shared builder (reused by data-processor.ts after email/send)
  if (previewType === 'items_ordering') {
    return buildItemsOrderingPreview(rfqId, workspace);
  }

  // Fallback to rfq_analysis when type is unknown (analysis always exists in map)
  const descriptor = PREVIEW_TABLE_MAP.analysis!;
  try {
    const rows = await getData(descriptor.table, { [descriptor.idColumn]: rfqId }, workspace);
    const analysis = rows[0];
    if (!analysis) return null;
    const itemRows = await getData('rfqItems', { rfqId }, workspace);
    const requiredCurrency = String(analysis.requiredCurrency ?? 'USD');
    return {
      rfq_analysis: {
        subject: analysis.subject,
        analysis_content: analysis.analysisContent,
      },
      rfq_items: (itemRows || []).map((item: Record<string, unknown>) => ({
        item_id: item.itemId,
        company_requirement: {
          company_description: item.companyDescription,
          qty: item.qty,
          uom: item.uom,
        },
        currency_code: requiredCurrency,
      })),
      rfq_id: rfqId,
    };
  } catch (err) {
    console.warn(`[fetchWorkspace] fallback analysis preview load failed:`, err);
    return null;
  }
}
