'use client';

/**
 * WorkspaceDataContext — Prefetch cache for UI reload data
 * Coordinates prefetching between sidebar (dashboard) and RFQ queue items (workspace)
 * Reduces waterfall fetches by preloading uiReload() results on hover
 */

import React, { createContext, useContext, useCallback, useRef } from 'react';
import { uiReload, uiSaved } from '@/lib/actions/ui-reload-actions';
import type { UiType, UiReloadResult, WorkspacePayload } from '@/types/ui-reload';

// =============================================
// Context Types
// =============================================

interface CacheEntry {
  data: UiReloadResult;
  timestamp: number;
}

interface WorkspaceDataContextValue {
  // Prefetch dashboard data
  prefetchDashboard: () => void;
  // Prefetch workspace data by rfq reference
  prefetchWorkspace: (rfqReference: string, rfqId: number) => void;
  // Get cached data if available
  getCachedData: (uiType: UiType, key?: string) => UiReloadResult | null;
  // Clear cache entry
  clearCacheEntry: (uiType: UiType, key?: string) => void;
  // Save UI state (layout prefs, scroll position, etc)
  saveUiState: (uiType: UiType, state: Record<string, unknown>) => Promise<void>;
}

// =============================================
// Context Creation
// =============================================

const WorkspaceDataContext = createContext<WorkspaceDataContextValue | undefined>(undefined);

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// =============================================
// Context Provider Component
// =============================================

interface WorkspaceDataProviderProps {
  children: React.ReactNode;
}

/**
 * WorkspaceDataProvider — Manages prefetch caching for workspace/dashboard/queue data
 * Wraps workspace page and sidebar to coordinate data loading
 */
export function WorkspaceDataProvider({ children }: WorkspaceDataProviderProps) {
  // Cache keyed by "uiType:key" (e.g., "workspace:RFQ%20PK%2022501", "dashboard:")
  const cacheRef = useRef<Record<string, CacheEntry>>({});
  // In-flight request tracking to avoid duplicate fetches
  const inFlightRef = useRef<Record<string, Promise<UiReloadResult>>>({});

  /**
   * Generate cache key from uiType and optional key
   * @param uiType - UI page type
   * @param key - Optional identifier (rfq_reference for workspace, empty for dashboard)
   */
  const getCacheKey = useCallback((uiType: UiType, key?: string): string => {
    return key ? `${uiType}:${key}` : uiType;
  }, []);

  /**
   * Check if cache entry is still valid
   */
  const isCacheValid = useCallback((entry: CacheEntry): boolean => {
    return Date.now() - entry.timestamp < CACHE_TTL;
  }, []);

  /**
   * Get cached data if available and valid
   */
  const getCachedData = useCallback(
    (uiType: UiType, key?: string): UiReloadResult | null => {
      const cacheKey = getCacheKey(uiType, key);
      const entry = cacheRef.current[cacheKey];

      if (!entry) {
        return null;
      }

      if (!isCacheValid(entry)) {
        delete cacheRef.current[cacheKey];
        return null;
      }

      return entry.data;
    },
    [getCacheKey, isCacheValid]
  );

  /**
   * Clear cache entry
   */
  const clearCacheEntry = useCallback(
    (uiType: UiType, key?: string): void => {
      const cacheKey = getCacheKey(uiType, key);
      delete cacheRef.current[cacheKey];
      delete inFlightRef.current[cacheKey];
    },
    [getCacheKey]
  );

  /**
   * Fetch and cache UI data with deduplication
   * Returns cached or in-flight result if available
   */
  const fetchAndCacheData = useCallback(
    async (
      uiType: UiType,
      key: string | undefined,
      fetchFn: () => Promise<UiReloadResult>
    ): Promise<UiReloadResult> => {
      const cacheKey = getCacheKey(uiType, key);

      // Return cached result if valid
      const cached = getCachedData(uiType, key);
      if (cached) {
        return cached;
      }

      // Return in-flight request if one is pending
      const inFlight = inFlightRef.current[cacheKey];
      if (inFlight) {
        return inFlight;
      }

      // Initiate new request with deduplication
      const promise = (async () => {
        try {
          const result = await fetchFn();
          // Cache successful result
          cacheRef.current[cacheKey] = {
            data: result,
            timestamp: Date.now(),
          };
          return result;
        } finally {
          // Clean up in-flight tracking
          delete inFlightRef.current[cacheKey];
        }
      })();

      inFlightRef.current[cacheKey] = promise;
      return promise;
    },
    [getCacheKey, getCachedData]
  );

  /**
   * Prefetch dashboard data on sidebar hover
   */
  const prefetchDashboard = useCallback(() => {
    fetchAndCacheData('dashboard', undefined, () => uiReload('dashboard')).catch(
      (err) => console.error('Dashboard prefetch error:', err)
    );
  }, [fetchAndCacheData]);

  /**
   * Prefetch workspace data on RFQ item hover
   * @param rfqReference - URL-encoded RFQ reference (e.g., "RFQ%20PK%2022501")
   * @param rfqId - Numeric RFQ ID
   */
  const prefetchWorkspace = useCallback(
    (rfqReference: string, rfqId: number) => {
      fetchAndCacheData('workspace', rfqReference, () =>
        uiReload('workspace', rfqId)
      ).catch((err) => console.error('Workspace prefetch error:', err));
    },
    [fetchAndCacheData]
  );

  /**
   * Save UI state (layout prefs, scroll position, etc)
   */
  const saveUiState = useCallback(
    async (uiType: UiType, state: Record<string, unknown>) => {
      try {
        const result = await uiSaved(uiType, state);
        // Invalidate cache entry to force refresh on next load
        if (result.success) {
          clearCacheEntry(uiType);
        }
      } catch (err) {
        console.error('Error saving UI state:', err);
      }
    },
    [clearCacheEntry]
  );

  const value: WorkspaceDataContextValue = {
    prefetchDashboard,
    prefetchWorkspace,
    getCachedData,
    clearCacheEntry,
    saveUiState,
  };

  return (
    <WorkspaceDataContext.Provider value={value}>
      {children}
    </WorkspaceDataContext.Provider>
  );
}

// =============================================
// Hook to use the context
// =============================================

/**
 * useWorkspaceData — Access prefetch cache and data loading functions
 * Must be called within WorkspaceDataProvider
 */
export function useWorkspaceData(): WorkspaceDataContextValue {
  const context = useContext(WorkspaceDataContext);
  if (!context) {
    throw new Error('useWorkspaceData must be used within WorkspaceDataProvider');
  }
  return context;
}
