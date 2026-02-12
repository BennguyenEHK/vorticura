// =============================================
// PRICING API ROUTE - GET/POST pricing calculations
// =============================================
// GET: Load pricing data for a quotation
// POST: Calculate pricing and save results

import { NextRequest, NextResponse } from 'next/server';
import { pricingCalculator, pricingManager } from '@/lib/services/pricing';
import { validatePricingVariables } from '@/lib/services/pricing/validation';
import type { CalculatePricingRequest } from '@/types/pricing';

// ---------------------------------------------
// GET /api/pricing?quotationId=123
// ---------------------------------------------

/**
 * Load pricing data for a quotation
 * Returns items, variables, and calculated pricing
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

    // Load pricing data from database
    const pricingData = await pricingManager.loadPricingData(quotationId);

    // Initialize variables for items without existing variables
    const completeVariables = pricingManager.initializeVariables(
      pricingData.items,
      pricingData.variables
    );

    return NextResponse.json({
      success: true,
      data: {
        quotation_id: quotationId,
        items: pricingData.items,
        variables: completeVariables,
        calculated_pricing: pricingData.calculated_pricing,
      },
    });

  } catch (error) {
    console.error('Error loading pricing data:', error);
    return NextResponse.json(
      {
        error: 'Failed to load pricing data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ---------------------------------------------
// POST /api/pricing
// ---------------------------------------------

/**
 * Calculate pricing for quotation items
 * Applies pricing formula and saves results
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: CalculatePricingRequest = await request.json();

    // Validate request
    if (!body.quotation_id || body.quotation_id <= 0) {
      return NextResponse.json(
        { error: 'Invalid or missing quotation_id' },
        { status: 400 }
      );
    }

    if (!body.pricing_variables || !Array.isArray(body.pricing_variables)) {
      return NextResponse.json(
        { error: 'Missing pricing_variables array' },
        { status: 400 }
      );
    }

    // Validate pricing variables
    const validation = validatePricingVariables(body.pricing_variables);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Load quotation items
    const items = await pricingManager.getQuotationItems(body.quotation_id);
    if (items.length === 0) {
      return NextResponse.json(
        { error: 'No quotation items found' },
        { status: 404 }
      );
    }

    // Calculate pricing
    const result = pricingCalculator.calculateQuotationPricing(
      items,
      body.pricing_variables
    );

    // Save variables and calculated pricing to database
    try {
      await pricingManager.savePricingVariables(
        body.quotation_id,
        body.pricing_variables
      );
      await pricingManager.saveCalculatedPricing(
        body.quotation_id,
        result.calculated_pricing
      );
    } catch (saveError) {
      console.error('Error saving pricing data:', saveError);
      // Continue - calculation succeeded, just saving failed
    }

    return NextResponse.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('Error calculating pricing:', error);
    return NextResponse.json(
      {
        error: 'Failed to calculate pricing',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
