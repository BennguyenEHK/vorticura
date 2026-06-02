// =============================================
// TELEMETRY HEADER — lower-panel header row
// =============================================
// Left: section title. Right: total sources extracted + color-coded source
// health indicators (live / dead / blocked).

'use client';

interface TelemetryHeaderProps {
  sources: number;
  live: number;
  dead: number;
  blocked: number;
}

function StatusDot({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span className="tabular-nums">{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

export function TelemetryHeader({ sources, live, dead, blocked }: TelemetryHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
      <span className="micro-label text-neon-cyan animate-neon-flicker">Live Telemetry Search</span>
      <div className="flex items-center gap-3 font-data text-xs text-foreground/80">
        <span className="tabular-nums">Σ {sources} sources</span>
        <StatusDot color="bg-neon-emerald" count={live} label="live" />
        <StatusDot color="bg-red-500" count={dead} label="dead" />
        <StatusDot color="bg-amber-400" count={blocked} label="blkd" />
      </div>
    </div>
  );
}
