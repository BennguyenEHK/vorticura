'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uiReload, uiSaved } from '@/lib/actions/ui-reload-actions';
import type { UiType, UiReloadResult } from '@/types/ui-reload';

const DEBOUNCE_MS = 800;

export interface UseUiReloadReturn {
  result: UiReloadResult | null;
  loading: boolean;
  error: string | null;
  saveState: (state: Record<string, unknown>) => void;
  saveStateImmediate: (state: Record<string, unknown>) => Promise<void>;
}

/**
 * Hook for loading and persisting UI state via the ui_reload subsystem.
 *
 * - On mount (or rfqReference change), fetches UI state for the given uiType.
 * - saveState: debounced write (DEBOUNCE_MS ms), suitable for rapid layout drags.
 * - saveStateImmediate: fire-and-forget upsert with no debounce, for explicit user saves.
 *
 * @param uiType - 'workspace' | 'dashboard' | 'rfq_queue'
 * @param rfqReference - (workspace only) URL-decoded RFQ reference string
 */
export function useUiReload(uiType: UiType, rfqReference?: string): UseUiReloadReturn {
  const [result, setResult] = useState<UiReloadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch on mount; re-fetches when rfqReference changes (workspace navigation)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    uiReload(uiType, rfqReference).then((res) => {
      if (cancelled) return;
      setResult(res);
      if (!res.success) setError(res.error ?? 'Unknown error');
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [uiType, rfqReference]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const saveStateImmediate = useCallback(
    async (state: Record<string, unknown>): Promise<void> => {
      await uiSaved(uiType, state);
    },
    [uiType],
  );

  const saveState = useCallback(
    (state: Record<string, unknown>): void => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        uiSaved(uiType, state);
      }, DEBOUNCE_MS);
    },
    [uiType],
  );

  return { result, loading, error, saveState, saveStateImmediate };
}
