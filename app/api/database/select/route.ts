/**
 * =============================================
 * 🔍 DATABASE SELECT API ROUTE
 * =============================================
 * Endpoint: POST /api/database/select
 * Purpose: Generic select operation with workspace isolation and optional JOIN
 *
 * Request Body:
 * {
 *   "tableNames": "quotations" | ["quotations", "quotationItems"],
 *   "columns": { "quotation_id": 1, "status": "active" }  // WHERE conditions
 * }
 *
 * Response: { success: true, data: [...] }
 *
 * Note: Using POST instead of GET to support complex query parameters in body
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspace } from '@/lib/middleware/get-workspace'; // Extract workspace from headers
import { getData } from '@/lib/db/queries'; // Generic select function with JOIN support

// Define expected request body structure for type safety
interface SelectRequestBody {
  tableNames: string | string[];        // Single table or array for LEFT JOIN
  columns?: Record<string, unknown>;    // WHERE conditions (optional)
}

/**
 * POST /api/database/select
 * Fetch records from specified table(s) with workspace isolation
 * Supports single table queries and LEFT JOIN for multiple tables
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Extract workspace context from middleware-injected headers
    // This enforces multi-tenant isolation (company_id, client_id)
    const workspace = requireWorkspace(request);

    // Step 2: Parse and validate request body
    const body: SelectRequestBody = await request.json();

    // Step 3: Validate required fields exist
    if (!body.tableNames) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: tableNames' },
        { status: 400 }
      );
    }

    // Step 4: Validate tableNames is string or array of strings
    const isValidTableNames =
      typeof body.tableNames === 'string' ||
      (Array.isArray(body.tableNames) && body.tableNames.every(t => typeof t === 'string'));

    if (!isValidTableNames) {
      return NextResponse.json(
        { success: false, error: 'tableNames must be a string or array of strings' },
        { status: 400 }
      );
    }

    // Step 5: Execute select operation with workspace context
    // getData automatically applies company_id and client_id filters
    const results = await getData(
      body.tableNames,
      body.columns || {},    // Pass empty object if no WHERE conditions
      workspace              // Workspace context for tenant isolation
    );

    // Step 6: Return success response with fetched data
    return NextResponse.json({
      success: true,
      data: results,
      count: results.length,
      message: `Fetched ${results.length} record(s) successfully`
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
    console.error('Select API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
