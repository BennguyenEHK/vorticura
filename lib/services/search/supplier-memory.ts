// =============================================
// SUPPLIER MEMORY — L0 exact-match learned cache (search Tier-0)
// =============================================
// Read/write helpers for the supplier_memory table: a normalized RFQ spec
// (spec_hash) → previously-verified supplier row. On a FRESH exact hit the
// orchestrator returns the stored suppliers and skips the entire live pipeline
// (no Tavily search, no LLM planning/extraction).
//
// Scope of THIS module (Phase 2, first cut):
//   • L0 exact-match read (fresh-only) + write (upsert).
// Deferred (provisioned but not yet wired — see the design spec §3.3/§3.4):
//   • L1 pgvector near-match seeding.
//   • verify-on-stale (re-extract the stored URL with 1 LLM call, no web search).
//     Until that lands, a STALE hit is treated as a miss and re-sourced live,
//     which transparently refreshes the row — correct, just not yet optimal.
//
// Gated by SEARCH_MEMORY_ENABLED so the read path can be killed instantly if a
// poisoned/stale entry ever surfaces; writes can run while reads are disabled
// ("shadow" warm-up). Every DB call is wrapped — a memory outage must NEVER
// break supplier search; it degrades to the live pipeline.

import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { supplierMemory } from '@/lib/db/schema';
import type { ParsedSpec } from '@/lib/ai-agent/schemas/query-plan';
import { specHash } from './spec-hash';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** Master switch — when false, lookupMemory always misses (live pipeline runs). */
export function isMemoryEnabled(): boolean {
  const v = (process.env.SEARCH_MEMORY_ENABLED ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

/** Independent switch for the write path so writes can warm the table while
 *  reads stay disabled. Defaults to the master switch when unset. */
export function isMemoryWriteEnabled(): boolean {
  const raw = process.env.SEARCH_MEMORY_WRITE;
  if (raw === undefined) return isMemoryEnabled();
  const v = raw.toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

/** Freshness window — a hit older than this is treated as a miss (re-sourced). */
function ttlDays(): number {
  const raw = Number(process.env.SEARCH_MEMORY_TTL_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

// ---------------------------------------------
// Types
// ---------------------------------------------

/** Tenant scope — supplied by the orchestrator from its WorkspaceContext. */
export interface MemoryScope {
  companyId: number;
  userId: number;
}

/** The cached sourcing fields a memory hit returns (subset of ItemSourceRow). */
export interface MemoryHit {
  supplier_name: string;
  source_url: string;
  bidder_description: string;
  bidder_unit_price: number;
  currency_code: string;
  delivery_time: string;
  available_qty: number;
  selling_unit: string;
  pack_size: number;
}

/** The sourcing fields the orchestrator hands back to be remembered. */
export interface RememberInput {
  supplier_name: string;
  source_url: string;
  bidder_description: string;
  bidder_unit_price: number;
  currency_code: string;
  delivery_time: string;
  available_qty: number;
  selling_unit: string;
  pack_size: number;
}

// ---------------------------------------------
// Read — L0 exact-match (fresh only)
// ---------------------------------------------

/**
 * Return FRESH cached supplier rows for this spec, or null on miss / disabled /
 * empty-spec / DB error. Never throws.
 *
 * A non-empty result means the orchestrator can skip the live pipeline for this
 * item entirely.
 */
export async function lookupMemory(
  parsed: ParsedSpec,
  scope: MemoryScope,
): Promise<MemoryHit[] | null> {
  if (!isMemoryEnabled()) return null;

  const hash = specHash(parsed);
  if (!hash) return null; // under-specified spec — unsafe to key

  const freshAfter = new Date(Date.now() - ttlDays() * 24 * 60 * 60 * 1000);

  try {
    const rows = await db
      .select()
      .from(supplierMemory)
      .where(
        and(
          eq(supplierMemory.companyId, scope.companyId),
          eq(supplierMemory.specHash, hash),
          gt(supplierMemory.lastVerifiedAt, freshAfter),
        ),
      );

    if (rows.length === 0) return null;

    return rows.map((r) => ({
      supplier_name: r.supplierName ?? '',
      source_url: r.sourceUrl,
      bidder_description: r.bidderDescription ?? '',
      bidder_unit_price: r.bidderUnitPrice != null ? Number(r.bidderUnitPrice) : 0,
      currency_code: r.currencyCode ?? 'USD',
      delivery_time: r.deliveryTime ?? '',
      available_qty: r.availableQty ?? 0,
      selling_unit: r.sellingUnit ?? '',
      pack_size: r.packSize ?? 0,
    }));
  } catch (err) {
    console.warn('[supplier-memory] lookup failed (degrading to live):', err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------
// Write — upsert on (company_id, spec_hash, source_url)
// ---------------------------------------------

/**
 * Remember one sourced supplier row for this spec. Upserts on the unique
 * (company_id, spec_hash, source_url) key: a re-found vendor bumps hit_count and
 * refreshes last_verified_at + the cached fields. No-op when writes are disabled,
 * the spec is empty, or the row has no source_url. Never throws.
 */
export async function rememberSupplier(
  parsed: ParsedSpec,
  row: RememberInput,
  scope: MemoryScope,
): Promise<void> {
  if (!isMemoryWriteEnabled()) return;
  if (!row.source_url || !row.source_url.trim()) return;

  const hash = specHash(parsed);
  if (!hash) return;

  try {
    await db
      .insert(supplierMemory)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        specHash: hash,
        specJson: parsed,
        supplierName: row.supplier_name,
        sourceUrl: row.source_url,
        bidderDescription: row.bidder_description,
        bidderUnitPrice: String(row.bidder_unit_price),
        currencyCode: row.currency_code || 'USD',
        deliveryTime: row.delivery_time,
        availableQty: row.available_qty,
        sellingUnit: row.selling_unit,
        packSize: row.pack_size,
        hitCount: 1,                 // creation counts as the first hit (re-finds increment)
        lastVerifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [supplierMemory.companyId, supplierMemory.specHash, supplierMemory.sourceUrl],
        set: {
          supplierName: row.supplier_name,
          bidderDescription: row.bidder_description,
          bidderUnitPrice: String(row.bidder_unit_price),
          currencyCode: row.currency_code || 'USD',
          deliveryTime: row.delivery_time,
          availableQty: row.available_qty,
          sellingUnit: row.selling_unit,
          packSize: row.pack_size,
          hitCount: sql`${supplierMemory.hitCount} + 1`,
          lastVerifiedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.warn('[supplier-memory] write failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}
