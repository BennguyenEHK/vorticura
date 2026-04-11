// =============================================
// RFQ ANALYSIS DOCUMENT - React Component
// =============================================

'use client';

import type { RfqAnalysisDocumentData } from '@/types/preview';

interface RfqAnalysisDocumentProps {
  data: RfqAnalysisDocumentData;
  isEditing: boolean;
  onFieldChange: (path: string, value: string) => void;
}

export function RfqAnalysisDocument({ data, isEditing, onFieldChange }: RfqAnalysisDocumentProps) {
  const hasItems = data.rfq_items && data.rfq_items.length > 0;
  const isScrollable = hasItems && data.rfq_items.length > 5;

  return (
    <div className="font-serif text-[16px] leading-relaxed text-gray-800 bg-white p-10 min-h-full max-w-[900px] mx-auto shadow">
      {/* Header */}
      <div className="mb-8 border-b-2 border-amber-600 pb-4">
        {isEditing ? (
          <input
            value={data.subject}
            onChange={(e) => onFieldChange('subject', e.target.value)}
            className="text-[28px] font-bold text-amber-600 w-full border-b border-amber-400 bg-amber-50/50 outline-none"
          />
        ) : (
          <h1 className="text-[28px] font-bold text-amber-600 m-0">{data.subject}</h1>
        )}
      </div>

      {/* Analysis Content */}
      <div className="mt-5 text-[16px]">
        {isEditing ? (
          <textarea
            value={data.analysis_content}
            onChange={(e) => onFieldChange('analysis_content', e.target.value)}
            className="w-full min-h-[300px] border border-amber-400 bg-amber-50/50 rounded p-3 outline-none font-serif text-[16px]"
          />
        ) : (
          <div
            className="whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: data.analysis_content }}
          />
        )}
      </div>

      {/* Items Summary Section — rendered only when items exist */}
      {hasItems && (
        <div className="mt-8">
          {/* Section header with count badge */}
          <div className="flex items-center gap-3 mb-3 pb-2 border-b border-amber-200">
            <h2 className="text-[15px] font-semibold text-amber-700 uppercase tracking-wide m-0">
              Items Summary
            </h2>
            <span className="inline-flex items-center justify-center px-2 py-0.5 text-[11px] font-bold bg-amber-600 text-white rounded-full min-w-[22px]">
              {data.rfq_items.length}
            </span>
          </div>

          {/* Scrollable items list — scroll activates when items exceed 5 */}
          <div className={isScrollable ? 'max-h-[280px] overflow-y-auto pr-1' : ''}>
            <div className="space-y-2">
              {data.rfq_items.map((item, index) => (
                <div
                  key={item.item_id || index}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-amber-50/60 border border-amber-100 hover:bg-amber-50 transition-colors"
                >
                  {/* Item number pill */}
                  <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-600 text-white text-[11px] font-bold mt-0.5">
                    {item.item_id || index + 1}
                  </span>

                  {/* Description — takes remaining space, wraps */}
                  <p className="flex-1 text-[14px] text-gray-800 leading-snug break-words m-0">
                    {item.company_description || '(no description)'}
                  </p>

                  {/* Qty × UOM + currency — right-aligned, no-wrap */}
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[13px] font-semibold text-gray-700 whitespace-nowrap">
                      {item.qty} × {item.uom}
                    </span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded border border-amber-200 uppercase tracking-wide">
                      {item.currency_code}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subtle fade gradient at bottom when scrollable */}
          {isScrollable && (
            <div className="h-4 bg-gradient-to-t from-white to-transparent -mt-4 relative z-10 pointer-events-none" />
          )}
        </div>
      )}
    </div>
  );
}
