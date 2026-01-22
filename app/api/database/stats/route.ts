/**
 * =============================================
 * 📊 DATABASE STATS API ROUTE
 * =============================================
 * Endpoint: POST /api/database/stats
 * Purpose: Get count/statistics for tables with workspace isolation
 *
 * Request Body:
 * {
 *   "tableName": "quotations",
 *   "columns": { "status": "active" }  // Optional WHERE conditions for filtered count
 * }
 *
 * Response: { success: true, data: { count: 42, tableName: "quotations" } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspace } from '@/lib/middleware/get-workspace'; // Extract workspace from headers
import { getCount } from '@/lib/db/queries'; // Use getCount for efficient counting

// Define expected request body structure for type safety
interface StatsRequestBody {
  tableName: string;                    // Target table name (e.g., 'quotations')
  columns?: Record<string, unknown>;    // Optional WHERE conditions for filtered stats
}

/**
 * POST /api/database/stats
 * Get record count and basic statistics for specified table with workspace isolation
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Extract workspace context from middleware-injected headers
    // This enforces multi-tenant isolation (company_id, client_id)
    const workspace = requireWorkspace(request);

    // Step 2: Parse and validate request body
    const body: StatsRequestBody = await request.json();

    // Step 3: Validate required fields exist
    if (!body.tableName) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: tableName' },
        { status: 400 }
      );
    }

    // Step 4: Validate tableName is a string (not array - stats only for single table)
    if (typeof body.tableName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'tableName must be a string (single table only for stats)' },
        { status: 400 }
      );
    }

    // Step 5: Execute count operation with workspace isolation
    // getCount efficiently counts records without loading all rows into memory
    const count = await getCount(
      body.tableName,
      body.columns || {},    // Pass empty object if no WHERE conditions
      workspace              // Workspace context for tenant isolation
    );

    // Step 6: Calculate statistics from count
    const stats = {
      tableName: body.tableName,         // Table that was queried
      count: count,                      // Total record count (via efficient COUNT query)
      hasFilters: Object.keys(body.columns || {}).length > 0,  // Whether filters were applied
      filters: body.columns || {},       // Applied filters (for reference)
    };

    // Step 7: Return success response with statistics
    return NextResponse.json({
      success: true,
      data: stats,
      message: `Statistics for ${body.tableName} retrieved successfully`
    });

  } catch (error) {
    // Handle authentication errors (thrown by requireWorkspace)
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Authentication required' },
        { status: 401 }
      );
    }

    // Handle other errors (table not found, query errors, etc.)
    console.error('Stats API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
