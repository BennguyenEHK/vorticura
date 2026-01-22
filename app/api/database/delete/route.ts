/**
 * =============================================
 * 🗑️ DATABASE DELETE API ROUTE
 * =============================================
 * Endpoint: POST /api/database/delete
 * Purpose: Generic delete operation with workspace isolation
 *
 * Request Body:
 * {
 *   "tableName": "quotations",
 *   "columns": { "quotation_id": 1, "status": "draft" }  // WHERE conditions
 * }
 *
 * Response: { success: true, data: <deleted_record> }
 *
 * Note: Using POST instead of DELETE to support complex query parameters in body
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspace } from '@/lib/middleware/get-workspace'; // Extract workspace from headers
import { deleteData } from '@/lib/db/queries'; // Generic delete function

// Define expected request body structure for type safety
interface DeleteRequestBody {
  tableName: string;                    // Target table name (e.g., 'quotations')
  columns: Record<string, unknown>;     // WHERE conditions (required for safety)
}

/**
 * POST /api/database/delete
 * Delete record(s) from the specified table with workspace isolation
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Extract workspace context from middleware-injected headers
    // This enforces multi-tenant isolation (company_id, client_id)
    const workspace = requireWorkspace(request);

    // Step 2: Parse and validate request body
    const body: DeleteRequestBody = await request.json();

    // Step 3: Validate required fields exist
    if (!body.tableName) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: tableName' },
        { status: 400 }
      );
    }

    // Step 4: Validate columns (WHERE conditions) - REQUIRED for safety
    // Prevents accidental mass deletion without WHERE clause (critical!)
    if (!body.columns || typeof body.columns !== 'object' || Object.keys(body.columns).length === 0) {
      return NextResponse.json(
        { success: false, error: 'columns (WHERE conditions) is required and must not be empty - prevents accidental mass deletion' },
        { status: 400 }
      );
    }

    // Step 5: Execute delete operation with workspace context
    // deleteData automatically applies company_id and client_id filters
    const result = await deleteData(
      body.tableName,
      body.columns,          // WHERE conditions
      {},                    // Reserved dataPayload (not used in delete)
      workspace              // Workspace context for tenant isolation
    );

    // Step 6: Check if any record was deleted
    if (!result) {
      return NextResponse.json({
        success: false,
        error: 'No record found matching the specified conditions',
        data: null
      }, { status: 404 });
    }

    // Step 7: Return success response with deleted data
    return NextResponse.json({
      success: true,
      data: result,
      message: `Record from ${body.tableName} deleted successfully`
    });

  } catch (error) {
    // Handle authentication errors (thrown by requireWorkspace)
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Authentication required' },
        { status: 401 }
      );
    }

    // Handle other errors (table not found, constraint violations, etc.)
    console.error('Delete API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
