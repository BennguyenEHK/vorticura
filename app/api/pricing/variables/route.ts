// =============================================
// PRICING VARIABLES API ROUTE - GET/PUT variables
// =============================================
// GET: Load saved pricing variables
// PUT: Update pricing variables (auto-save)

import { NextRequest, NextResponse } from 'next/server';
import { pricingManager } from '@/lib/services/pricing';
import { validatePricingVariables } from '@/lib/services/pricing/validation';
import type { UpdateVariablesRequest } from '@/types/pricing';

// ---------------------------------------------
// GET /api/pricing/variables?quotationId=123
// ---------------------------------------------

/**
 * Load pricing variables for a quotation
 * Returns array of per-item pricing variables
 */
export async function GET(request: NextRequest) {
  try {
    // Get quotationId from query params
    const { searchParams } = new URL(request.url);
    const quotationIdParam = searchParams.get('quotationId');

    // Validate quotationId
    if (!quotationIdParam) {
      return NextResponse.json(
        { error: 'Missing quotationId parameter' },
        { status: 400 }
      );
    }

    const quotationId = parseInt(quotationIdParam, 10);
    if (isNaN(quotationId) || quotationId <= 0) {
      return NextResponse.json(
        { error: 'Invalid quotationId parameter' },
        { status: 400 }
      );
    }

    // Load items and variables
    const [items, variables] = await Promise.all([
      pricingManager.getQuotationItems(quotationId),
      pricingManager.loadPricingVariables(quotationId),
    ]);

    // Initialize variables for items without existing variables
    const completeVariables = pricingManager.initializeVariables(items, variables);

    return NextResponse.json({
      success: true,
      data: {
        quotation_id: quotationId,
        variables: completeVariables,
      },
    });

  } catch (error) {
    console.error('Error loading pricing variables:', error);
    return NextResponse.json(
      {
        error: 'Failed to load pricing variables',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ---------------------------------------------
// PUT /api/pricing/variables
// ---------------------------------------------

/**
 * Update pricing variables for a quotation
 * Auto-saves changes to database
 */
export async function PUT(request: NextRequest) {
  try {
    // Parse request body
    const body: UpdateVariablesRequest = await request.json();

    // Validate request
    if (!body.quotation_id || body.quotation_id <= 0) {
      return NextResponse.json(
        { error: 'Invalid or missing quotation_id' },
        { status: 400 }
      );
    }

    if (!body.variables || !Array.isArray(body.variables)) {
      return NextResponse.json(
        { error: 'Missing variables array' },
        { status: 400 }
      );
    }

    // Validate pricing variables
    const validation = validatePricingVariables(body.variables);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Save variables to database
    await pricingManager.savePricingVariables(body.quotation_id, body.variables);

    return NextResponse.json({
      success: true,
      updated_count: body.variables.length,
    });

  } catch (error) {
    console.error('Error updating pricing variables:', error);
    return NextResponse.json(
      {
        error: 'Failed to update pricing variables',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
