'use client';

import { useState, useRef, useCallback } from 'react';
import {
  ChevronRight, ChevronDown, ExternalLink, Package, Mail, Phone,
} from 'lucide-react';

import type { SupplierSearchDocumentData } from '@/types/preview';

interface SupplierSearchDocumentProps {
  data: SupplierSearchDocumentData;
  isEditing: boolean;                            // will be unused
  onFieldChange: (path: string, value: string) => void; // will be unused
}

// Key identifying the selected supplier row
interface SelectedKey { itemId: number; category: 'source' | 'alternative'; idx: number }

const COLS = '24px 1fr 100px 100px'; // For upper panel: Chevron, Supplier Name/Item ID, Price, Delivery Time

// Strip leading "via_alt[:<token>]" prefix from notes (up to first whitespace).
// Mirrors the category-detection rule (trimStart + startsWith('via_alt')) used in
// fetch-workspace.ts / use-preview-sse.ts so detection and stripping stay in sync —
// tolerates an optional colon and leading whitespace.
function stripViaAltPrefix(notes: string): string {
  const trimmed = notes.trimStart();
  if (!trimmed.startsWith('via_alt')) return notes;
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return ''; // entire string is the prefix token
  return trimmed.slice(spaceIdx + 1).trim();
}

// Render a small page_type pill badge
function PageTypeBadge({ pageType }: { pageType: 'product' | 'tech_spec' | null }) {
  if (!pageType) return null;
  if (pageType === 'product') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide shrink-0 bg-blue-950/70 text-blue-400 border border-blue-800/40">
        Product
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide shrink-0 bg-violet-950/70 text-violet-400 border border-violet-800/40">
      Tech Spec
    </span>
  );
}

// Render the price cell content (upper panel)
function PriceCell({
  bidder_unit_price,
  currency_code,
  requires_quote,
}: {
  bidder_unit_price: number;
  currency_code: string;
  requires_quote: boolean;
}) {
  if (requires_quote) {
    return <span className="text-amber-400 text-[10px]">QUOTE REQUIRED</span>;
  }
  if (bidder_unit_price > 0) {
    return <span className="text-emerald-400">{currency_code} {bidder_unit_price.toFixed(2)}</span>;
  }
  return <span className="text-gray-700">—</span>;
}

// Render the delivery cell content (upper panel)
function DeliveryCell({
  delivery_time,
  requires_quote,
}: {
  delivery_time: string;
  requires_quote: boolean;
}) {
  if (delivery_time) return <>{delivery_time}</>;
  if (requires_quote) return <span className="text-amber-400 text-[10px]">QUOTE REQUIRED</span>;
  return <>—</>;
}

export function SupplierSearchDocument({ data }: SupplierSearchDocumentProps) {
  // Split percentage: upper panel height (clamped 25–75)
  const [splitPct, setSplitPct] = useState(60);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Which item groups are expanded (default: first item open)
  const [expanded, setExpanded] = useState<Set<number>>(
    () => {
      const initialExpanded = new Set<number>();
      if (data.items_source.length > 0) {
        initialExpanded.add(data.items_source[0].item_id);
      }
      return initialExpanded;
    }
  );

  // Selected supplier row — drives the lower supplier dossier panel
  const [selected, setSelected] = useState<SelectedKey | null>(null);

  // Group items by item_id
  const itemsGrouped = data.items_source.reduce((acc, current) => {
    let itemArray = acc[current.item_id];
    if (!itemArray) {
      itemArray = [];
      acc[current.item_id] = itemArray;
    }
    itemArray.push(current);
    return acc;
  }, {} as Record<number, SupplierSearchDocumentData['items_source'][0][]>);

  // ── Toggle item group ──────────────────────────────────────────────────────
  const toggleItem = useCallback((id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Select a supplier child row ────────────────────────────────────────────
  const selectRow = useCallback((itemId: number, category: 'source' | 'alternative', idx: number) => {
    setSelected(prev =>
      prev?.itemId === itemId && prev?.category === category && prev?.idx === idx ? null : { itemId, category, idx }
    );
  }, []);

  // ── Drag-to-resize divider ─────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    dragging.current = true;
    const move = (ev: MouseEvent | TouchEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const clientY = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((clientY - rect.top) / rect.height) * 100;
      setSplitPct(Math.min(Math.max(pct, 25), 75)); // clamp 25–75%
    };
    const up = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
  }, []);

  const selectedSupplier = selected
    ? itemsGrouped[selected.itemId]
        ?.filter(s => s.category === selected.category)[selected.idx]
    : null;

  const renderBulletPoints = (text: string | null) => {
    if (!text) return null;
    // Prefer explicit line/bullet breaks. Only fall back to sentence splitting
    // when the text is a single line — and split on ". " before a capital so
    // decimals (1.5) and abbreviations (e.g.) are not broken apart.
    let points = text.split(/\n|(?:^|\s)[•\-–]\s+/).map(p => p.trim()).filter(Boolean);
    if (points.length <= 1) {
      points = text.split(/(?<=\.)\s+(?=[A-Z])/).map(p => p.trim()).filter(Boolean);
    }
    if (points.length === 0) return null;
    return (
      <ul className="list-disc list-inside text-[11px] text-gray-300 space-y-0.5">
        {points.map((point, i) => <li key={i}>{point.trim()}</li>)}
      </ul>
    );
  };

  return (
    // Escape the parent p-4 so the panel fills the full available area
    <div
      className="flex flex-col bg-[#0d1117] text-gray-100 overflow-hidden"
      style={{ margin: '-1rem', height: 'calc(100% + 2rem)' }}
    >
      {/* Summary strip removed to reclaim vertical space in the panel */}

      {/* ================================================================
          SPLIT PANEL CONTAINER — resize driven by splitPct state
      ================================================================ */}
      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">

        {/* ── UPPER: Source Tree (Master Panel) ────────── */}
        <div
          className="flex-none overflow-y-auto overflow-x-hidden"
          style={{ height: `${splitPct}%` }}
        >
          {/* Sticky column header */}
          <div
            className="sticky top-0 z-10 grid items-center bg-[#0a0d14] border-b border-[#1a2030] select-none"
            style={{ gridTemplateColumns: COLS, padding: '5px 16px' }}
          >
            <div />
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Item / Supplier</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-600 text-right pr-2">Price</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Delivery</div>
          </div>

          {/* Item groups */}
          {Object.entries(itemsGrouped).map(([itemIdStr, suppliersForItem]) => {
            const itemId = parseInt(itemIdStr, 10);
            const isOpen = expanded.has(itemId);

            // Separate suppliers into sources and alternatives
            const sources = suppliersForItem.filter(s => s.category === 'source');
            const alternatives = suppliersForItem.filter(s => s.category === 'alternative');

            // Item identification — same for all rows in this group, read from first supplier
            const itemIdentification = suppliersForItem[0]?.item_identification;
            const identificationText = itemIdentification && itemIdentification.length > 0
              ? itemIdentification.join(' · ')
              : null;

            return (
              <div key={itemId} className="border-b border-[#131a27] last:border-0">

                {/* ── Parent item row (collapsible) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleItem(itemId)}
                  onKeyDown={e => e.key === 'Enter' && toggleItem(itemId)}
                  className="grid items-center px-4 py-2.5 cursor-pointer hover:bg-[#131c2e] transition-colors duration-100 group select-none"
                  style={{ gridTemplateColumns: COLS }}
                >
                  {/* Expand arrow */}
                  <div className="text-gray-600 group-hover:text-gray-400 transition-colors">
                    {isOpen
                      ? <ChevronDown className="w-3.5 h-3.5" />
                      : <ChevronRight className="w-3.5 h-3.5" />}
                  </div>
                  {/* Item name + ID + identification — "Item N (X suppliers) : <identification>" */}
                  <div className="flex items-center gap-1.5 min-w-0 pr-2">
                    <span className="text-[12px] font-medium text-gray-100 shrink-0">Item {itemId}</span>
                    <span className="text-[10px] text-gray-600 shrink-0">({suppliersForItem.length} suppliers)</span>
                    {identificationText && (
                      <span className="text-[11px] text-gray-400 truncate" title={identificationText}>
                        : {identificationText}
                      </span>
                    )}
                  </div>
                  {/* Empty cells for price and delivery in the item header */}
                  <div/><div/>
                </div>

                {/* ── Supplier child rows (Sources) */}
                {isOpen && sources.length > 0 && (
                  <div className="pl-6 border-b border-[#0f1520] last:border-0">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-600 pt-2 pb-1">Sources</h3>
                    {sources.map((supplier, idx) => {
                      const isSelected = selected?.itemId === itemId && selected?.category === 'source' && selected?.idx === idx;
                      return (
                        <div
                          key={`${itemId}-source-${idx}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectRow(itemId, 'source', idx)}
                          onKeyDown={e => e.key === 'Enter' && selectRow(itemId, 'source', idx)}
                          className={`grid items-center py-2 cursor-pointer transition-all duration-100 border-b border-[#0f1520] last:border-0 ${
                            isSelected
                              ? 'bg-[#1e3a5f] border-l-[2px] border-l-blue-500'
                              : 'bg-[#0a0e18] hover:bg-[#111927]'
                          }`}
                          style={{
                            gridTemplateColumns: COLS,
                            paddingLeft: isSelected ? '14px' : '16px',
                            paddingRight: '16px',
                          }}
                        >
                          <div/> {/* Empty for chevron column */}
                          <div className="flex items-center gap-1.5 min-w-0 pr-2">
                            <span className="text-[11px] text-gray-400 truncate">{supplier.supplier_name}</span>
                            <PageTypeBadge pageType={supplier.page_type} />
                          </div>
                          <div className="text-right pr-2 font-mono text-[11px]">
                            <PriceCell
                              bidder_unit_price={supplier.bidder_unit_price}
                              currency_code={supplier.currency_code}
                              requires_quote={supplier.requires_quote}
                            />
                          </div>
                          <div className="text-[10px] text-gray-600 text-center">
                            <DeliveryCell
                              delivery_time={supplier.delivery_time}
                              requires_quote={supplier.requires_quote}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Supplier child rows (Alternatives) */}
                {isOpen && alternatives.length > 0 && (
                  <div className="pl-6 pb-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-600 pt-2 pb-1">Alternatives</h3>
                    {alternatives.map((supplier, idx) => {
                      const isSelected = selected?.itemId === itemId && selected?.category === 'alternative' && selected?.idx === idx;
                      return (
                        <div
                          key={`${itemId}-alternative-${idx}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectRow(itemId, 'alternative', idx)}
                          onKeyDown={e => e.key === 'Enter' && selectRow(itemId, 'alternative', idx)}
                          className={`grid items-center py-2 cursor-pointer transition-all duration-100 border-b border-[#0f1520] last:border-0 ${
                            isSelected
                              ? 'bg-[#1e3a5f] border-l-[2px] border-l-blue-500'
                              : 'bg-[#0a0e18] hover:bg-[#111927]'
                          }`}
                          style={{
                            gridTemplateColumns: COLS,
                            paddingLeft: isSelected ? '14px' : '16px',
                            paddingRight: '16px',
                          }}
                        >
                          <div/> {/* Empty for chevron column */}
                          <div className="flex items-center gap-1.5 min-w-0 pr-2">
                            <span className="text-[11px] text-gray-400 truncate">Alternative {idx + 1}: {supplier.supplier_name}</span>
                            <PageTypeBadge pageType={supplier.page_type} />
                          </div>
                          <div className="text-right pr-2 font-mono text-[11px]">
                            <PriceCell
                              bidder_unit_price={supplier.bidder_unit_price}
                              currency_code={supplier.currency_code}
                              requires_quote={supplier.requires_quote}
                            />
                          </div>
                          <div className="text-[10px] text-gray-600 text-center">
                            <DeliveryCell
                              delivery_time={supplier.delivery_time}
                              requires_quote={supplier.requires_quote}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── DRAG DIVIDER ─────────────────────────────────────────────── */}
        <div
          role="separator"
          aria-label="Resize panels"
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
          className="flex-none flex items-center justify-center h-[10px] bg-[#131a27] border-y border-[#1f2937] cursor-row-resize hover:bg-[#1a2535] group transition-colors select-none"
        >
          <div className="w-10 h-[3px] rounded-full bg-[#2a3447] group-hover:bg-[#3d4f66] transition-colors" />
        </div>

        {/* ── LOWER: Supplier Dossier (Detail Panel) */}
        <div
          className="flex-none overflow-y-auto overflow-x-hidden bg-[#0d1117]"
          style={{ height: `${100 - splitPct}%` }}
        >
          {selectedSupplier ? (
            // zoom: 2 — enlarge the whole dossier (text + icons + spacing) ~2x for readability
            <div className="px-4 py-3 space-y-4" style={{ zoom: 2 }}>
              {/* Dossier Header */}
              <div className="flex items-center gap-2 pb-2 border-b border-[#1a2030]">
                <h2 className="text-[14px] font-bold text-gray-100">{selectedSupplier.supplier_name}</h2>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium tracking-wide whitespace-nowrap ${
                  selectedSupplier.category === 'source'
                    ? 'bg-blue-950/60 text-blue-400 border border-blue-800/40'
                    : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                }`}>
                  {selectedSupplier.category === 'source' ? 'SOURCE' : 'ALTERNATIVE'}
                </span>
              </div>

              {/* Source URL */}
              {selectedSupplier.source_url && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-gray-500">Source URL:</span>
                  <a
                    href={selectedSupplier.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {selectedSupplier.source_url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Price + commercial fields — with graceful fallback */}
              {(() => {
                const hasPrice = selectedSupplier.bidder_unit_price > 0;
                const hasDelivery = Boolean(selectedSupplier.delivery_time);
                const hasQty = selectedSupplier.available_qty !== null;
                const hasSellUnit = selectedSupplier.selling_unit !== null;
                const hasPack = selectedSupplier.pack_size !== null && selectedSupplier.pack_size > 0;
                const hasAnyCommercial = hasPrice || hasDelivery || hasQty || hasSellUnit || hasPack;

                if (!hasAnyCommercial) {
                  return (
                    <p className="text-[11px] text-gray-600 italic">Please quote the suppliers to know</p>
                  );
                }

                return (
                  <>
                    {/* Price */}
                    {hasPrice ? (
                      <div className="text-[11px]">
                        <span className="text-gray-500">Price:</span>{' '}
                        <span className="font-mono text-emerald-400">
                          {selectedSupplier.currency_code} {selectedSupplier.bidder_unit_price.toFixed(2)}
                        </span>{' '}
                        <span className="text-gray-500">per unit</span>
                      </div>
                    ) : selectedSupplier.requires_quote ? (
                      <div className="text-[11px]">
                        <span className="text-gray-500">Price:</span>{' '}
                        <span className="text-amber-400">QUOTE REQUIRED</span>
                      </div>
                    ) : null}

                    {/* Selling Type */}
                    {selectedSupplier.selling_unit === 'per_pack' && selectedSupplier.pack_size && (
                      <div className="text-[11px] text-gray-300">
                        <Package className="w-3 h-3 inline-block mr-1 text-gray-500" />
                        Sold per Pack — 1 pack = {selectedSupplier.pack_size} units
                      </div>
                    )}
                    {selectedSupplier.selling_unit === 'per_unit' && (
                      <div className="text-[11px] text-gray-300">
                        <Package className="w-3 h-3 inline-block mr-1 text-gray-500" />
                        Sold per Unit
                      </div>
                    )}

                    {/* Inventory */}
                    {selectedSupplier.available_qty !== null && (
                      <div className="text-[11px] text-gray-300">
                        <span className="text-gray-500">Inventory:</span>{' '}
                        <span className="text-yellow-500">{selectedSupplier.available_qty} available</span>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Reasoning for Match (only for alternatives) */}
              {selectedSupplier.category === 'alternative' && (
                <div>
                  <h3 className="text-[11px] font-semibold text-gray-400 mb-1">Reasoning for Match</h3>
                  {selectedSupplier.match_reasoning
                    ? renderBulletPoints(selectedSupplier.match_reasoning)
                    : <p className="text-[11px] text-gray-700 italic">No match reasoning provided</p>
                  }
                </div>
              )}

              {/* Match & Supplier Notes */}
              <div>
                <h3 className="text-[11px] font-semibold text-gray-400 mb-1">Match & Supplier Notes</h3>
                <div className="space-y-1.5">
                  <div className="text-[11px]">
                    <span className="text-gray-500">Spec Compliance: </span>
                    {selectedSupplier.compliance_deviation
                      ? <span className="text-gray-300">{selectedSupplier.compliance_deviation}</span>
                      : <span className="text-gray-700 italic">Not assessed</span>
                    }
                  </div>
                  <div className="text-[11px]">
                    <span className="text-gray-500">Supplier Notes: </span>
                    {(() => {
                      const stripped = stripViaAltPrefix(selectedSupplier.notes);
                      return stripped
                        ? <span className="text-gray-300">{stripped}</span>
                        : <span className="text-gray-700 italic">None</span>;
                    })()}
                  </div>
                </div>
              </div>

              {/* Bidder Description */}
              <div>
                <h3 className="text-[11px] font-semibold text-gray-400 mb-1">Bidder Description</h3>
                {selectedSupplier.bidder_description
                  ? renderBulletPoints(selectedSupplier.bidder_description)
                  : <p className="text-[11px] text-gray-700 italic">No description provided</p>
                }
              </div>

              {/* Logistics & Contact */}
              <div>
                <h3 className="text-[11px] font-semibold text-gray-400 mb-1">Logistics & Contact</h3>
                <div className="space-y-1">
                  <p className="text-[11px] text-gray-300">
                    <span className="text-gray-500">Delivery Time:</span> {selectedSupplier.delivery_time || 'N/A'}
                  </p>
                  {selectedSupplier.contact_email && (
                    <a href={`mailto:${selectedSupplier.contact_email}`} className="flex items-center gap-1 text-blue-400 hover:underline text-[11px]">
                      <Mail className="w-3 h-3" /> {selectedSupplier.contact_email}
                    </a>
                  )}
                  {selectedSupplier.contact_phone && (
                    <a href={`tel:${selectedSupplier.contact_phone}`} className="flex items-center gap-1 text-blue-400 hover:underline text-[11px]">
                      <Phone className="w-3 h-3" /> {selectedSupplier.contact_phone}
                    </a>
                  )}
                  {!selectedSupplier.contact_email && !selectedSupplier.contact_phone && (
                    <p className="text-[11px] text-gray-700 italic">No contact info available</p>
                  )}
                </div>
              </div>

            </div>
          ) : (
            // Empty state when no row is selected
            <div className="flex items-center justify-center h-full">
              <p className="text-[12px] text-gray-700 select-none">
                Select a supplier above to view its dossier
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
