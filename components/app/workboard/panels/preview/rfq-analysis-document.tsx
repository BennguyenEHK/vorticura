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
          <div className="whitespace-pre-wrap">{data.analysis_content}</div>
        )}
      </div>
    </div>
  );
}
