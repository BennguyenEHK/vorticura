// =============================================
// QUOTATION ACTIONS - Quotation Generation Server Actions
// =============================================
// Server actions for quotation operations:
// - action_type = 'generate': Generate quotation from supplier responses
// - action_type = 'update': Update quotation with new pricing
// - Store in database
// - Update PreviewPanel via store

'use server';

import { createClient } from '@supabase/supabase-js';
import type {
  ActionResult,
  QuotationInput,
  QuotationOutput,
  QuotationItem,
  QuotationActionType,
} from '@/types/workflow';
import { QuotationInputSchema } from '@/types/workflow';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** Supabase client for database operations */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------
// Main Action: Process Quotation
// ---------------------------------------------

/**
 * Process quotation based on action type
 * @param input - Quotation input with action type
 * @returns ActionResult with quotation output
 */
export async function processQuotation(
  input: QuotationInput
): Promise<ActionResult<QuotationOutput>> {
  const timestamp = new Date().toISOString();

  try {
    // Validate input using Zod schema
    const validationResult = QuotationInputSchema.safeParse(input);
    if (!validationResult.success) {
      return {
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
        timestamp,
        stepId: 'quotation',
        rfqId: input.rfqId,
      };
    }

    // Route to appropriate handler based on action type
    let output: QuotationOutput;

    if (input.actionType === 'generate') {
      output = await generateQuotation(input, timestamp);
    } else {
      output = await updateQuotation(input, timestamp);
    }

    return {
      success: true,
      data: output,
      timestamp,
      stepId: 'quotation',
      rfqId: input.rfqId,
    };

  } catch (error) {
    console.error('[Quotation] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Quotation processing failed',
      timestamp,
      stepId: 'quotation',
      rfqId: input.rfqId,
    };
  }
}

// ---------------------------------------------
// Generate Quotation
// ---------------------------------------------

/**
 * Generate new quotation from supplier responses
 */
async function generateQuotation(
  input: QuotationInput,
  timestamp: string
): Promise<QuotationOutput> {
  if (!input.supplierResponses || input.supplierResponses.length === 0) {
    throw new Error('No supplier responses provided for generation');
  }

  // Aggregate items from all supplier responses
  const itemsMap = new Map<number, QuotationItem>();

  for (const response of input.supplierResponses) {
    for (const item of response.items) {
      // Keep the best price for each item
      const existing = itemsMap.get(item.itemId);
      if (!existing || item.unitPrice < existing.unitPrice) {
        itemsMap.set(item.itemId, item);
      }
    }
  }

  const items = Array.from(itemsMap.values());

  // Calculate total amount
  const totalAmount = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  // Generate quotation ID
  const quotationId = `Q-${Date.now().toString(36).toUpperCase()}`;

  // Store quotation in database
  const { error: dbError } = await supabase
    .from('quotations')
    .insert({
      id: quotationId,
      rfq_id: input.rfqId,
      items: items,
      total_amount: totalAmount,
      currency: items[0]?.currency || 'USD',
      status: 'draft',
      created_at: timestamp,
      updated_at: timestamp,
    });

  if (dbError) {
    console.error('[Quotation] Database error:', dbError);
    throw new Error('Failed to store quotation');
  }

  return {
    rfqId: input.rfqId,
    quotationId,
    actionType: 'generate',
    items,
    totalAmount,
    currency: items[0]?.currency || 'USD',
    generatedAt: timestamp,
  };
}

// ---------------------------------------------
// Update Quotation
// ---------------------------------------------

/**
 * Update existing quotation with new values
 */
async function updateQuotation(
  input: QuotationInput,
  timestamp: string
): Promise<QuotationOutput> {
  if (!input.updates || input.updates.length === 0) {
    throw new Error('No updates provided');
  }

  // Get existing quotation
  const { data: existing, error: fetchError } = await supabase
    .from('quotations')
    .select('*')
    .eq('rfq_id', input.rfqId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError) {
    throw new Error('Failed to fetch existing quotation');
  }

  // Apply updates to items
  const items = (existing.items as QuotationItem[]).map((item) => {
    const update = input.updates?.find((u) => u.itemId === item.itemId);
    if (update) {
      return {
        ...item,
        [update.field]: update.value,
      };
    }
    return item;
  });

  // Recalculate total
  const totalAmount = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  // Update in database
  const { error: updateError } = await supabase
    .from('quotations')
    .update({
      items,
      total_amount: totalAmount,
      updated_at: timestamp,
    })
    .eq('id', existing.id);

  if (updateError) {
    throw new Error('Failed to update quotation');
  }

  return {
    rfqId: input.rfqId,
    quotationId: existing.id,
    actionType: 'update',
    items,
    totalAmount,
    currency: existing.currency,
    generatedAt: timestamp,
  };
}

// ---------------------------------------------
// Helper Actions
// ---------------------------------------------

/**
 * Get quotation for an RFQ
 * @param rfqId - RFQ identifier
 */
export async function getQuotation(
  rfqId: string
): Promise<ActionResult<QuotationOutput | null>> {
  const timestamp = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('rfq_id', rfqId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          success: true,
          data: null,
          timestamp,
          stepId: 'quotation',
          rfqId,
        };
      }
      throw error;
    }

    const output: QuotationOutput = {
      rfqId,
      quotationId: data.id,
      actionType: 'generate',
      items: data.items as QuotationItem[],
      totalAmount: data.total_amount,
      currency: data.currency,
      generatedAt: data.created_at,
    };

    return {
      success: true,
      data: output,
      timestamp,
      stepId: 'quotation',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get quotation',
      timestamp,
      stepId: 'quotation',
      rfqId,
    };
  }
}

/**
 * Update single item in quotation
 * @param rfqId - RFQ identifier
 * @param itemId - Item to update
 * @param updates - Field updates
 */
export async function updateQuotationItem(
  rfqId: string,
  itemId: number,
  updates: Partial<QuotationItem>
): Promise<ActionResult<QuotationItem>> {
  const timestamp = new Date().toISOString();

  try {
    // Build update array
    const updateInputs = Object.entries(updates).map(([field, value]) => ({
      itemId,
      field,
      value,
    }));

    // Use the main update function
    const result = await processQuotation({
      rfqId,
      actionType: 'update',
      updates: updateInputs,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Update failed');
    }

    // Find the updated item
    const updatedItem = result.data.items.find((i) => i.itemId === itemId);
    if (!updatedItem) {
      throw new Error('Item not found after update');
    }

    return {
      success: true,
      data: updatedItem,
      timestamp,
      stepId: 'quotation',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update item',
      timestamp,
      stepId: 'quotation',
      rfqId,
    };
  }
}

/**
 * Delete a quotation
 * @param rfqId - RFQ identifier
 * @param quotationId - Quotation to delete
 */
export async function deleteQuotation(
  rfqId: string,
  quotationId: string
): Promise<ActionResult<void>> {
  const timestamp = new Date().toISOString();

  try {
    const { error } = await supabase
      .from('quotations')
      .delete()
      .eq('id', quotationId)
      .eq('rfq_id', rfqId);

    if (error) throw error;

    return {
      success: true,
      timestamp,
      stepId: 'quotation',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete quotation',
      timestamp,
      stepId: 'quotation',
      rfqId,
    };
  }
}

/**
 * Finalize quotation (change status to final)
 * @param rfqId - RFQ identifier
 * @param quotationId - Quotation to finalize
 */
export async function finalizeQuotation(
  rfqId: string,
  quotationId: string
): Promise<ActionResult<{ status: string }>> {
  const timestamp = new Date().toISOString();

  try {
    const { error } = await supabase
      .from('quotations')
      .update({
        status: 'final',
        finalized_at: timestamp,
        updated_at: timestamp,
      })
      .eq('id', quotationId)
      .eq('rfq_id', rfqId);

    if (error) throw error;

    return {
      success: true,
      data: { status: 'final' },
      timestamp,
      stepId: 'quotation',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to finalize quotation',
      timestamp,
      stepId: 'quotation',
      rfqId,
    };
  }
}
