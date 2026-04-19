'use client';

/**
 * RFQ Context — Provides current RFQ ID for workspace pages
 * Allows child components to access the RFQ context without prop drilling
 */

import React, { createContext, useContext, type ReactNode } from 'react';

// =============================================
// Context Types
// =============================================

interface RFQContextValue {
  rfqId?: number;
  rfqReference?: string;
}

// =============================================
// Context Creation
// =============================================

const RFQContext = createContext<RFQContextValue | undefined>(undefined);

// =============================================
// Context Provider Component
// =============================================

interface RFQProviderProps {
  children: ReactNode;
  rfqId?: number;
  rfqReference?: string;
}

/**
 * RFQProvider — Provides current RFQ ID context to children
 * Used in workspace pages to make rfqId accessible to nested components
 */
export function RFQProvider({ children, rfqId, rfqReference }: RFQProviderProps) {
  return (
    <RFQContext.Provider value={{ rfqId, rfqReference }}>
      {children}
    </RFQContext.Provider>
  );
}

// =============================================
// Hook to use the context
// =============================================

/**
 * useRFQContext — Access current RFQ ID and reference
 * Returns undefined if not in an RFQ context (e.g., on dashboard)
 */
export function useRFQContext(): RFQContextValue | undefined {
  return useContext(RFQContext);
}
