/**
 * =============================================
 * 📝 DATABASE INSERT API ROUTE
 * =============================================
 * Endpoint: POST /api/database/insert
 * Purpose: Generic insert operation with workspace isolation
 *
 * Request Body:
 * {
 *   "tableName": "quotations",     // Target table name
 *   "columns": {},                  // Reserved for future use
 *   "dataPayload": { ... }          // Data to insert
 * }
 *
 * Response: { success: true, data: <inserted_record> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspace } from '@/lib/middleware/get-workspace'; // Extract workspace from headers
import { insertData } from '@/lib/db/queries'; // Generic insert function

// Define expected request body structure for type safety
interface InsertRequestBody {
  tableName: string;                    // Target table name (e.g., 'quotations')
  columns?: Record<string, unknown>;    // Reserved for future column filtering
  dataPayload: Record<string, unknown>; // Data object to insert
}

/**
 * POST /api/database/insert
 * Insert a new record into the specified table with workspace isolation
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Extract workspace context from middleware-injected headers
    // This enforces multi-tenant isolation (company_id, client_id)
    const workspace = requireWorkspace(request);

    // Step 2: Parse and validate request body
    const body: InsertRequestBody = await request.json();

    // Step 3: Validate required fields exist
    if (!body.tableName) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: tableName' },
        { status: 400 }
      );
    }

    if (!body.dataPayload || typeof body.dataPayload !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid field: dataPayload must be an object' },
        { status: 400 }
      );
    }

    // Step 4: Execute insert operation with workspace context
    // insertData automatically injects company_id and client_id
    const result = await insertData(
      body.tableName,
      body.columns || {},    // Pass empty object if not provided
      body.dataPayload,
      workspace              // Workspace context for tenant isolation
    );

    // Step 5: Return success response with inserted data
    return NextResponse.json({
      success: true,
      data: result,
      message: `Record inserted into ${body.tableName} successfully`
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
    console.error('Insert API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
