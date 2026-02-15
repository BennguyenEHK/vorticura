// =============================================
// SUPPLIER SEARCH ACTIONS - Supplier Discovery Server Actions
// =============================================
// Server actions for finding suppliers:
// - Search suppliers via AI API
// - Filter by preferences (region, rating, lead time)
// - Return ranked supplier list
// - Store results in database

'use server';

import { createClient } from '@supabase/supabase-js';
import ky from 'ky';
import type {
  ActionResult,
  SupplierSearchInput,
  SupplierSearchOutput,
  SupplierResult,
} from '@/lib/types/workflow';
import { SupplierSearchInputSchema } from '@/lib/types/workflow';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** Supabase client for database operations */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** AI Supplier Search API endpoint */
const SUPPLIER_API_URL = process.env.SUPPLIER_API_URL || 'https://api.example.com/suppliers/search';

// ---------------------------------------------
// Main Action: Search Suppliers
// ---------------------------------------------

/**
 * Search for suppliers matching RFQ requirements
 * @param input - Supplier search input
 * @returns ActionResult with supplier results
 */
export async function searchSuppliers(
  input: SupplierSearchInput
): Promise<ActionResult<SupplierSearchOutput>> {
  const timestamp = new Date().toISOString();

  try {
    // Validate input using Zod schema
    const validationResult = SupplierSearchInputSchema.safeParse(input);
    if (!validationResult.success) {
      return {
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
        timestamp,
        stepId: 'supplier_search',
        rfqId: input.rfqId,
      };
    }

    // Call AI API for supplier search
    const suppliers = await callSupplierSearchAPI(input);

    // Store results in Supabase
    const output: SupplierSearchOutput = {
      rfqId: input.rfqId,
      suppliers,
      searchTimestamp: timestamp,
    };

    const { error: dbError } = await supabase
      .from('supplier_searches')
      .upsert({
        rfq_id: input.rfqId,
        search_results: output,
        created_at: timestamp,
        updated_at: timestamp,
      });

    if (dbError) {
      console.error('[Supplier Search] Database error:', dbError);
    }

    return {
      success: true,
      data: output,
      timestamp,
      stepId: 'supplier_search',
      rfqId: input.rfqId,
    };

  } catch (error) {
    console.error('[Supplier Search] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Supplier search failed',
      timestamp,
      stepId: 'supplier_search',
      rfqId: input.rfqId,
    };
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

/**
 * Call AI API for supplier search
 */
async function callSupplierSearchAPI(
  input: SupplierSearchInput
): Promise<SupplierResult[]> {
  try {
    // Make API call with ky
    const response = await ky.post(SUPPLIER_API_URL, {
      json: {
        items: input.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          specifications: item.specifications,
        })),
        preferences: {
          region: input.preferences?.region,
          min_rating: input.preferences?.minRating,
          max_lead_time: input.preferences?.maxLeadTime,
        },
      },
      timeout: 45000, // 45 second timeout (search can take longer)
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
    return response.suppliers.map((supplier: AISupplierResponse['suppliers'][0]) => ({
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
      return generateMockSuppliers(input);
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
function generateMockSuppliers(input: SupplierSearchInput): SupplierResult[] {
  const mockSuppliers: SupplierResult[] = [
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
  ];

  // Apply filters from preferences
  let filtered = mockSuppliers;

  if (input.preferences?.minRating) {
    filtered = filtered.filter(
      (s) => (s.rating ?? 0) >= (input.preferences?.minRating ?? 0)
    );
  }

  if (input.preferences?.maxLeadTime) {
    filtered = filtered.filter(
      (s) => (s.estimatedLeadTime ?? Infinity) <= (input.preferences?.maxLeadTime ?? Infinity)
    );
  }

  // Sort by match score
  return filtered.sort((a, b) => b.matchScore - a.matchScore);
}

// ---------------------------------------------
// Helper Actions
// ---------------------------------------------

/**
 * Get existing supplier search results for an RFQ
 * @param rfqId - RFQ identifier
 */
export async function getSupplierSearchResults(
  rfqId: string
): Promise<ActionResult<SupplierSearchOutput | null>> {
  const timestamp = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from('supplier_searches')
      .select('search_results')
      .eq('rfq_id', rfqId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          success: true,
          data: null,
          timestamp,
          stepId: 'supplier_search',
          rfqId,
        };
      }
      throw error;
    }

    return {
      success: true,
      data: data.search_results as SupplierSearchOutput,
      timestamp,
      stepId: 'supplier_search',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get results',
      timestamp,
      stepId: 'supplier_search',
      rfqId,
    };
  }
}

/**
 * Select specific suppliers from search results
 * @param rfqId - RFQ identifier
 * @param supplierIds - IDs of selected suppliers
 */
export async function selectSuppliers(
  rfqId: string,
  supplierIds: string[]
): Promise<ActionResult<{ selectedCount: number }>> {
  const timestamp = new Date().toISOString();

  try {
    // Store selected suppliers
    const { error } = await supabase
      .from('selected_suppliers')
      .upsert({
        rfq_id: rfqId,
        supplier_ids: supplierIds,
        selected_at: timestamp,
      });

    if (error) throw error;

    return {
      success: true,
      data: { selectedCount: supplierIds.length },
      timestamp,
      stepId: 'supplier_search',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to select suppliers',
      timestamp,
      stepId: 'supplier_search',
      rfqId,
    };
  }
}

/**
 * Re-search with different preferences
 * @param rfqId - RFQ identifier
 * @param newPreferences - Updated search preferences
 */
export async function refineSupplierSearch(
  rfqId: string,
  newPreferences: SupplierSearchInput['preferences']
): Promise<ActionResult<SupplierSearchOutput>> {
  const timestamp = new Date().toISOString();

  try {
    // Get original search input
    const { data: originalSearch } = await supabase
      .from('supplier_searches')
      .select('search_results')
      .eq('rfq_id', rfqId)
      .single();

    if (!originalSearch) {
      throw new Error('No previous search found');
    }

    const original = originalSearch.search_results as SupplierSearchOutput;

    // Re-run search with new preferences
    // Note: We need the original items, which should be stored separately
    // For now, return filtered results from existing search
    const filtered = original.suppliers.filter((supplier) => {
      if (newPreferences?.minRating && (supplier.rating ?? 0) < newPreferences.minRating) {
        return false;
      }
      if (newPreferences?.maxLeadTime && (supplier.estimatedLeadTime ?? Infinity) > newPreferences.maxLeadTime) {
        return false;
      }
      return true;
    });

    const output: SupplierSearchOutput = {
      rfqId,
      suppliers: filtered,
      searchTimestamp: timestamp,
    };

    return {
      success: true,
      data: output,
      timestamp,
      stepId: 'supplier_search',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refine search',
      timestamp,
      stepId: 'supplier_search',
      rfqId,
    };
  }
}
