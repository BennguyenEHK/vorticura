// =============================================
// EMAIL DOCUMENT - React Component
// =============================================

'use client';

import type { EmailDocumentData } from '@/types/preview';

interface EmailDocumentProps {
  data: EmailDocumentData;
  isEditing: boolean;
  onFieldChange: (path: string, value: string) => void;
}

export function EmailDocument({ data, isEditing, onFieldChange }: EmailDocumentProps) {
  return (
    <div className="font-serif text-[16px] leading-relaxed text-gray-800 bg-white p-10 min-h-full max-w-[900px] mx-auto shadow">
      {/* Header */}
      <div className="mb-8 border-b-2 border-blue-600 pb-4">
        {isEditing ? (
          <input
            value={data.subject}
            onChange={(e) => onFieldChange('subject', e.target.value)}
            className="text-[28px] font-bold text-blue-600 w-full border-b border-blue-400 bg-blue-50/50 outline-none"
          />
        ) : (
          <h1 className="text-[28px] font-bold text-blue-600 m-0">{data.subject}</h1>
        )}
      </div>

      {/* Recipient */}
      <div className="mb-4 text-sm text-gray-500">
        <strong>To:</strong>{' '}
        {isEditing ? (
          <input
            value={data.recipient_email}
            onChange={(e) => onFieldChange('recipient_email', e.target.value)}
            className="border-b border-blue-400 bg-blue-50/50 outline-none px-1"
          />
        ) : (
          <span>{data.recipient_email}</span>
        )}
      </div>

      {/* Email Content */}
      <div className="mt-5 text-[16px]">
        {isEditing ? (
          <textarea
            value={data.email_content}
            onChange={(e) => onFieldChange('email_content', e.target.value)}
            className="w-full min-h-[300px] border border-blue-400 bg-blue-50/50 rounded p-3 outline-none font-serif text-[16px]"
          />
        ) : (
          <div className="whitespace-pre-wrap">{data.email_content}</div>
        )}
      </div>
    </div>
  );
}
