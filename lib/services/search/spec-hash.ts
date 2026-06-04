// Deterministic L0 cache key from a parsed RFQ spec.
// Empty spec returns '' — caller must skip memoization.

import { createHash } from 'crypto';
import type { ParsedSpec } from '@/lib/ai-agent/schemas/query-plan';

// Fixed field order; independent of LLM object-key ordering.
const SPEC_KEYS: (keyof ParsedSpec)[] = [
  'manufacturer', 'model', 'type', 'size', 'class',
  'connection', 'material', 'bore', 'standard',
];

/**
 * Lowercase + strip non-alphanumeric — formatting variants collapse.
 * "Z41H-16C", "z41h 16c", "z41h.16c" all normalize to "z41h16c".
 */
function normValue(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Canonicalize a ParsedSpec to normalized non-empty fields.
 * Returns empty object when no field carries signal.
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
 * Deterministic spec hash (sha1 hex, 40 chars).
 * Returns '' for empty/under-specified spec — caller skips memory layer.
 * Hash must stay stable; changing canonical form is a cache-namespace bump.
 */
export function specHash(parsed: ParsedSpec): string {
  const canonical = normalizeSpec(parsed);
  if (Object.keys(canonical).length === 0) return '';
  // Fixed-order rebuild → stable canonical string.
  const ordered: Record<string, string> = {};
  for (const key of SPEC_KEYS) {
    if (canonical[key] !== undefined) ordered[key] = canonical[key];
  }
  return createHash('sha1').update(JSON.stringify(ordered)).digest('hex');
}
