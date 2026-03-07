// =============================================
// PREVIEW CONTEXT - Shared undo/redo state
// =============================================
// Lifts usePreviewReducer to React context so multiple
// panels (preview, workflow, pricing) can share the same
// undo/redo history.

'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { usePreviewReducer } from './use-preview-reducer';

// ---------------------------------------------
// Types
// ---------------------------------------------

type PreviewContextValue = ReturnType<typeof usePreviewReducer>;

// ---------------------------------------------
// Context
// ---------------------------------------------

const PreviewContext = createContext<PreviewContextValue | null>(null);

// ---------------------------------------------
// Provider
// ---------------------------------------------

export function PreviewProvider({ children }: { children: ReactNode }) {
  const reducer = usePreviewReducer();
  return (
    <PreviewContext.Provider value={reducer}>
      {children}
    </PreviewContext.Provider>
  );
}

// ---------------------------------------------
// Hook
// ---------------------------------------------

export function usePreview() {
  const ctx = useContext(PreviewContext);
  if (!ctx) {
    throw new Error('usePreview must be used within a PreviewProvider');
  }
  return ctx;
}
