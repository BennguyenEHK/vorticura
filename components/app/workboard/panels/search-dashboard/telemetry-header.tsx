// =============================================
// TELEMETRY HEADER — compact-strip funnel counter row
// =============================================
// Left: the neon "Live Telemetry Search" label. Right: the Serper → Jina → Qwen
// funnel as tabular counters — items processed, then sources found → kept → priced.

'use client';

interface TelemetryHeaderProps {
  itemsDone: number;
  itemsTotal: number;
  sourcesFound: number;
  sourcesKept: number;
  sourcesPriced: number;
}

function Counter({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

export function TelemetryHeader({
  itemsDone,
  itemsTotal,
  sourcesFound,
  sourcesKept,
  sourcesPriced,
}: TelemetryHeaderProps) {
  return (
    <div className="flex w-full items-center justify-between px-3 py-2">
      <span className="micro-label text-neon-cyan animate-neon-flicker">Live Telemetry Search</span>
      <div className="flex items-center gap-3 font-data text-xs text-foreground/80">
        <Counter label="Items" value={`${itemsDone}/${itemsTotal}`} />
        <span className="text-muted-foreground/40">·</span>
        <Counter label="Found" value={sourcesFound} />
        <span className="text-muted-foreground/40">·</span>
        <Counter label="Kept" value={sourcesKept} />
        <span className="text-muted-foreground/40">·</span>
        <Counter label="Priced" value={sourcesPriced} />
      </div>
    </div>
  );
}
