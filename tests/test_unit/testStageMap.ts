import { STAGE_FETCH_INTENT, getFetchIntent } from '../../lib/ui-reload/stage-map';

function assertEq<T>(got: T, want: T, label: string) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

// `suppliers` is no longer a panel — preview content is driven by last_preview_type via tableMap
const reportAnalysis = getFetchIntent('report_analysis');
assertEq(reportAnalysis.preview, true, 'report_analysis preview');
assertEq(reportAnalysis.pricing, false, 'report_analysis pricing');

const supplierDiscovery = getFetchIntent('supplier_discovery');
assertEq(supplierDiscovery.preview, true, 'supplier_discovery preview');
assertEq(supplierDiscovery.pricing, false, 'supplier_discovery pricing');

const quotationProcessing = getFetchIntent('quotation_processing');
assertEq(quotationProcessing.pricing, true, 'quotation_processing pricing');

const quotationProcessing2 = getFetchIntent('quotation_processing');
assertEq(quotationProcessing2.pricing, true, 'quotation_processing pricing');
assertEq(quotationProcessing2.preview, true, 'quotation_processing preview');

// Unknown stage falls back to a safe default.
const unknown = getFetchIntent('not_a_stage' as any);
assertEq(unknown.preview, true, 'unknown stage preview default');

console.log('OK: stage map', Object.keys(STAGE_FETCH_INTENT).length, 'stages');
