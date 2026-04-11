// =============================================
// SUPPLIER SEARCH DOCUMENT - React Component
// =============================================

'use client';

import type { SupplierSearchDocumentData } from '@/types/preview';

interface SupplierSearchDocumentProps {
  data: SupplierSearchDocumentData;
  isEditing: boolean;
  onFieldChange: (path: string, value: string) => void;
}

export function SupplierSearchDocument({ data, isEditing, onFieldChange }: SupplierSearchDocumentProps) {
  const hasItems = data.items_source && data.items_source.length > 0;
  const isScrollable = hasItems && data.items_source.length > 5;

  return (
    <div className="font-serif text-[16px] leading-relaxed text-gray-800 bg-white p-10 min-h-full max-w-[900px] mx-auto shadow">
      {/* Header */}
      <div className="mb-8 border-b-2 border-green-600 pb-4">
        {isEditing ? (
          <input
            value={data.subject}
            onChange={(e) => onFieldChange('subject', e.target.value)}
            className="text-[28px] font-bold text-green-600 w-full border-b border-green-400 bg-green-50/50 outline-none"
          />
        ) : (
          <h1 className="text-[28px] font-bold text-green-600 m-0">{data.subject}</h1>
        )}
      </div>

      {/* Search Content */}
      <div className="mt-5 text-[16px]">
        {isEditing ? (
          <textarea
            value={data.search_content}
            onChange={(e) => onFieldChange('search_content', e.target.value)}
            className="w-full min-h-[300px] border border-green-400 bg-green-50/50 rounded p-3 outline-none font-serif text-[16px]"
          />
        ) : (
          <div className="whitespace-pre-wrap">{data.search_content}</div>
        )}
      </div>

      {/* Items Source Summary — rendered only when items exist */}
      {hasItems && (
        <div className="mt-8">
          {/* Section header with item count badge */}
          <div className="flex items-center gap-3 mb-3 pb-2 border-b border-green-200">
            <h2 className="text-[15px] font-semibold text-green-700 uppercase tracking-wide m-0">
              Items Source Summary
            </h2>
            <span className="inline-flex items-center justify-center px-2 py-0.5 text-[11px] font-bold bg-green-600 text-white rounded-full min-w-[22px]">
              {data.items_source.length}
            </span>
          </div>

          {/* Scrollable container — vertical scroll when items > 5 */}
          <div className={isScrollable ? 'max-h-[280px] overflow-y-auto pr-1' : ''}>
            {/* Horizontal scroll wrapper for wide rows */}
            <div className="overflow-x-auto">
              <div className="min-w-[800px] space-y-2">
                {data.items_source.map((item, index) => (
                  <div
                    key={`${item.item_id}-${item.supplier_name}-${index}`}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-green-50/60 border border-green-100 hover:bg-green-50 transition-colors"
                  >
                    {/* Item number pill */}
                    <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-600 text-white text-[11px] font-bold mt-0.5">
                      {item.item_id || index + 1}
                    </span>

                    {/* Supplier name — fixed width */}
                    <span className="shrink-0 w-[120px] text-[13px] font-semibold text-gray-800 truncate" title={item.supplier_name}>
                      {item.supplier_name}
                    </span>

                    {/* Bidder description — takes remaining space, truncated */}
                    <p className="flex-1 text-[13px] text-gray-600 leading-snug truncate m-0" title={item.bidder_description}>
                      {item.bidder_description || '(no description)'}
                    </p>

                    {/* Price + delivery — right section */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {/* Unit price badge */}
                      <span className="text-[13px] font-semibold text-gray-700 whitespace-nowrap">
                        ${item.bidder_unit_price.toFixed(2)}
                      </span>
                      {/* Delivery time */}
                      <span className="text-[10px] font-medium px-1.5 py-0.5 bg-green-100 text-green-700 rounded border border-green-200 whitespace-nowrap">
                        {item.delivery_time || 'N/A'}
                      </span>
                    </div>

                    {/* Contact info — rightmost column */}
                    <div className="shrink-0 flex flex-col items-end gap-1 min-w-[140px]">
                      {/* Contact email */}
                      {item.contact_email ? (
                        <span className="text-[11px] text-blue-600 truncate max-w-[140px]" title={item.contact_email}>
                          {item.contact_email}
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400 italic">no email</span>
                      )}
                      {/* Contact phone */}
                      {item.contact_phone ? (
                        <span className="text-[11px] text-gray-600 whitespace-nowrap">
                          {item.contact_phone}
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400 italic">no phone</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
