// =============================================
// THREAD AI ACTIONS — Server actions for items_ordering AI features
// =============================================
// Called from items-ordering-document.tsx (client component) for:
//   - AI thread summary: summarize supplier email thread on row select
//   - AI draft reply: pre-fill reply textarea when operator clicks "AI Draft Reply"

'use server';

import { aiChatCompletion } from '@/lib/ai-agent/ai-router';
import { getData, updateData } from '@/lib/db/queries';
import { getServerActionWorkspace } from '@/lib/middleware/get-workspace';

interface ThreadMsg {
  direction: 'outbound' | 'inbound';
  subject: string;
  body: string;
  from_email: string;
  sent_at: string | null;
}

const SUMMARY_SYSTEM_PROMPT = `You summarize supplier email threads for procurement operators. Return ONLY valid JSON: {"text": "1-2 sentence summary of what was discussed and current status"}`;

const DRAFT_REPLY_SYSTEM_PROMPT = `You write professional procurement email replies. Return ONLY valid JSON: {"text": "email body only, plain text, no greeting line, concise and professional"}`;

/** Generate a concise AI summary of a supplier's email thread */
export async function generateAIThreadSummary(
  thread: ThreadMsg[],
  supplierName: string,
  itemName: string,
): Promise<string> {
  if (thread.length === 0) return '';
  const threadText = thread
    .map(m => `[${m.direction === 'outbound' ? 'You' : supplierName}]: ${m.body}`)
    .join('\n\n');
  const result = await aiChatCompletion<{ text: string }>(
    SUMMARY_SYSTEM_PROMPT,
    `Supplier: ${supplierName}\nItem: ${itemName}\n\nThread:\n${threadText}`,
  );
  return result.text ?? '';
}

// ─── Supplier item status persistence ────────────────────────────────────────

/**
 * Persist a supplier item status change to the database.
 * Called from items-ordering-document when operator marks quoted / awards / declines.
 * 'awarded' is written as 'ordered' — the signal loadQuotationGenerateInput queries for.
 */
export async function updateSupplierItemOrderStatus(params: {
  rfqId: number;
  itemId: number;
  supplierId: number | null;
  status: string;
}): Promise<{ success: boolean }> {
  try {
    const workspace = await getServerActionWorkspace();
    if (!workspace) throw new Error('Authentication required');
    const filter: Record<string, unknown> = { rfqId: params.rfqId, itemId: params.itemId };
    if (params.supplierId) filter.supplierId = params.supplierId;
    await updateData('supplierItemStatus', filter, { status: params.status }, workspace);
    return { success: true };
  } catch (err) {
    console.error('[updateSupplierItemOrderStatus]', err);
    return { success: false };
  }
}

// ─── Pricing panel data loader ────────────────────────────────────────────────

interface PricingItem {
  item_id: number;
  bidder_description: string;
  qty: number;
  currency_code: string;
  bidder_unit_price: number;
}

interface PricingVar {
  item_id: number;
  // Nullable: null means "no saved value yet → UI shows the default as ghost placeholder".
  shipping_cost: number | null;
  tax_rate: number | null;
  exchange_rate: number | null;
  profit_rate: number | null;
  discount_rate: number | null;
}

interface CalculatedPricingRow {
  item_id: number;
  sales_unit_price: number;
  ext_price: number;
  potential_profit: number;
  calculation_timestamp: string;
}

interface QuotationPricingData {
  quotationId: number;
  items: PricingItem[];
  variables: PricingVar[];
  // Calculated results from a prior Apply — populated when quotation_pricing
  // rows have sales_unit_price/ext_price/potential_profit columns set.
  // Empty array on first load (user hasn't pressed Apply yet).
  calculated_pricing: CalculatedPricingRow[];
}

/**
 * Load quotation items + pricing variables for the pricing panel.
 * Queries quotations → rfqItems + supplierItemStatus(ordered) + quotationPricing.
 * Returns null when no quotation exists yet for the given RFQ.
 */
export async function fetchQuotationForPricing(
  rfqId: number,
): Promise<QuotationPricingData | null> {
  try {
    const workspace = await getServerActionWorkspace();
    if (!workspace) throw new Error('Authentication required');

    const quotationRows = await getData('quotations', { rfqId }, workspace);
    if (!quotationRows.length) return null;

    const quotation = quotationRows[0] as Record<string, unknown>;
    const quotationId = Number(quotation.quotationId);

    const [rfqItemRows, supplierRows, pricingRows] = await Promise.all([
      getData('rfqItems', { rfqId }, workspace),
      getData('supplierItemStatus', { rfqId, status: 'ordered' }, workspace),
      getData('quotationPricing', { quotationId }, workspace),
    ]);

    // Index ordered supplier by itemId (first match wins)
    const supplierByItem = new Map<number, Record<string, unknown>>();
    for (const s of supplierRows as Array<Record<string, unknown>>) {
      const id = Number(s.itemId);
      if (!supplierByItem.has(id)) supplierByItem.set(id, s);
    }

    // Index existing pricing variables by itemId
    const pricingByItem = new Map<number, Record<string, unknown>>();
    for (const p of pricingRows as Array<Record<string, unknown>>) {
      if (p.itemId) pricingByItem.set(Number(p.itemId), p);
    }

    // currency_code now lives on supplier_item_status (per-supplier proposal),
    // not rfq_items. Fall back to USD only when no ordered supplier exists yet.
    const items: PricingItem[] = (rfqItemRows as Array<Record<string, unknown>>).map(row => {
      const itemId = Number(row.itemId);
      const supplier = supplierByItem.get(itemId);
      return {
        item_id: itemId,
        bidder_description: String(supplier?.bidderDescription ?? row.companyDescription ?? ''),
        qty: Number(row.qty ?? 1),
        currency_code: String(supplier?.currencyCode ?? 'USD'),
        bidder_unit_price: (supplier?.bidderUnitPrice != null && Number(supplier.bidderUnitPrice) > 0)
          ? Number(supplier.bidderUnitPrice)
          : 0,
      };
    });

    // Ghost-mode: only return a numeric value when a quotation_pricing row exists
    // AND that column was actually populated. Otherwise return null so the UI
    // shows the default as ghost placeholder, forcing the user to enter their own.
    const variables: PricingVar[] = items.map(item => {
      const p = pricingByItem.get(item.item_id);
      return {
        item_id: item.item_id,
        shipping_cost: p?.shippingCost  != null ? Number(p.shippingCost)  : null,
        tax_rate:      p?.taxRate       != null ? Number(p.taxRate)       : null,
        exchange_rate: p?.exchangeRate  != null ? Number(p.exchangeRate)  : null,
        profit_rate:   p?.profitRate    != null ? Number(p.profitRate)    : null,
        discount_rate: p?.discountRate  != null ? Number(p.discountRate)  : null,
      };
    });

    // Rehydrate calculated_pricing from quotation_pricing rows that have a
    // populated sales_unit_price column (set by handleCalculate). This is what
    // makes the Potential Profit summary table reappear after F5 — the values
    // are persisted in DB via modifyDatabase + buildPricingPayload (schema:
    // sales_unit_price, ext_price, potential_profit on quotation_pricing).
    const calculated_pricing: CalculatedPricingRow[] = items
      .map(item => {
        const p = pricingByItem.get(item.item_id);
        if (!p || p.salesUnitPrice == null) return null;
        return {
          item_id: item.item_id,
          sales_unit_price: Number(p.salesUnitPrice),
          ext_price: p.extPrice != null ? Number(p.extPrice) : 0,
          potential_profit: p.potentialProfit != null ? Number(p.potentialProfit) : 0,
          calculation_timestamp: (p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt ?? new Date().toISOString())),
        };
      })
      .filter((x): x is CalculatedPricingRow => x !== null);

    return { quotationId, items, variables, calculated_pricing };
  } catch (err) {
    console.error('[fetchQuotationForPricing]', err);
    return null;
  }
}

/** Generate an AI draft reply for the operator to review before sending */
export async function generateAIDraftReply(
  thread: ThreadMsg[],
  supplierName: string,
  itemName: string,
): Promise<string> {
  const threadText = thread.length > 0
    ? thread.map(m => `[${m.direction === 'outbound' ? 'You' : supplierName}]: ${m.body}`).join('\n\n')
    : '(No prior messages — this is the first follow-up)';
  const result = await aiChatCompletion<{ text: string }>(
    DRAFT_REPLY_SYSTEM_PROMPT,
    `Write a follow-up reply to ${supplierName} regarding item: ${itemName}\n\nThread context:\n${threadText}`,
  );
  return result.text ?? '';
}
