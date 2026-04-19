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
 * - On mount, fetches the current UI state for the given uiType (and rfqId for workspace).
 * - saveState: debounced write (DEBOUNCE_MS ms), suitable for rapid layout drags.
 * - saveStateImmediate: fire-and-forget upsert with no debounce, for explicit user saves.
 */
export function useUiReload(uiType: UiType, rfqId?: number): UseUiReloadReturn {
  const [result, setResult] = useState<UiReloadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial fetch on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    uiReload(uiType, rfqId).then((res) => {
      if (cancelled) return;
      setResult(res);
      if (!res.success) setError(res.error ?? 'Unknown error');
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [uiType, rfqId]);

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
