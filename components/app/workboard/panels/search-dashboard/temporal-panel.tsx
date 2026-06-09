// =============================================
// TEMPORAL PANEL — compact completion ring + isolated elapsed timer
// =============================================
// Left cell of the compact upper strip. Horizontal layout (ring + timer side by
// side) so it fits the short strip without clipping. The ElapsedTimer is a LEAF
// with its own 1 Hz interval so the clock tick never re-renders the ring or log.

'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

/** SVG progress ring. strokeDashoffset shrinks as pct → 100. */
function CircularRing({ pct }: { pct: number }) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg viewBox="0 0 120 120" className="w-16 h-16 -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="6" className="stroke-border/40" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="stroke-neon-emerald neon-glow-accept transition-all duration-300 ease-out"
      />
    </svg>
  );
}

/** Isolated leaf — owns its own interval, reads nothing from dashboard state. */
function ElapsedTimer({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const elapsed = startedAt == null ? 0 : Math.max(0, now - startedAt);
  const mm = String(Math.floor(elapsed / 60000)).padStart(2, '0');
  const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
  return (
    <span className="font-data tabular-nums">
      {mm}:{ss}
    </span>
  );
}

export function TemporalPanel({ pct, startedAt }: { pct: number; startedAt: number | null }) {
  return (
    <div className="flex h-full items-center gap-3 px-1">
      <div className="relative shrink-0">
        <CircularRing pct={pct} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-data tabular-nums text-sm text-neon-emerald">
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="micro-label text-muted-foreground">total completion</span>
        <div className="flex items-center gap-1.5 micro-label text-neon-cyan">
          <Clock className="w-3 h-3" />
          <ElapsedTimer startedAt={startedAt} />
          <span>elapsed</span>
        </div>
      </div>
    </div>
  );
}
