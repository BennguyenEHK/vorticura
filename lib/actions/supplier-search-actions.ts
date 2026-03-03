// =============================================
// SUPPLIER SEARCH ACTIONS - Supplier Discovery Processor
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → route by action_type → AI API call → save to DB → emit SSE → return ProcessorResult
// Supports: search | research

import ky from 'ky';
import { eventBus } from '@/lib/event-bus';
import { modifyDatabase } from '@/lib/utils/databaseHandler';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** AI Supplier Search API endpoint */
const SUPPLIER_API_URL = process.env.SUPPLIER_API_URL || 'https://api.example.com/suppliers/search';

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

/** AI API response shape */
interface AISupplierResponse {
  suppliers: Array<{
    id: string;
    name: string;
    email: string;
    rating?: number;
    specialties: string[];
    estimated_lead_time?: number;
    match_score: number;
    location?: string;
    contact_person?: string;
  }>;
  search_metadata: {
    total_found: number;
    search_time_ms: number;
  };
}

/** Internal supplier result shape */
interface SupplierResult {
  id: string;
  name: string;
  email: string;
  rating?: number;
  specialties: string[];
  estimatedLeadTime?: number;
  matchScore: number;
}

/** Internal input for API call */
interface SearchAPIInput {
  subject: string;
  searchContent: string;
  actionType: string;
}

/**
 * Call AI API for supplier search
 */
async function callSupplierSearchAPI(input: SearchAPIInput): Promise<SupplierResult[]> {
  try {
    const response = await ky.post(SUPPLIER_API_URL, {
      json: {
        subject: input.subject,
        search_content: input.searchContent,
        action_type: input.actionType,
      },
      timeout: 45000,
      retry: {
        limit: 2,
        methods: ['post'],
        statusCodes: [408, 429, 500, 502, 503, 504],
      },
      headers: {
        'Authorization': `Bearer ${process.env.AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }).json<AISupplierResponse>();

    // Transform response to our schema
    return response.suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      email: supplier.email,
      rating: supplier.rating,
      specialties: supplier.specialties,
      estimatedLeadTime: supplier.estimated_lead_time,
      matchScore: supplier.match_score,
    }));
  } catch (error) {
    // If AI API fails, return mock data for development
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Supplier Search] API failed, using mock data');
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
