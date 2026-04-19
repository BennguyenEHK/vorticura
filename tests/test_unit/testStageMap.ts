import { STAGE_FETCH_INTENT, getFetchIntent } from '../../lib/ui-reload/stage-map';

function assertEq<T>(got: T, want: T, label: string) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

// `suppliers` is no longer a panel — preview content is driven by last_preview_type via tableMap
const ingestion = getFetchIntent('ingestion');
assertEq(ingestion.preview, true, 'ingestion preview');
assertEq(ingestion.pricing, false, 'ingestion pricing');

const supplierDiscovery = getFetchIntent('supplier_discovery');
assertEq(supplierDiscovery.preview, true, 'supplier_discovery preview');
assertEq(supplierDiscovery.pricing, false, 'supplier_discovery pricing');

const awaitingQuotation = getFetchIntent('awaiting_quotation');
assertEq(awaitingQuotation.pricing, true, 'awaiting_quotation pricing');

const finalActions = getFetchIntent('final_actions');
assertEq(finalActions.pricing, true, 'final_actions pricing');
assertEq(finalActions.preview, true, 'final_actions preview');

// Unknown stage falls back to a safe default.
const unknown = getFetchIntent('not_a_stage' as any);
assertEq(unknown.preview, true, 'unknown stage preview default');

console.log('OK: stage map', Object.keys(STAGE_FETCH_INTENT).length, 'stages');
