// =============================================
// SEARCH PHASE DASHBOARD — blur-layer multi-panel monitor
// =============================================
// Replaces the generic accept overlay during the search_discovery phase. Layout:
//   Upper panel (25% h): LayerBudgetBars (50% w) | TemporalPanel (50% w)
//   Lower panel (75% h): TelemetryHeader + LogStream
// Mounting this component opens the SSE connection; unmounting (accept resolves)
// tears it down — the mount lifecycle IS the connect signal.

'use client';

import { useSearchProgressSSE } from '@/hooks/use-search-progress-sse';
import { LayerBudgetBars } from './layer-budget-bars';
import { TemporalPanel } from './temporal-panel';
import { TelemetryHeader } from './telemetry-header';
import { LogStream } from './log-stream';

export function SearchPhaseDashboard({ rfqId }: { rfqId: number | null }) {
  const { state, logTail } = useSearchProgressSSE({ rfqId, enabled: true });

  return (
    <div
      aria-busy="true"
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-20 flex flex-col gap-2 overflow-hidden p-3 backdrop-blur-sm bg-background/70"
    >
      {/* Scanner accent — same motion language as the legacy overlay. */}
      <div className="animate-scanner pointer-events-none absolute left-0 h-px w-full bg-neon-cyan/30" />

      {/* UPPER PANEL — 25% height, split 50/50. */}
      <div className="flex h-1/4 min-h-0 gap-2">
        <div className="flex w-1/2 rounded-md border border-border/50 bg-background/40 p-2">
          <LayerBudgetBars layers={state.layers} candidatesSeen={state.candidatesSeen} />
        </div>
        <div className="flex w-1/2 rounded-md border border-border/50 bg-background/40 p-2">
          <TemporalPanel pct={state.overallPct} startedAt={state.startedAt} />
        </div>
      </div>

      {/* LOWER PANEL — 75% height, telemetry terminal. */}
      <div className="flex min-h-0 flex-1 flex-col rounded-md border border-border/50 bg-background/40">
        <TelemetryHeader
          sources={state.sourcesExtracted}
          live={state.live}
          dead={state.dead}
          blocked={state.blocked}
        />
        <LogStream lines={logTail} />
      </div>
    </div>
  );
}
