// =============================================
// SUPPLIER SEARCH ACTIONS - Supplier Discovery Processor
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → route by action_type → AI API call → save to DB → emit SSE → return ProcessorResult
// Supports: search | research

import { hfChatCompletion, SUPPLIER_SEARCH_SYSTEM_PROMPT } from '@/lib/ai-agent/hf-client';
import { eventBus } from '@/lib/event-bus';
import { modifyDatabase } from '@/lib/utils/databaseHandler';
import { getLocalModel } from '@/lib/ai-agent/local-model';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';
import type { SearchAPIInput, SupplierResult } from '@/types/ai-agent';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** AI inference mode: 'local' = run model locally, anything else = call remote API */
const AI_MODE = process.env.AI_MODE || 'remote';


// ---------------------------------------------
// Main Processor: Process Supplier Search
// ---------------------------------------------

/**
 * Process supplier search based on action_type
 * @param input - Validated ProcessorInput (data_type: 'supplier_search')
 * @returns ProcessorResult with supplier data
 */
export async function processSupplierSearch(input: ProcessorInput): Promise<ProcessorResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const { action_type, rfq_id, rfq_reference, search, workspace } = input;

    // Route by action_type: search | research → both call AI API
    const suppliers = await callSupplierSearchAPI({
      subject: search?.subject || '',
      searchContent: search?.search_content || '',
      actionType: action_type,
    });

    // Build result
    const result: ProcessorResult = {
      success: true,
      data_type: 'supplier_search',
      action_type,
      status: 'completed',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      data: {
        suppliers,
        searchTimestamp: timestamp,
      },
      timestamp,
    };

    // Save to database (non-blocking, errors don't fail the response)
    // Note: DB handler uses `suppliers_search` (with 's'), not `supplier_search`
    try {
      if (workspace) {
        await modifyDatabase({
          data_type: 'supplier_search',
          rfq_id,
          rfq_reference,
          suppliers_search: {
            subject: search?.subject || '',
            search_content: search?.search_content || '',
            search_status: 'completed',
          },
        }, workspace);
      } else {
        console.warn('[Supplier Search] Skipping DB save because workspace is missing');
      }
    } catch (dbError) {
      console.error('[Supplier Search] DB save failed (non-blocking):', dbError);
    }

    // Emit SSE for real-time preview update
    eventBus.emit('preview-update', result);

    return result;
  } catch (error) {
    console.error('[Supplier Search] Error:', error);

    const errorResult: ProcessorResult = {
      success: false,
      data_type: 'supplier_search',
      action_type: input.action_type,
      status: 'error',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Supplier search failed',
      timestamp,
    };

    eventBus.emit('preview-update', errorResult);
    return errorResult;
  }
}

// ---------------------------------------------
// AI API Call
// ---------------------------------------------

// SupplierResult and SearchAPIInput types imported from '@/types/ai-agent'

/**
 * Call AI for supplier search — routes to local model or remote API based on AI_MODE.
 * Local mode: runs model in-process via @xenova/transformers
 * Remote mode: calls HuggingFace Inference API via hfChatCompletion
 */
async function callSupplierSearchAPI(input: SearchAPIInput): Promise<SupplierResult[]> {
  // Route: local model inference (no network required)
  if (AI_MODE === 'local') {
    console.log('[Supplier Search] Using local AI model');
    try {
      return await getLocalModel().searchSuppliers(input);
    } catch (error) {
      console.error('[Supplier Search] Local model failed:', error);
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Supplier Search] Local model failed, using mock data');
        return generateMockSuppliers();
      }
      throw error;
    }
  }

  // Route: remote API call via HuggingFace Inference SDK
  try {
    // Build user message from input fields
    const userMessage = `Subject: ${input.subject}\n\nRequirements:\n${input.searchContent}`;
    // Call HuggingFace chatCompletion — returns parsed SupplierResult[] JSON
    return await hfChatCompletion<SupplierResult[]>(SUPPLIER_SEARCH_SYSTEM_PROMPT, userMessage);
  } catch (error) {
    // If AI API fails, return mock data for development
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Supplier Search] HF Inference API failed, using mock data');
      return generateMockSuppliers();
    }
    throw error;
  }
}

// ---------------------------------------------
// Mock Data (Development)
// ---------------------------------------------

/**
 * Generate mock supplier results for development
 */
function generateMockSuppliers(): SupplierResult[] {
  return [
    {
      id: 'SUP-001',
      name: 'Global Industrial Parts Co.',
      email: 'sales@globalparts.com',
      rating: 4.8,
      specialties: ['Bearings', 'Mechanical Parts', 'Industrial Components'],
      estimatedLeadTime: 14,
      matchScore: 0.95,
    },
    {
      id: 'SUP-002',
      name: 'Asia Pacific Supplies Ltd.',
      email: 'orders@apac-supplies.com',
      rating: 4.5,
      specialties: ['Hydraulic Parts', 'Seals', 'Valves'],
      estimatedLeadTime: 21,
      matchScore: 0.88,
    },
    {
      id: 'SUP-003',
      name: 'TechMaterials Inc.',
      email: 'procurement@techmaterials.com',
      rating: 4.2,
      specialties: ['Electronic Components', 'Industrial Materials'],
      estimatedLeadTime: 10,
      matchScore: 0.75,
    },
  ].sort((a, b) => b.matchScore - a.matchScore);
}
