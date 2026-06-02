// =============================================
// TEMPORAL PANEL — circular completion ring + isolated elapsed timer
// =============================================
// Upper-right quadrant. The ElapsedTimer is a LEAF with its own 1 Hz interval so
// the clock tick never re-renders the bars, ring, or log stream.

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
    <svg viewBox="0 0 120 120" className="w-28 h-28 -rotate-90">
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
    <div className="flex h-full w-1/2 flex-col items-center justify-center gap-1.5">
      <div className="relative">
        <CircularRing pct={pct} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-data tabular-nums text-2xl text-neon-emerald">
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 micro-label text-neon-cyan">
        <Clock className="w-3 h-3" />
        <ElapsedTimer startedAt={startedAt} />
        <span>elapsed</span>
      </div>
      <span className="micro-label text-muted-foreground">total completion</span>
    </div>
  );
}
