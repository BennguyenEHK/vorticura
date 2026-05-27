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
}
