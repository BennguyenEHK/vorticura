// Supplier memory: L0 exact-match cache (search Tier-0).
// spec_hash → previously-verified supplier row.
// Gated by SEARCH_MEMORY_ENABLED; DB errors degrade to live pipeline.

import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { supplierMemory } from '@/lib/db/schema';
import type { ParsedSpec } from '@/lib/ai-agent/schemas/query-plan';
import { specHash } from './spec-hash';

// --- Configuration ---

/** Master switch — false means lookupMemory always misses. */
export function isMemoryEnabled(): boolean {
  const v = (process.env.SEARCH_MEMORY_ENABLED ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

/** Write-path switch; defaults to master switch when unset. */
export function isMemoryWriteEnabled(): boolean {
  const raw = process.env.SEARCH_MEMORY_WRITE;
  if (raw === undefined) return isMemoryEnabled();
  const v = raw.toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

/** Hit older than TTL is treated as a miss. */
function ttlDays(): number {
  const raw = Number(process.env.SEARCH_MEMORY_TTL_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

// --- Types ---

/** Tenant scope from the orchestrator's WorkspaceContext. */
export interface MemoryScope {
  companyId: number;
  userId: number;
}

/** Cached sourcing fields returned on a memory hit. */
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

/** Sourcing fields passed to rememberSupplier. */
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

// --- Read: L0 exact-match (fresh only) ---

/**
 * Return fresh cached supplier rows, or null on miss/error.
 * Non-empty result means the live pipeline can be skipped.
 */
export async function lookupMemory(
  parsed: ParsedSpec,
  scope: MemoryScope,
): Promise<MemoryHit[] | null> {
  if (!isMemoryEnabled()) return null;

  const hash = specHash(parsed);
  if (!hash) return null; // under-specified spec

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

// --- Write: upsert on (company_id, spec_hash, source_url) ---

/**
 * Upsert one supplier row for this spec.
 * Re-found vendor bumps hit_count and refreshes cached fields.
 * No-op when writes disabled or source_url is empty. Never throws.
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
        hitCount: 1,                 // first hit; re-finds increment via onConflict
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
