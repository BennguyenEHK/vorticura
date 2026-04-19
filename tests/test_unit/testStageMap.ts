import { STAGE_FETCH_INTENT, getFetchIntent } from '../../lib/ui-reload/stage-map';

function assertEq<T>(got: T, want: T, label: string) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

const ingestion = getFetchIntent('ingestion');
assertEq(ingestion.preview, true, 'ingestion preview');
assertEq(ingestion.suppliers, false, 'ingestion suppliers');
assertEq(ingestion.pricing, false, 'ingestion pricing');

const supplierDiscovery = getFetchIntent('supplier_discovery');
assertEq(supplierDiscovery.suppliers, true, 'supplier_discovery suppliers');
assertEq(supplierDiscovery.pricing, false, 'supplier_discovery pricing');

const awaitingQuotation = getFetchIntent('awaiting_quotation');
assertEq(awaitingQuotation.pricing, true, 'awaiting_quotation pricing');

const finalActions = getFetchIntent('final_actions');
assertEq(finalActions.pricing, true, 'final_actions pricing');
assertEq(finalActions.suppliers, true, 'final_actions suppliers (cumulative)');

// Unknown stage falls back to a safe default.
const unknown = getFetchIntent('not_a_stage' as any);
assertEq(unknown.preview, true, 'unknown stage preview default');

console.log('OK: stage map', Object.keys(STAGE_FETCH_INTENT).length, 'stages');
