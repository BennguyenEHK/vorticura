/**
 * =============================================
 * ✏️ DATABASE UPDATE API ROUTE
 * =============================================
 * Endpoint: POST /api/database/update
 * Purpose: Generic update operation with workspace isolation
 *
 * Request Body:
 * {
 *   "tableName": "quotations",
 *   "columns": { "quotation_id": 1 },           // WHERE conditions
 *   "dataPayload": { "status": "completed" }    // Data to update
 * }
 *
 * Response: { success: true, data: <updated_record> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspace } from '@/lib/middleware/get-workspace'; // Extract workspace from headers
import { updateData } from '@/lib/db/queries'; // Generic update function

// Define expected request body structure for type safety
interface UpdateRequestBody {
  tableName: string;                    // Target table name (e.g., 'quotations')
  columns: Record<string, unknown>;     // WHERE conditions (required for safety)
  dataPayload: Record<string, unknown>; // Data object to update
}

/**
 * POST /api/database/update
 * Update record(s) in the specified table with workspace isolation
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Extract workspace context from middleware-injected headers
    // This enforces multi-tenant isolation (company_id, client_id)
    const workspace = requireWorkspace(request);

    // Step 2: Parse and validate request body
    const body: UpdateRequestBody = await request.json();

    // Step 3: Validate required fields exist
    if (!body.tableName) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: tableName' },
        { status: 400 }
      );
    }

    // Step 4: Validate columns (WHERE conditions) - REQUIRED for safety
    // Prevents accidental mass updates without WHERE clause
    if (!body.columns || typeof body.columns !== 'object' || Object.keys(body.columns).length === 0) {
      return NextResponse.json(
        { success: false, error: 'columns (WHERE conditions) is required and must not be empty' },
        { status: 400 }
      );
    }

    // Step 5: Validate dataPayload exists and is not empty
    if (!body.dataPayload || typeof body.dataPayload !== 'object' || Object.keys(body.dataPayload).length === 0) {
      return NextResponse.json(
        { success: false, error: 'dataPayload is required and must not be empty' },
        { status: 400 }
      );
    }

    // Step 6: Execute update operation with workspace context
    // updateData automatically applies company_id and client_id filters
    const result = await updateData(
      body.tableName,
      body.columns,          // WHERE conditions
      body.dataPayload,      // Data to update
      workspace              // Workspace context for tenant isolation
    );

    // Step 7: Check if any record was updated
    if (!result) {
      return NextResponse.json({
        success: false,
        error: 'No record found matching the specified conditions',
        data: null
      }, { status: 404 });
    }

    // Step 8: Return success response with updated data
    return NextResponse.json({
      success: true,
      data: result,
      message: `Record in ${body.tableName} updated successfully`
    });

  } catch (error) {
    // Handle authentication errors (thrown by requireWorkspace)
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Authentication required' },
        { status: 401 }
      );
    }

    // Handle other errors (table not found, validation errors, etc.)
    console.error('Update API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
