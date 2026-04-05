/**
 * =============================================
 * DATA LOADER - DB → ProcessorInput Builder
 * =============================================
 * Purpose: Load existing data from the database and construct a complete
 * ProcessorInput for pipeline chaining (e.g., "proceed" action).
 *
 * Architecture role:
 *   data-processor.ts receives a "proceed" action →
 *   data-loader.ts loads DB state for the NEXT pipeline step →
 *   returns a fully-formed ProcessorInput that data-processor can route normally.
 *
 * This is a plain server-side module (NOT a server action).
 * It is consumed only by data-processor.ts during pipeline chaining.
 */

import { getData } from '@/lib/db/queries';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';
import type { DataType, ProcessorInput } from '@/lib/utils/validator';

// =============================================
// Types
// =============================================

/** Parameters required to load a ProcessorInput from DB */
interface LoaderParams {
  data_type: DataType;
  rfq_id: number;
  workspace: WorkspaceContext;
  overrides?: Partial<ProcessorInput>;
}

/** Loader function signature — each data_type has one */
type LoaderFn = (
  rfqId: number,
  workspace: WorkspaceContext
) => Promise<Partial<ProcessorInput>>;

// =============================================
// PER-DATA-TYPE LOADER FUNCTIONS
// =============================================

/**
 * Load analysis input from rfqAnalysis table.
 * Used when pipeline chains INTO rfq_analysis (e.g., reanalyze).
 */
async function loadAnalysisInput(
  rfqId: number,
  workspace: WorkspaceContext
): Promise<Partial<ProcessorInput>> {
  const rows = await getData('rfqAnalysis', { rfqId }, workspace);

  if (!rows.length) {
    throw new Error(`[data-loader] No rfqAnalysis found for rfq_id=${rfqId}`);
  }

  const rfq = rows[0];

  return {
    rfq_id: rfqId,
    rfq_reference: rfq.rfqReference,
    analysis: {
      subject: rfq.subject ?? '',
      analysis_content: rfq.analysisContent ?? '',
    },
  };
}

/**
 * Load supplier search input from rfqAnalysis table.
 * Transforms the analysis content into a search request so the
 * supplier_search processor can use extracted items as search queries.
 */
async function loadSupplierSearchInput(
  rfqId: number,
  workspace: WorkspaceContext
): Promise<Partial<ProcessorInput>> {
  const rows = await getData('rfqAnalysis', { rfqId }, workspace);

  if (!rows.length) {
    throw new Error(`[data-loader] No rfqAnalysis found for rfq_id=${rfqId}`);
  }

  const rfq = rows[0];

  // Use the analysis content as search content — the supplier_search
  // processor will extract item descriptions and search for suppliers.
  return {
    rfq_id: rfqId,
    rfq_reference: rfq.rfqReference,
    search: {
      subject: rfq.subject ?? '',
      search_content: rfq.analysisContent ?? '',
    },
  };
}

/**
 * Load email input by combining rfqAnalysis + quotations context.
 * Email content and recipient are left empty — the AI email generator
 * will fill them based on quotation context.
 */
async function loadEmailInput(
  rfqId: number,
  workspace: WorkspaceContext
): Promise<Partial<ProcessorInput>> {
  // Fetch RFQ analysis for reference and subject
  const rfqRows = await getData('rfqAnalysis', { rfqId }, workspace);

  if (!rfqRows.length) {
    throw new Error(`[data-loader] No rfqAnalysis found for rfq_id=${rfqId}`);
  }

  const rfq = rfqRows[0];

  // Fetch the quotation linked to this RFQ (for quotation_id context)
  const quotationRows = await getData('quotations', { rfqId }, workspace);
  const quotation = quotationRows[0] ?? null;

  return {
    rfq_id: rfqId,
    rfq_reference: rfq.rfqReference,
    quotation_id: quotation?.quotationId ?? undefined,
    email: {
      recipient_email: '',
      subject: rfq.subject ?? '',
      email_content: '',
    },
  };
}

/**
 * Load quotation generation input by combining rfqAnalysis metadata
 * with available supplier items from supplierItemStatus.
 * Builds the quotation_data shape needed by the quotation processor.
 */
async function loadQuotationInput(
  rfqId: number,
  workspace: WorkspaceContext
): Promise<Partial<ProcessorInput>> {
  // Get RFQ reference
  const rfqRows = await getData('rfqAnalysis', { rfqId }, workspace);

  if (!rfqRows.length) {
    throw new Error(`[data-loader] No rfqAnalysis found for rfq_id=${rfqId}`);
  }

  const rfq = rfqRows[0];

  // Get available supplier items for this RFQ
  const supplierItems = await getData(
    'supplierItemStatus',
    { rfqId, status: 'available' },
    workspace
  );

  // Transform supplier items into quotation item format
  const quotationItems = supplierItems.map((item) => ({
    item_id: item.itemId,
    currency_code: 'USD',
    company_requirement: {
      company_description: '',
      qty: 1,
    },
    bidder_proposal: {
      bidder_description: item.supplierName ?? '',
      bidder_unit_price: item.unitPrice ? parseFloat(item.unitPrice) : 0,
      delivery_time: item.deliveryTime ?? '',
      compliance_deviation: '',
    },
  }));

  return {
    rfq_id: rfqId,
    rfq_reference: rfq.rfqReference,
    quotation_data: {
      rfq_reference: rfq.rfqReference,
      customer_info: {
        company_name: '',
        attention_person: '',
        carbon_copy_person: [],
        email: '',
        phone: '',
        customer_address: '',
      },
      quotation_items: quotationItems,
      commercial_terms: '',
    },
  };
}

/**
 * Load respond service input from supplierItemStatus table.
 * Returns all items for the given RFQ so the respond_service
 * processor can update their availability status.
 */
async function loadSupplierRespondInput(
  rfqId: number,
  workspace: WorkspaceContext
): Promise<Partial<ProcessorInput>> {
  const supplierItems = await getData(
    'supplierItemStatus',
    { rfqId },
    workspace
  );

  // Map DB rows to the respond_service items shape
  const items = supplierItems.map((item) => ({
    item_id: item.itemId ?? 0,
    status: (item.status as 'available' | 'unavailable') ?? 'pending',
    unit_price: item.unitPrice ? parseFloat(item.unitPrice) : undefined,
    delivery_time: item.deliveryTime ?? undefined,
    notes: item.notes ?? undefined,
  }));

  return {
    rfq_id: rfqId,
    respond_service: {
      rfq_id: rfqId,
      supplier_id: 0,
      items,
    },
  };
}

// =============================================
// DATA_LOADERS ROUTING MAP
// =============================================
// Maps each DataType to its corresponding loader function.
// data-processor calls loadProcessorInput with the NEXT data_type
// in the pipeline, and this map routes to the correct loader.

const DATA_LOADERS: Record<DataType, LoaderFn> = {
  rfq_analysis: loadAnalysisInput,
  supplier_search: loadSupplierSearchInput,
  email: loadEmailInput,
  quotation: loadQuotationInput,
  respond_service: loadSupplierRespondInput,
  // incoming_email is classified internally (no pipeline chain loads into it)
  incoming_email: async () => ({}),
};

// =============================================
// MAIN ENTRY POINT
// =============================================

/**
 * Load data from the database and build a complete ProcessorInput
 * for the given data_type + rfq_id combination.
 *
 * @param params.data_type   - The target data type to build input for
 * @param params.rfq_id      - The RFQ ID to query against
 * @param params.workspace   - Workspace context for tenant isolation
 * @param params.overrides   - Optional partial input to merge on top of DB data
 * @returns Complete ProcessorInput ready for data-processor routing
 * @throws Error if data_type is unsupported or DB queries fail
 */
export async function loadProcessorInput(
  params: LoaderParams
): Promise<ProcessorInput> {
  const { data_type, rfq_id, workspace, overrides } = params;

  // Validate that we have a loader for this data_type
  const loader = DATA_LOADERS[data_type];
  if (!loader) {
    throw new Error(
      `[data-loader] No loader registered for data_type="${data_type}". ` +
      `Supported: ${Object.keys(DATA_LOADERS).join(', ')}`
    );
  }

  try {
    // Step 1: Load base data from the database
    const dbData = await loader(rfq_id, workspace);

    // Step 2: Merge DB data with overrides (overrides take precedence)
    const merged: ProcessorInput = {
      data_type,
      action_type: 'proceed',
      rfq_id,
      ...dbData,
      ...overrides,
      workspace,
    } as ProcessorInput;

    return merged;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `[data-loader] Failed to load input for data_type="${data_type}", ` +
      `rfq_id=${rfq_id}: ${message}`
    );
  }
}
