// =============================================
// QUERY-PLAN JSON SCHEMA — guided_json for LLM query planner
// =============================================
// Locks the LLM output shape for the procurement search-query planning step
// (lib/services/search/query-planner.ts). The planner parses a free-text item
// description into structured spec fields and emits a ranked list of web
// search queries ordered narrow→broad.
//
// vLLM enforces this schema at decoding time via xgrammar guided decoding when
// passed as `extra_body.guided_json`. The HuggingFace remote path is best-effort
// (no guided_json equivalent) — normalizeQueryPlan() provides defensive coercion.

export const QUERY_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['parsed', 'queries'],
  properties: {
    // Structured spec fields parsed from the item description
    parsed: {
      type: 'object',
      additionalProperties: false,
      properties: {
        // Product/fitting type (e.g. "gate valve", "butterfly valve", "elbow")
        type:         { type: 'string' },
        // Nominal pipe size or dimension (e.g. "2 inch", "DN50")
        size:         { type: 'string' },
        // Pressure class (e.g. "class 150", "class 300", "PN16")
        class:        { type: 'string' },
        // End connection type (e.g. "flanged", "butt-weld", "threaded")
        connection:   { type: 'string' },
        // Body/trim material (e.g. "carbon steel", "stainless 316", "WCB")
        material:     { type: 'string' },
        // Bore/trim designation (e.g. "full bore", "reduced bore")
        bore:         { type: 'string' },
        // Applicable standard (e.g. "ANSI B16.34", "API 600", "ASME B16.10")
        standard:     { type: 'string' },
        // Model number or part number (e.g. "OS&Y", "Z41H-16C")
        model:        { type: 'string' },
        // Manufacturer / brand name (e.g. "Kitz", "Crane", "Neway")
        manufacturer: { type: 'string' },
      },
    },
    // Ranked list of web search queries, ordered narrow→broad; capped at 8
    queries: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const;

// Mirror schema in TS for typed parsing on the orchestrator side.
export interface ParsedSpec {
  type?:         string;
  size?:         string;
  class?:        string;
  connection?:   string;
  material?:     string;
  bore?:         string;
  standard?:     string;
  model?:        string;
  manufacturer?: string;
}

export interface QueryPlan {
  parsed:  ParsedSpec;
  queries: string[];
}

// =============================================
// Normalization — defensive coercion of raw LLM output → QueryPlan
// =============================================
// The local vLLM path is schema-enforced (guided_json), but the HuggingFace
// remote path is NOT — the Inference API has no guided_json equivalent, so the
// model can return a wrapped object ({"plan":{...}}), a single-element array,
// alternate key names (searchQueries / query_list / searches), or omit fields
// entirely. This wrapper guarantees every consumer sees a fully-populated,
// correctly-typed QueryPlan regardless of which provider produced it.

type RawRecord = Record<string, unknown>;

/** Hard caps applied during normalization — defensive bounds on LLM output. */
const MAX_QUERIES = 8;       // ranked list ceiling (matches the prompt's "up to 8")
const MAX_QUERY_LEN = 512;   // per-query character bound

/** Unwrap arrays / common wrapper keys so we operate on the plan object itself. */
function unwrapQueryPlan(raw: unknown): RawRecord {
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === 'object' ? (first as RawRecord) : {};
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as RawRecord;
    for (const key of ['plan', 'result', 'data']) {
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

/**
 * Coerce an arbitrary parsed-JSON value into a guaranteed-valid QueryPlan.
 * Never throws — unknown/missing fields fall back to safe defaults.
 * queries entries are coerced to trimmed strings, empties dropped, deduped
 * preserving order, and capped at 8. Missing → { parsed:{}, queries:[] }.
 */
export function normalizeQueryPlan(raw: unknown): QueryPlan {
  const obj = unwrapQueryPlan(raw);
  const m   = indexByLooseKey(obj);

  // --- queries: pull from loose aliases, coerce entries, dedupe, cap at 8 ---
  const queriesRaw =
    m.get('queries') ??
    m.get('searchqueries') ??
    m.get('querylist') ??
    m.get('searches');

  // Accept both an array and a bare single string — some models return one query
  // as a string rather than a one-element array. Anything else → no queries.
  const rawList: unknown[] = Array.isArray(queriesRaw)
    ? queriesRaw
    : typeof queriesRaw === 'string'
      ? [queriesRaw]
      : [];

  const queries: string[] = [];
  const seen = new Set<string>();
  for (const entry of rawList) {
    // Trim, then bound each query length defensively (a runaway LLM string must
    // not flow unbounded into the search layer). Slice before dedupe so trimmed
    // near-duplicates still collapse.
    const s = (typeof entry === 'string' ? entry : String(entry ?? '')).trim().slice(0, MAX_QUERY_LEN);
    if (s && !seen.has(s)) {
      seen.add(s);
      queries.push(s);
      if (queries.length >= MAX_QUERIES) break;
    }
  }

  // --- parsed: best-effort from loose keys on the nested parsed object ---
  const parsedRaw = m.get('parsed');
  let parsedObj: RawRecord = {};
  if (parsedRaw && typeof parsedRaw === 'object' && !Array.isArray(parsedRaw)) {
    parsedObj = parsedRaw as RawRecord;
  }
  const pm = indexByLooseKey(parsedObj);

  const parsed: ParsedSpec = {};
  const t            = pickString(pm, ['type', 'producttype', 'itemtype']);
  const size         = pickString(pm, ['size', 'nominalsize', 'dimension', 'nps']);
  const cls          = pickString(pm, ['class', 'pressureclass', 'rating', 'pressurerating']);
  const connection   = pickString(pm, ['connection', 'endconnection', 'endtype', 'facing']);
  const material     = pickString(pm, ['material', 'bodymaterial', 'trimmaterial']);
  const bore         = pickString(pm, ['bore', 'boretype', 'borestyle']);
  const standard     = pickString(pm, ['standard', 'applicablestandard', 'norm', 'code']);
  const model        = pickString(pm, ['model', 'modelnumber', 'partnumber', 'partno']);
  const manufacturer = pickString(pm, ['manufacturer', 'brand', 'make', 'vendor']);

  if (t)            parsed.type         = t;
  if (size)         parsed.size         = size;
  if (cls)          parsed.class        = cls;
  if (connection)   parsed.connection   = connection;
  if (material)     parsed.material     = material;
  if (bore)         parsed.bore         = bore;
  if (standard)     parsed.standard     = standard;
  if (model)        parsed.model        = model;
  if (manufacturer) parsed.manufacturer = manufacturer;

  return { parsed, queries };
}
