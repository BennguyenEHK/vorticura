// =============================================
// ITEMS ORDERING DOCUMENT - Procurement Status Panel
// =============================================
// Split-panel operational dashboard for the items_ordering workflow stage.
// Upper 60%: item-grouped supplier table with collapsible rows.
// Lower 40%: email thread for the selected supplier row.
// A drag divider lets the operator resize both halves.

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ChevronRight, ChevronDown, Package, Trophy, XCircle,
  Clock, Sparkles, Send, RefreshCw, ThumbsDown, ArrowRight, Check, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { handleHTTPRequest } from '@/lib/data-processor';
import { generateAIThreadSummary, generateAIDraftReply } from '@/lib/actions/thread-ai-actions';
import type { ItemsOrderingDocumentData, ItemsOrderingSupplier, ItemsOrderingItem } from '@/types/preview';

// ─── Status display config (badge colors per procurement state) ───────────────
const STATUS_CFG = {
  sent:     { label: 'Sent',     cls: 'bg-blue-950/60 text-blue-400 border border-blue-800/40' },
  quoted:   { label: 'Quoted',   cls: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' },
  awarded:  { label: 'Awarded',  cls: 'bg-violet-950/60 text-violet-400 border border-violet-800/40' },
  declined: { label: 'Declined', cls: 'bg-red-950/60 text-red-400 border border-red-800/40' },
} as const;

type SupplierStatus = keyof typeof STATUS_CFG;

// Small pill badge driven by supplier_item_status.status
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status as SupplierStatus] ?? STATUS_CFG.sent;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide whitespace-nowrap ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── Component props (same interface as all document components) ──────────────
interface ItemsOrderingDocumentProps {
  data: ItemsOrderingDocumentData;
  isEditing: boolean;                            // unused — no editable fields
  onFieldChange: (path: string, value: string) => void; // unused — status via server action
}

// Key identifying the selected supplier row
interface SelectedKey { itemId: number; idx: number }

// ─── Main exported component ──────────────────────────────────────────────────
export function ItemsOrderingDocument({ data }: ItemsOrderingDocumentProps) {
  // Which item groups are expanded (default: first item open)
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(data.items[0] ? [data.items[0].item_id] : [])
  );
  // Selected supplier row — drives the lower email thread panel
  const [selected, setSelected] = useState<SelectedKey | null>(null);
  // Local optimistic status overrides keyed by `${itemId}-${idx}`
  const [localStatus, setLocalStatus] = useState<Record<string, SupplierStatus>>({});
  // Draft reply state
  const [showDraft, setShowDraft] = useState(false);
  const [draftReply, setDraftReply] = useState('');
  // AI-generated thread summaries keyed `${itemId}-${idx}`
  const [aiSummaries, setAiSummaries]       = useState<Record<string, string>>({});
  const [summaryLoading, setSummaryLoading] = useState<Record<string, boolean>>({});
  const [draftLoading, setDraftLoading]     = useState(false);
  // Split percentage: upper panel height (clamped 25–75)
  const [splitPct, setSplitPct] = useState(60);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // ── Toggle item group ──────────────────────────────────────────────────────
  const toggleItem = useCallback((id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ── Select a supplier child row ────────────────────────────────────────────
  const selectRow = useCallback((itemId: number, idx: number) => {
    setSelected(prev =>
      prev?.itemId === itemId && prev?.idx === idx ? null : { itemId, idx }
    );
    setShowDraft(false); // reset draft when switching rows
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

  // ── Optimistic local status update (visual only; wire to server action when ready)
  const updateStatus = useCallback((itemId: number, idx: number, status: SupplierStatus) => {
    setLocalStatus(prev => ({ ...prev, [`${itemId}-${idx}`]: status }));
  }, []);

  // ── Trigger quotation generation via the quotation pipeline ───────────────
  const handleGenerateQuote = useCallback(async () => {
    if (!data.rfq_id) return;
    await handleHTTPRequest({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data_type: 'quotation' as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      action_type: 'generate' as any,
      rfq_id: data.rfq_id,
    });
  }, [data.rfq_id]);

  // Resolve the selected supplier + parent item for the lower panel handlers
  const selectedItem     = selected ? data.items.find(i => i.item_id === selected.itemId) ?? null : null;
  const selectedSupplier = selectedItem ? selectedItem.suppliers[selected!.idx] ?? null : null;

  // Auto-load AI thread summary when operator selects a supplier row
  useEffect(() => {
    if (!selected) return;
    const key = `${selected.itemId}-${selected.idx}`;
    if (aiSummaries[key] || summaryLoading[key]) return; // already loaded/loading
    const item = data.items.find(i => i.item_id === selected.itemId);
    const supplier = item?.suppliers[selected.idx];
    if (!supplier || supplier.thread.length === 0) return; // nothing to summarize
    setSummaryLoading(prev => ({ ...prev, [key]: true }));
    generateAIThreadSummary(supplier.thread, supplier.supplier_name, item!.item_name)
      .then(summary => setAiSummaries(prev => ({ ...prev, [key]: summary })))
      .catch(() => {}) // silent fail — summary is decorative
      .finally(() => setSummaryLoading(prev => ({ ...prev, [key]: false })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, data.items]);

  // Toggle draft panel; trigger AI pre-fill if opening an empty draft
  const handleToggleDraft = useCallback(() => {
    const nowShowing = !showDraft;
    setShowDraft(nowShowing);
    if (nowShowing && !draftReply && selectedSupplier && selectedItem) {
      setDraftLoading(true);
      generateAIDraftReply(selectedSupplier.thread, selectedSupplier.supplier_name, selectedItem.item_name)
        .then(reply => setDraftReply(reply))
        .catch(() => {})
        .finally(() => setDraftLoading(false));
    }
  }, [showDraft, draftReply, selectedSupplier, selectedItem]);

  // Send the draft reply via email pipeline
  const handleSendReply = useCallback(async () => {
    if (!selectedSupplier?.contact_email || !draftReply.trim() || !data.rfq_id) return;
    await handleHTTPRequest({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data_type: 'email' as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      action_type: 'send' as any,
      rfq_id: data.rfq_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      email: {
        recipient_email: selectedSupplier.contact_email,
        subject: `RE: Item Inquiry - ${selectedItem?.item_name ?? ''}`,
        email_content: draftReply,
        email_status: 'sent',
      } as any,
    });
    setShowDraft(false);
    setDraftReply('');
  }, [selectedSupplier, draftReply, data.rfq_id, selectedItem]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Resolve status with local overrides applied
  const getStatus = (itemId: number, idx: number, orig: string): SupplierStatus =>
    localStatus[`${itemId}-${idx}`] ?? (orig as SupplierStatus);

  // Derive item-level summary status from child supplier statuses
  const itemStatus = (item: ItemsOrderingItem): SupplierStatus => {
    if (!item.suppliers.length) return 'sent';
    if (item.suppliers.some((s, i) => getStatus(item.item_id, i, s.status) === 'awarded'))  return 'awarded';
    if (item.suppliers.some((s, i) => getStatus(item.item_id, i, s.status) === 'quoted'))   return 'quoted';
    if (item.suppliers.every((s, i) => getStatus(item.item_id, i, s.status) === 'declined')) return 'declined';
    return 'sent';
  };

  // Best (lowest) unit price across all suppliers for an item
  const bestPrice = (item: ItemsOrderingItem): number | null =>
    item.suppliers.reduce<number | null>(
      (best, s) => s.unit_price !== null && (best === null || s.unit_price < best) ? s.unit_price : best,
      null
    );

  // Recompute readiness summary with local overrides reflected
  const quoted   = data.items.filter(i => i.suppliers.some((s, idx) => ['quoted','awarded'].includes(getStatus(i.item_id, idx, s.status)))).length;
  const awarded  = data.items.filter(i => i.suppliers.some((s, idx) => getStatus(i.item_id, idx, s.status) === 'awarded')).length;
  const declined = data.items.filter(i => i.suppliers.length > 0 && i.suppliers.every((s, idx) => getStatus(i.item_id, idx, s.status) === 'declined')).length;
  const awaiting = data.items.filter(i => i.suppliers.length > 0 && i.suppliers.every((s, idx) => getStatus(i.item_id, idx, s.status) === 'sent')).length;
  const progressPct = data.summary.total_items > 0
    ? Math.round(((quoted + awarded) / data.summary.total_items) * 100) : 0;

  // Resolve the current status for the already-selected supplier (selectedItem/selectedSupplier computed above)
  const selectedStatus   = selected && selectedSupplier
    ? getStatus(selected.itemId, selected.idx, selectedSupplier.status) : 'sent';

  // Column layout shared by header, parent rows, and child rows
  const COLS = '24px 1fr 60px 90px 104px';

  return (
    // Escape the parent p-4 so the panel fills the full available area
    <div
      className="flex flex-col bg-[#0d1117] text-gray-100 overflow-hidden"
      style={{ margin: '-1rem', height: 'calc(100% + 2rem)' }}
    >
      {/* ================================================================
          READINESS STRIP — live progress + Generate Quote CTA
      ================================================================ */}
      <div className="flex-none flex items-center gap-3 px-4 py-2.5 bg-[#111827] border-b border-[#1f2937]">
        {/* Stat pills */}
        <div className="flex items-center gap-4 flex-1 text-[11px] select-none">
          <span className="flex items-center gap-1.5">
            <Package className="w-3 h-3 text-emerald-400" />
            <strong className="text-emerald-400 tabular-nums">{quoted + awarded}</strong>
            <span className="text-gray-500">/ {data.summary.total_items} quoted</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Trophy className="w-3 h-3 text-violet-400" />
            <strong className="text-violet-400 tabular-nums">{awarded}</strong>
            <span className="text-gray-500">awarded</span>
          </span>
          <span className="flex items-center gap-1.5">
            <XCircle className="w-3 h-3 text-red-400" />
            <strong className="text-red-400 tabular-nums">{declined}</strong>
            <span className="text-gray-500">declined</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-yellow-500" />
            <strong className="text-yellow-500 tabular-nums">{awaiting}</strong>
            <span className="text-gray-500">awaiting</span>
          </span>
        </div>
        {/* Progress bar */}
        <div className="hidden sm:flex items-center gap-2 select-none">
          <div className="w-20 h-1 bg-[#1f2937] rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-600 tabular-nums">{progressPct}%</span>
        </div>
        {/* CTA */}
        <Button
          size="sm"
          onClick={handleGenerateQuote}
          className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white gap-1.5 shrink-0 font-medium transition-colors"
        >
          Generate Quote
          <ArrowRight className="w-3 h-3" />
        </Button>
      </div>

      {/* ================================================================
          SPLIT PANEL CONTAINER — resize driven by splitPct state
      ================================================================ */}
      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">

        {/* ── UPPER: Item-grouped supplier table (60% default) ────────── */}
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
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-600 text-center">Quotes</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-600 text-right pr-2">Best Price</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Status</div>
          </div>

          {/* Item groups */}
          {data.items.map((item) => {
            const isOpen  = expanded.has(item.item_id);
            const iStatus = itemStatus(item);
            const bp      = bestPrice(item);

            return (
              <div key={item.item_id} className="border-b border-[#131a27] last:border-0">

                {/* ── Parent item row (collapsible) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleItem(item.item_id)}
                  onKeyDown={e => e.key === 'Enter' && toggleItem(item.item_id)}
                  className="grid items-center px-4 py-2.5 cursor-pointer hover:bg-[#131c2e] transition-colors duration-100 group select-none"
                  style={{ gridTemplateColumns: COLS }}
                >
                  {/* Expand arrow */}
                  <div className="text-gray-600 group-hover:text-gray-400 transition-colors">
                    {isOpen
                      ? <ChevronDown className="w-3.5 h-3.5" />
                      : <ChevronRight className="w-3.5 h-3.5" />}
                  </div>
                  {/* Item name + ID */}
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className="text-[12px] font-medium text-gray-100 truncate">{item.item_name}</span>
                    <span className="text-[10px] text-gray-600 shrink-0">#{item.item_id}</span>
                  </div>
                  {/* Quote count */}
                  <div className="text-[11px] text-gray-500 text-center">{item.suppliers.length}</div>
                  {/* Best price */}
                  <div className="text-right pr-2 font-mono text-[11px]">
                    {bp !== null
                      ? <span className="text-emerald-400">${bp.toFixed(2)}</span>
                      : <span className="text-gray-700">—</span>}
                  </div>
                  {/* Item-level status */}
                  <StatusBadge status={iStatus} />
                </div>

                {/* ── Supplier child rows */}
                {isOpen && item.suppliers.map((supplier, idx) => {
                  const isSelected = selected?.itemId === item.item_id && selected?.idx === idx;
                  const sStatus    = getStatus(item.item_id, idx, supplier.status);

                  return (
                    <div
                      key={`${item.item_id}-${idx}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectRow(item.item_id, idx)}
                      onKeyDown={e => e.key === 'Enter' && selectRow(item.item_id, idx)}
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
                      <div />
                      {/* Supplier name */}
                      <div className="text-[11px] text-gray-400 truncate pr-2">{supplier.supplier_name}</div>
                      {/* Lead time */}
                      <div className="text-[10px] text-gray-600 text-center">{supplier.lead_time ?? '—'}</div>
                      {/* Unit price */}
                      <div className="text-right pr-2 font-mono text-[11px]">
                        {supplier.unit_price !== null
                          ? <span className="text-gray-200">${supplier.unit_price.toFixed(2)}</span>
                          : <span className="text-gray-700">—</span>}
                      </div>
                      {/* Supplier status */}
                      <StatusBadge status={sStatus} />
                    </div>
                  );
                })}
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

        {/* ── LOWER: Email thread for selected supplier row (40% default) */}
        <div
          className="flex-none overflow-y-auto overflow-x-hidden bg-[#0d1117]"
          style={{ height: `${100 - splitPct}%` }}
        >
          {selectedSupplier && selectedItem ? (
            <EmailThreadPanel
              supplier={selectedSupplier}
              status={selectedStatus}
              itemName={selectedItem.item_name}
              itemId={selected!.itemId}
              supplierIdx={selected!.idx}
              showDraft={showDraft}
              draftReply={draftReply}
              onToggleDraft={handleToggleDraft}
              onDraftChange={setDraftReply}
              onUpdateStatus={updateStatus}
              aiSummary={selected ? (aiSummaries[`${selected.itemId}-${selected.idx}`] ?? selectedSupplier?.ai_summary ?? null) : null}
              draftLoading={draftLoading}
              onSendReply={handleSendReply}
            />
          ) : (
            // Empty state when no row is selected
            <div className="flex items-center justify-center h-full">
              <p className="text-[12px] text-gray-700 select-none">
                Select a supplier row above to view its email thread
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Email Thread Panel ───────────────────────────────────────────────────────
// Shown in the lower panel when a supplier child row is selected.
// Displays AI summary, message thread, and action buttons.

interface EmailThreadPanelProps {
  supplier: ItemsOrderingSupplier;
  status: SupplierStatus;
  itemName: string;
  itemId: number;
  supplierIdx: number;
  showDraft: boolean;
  draftReply: string;
  onToggleDraft: () => void;
  onDraftChange: (v: string) => void;
  onUpdateStatus: (itemId: number, idx: number, status: SupplierStatus) => void;
  aiSummary: string | null;       // AI summary of thread (lazy loaded)
  draftLoading: boolean;          // AI draft generation in progress
  onSendReply: () => void;        // Send the draft reply
}

function EmailThreadPanel({
  supplier, status, itemName, itemId, supplierIdx,
  showDraft, draftReply, onToggleDraft, onDraftChange, onUpdateStatus,
  aiSummary, draftLoading, onSendReply,
}: EmailThreadPanelProps) {
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Thread context header */}
      <div className="flex-none flex items-center gap-2 px-4 py-2 bg-[#0f141f] border-b border-[#1a2030] select-none">
        <span className="text-[11px] font-semibold text-gray-300 truncate">{supplier.supplier_name}</span>
        <span className="text-gray-700 text-xs">·</span>
        <span className="text-[10px] text-gray-600 truncate flex-1">{itemName}</span>
        <StatusBadge status={status} />
      </div>

      {/* Scrollable thread body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">

        {/* AI-generated thread summary (shown when present) */}
        {aiSummary && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-[#0f2744] border border-[#1e3a5f] rounded-lg">
            <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-300 leading-relaxed">{aiSummary}</p>
          </div>
        )}

        {/* Thread messages */}
        {supplier.thread.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <p className="text-[11px] text-gray-700">
              {status === 'sent' ? 'Email sent · awaiting supplier reply' : 'No messages in thread yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {supplier.thread.map((msg, i) => (
              <div
                key={i}
                className={`max-w-[88%] rounded-lg px-3 py-2 ${
                  msg.direction === 'outbound'
                    ? 'ml-auto bg-[#1e3a5f]'   // sent by operator — right side
                    : 'bg-[#1a2535]'            // received from supplier — left side
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] text-gray-600">
                    {msg.direction === 'outbound' ? '→ You' : `← ${supplier.supplier_name}`}
                  </span>
                  {msg.sent_at && (
                    <span className="text-[9px] text-gray-700">
                      {new Date(msg.sent_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
                  {msg.body}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* AI Draft Reply area — toggled by button below */}
        {showDraft && (
          <div className="border border-[#1f2937] rounded-lg overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111827] border-b border-[#1f2937] select-none">
              <Sparkles className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                AI Draft Reply
              </span>
            </div>
            <textarea
              value={draftReply}
              onChange={e => onDraftChange(e.target.value)}
              disabled={draftLoading}
              placeholder={draftLoading ? 'AI is drafting a reply…' : 'Edit before sending…'}
              rows={4}
              className="w-full bg-[#0d1117] text-[11px] text-gray-200 placeholder-gray-700 p-3 resize-none outline-none border-0 leading-relaxed block disabled:opacity-60"
            />
            <div className="flex items-center justify-end gap-2 px-3 py-2 bg-[#111827] border-t border-[#1f2937]">
              <Button
                size="sm"
                variant="ghost"
                onClick={onToggleDraft}
                className="h-6 text-[10px] text-gray-600 hover:text-gray-300 px-2"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={onSendReply}
                disabled={draftLoading || !draftReply.trim()}
                className="h-6 text-[10px] bg-blue-600 hover:bg-blue-700 text-white gap-1 px-3 disabled:opacity-50"
              >
                <Send className="w-2.5 h-2.5" />
                Send Reply
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Action bar — persistent at bottom of lower panel */}
      <div className="flex-none flex items-center gap-1.5 px-4 py-2 border-t border-[#1a2030] bg-[#0f141f] select-none">
        {/* AI Draft Reply toggle */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onToggleDraft}
          className="h-6 text-[10px] gap-1 text-blue-400 hover:text-blue-300 hover:bg-blue-950/40 px-2"
        >
          <RefreshCw className="w-3 h-3" />
          {showDraft ? 'Hide Draft' : 'AI Draft Reply'}
        </Button>

        <div className="flex-1" />

        {/* Mark Quoted — shown when status is 'sent' */}
        {status === 'sent' && (
          <Button
            size="sm"
            onClick={() => onUpdateStatus(itemId, supplierIdx, 'quoted')}
            className="h-6 text-[10px] gap-1 bg-emerald-950/60 hover:bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 px-2"
          >
            <Check className="w-3 h-3" />
            Mark Quoted
          </Button>
        )}

        {/* Award — shown when not already awarded */}
        {status !== 'awarded' && status !== 'declined' && (
          <Button
            size="sm"
            onClick={() => onUpdateStatus(itemId, supplierIdx, 'awarded')}
            className="h-6 text-[10px] gap-1 bg-violet-950/60 hover:bg-violet-950/80 text-violet-400 border border-violet-800/50 px-2"
          >
            <Star className="w-3 h-3" />
            Award
          </Button>
        )}

        {/* Decline — shown when not already declined */}
        {status !== 'declined' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onUpdateStatus(itemId, supplierIdx, 'declined')}
            className="h-6 text-[10px] gap-1 text-gray-600 hover:text-red-400 hover:bg-red-950/40 px-2"
          >
            <ThumbsDown className="w-3 h-3" />
            Decline
          </Button>
        )}
      </div>
    </div>
  );
}
