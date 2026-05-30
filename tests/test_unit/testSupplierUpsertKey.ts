import assert from 'assert';
import {
  supplierItemStatusExistsFilter,
  supplierItemStatusUpdateFilter,
} from '@/lib/utils/databaseHandler';

// =============================================
// Cause C: re-run upsert-key instability
// =============================================
// supplier_id is a synthetic enumeration (idx+1) assigned after merge. Keying
// the upsert on {rfqId, itemId, supplierId} means a re-run whose survivor count
// changed reshuffles supplier_id ↔ item_id, so the existence check misses the
// prior row → duplicate inserts + orphaned stale rows.
//
// Fix: key search rows on their NATURAL identity — source_url (the supplier's
// product page) — which is stable across re-runs. Quotation-flow rows have no
// source_url, so they keep the real supplier_id as the discriminator.

// --- Search row keys on source_url, NOT the synthetic supplier_id ---
const run1 = supplierItemStatusExistsFilter({
  rfq_id: 7, item_id: 3, supplier_id: 2, source_url: 'https://baovi.vn/p/seal-50mm',
});
const run2 = supplierItemStatusExistsFilter({
  rfq_id: 7, item_id: 3, supplier_id: 5, source_url: 'https://baovi.vn/p/seal-50mm',
});
assert.deepEqual(
  run1, run2,
  'same item+source_url must yield the same filter even when synthetic supplier_id changes',
);
assert.equal(run1!.sourceUrl, 'https://baovi.vn/p/seal-50mm', 'filter keys on source_url');
assert.ok(!('supplierId' in run1!), 'synthetic supplier_id is NOT part of the key when source_url is present');

// --- Quotation-flow row (no source_url) falls back to real supplier_id ---
const quote = supplierItemStatusExistsFilter({ rfq_id: 7, item_id: 3, supplier_id: 42 });
assert.equal(quote!.supplierId, 42, 'no source_url → key on real supplier_id (backward compatible)');
assert.ok(!('sourceUrl' in quote!), 'no source_url key when absent');

// --- Empty source_url ("no product page" marker) also falls back to supplier_id ---
const noPage = supplierItemStatusExistsFilter({ rfq_id: 7, item_id: 3, supplier_id: 9, source_url: '' });
assert.equal(noPage!.supplierId, 9, 'empty source_url is treated as absent → supplier_id key');

// --- Missing rfq_id → null (cannot scope the query safely) ---
assert.equal(supplierItemStatusExistsFilter({ item_id: 3 }), null, 'no rfq_id → null filter');

// --- Update filter mirrors the existence filter (must target the matched row) ---
const upd = supplierItemStatusUpdateFilter({
  rfq_id: 7, item_id: 3, supplier_id: 2, source_url: 'https://baovi.vn/p/seal-50mm',
});
assert.equal(upd.rfqId, 7, 'update filter scoped to rfq');
assert.equal(upd.itemId, 3, 'update filter scoped to item');
assert.equal(upd.sourceUrl, 'https://baovi.vn/p/seal-50mm', 'update filter keys on source_url');

const updQuote = supplierItemStatusUpdateFilter({ rfq_id: 7, item_id: 3, supplier_id: 42 });
assert.equal(updQuote.supplierId, 42, 'update filter falls back to supplier_id when no source_url');

console.log('✓ testSupplierUpsertKey passed');
