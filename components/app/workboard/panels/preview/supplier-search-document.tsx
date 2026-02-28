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
    </div>
  );
}
