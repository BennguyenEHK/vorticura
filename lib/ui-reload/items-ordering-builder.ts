// =============================================
// ITEMS ORDERING BUILDER - Shared preview builder
// =============================================
// Builds the ItemsOrderingDocumentData shape from rfq_items + supplier_item_status.
// Plain server-side module (NOT a server action) so it can be reused by:
//   - lib/ui-reload/fetch-workspace.ts (page-reload hydration)
//   - lib/data-processor.ts            (post email/send live SSE switch)

import { getData } from '@/lib/db/queries';
import type { WorkspaceContext } from '@/lib/middleware/workspace-context';
import type { ItemsOrderingDocumentData } from '@/types/preview';

export async function buildItemsOrderingPreview(
  rfqId: number,
  workspace: WorkspaceContext,
): Promise<ItemsOrderingDocumentData | null> {
  try {
    const [rfqItems, supplierItems] = await Promise.all([
      getData('rfqItems', { rfqId }, workspace),
      getData('supplierItemStatus', { rfqId }, workspace),
    ]);

    const items = (rfqItems as Array<Record<string, unknown>>).map((rfqItem) => {
      const itemId = Number(rfqItem.itemId);
      const matchingSuppliers = (supplierItems as Array<Record<string, unknown>>)
        .filter((si) => Number(si.itemId) === itemId);
      const suppliers = matchingSuppliers.map((si) => ({
        supplier_id: si.supplierId ? Number(si.supplierId) : null,
        supplier_name: String(si.supplierName ?? ''),
        unit_price: si.bidderUnitPrice ? Number(si.bidderUnitPrice) : null,
        currency_code: si.currencyCode ? String(si.currencyCode) : null,
        lead_time: si.deliveryTime ? String(si.deliveryTime) : null,
        status: String(si.status ?? 'sent') as 'sent' | 'quoted' | 'awarded' | 'declined',
        contact_email: si.contactEmail ? String(si.contactEmail) : null,
        responded_at: si.respondedAt ? String(si.respondedAt) : null,
        source_url: si.sourceUrl ? String(si.sourceUrl) : null,
        ai_summary: null,
        thread: [],
      }));
      // currency_code now lives on supplier_item_status. Display the awarded
      // supplier's currency when one exists, otherwise the first supplier row.
      const awarded = matchingSuppliers.find((si) => String(si.status) === 'ordered' || String(si.status) === 'awarded');
      const currencyOwner = awarded ?? matchingSuppliers[0];
      return {
        item_id: itemId,
        item_name: String(rfqItem.companyDescription ?? ''),
        rfq_qty: Number(rfqItem.qty ?? 0),
        uom: String(rfqItem.uom ?? 'EA'),
        currency_code: String(currencyOwner?.currencyCode ?? 'USD'),
        suppliers,
      };
    });

    const summary = {
      total_items: items.length,
      quoted_count: items.filter((i) => i.suppliers.some((s) => s.status === 'quoted' || s.status === 'awarded')).length,
      awarded_count: items.filter((i) => i.suppliers.some((s) => s.status === 'awarded')).length,
      declined_count: items.filter((i) => i.suppliers.length > 0 && i.suppliers.every((s) => s.status === 'declined')).length,
      awaiting_count: items.filter((i) => i.suppliers.length > 0 && i.suppliers.every((s) => s.status === 'sent')).length,
    };

    return {
      rfq_id: rfqId,
      rfq_reference: String(rfqId), // display label resolved upstream by caller
      items,
      summary,
    };
  } catch (err) {
    console.warn('[items-ordering-builder] build failed:', err);
    return null;
  }
}
