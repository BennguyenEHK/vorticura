// =============================================
// LOG STREAM — terminal-style telemetry body (windowed tail)
// =============================================
// Renders the windowed log tail the hook hands down (already bounded to ~TAIL
// lines), so the 500-line ring never diffs as DOM. Auto-scrolls to the bottom
// whenever the tail changes (once per rAF drain).

'use client';

import { useEffect, useRef } from 'react';
import type { LogLine } from '@/types/search-progress';

const TONE: Record<LogLine['tone'], string> = {
  cyan: 'text-neon-cyan',
  sky: 'text-sky-400',
  emerald: 'text-neon-emerald',
  red: 'text-red-400',
  amber: 'text-amber-400',
  violet: 'text-violet-400',
  muted: 'text-muted-foreground',
};

function LogRow({ line }: { line: LogLine }) {
  return (
    <div className="flex items-start gap-2 whitespace-pre-wrap leading-relaxed">
      <span className="text-muted-foreground/60">▸</span>
      <span className={`w-24 shrink-0 ${TONE[line.tone]}`}>{line.tag}</span>
      <span className="w-12 shrink-0 text-muted-foreground">
        {line.itemId != null ? `item#${line.itemId}` : ''}
      </span>
      <span className="flex-1 text-foreground/85">{line.text}</span>
    </div>
  );
}

export function LogStream({ lines }: { lines: LogLine[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pin to bottom whenever the tail changes (auto-scroll).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto px-3 py-2 font-data text-xs">
      {lines.length === 0 ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <span className="animate-neon-flicker">awaiting telemetry…</span>
        </div>
      ) : (
        lines.map((line) => <LogRow key={line.id} line={line} />)
      )}
    </div>
  );
}
