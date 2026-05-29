// =============================================
// SUPPLIER JSON SCHEMA — guided_json for vLLM extraction
// =============================================
// Locks the LLM output shape for the per-item RAG extraction step
// (lib/actions/supplier-search-actions.ts). Field names mirror the
// items_source DB row so modifyDatabase() can be re-used unchanged.
//
// vLLM enforces this schema at decoding time via xgrammar guided
// decoding when passed as `extra_body.guided_json` on the request.

export const SUPPLIER_SCHEMA = {
  type: 'object',
  // Strict mode: model must populate exactly these keys, no more, no less
  additionalProperties: false,
  required: [
    'supplier_name',
    'source_url',
    'bidder_description',
    'bidder_unit_price',
    'currency_code',
    'delivery_time',
    'compliance_deviation',
    'notes',
    'contact_email',
    'contact_phone',
    // New transient signals — used by orchestrator filters but NOT persisted
    // as their own DB columns (notes carries the human-readable summary).
    'available_qty',
    'alternative_source_url',
  ],
  properties: {
    // Supplier brand / company name (e.g. "Bao Vi Trading")
    supplier_name: { type: 'string' },
    // Specific product/quote page URL — never a homepage. Empty string if no product page found.
    source_url: { type: 'string' },
    // Product description matching RFQ specs
    bidder_description: { type: 'string' },
    // Best-estimate unit price in the supplier's quoted currency; 0 if unknown
    bidder_unit_price: { type: 'number' },
    // ISO 4217 currency for bidder_unit_price (e.g. "USD","VND","EUR","JPY"). Default "USD" if unspecified.
    currency_code: { type: 'string' },
    // Lead time normalized to "X-Y weeks" (e.g. "4-6 weeks")
    delivery_time: { type: 'string' },
    // Reasoned deviation vs RFQ specs, or "Meets all specs"
    compliance_deviation: { type: 'string' },
    // Differentiators / MOQ / certifications. Concise.
    notes: { type: 'string' },
    // Literal email from page; "" if not present
    contact_email: { type: 'string' },
    // Literal phone from page; "" if not present
    contact_phone: { type: 'string' },
    // Stock available at the supplier as stated on the page. 0 = unknown (do
    // NOT punish unknowns — orchestrator stock filter treats 0 as bypass).
    // Drives the Stock Protection Rule (available_qty >= rfq_qty + 2).
    available_qty: { type: 'number' },
    // Explicit href to an alternative / related product on the same vendor or
    // a linked vendor. Empty string when no alternative is offered.
    // Drives the alt-URL re-loop (depth=1, visited-set guarded).
    alternative_source_url: { type: 'string' },
  },
} as const;

// Mirror schema in TS for typed parsing on the orchestrator side.
export interface SupplierExtraction {
  supplier_name: string;
  source_url: string;
  bidder_description: string;
  bidder_unit_price: number;
  currency_code: string;
  delivery_time: string;
  compliance_deviation: string;
  notes: string;
  contact_email: string;
  contact_phone: string;
  available_qty: number;
  alternative_source_url: string;
}

// =============================================
// Normalization — defensive coercion of raw LLM output → SupplierExtraction
// =============================================
// The local vLLM path is schema-enforced (guided_json), but the HuggingFace
// remote path is NOT — the Inference API has no guided_json equivalent, so Qwen
// can return a wrapped object ({"supplier":{...}}), a single-element array,
// alternate key casing (sourceUrl / url / href), or omit fields entirely.
// parseJSON() in hf-client only guarantees "valid JSON", not "valid shape", so
// an unnormalized result silently yields `undefined` fields that get dropped
// downstream: an undefined source_url fails the URL guard, and an undefined
// available_qty bypasses the stock filter. That is the "returned=0 dropped=9"
// wipeout. This wrapper guarantees every consumer sees a fully-populated,
// correctly-typed object regardless of which provider produced it.

type RawRecord = Record<string, unknown>;

/** Unwrap arrays / common wrapper keys so we operate on the supplier object itself. */
function unwrapSupplier(raw: unknown): RawRecord {
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === 'object' ? (first as RawRecord) : {};
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as RawRecord;
    for (const key of ['supplier', 'result', 'data', 'extraction']) {
      const inner = obj[key];
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        return inner as RawRecord;
      }
    }
    return obj;
  }
  return {};
}

/** Index object entries by a loose key (lowercased, separators stripped) for alias matching. */
function indexByLooseKey(obj: RawRecord): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    m.set(k.toLowerCase().replace(/[_\s-]/g, ''), v);
  }
  return m;
}

function pickString(m: Map<string, unknown>, aliases: string[]): string {
  for (const a of aliases) {
    const v = m.get(a);
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

function pickNumber(m: Map<string, unknown>, aliases: string[]): number {
  for (const a of aliases) {
    const v = m.get(a);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

/**
 * Coerce an arbitrary parsed-JSON value into a guaranteed-valid SupplierExtraction.
 * Never throws — unknown/missing fields fall back to safe defaults (empty string,
 * 0). currency_code defaults to "USD" when unspecified.
 */
export function normalizeSupplierExtraction(raw: unknown): SupplierExtraction {
  const m = indexByLooseKey(unwrapSupplier(raw));
  return {
    supplier_name:          pickString(m, ['suppliername', 'supplier', 'name', 'company', 'companyname']),
    source_url:             pickString(m, ['sourceurl', 'url', 'link', 'href', 'producturl', 'productpage']),
    bidder_description:     pickString(m, ['bidderdescription', 'description', 'productdescription', 'desc']),
    bidder_unit_price:      pickNumber(m, ['bidderunitprice', 'unitprice', 'price', 'unitcost']),
    currency_code:          pickString(m, ['currencycode', 'currency', 'ccy']) || 'USD',
    delivery_time:          pickString(m, ['deliverytime', 'leadtime', 'delivery', 'lead']),
    compliance_deviation:   pickString(m, ['compliancedeviation', 'compliance', 'deviation']),
    notes:                  pickString(m, ['notes', 'note', 'remarks', 'remark', 'comment']),
    contact_email:          pickString(m, ['contactemail', 'email', 'mail']),
    contact_phone:          pickString(m, ['contactphone', 'phone', 'telephone', 'tel', 'mobile']),
    available_qty:          pickNumber(m, ['availableqty', 'availablequantity', 'stock', 'quantityavailable', 'instock', 'qty']),
    alternative_source_url: pickString(m, ['alternativesourceurl', 'alternativeurl', 'alturl', 'alternatesourceurl', 'alternativelink']),
  };
}
