// =============================================
// RFQ ANALYSIS DOCUMENT - React Component
// =============================================

'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Package, ClipboardList, Eye, Lightbulb, Zap, List,
} from 'lucide-react';
import type { RfqAnalysisDocumentData, AgentItemSummary } from '@/types/preview';

interface RfqAnalysisDocumentProps {
  data: RfqAnalysisDocumentData;
  isEditing: boolean;
  onFieldChange: (path: string, value: string) => void;
}

const SECTION_ICONS: Record<keyof AgentItemSummary, React.ElementType> = {
  identification: List,
  classification: Package,
  application: Eye,
  purpose: Lightbulb,
  features: Zap,
};

export function RfqAnalysisDocument({ data, isEditing, onFieldChange }: RfqAnalysisDocumentProps) {
  const hasItems = data.rfq_items && data.rfq_items.length > 0;

  // Split percentage: upper panel height (clamped 25–75)
  const [splitPct, setSplitPct] = useState(40); // Upper panel ~40%
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Selected item from the master list (defaults to the first item)
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0);

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

  // Clamp the index so a shrinking rfq_items list can never point out of bounds.
  const safeIndex = hasItems ? Math.min(selectedItemIndex, data.rfq_items.length - 1) : 0;
  const selectedRfqItem = hasItems ? data.rfq_items[safeIndex] : null;
  const agentItemSummary = selectedRfqItem?.agent_item_summary;

  const renderSummarySection = (
    title: string,
    key: keyof AgentItemSummary,
    summary: AgentItemSummary,
    Icon: React.ElementType,
  ) => {
    const items = summary[key];
    if (!items || items.length === 0) return null;

    return (
      <div>
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
          <Icon className="w-3 h-3 text-amber-500" /> {title}
        </h3>
        <ul className="list-disc list-inside space-y-0.5 pl-2 text-[12px] text-gray-300">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div
      className="flex flex-col bg-[#0d1117] text-gray-100 overflow-hidden"
      style={{ margin: '-1rem', height: 'calc(100% + 2rem)' }}
    >
      {/* ================================================================
          UPPER PANEL - Document Overview
      ================================================================ */}
      <div
        className="flex-none overflow-y-auto overflow-x-hidden p-4"
        style={{ height: `${splitPct}%` }}
      >
        <div className="mb-4 border-b border-amber-600 pb-2">
          {isEditing ? (
            <input
              value={data.subject}
              onChange={(e) => onFieldChange('subject', e.target.value)}
              className="text-[20px] font-bold text-amber-500 w-full bg-transparent border-b border-amber-700 outline-none focus:border-amber-400 px-1 py-0.5"
            />
          ) : (
            <h1 className="text-[20px] font-bold text-amber-500 m-0">{data.subject}</h1>
          )}
        </div>

        <div className="text-[14px] text-gray-300 leading-relaxed">
          {isEditing ? (
            <textarea
              value={data.analysis_content}
              onChange={(e) => onFieldChange('analysis_content', e.target.value)}
              className="w-full min-h-[150px] bg-[#111827] border border-amber-700 rounded p-2 outline-none focus:border-amber-400 font-serif text-[14px] text-gray-200"
            />
          ) : (
            <div dangerouslySetInnerHTML={{ __html: data.analysis_content }} />
          )}
        </div>
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

      {/* ================================================================
          LOWER PANEL - Item Master-Detail
      ================================================================ */}
      <div
        className="flex-1 flex overflow-hidden bg-[#0a0d14]"
        style={{ height: `${100 - splitPct}%` }}
      >
        {hasItems ? (
          <>
            {/* LEFT (Master) = vertical list of items */}
            <div className="w-1/2 flex flex-col overflow-y-auto border-r border-[#1a2030]">
              <div className="sticky top-0 bg-[#0a0d14] p-3 border-b border-[#1f2937] text-[10px] font-bold uppercase tracking-widest text-gray-600 z-10">
                Extracted RFQ Items ({data.rfq_items.length})
              </div>
              {data.rfq_items.map((item, index) => {
                const isSelected = safeIndex === index;
                return (
                  <div
                    key={item.item_id || index}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedItemIndex(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSelectedItemIndex(index);
                    }}
                    className={`flex items-start gap-3 p-3 cursor-pointer transition-colors duration-100 ${
                      isSelected
                        ? 'bg-[#1e2a4a] border-l-[3px] border-amber-500'
                        : 'hover:bg-[#111827] border-l-[3px] border-transparent'
                    }`}
                  >
                    <span
                      className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold mt-0.5 ${
                        isSelected ? 'bg-amber-500 text-white' : 'bg-gray-700 text-gray-200'
                      }`}
                    >
                      {item.item_id || index + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-[12px] text-gray-200 leading-snug line-clamp-1">
                        {item.company_description || '(no description)'}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {item.qty} × {item.uom}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RIGHT (Detail) = renders the selected item's agent_item_summary */}
            <div className="w-1/2 overflow-y-auto p-4 bg-[#0a0d14]">
              {agentItemSummary ? (
                <div className="space-y-4">
                  <h2 className="text-[14px] font-bold text-amber-400">AI Summary for Item {selectedRfqItem?.item_id || safeIndex + 1}</h2>
                  {renderSummarySection('Identification', 'identification', agentItemSummary, SECTION_ICONS.identification)}
                  {renderSummarySection('Classification', 'classification', agentItemSummary, SECTION_ICONS.classification)}
                  {renderSummarySection('Application & Location', 'application', agentItemSummary, SECTION_ICONS.application)}
                  {renderSummarySection('Purpose', 'purpose', agentItemSummary, SECTION_ICONS.purpose)}
                  {renderSummarySection('Features', 'features', agentItemSummary, SECTION_ICONS.features)}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-center text-[12px] text-gray-500">
                  AI summary not yet generated for this item.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full text-center text-[14px] text-gray-500 p-4">
            <ClipboardList className="w-10 h-10 text-gray-600 mb-3" />
            No items extracted for analysis. The document overview is shown above.
          </div>
        )}
      </div>
    </div>
  );
}

