// =============================================
// QUOTATION ACTIONS - Quotation Generation Server Actions
// =============================================
// Server actions for quotation operations:
// - action_type = 'generate': Generate quotation from supplier responses
// - action_type = 'update': Update quotation with new pricing
// - Update PreviewPanel via store

'use server';

import type {
  ActionResult,
  QuotationInput,
  QuotationOutput,
  QuotationItem,
} from '@/types/workflow';
import { QuotationInputSchema } from '@/types/workflow';

// ---------------------------------------------
// In-Memory Storage (Development)
// ---------------------------------------------
// TODO: Replace with database when DB layer is implemented

const quotationStore = new Map<string, QuotationOutput>();

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

    // Store in memory (TODO: replace with DB)
    quotationStore.set(input.rfqId, output);

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

  // Get existing quotation from memory store
  const existing = quotationStore.get(input.rfqId);

  if (!existing) {
    throw new Error('No existing quotation found for this RFQ');
  }

  // Apply updates to items
  const items = existing.items.map((item) => {
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

  return {
    rfqId: input.rfqId,
    quotationId: existing.quotationId,
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
    const existing = quotationStore.get(rfqId);

    return {
      success: true,
      data: existing || null,
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
 * Delete a quotation
 * @param rfqId - RFQ identifier
 */
export async function deleteQuotation(
  rfqId: string
): Promise<ActionResult<void>> {
  const timestamp = new Date().toISOString();

  try {
    quotationStore.delete(rfqId);

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
