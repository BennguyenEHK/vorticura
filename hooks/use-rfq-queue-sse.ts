// =============================================
// RFQ QUEUE SSE HOOK - Real-time sidebar queue deltas
// =============================================
// Subscribes to /api/rfq-queue-stream; pushes upserts into the sidebar list.
// Seed + reconnect-recovery remain the component's job (getQueuedRFQs server action).

'use client';

import { useEffect, useRef, useState } from 'react';
import type { QueuedRFQ } from '@/types/rfq-queue';

interface UseRfqQueueSSEOptions {
  // Called for every upsert payload received on the 'rfq-queue' channel
  onUpsert: (rfq: QueuedRFQ) => void;
  // Called after EventSource re-opens following a prior error — component re-seeds the list
  onReconnect: () => void;
}

/**
 * Hook that connects to /api/rfq-queue-stream SSE endpoint.
 * Delivers upsert payloads to `onUpsert` and fires `onReconnect`
 * after a drop/resume so the caller can re-seed from getQueuedRFQs().
 * @returns `{ connected }` — true while the EventSource is open.
 */
export function useRfqQueueSSE(opts: UseRfqQueueSSEOptions): { connected: boolean } {
  const [connected, setConnected] = useState(false);

  // Stash callbacks in refs so the effect does NOT re-subscribe each render
  // (which would thrash the SSE connection and re-seed repeatedly)
  const onUpsertRef = useRef(opts.onUpsert);
  const onReconnectRef = useRef(opts.onReconnect);
  onUpsertRef.current = opts.onUpsert;
  onReconnectRef.current = opts.onReconnect;

  useEffect(() => {
    const es = new EventSource('/api/rfq-queue');

    // Tracks whether we've seen a prior error — distinguishes "first open" from "reconnect"
    let hadError = false;

    es.onopen = () => {
      setConnected(true);
      // Fire re-seed only when onopen follows an error (in-session reconnect)
      if (hadError) {
        hadError = false;
        console.log('[rfq-queue SSE] re-open after error — invoking onReconnect');
        try {
          onReconnectRef.current();
        } catch (err) {
          console.error('[rfq-queue SSE] onReconnect handler threw:', err);
        }
      }
    };

    es.onmessage = (evt) => {
      try {
        // Heartbeats start with ':' and are filtered by the browser — never reach here
        const payload = JSON.parse(evt.data) as QueuedRFQ;
        console.log('[rfq-queue SSE] payload received:', payload);
        console.log('[rfq-queue SSE] invoking onUpsert callback for rfq:', payload?.rfqId ?? payload?.rfqReference ?? payload);
        try {
          onUpsertRef.current(payload);
        } catch (err) {
          console.error('[rfq-queue SSE] onUpsert handler threw:', err);
        }
      } catch (err) {
        console.error('[rfq-queue SSE] Failed to parse event:', err);
      }
    };

    es.onerror = () => {
      // EventSource reconnects natively — no manual reconnect logic needed
      hadError = true;
      setConnected(false);
    };

    // Cleanup: close on unmount so no zombie listener survives a remount
    return () => {
      es.close();
    };
  }, []); // Intentionally empty — refs above keep callbacks fresh without re-subscribing

  return { connected };
}
