// =============================================
// SPEC HASH — deterministic L0 key for the supplier-memory cache
// =============================================
// Turns a parsed RFQ specification (from the query planner) into a stable, short
// key so two descriptions of the SAME part collapse to the same memory row. This
// is the Tier-0 exact-match key in the search memory hierarchy (see
// docs/superpowers/specs/2026-05-31-adaptive-supplier-search-design.md §3.2).
//
// Pure, no I/O — trivially unit-testable. Same normalization discipline as the
// product-page scorer's norm(): lowercase + trim so "Z41H-16C" and "z41h 16c"
// hash equal. An EMPTY spec (no usable fields) returns '' — the caller MUST treat
// '' as "do not memoize / do not look up", because hashing an empty spec would
// collide every unrelated under-specified item onto one poisoned row.

import { createHash } from 'crypto';
import type { ParsedSpec } from '@/lib/ai-agent/schemas/query-plan';

// The spec fields that participate in the key, in a FIXED order so the canonical
// form is independent of object key ordering from the LLM.
const SPEC_KEYS: (keyof ParsedSpec)[] = [
  'manufacturer', 'model', 'type', 'size', 'class',
  'connection', 'material', 'bore', 'standard',
];

/**
 * Lowercase and strip ALL non-alphanumeric characters — same discipline as the
 * product-page scorer's norm(). This is what makes formatting variants collapse:
 * "Z41H-16C", "z41h 16c" and "z41h.16c" all normalize to "z41h16c", so the same
 * physical part keys to one memory row regardless of how it was punctuated.
 */
function normValue(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Canonicalize a ParsedSpec to a record of normalized, non-empty fields in a
 * fixed key order. Returns an empty object when no field carries signal.
 */
export function normalizeSpec(parsed: ParsedSpec): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SPEC_KEYS) {
    const raw = parsed[key];
    if (typeof raw === 'string') {
      const v = normValue(raw);
      if (v) out[key] = v;
    }
  }
  return out;
}

/**
 * Deterministic spec hash (sha1 hex, 40 chars — matches the spec_hash column
 * width). Returns '' for an empty/under-specified spec so the caller skips the
 * memory layer for items too vague to key safely.
 *
 * The hash MUST stay stable across versions; if you ever change the canonical
 * form, treat it as a cache-namespace bump (old rows orphan + TTL out).
 */
export function specHash(parsed: ParsedSpec): string {
  const canonical = normalizeSpec(parsed);
  if (Object.keys(canonical).length === 0) return '';
  // JSON.stringify over a fixed-order rebuild → stable canonical string.
  const ordered: Record<string, string> = {};
  for (const key of SPEC_KEYS) {
    if (canonical[key] !== undefined) ordered[key] = canonical[key];
  }
  return createHash('sha1').update(JSON.stringify(ordered)).digest('hex');
}
