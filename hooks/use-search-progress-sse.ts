// =============================================
// SEARCH PROGRESS SSE HOOK — non-blocking live telemetry
// =============================================
// Connects to /api/search-stream and feeds the Search Phase Dashboard WITHOUT
// blocking the UI thread. The anti-block design:
//
//   network onmessage → push into a ref queue   (NO setState per event)
//   requestAnimationFrame loop → drain the WHOLE queue → ONE batched dispatch
//
// A burst of 200 events across a tick collapses into a single reducer dispatch,
// so render rate is capped by the display refresh, never the event rate.
//
// Logs: the FULL history lives in a ref RING BUFFER (bounded memory, never in
// React state). Once per drain we snapshot the visible TAIL into `logTail` state
// — a small, bounded array — so the log pane re-renders at frame cadence without
// the giant ring ever entering React's diffing or a ref being read during render.
//
// Lifecycle: the dashboard mounts only during a search accept and unmounts when
// it resolves, so each run starts from a fresh useReducer state + empty refs —
// no explicit in-effect reset (which would trip set-state-in-effect) is needed.

import { useEffect, useReducer, useRef, useState } from 'react';
import type { SearchProgressEvent, LogLine, SearchDashboardState } from '@/types/search-progress';
import { initialDashboardState } from '@/types/search-progress';
import { dashboardReducer } from './search-dashboard-reducer';

/** Hard cap on retained log lines — bounds memory under a long, chatty run. */
const LOG_CAP = 500;
/** Visible tail snapshotted into state each drain (the on-screen window). */
const TAIL = 120;

interface UseSearchProgressOptions {
  /** RFQ being searched; events for other rfqIds are filtered out. */
  rfqId: number | null;
  /** Connect only while true (mounted during the search accept). */
  enabled: boolean;
}

export interface SearchProgressFeed {
  state: SearchDashboardState;
  /** Windowed tail of the log ring, refreshed once per rAF drain. */
  logTail: LogLine[];
}

/** Append to the ring, trimming the oldest lines past LOG_CAP. */
function ringPush(ring: LogLine[], line: LogLine): void {
  ring.push(line);
  if (ring.length > LOG_CAP) ring.splice(0, ring.length - LOG_CAP);
}

/** Map a wire event to a rendered log line; null = not shown (e.g. layer ticks). */
function toLogLine(e: SearchProgressEvent): LogLine | null {
  switch (e.kind) {
    case 'run-start':
      return { id: e.seq, tag: 'RUN', text: `search started · ${e.itemsTotal} items`, tone: 'muted' };
    case 'query-gen':
      return {
        id: e.seq, tag: 'QUERY-GEN', itemId: e.itemId, tone: 'cyan',
        text: `a/${e.attempt}  "${e.query}"`,
      };
    case 'raw-search':
      return {
        id: e.seq, tag: 'RAW-SEARCH', itemId: e.itemId, tone: 'sky',
        text: `${e.snippets} snippets · tavily×${e.tavilyCalls}`,
      };
    case 'extract':
      return {
        id: e.seq, tag: 'EXTRACT', itemId: e.itemId, tone: 'emerald',
        text: `✓ ${e.track}  ${e.price > 0 ? `${e.price} ${e.currency}`.trim() : 'quote-required'}  ${e.pageType ?? ''}`.trim(),
      };
    case 'liveness':
      return {
        id: e.seq, tag: 'LIVENESS', itemId: e.itemId,
        tone: e.status === 'live' ? 'emerald' : e.status === 'dead' ? 'red' : e.status === 'timeout' ? 'violet' : 'amber',
        text: `${e.status === 'live' ? '✓' : e.status === 'timeout' ? '⏱' : '✗'} ${e.status}  ${e.host}`,
      };
    case 'density':
      return {
        id: e.seq, tag: 'DENSITY', itemId: e.itemId, tone: 'violet',
        text: `have ${e.have} / need ${e.need}${e.have >= e.need ? '  ✓ floor met' : ''}`,
      };
    case 'run-summary':
      return {
        id: e.seq, tag: 'RUN', tone: 'muted',
        text: `done · ${e.itemsTotal} items · ${e.dropped} dropped${e.exhausted ? ' · budget exhausted' : ''}`,
      };
    case 'layer':
      return null; // invocation ticks feed the bars, not the log
  }
}

export function useSearchProgressSSE({ rfqId, enabled }: UseSearchProgressOptions): SearchProgressFeed {
  const [state, dispatch] = useReducer(dashboardReducer, undefined, initialDashboardState);
  const [logTail, setLogTail] = useState<LogLine[]>([]);

  const logsRef = useRef<LogLine[]>([]);
  const pendingRef = useRef<SearchProgressEvent[]>([]);
  const seenRef = useRef<Set<number>>(new Set()); // dedup by seq within a run

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource('/api/search-stream');
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as SearchProgressEvent;
        // Filter to this RFQ (rfqId 0 = unattributed; let it through).
        if (rfqId != null && data.rfqId !== 0 && data.rfqId !== rfqId) return;
        pendingRef.current.push(data);
      } catch {
        /* malformed frame — ignore */
      }
    };
    es.onerror = () => { /* EventSource auto-reconnects; nothing to do */ };

    let raf = 0;
    const drain = () => {
      const pending = pendingRef.current;
      if (pending.length > 0) {
        const events = pending.splice(0, pending.length);
        const fresh: SearchProgressEvent[] = [];
        let logsChanged = false;

        for (const e of events) {
          if (e.kind === 'run-start') {
            // New run inside the same connection — reset dedup + logs.
            seenRef.current.clear();
            logsRef.current.length = 0;
            logsChanged = true;
          }
          if (seenRef.current.has(e.seq)) continue; // drop duplicate (bus echo)
          seenRef.current.add(e.seq);
          fresh.push(e);
          const line = toLogLine(e);
          if (line) { ringPush(logsRef.current, line); logsChanged = true; }
        }

        // At most one reducer dispatch + one tail snapshot per frame — React 18
        // auto-batches these into a single render.
        if (fresh.length > 0) dispatch({ type: 'batch', events: fresh });
        if (logsChanged) setLogTail(logsRef.current.slice(-TAIL));
      }
      raf = requestAnimationFrame(drain);
    };
    raf = requestAnimationFrame(drain);

    return () => {
      es.close();
      cancelAnimationFrame(raf);
    };
  }, [enabled, rfqId]);

  return { state, logTail };
}
