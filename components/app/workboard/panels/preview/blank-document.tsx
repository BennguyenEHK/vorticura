// =============================================
// BLANK DOCUMENT - Default empty state for Preview Panel
// =============================================

'use client';

import { FileText } from 'lucide-react';

export function BlankDocument() {
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="flex flex-col items-center justify-center w-full max-w-md rounded-xl border border-border bg-card p-10 shadow-sm">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted mb-5">
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground text-center">
          Generated documents will appear here
        </p>
      </div>
    </div>
  );
}
