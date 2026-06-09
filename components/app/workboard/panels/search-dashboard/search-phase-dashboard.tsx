// =============================================
// SEARCH PHASE DASHBOARD — blur-layer telemetry monitor
// =============================================
// Replaces the generic accept overlay during the search_discovery phase. Layout:
//   Upper compact strip (~18% h): TemporalPanel (auto w) | TelemetryHeader (flex-1)
//   Lower main area (~82% h): LogStream — the centerpiece terminal
// Mounting this component opens the SSE connection; unmounting (accept resolves)
// tears it down — the mount lifecycle IS the connect signal.

'use client';

import { useSearchProgressSSE } from '@/hooks/use-search-progress-sse';
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

      {/* UPPER COMPACT STRIP — temporal ring + funnel counters (fixed height
          so the compact ring never clips regardless of panel size). */}
      <div className="flex h-24 flex-none gap-2">
        <div className="flex w-auto rounded-md border border-border/50 bg-background/40 p-2">
          <TemporalPanel pct={state.overallPct} startedAt={state.startedAt} />
        </div>
        <div className="flex flex-1 rounded-md border border-border/50 bg-background/40">
          <TelemetryHeader
            itemsDone={state.itemsDone}
            itemsTotal={state.itemsTotal}
            sourcesFound={state.sourcesFound}
            sourcesKept={state.sourcesKept}
            sourcesPriced={state.sourcesPriced}
          />
        </div>
      </div>

      {/* LOWER MAIN AREA — telemetry terminal takes the remaining height. */}
      <div className="flex min-h-0 flex-1 flex-col rounded-md border border-border/50 bg-background/40">
        <LogStream lines={logTail} />
      </div>
    </div>
  );
}
