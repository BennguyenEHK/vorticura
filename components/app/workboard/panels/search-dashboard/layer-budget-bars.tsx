// =============================================
// LAYER BUDGET BARS — scraper-layer invocation gauges
// =============================================
// Upper-left quadrant. Four horizontal bars (L1–L4):
//   • L1/L2 are THROUGHPUT counters — normalized against L1 (the cascade base),
//     so the bars draw the funnel L1 ≥ L2 ≥ L3 ≥ L4.
//   • L3/L4 are RESOURCE gauges — used/cap against their real budget ceilings,
//     turning amber then red as the ceiling approaches.

'use client';

import type { LayerBudget } from '@/types/search-progress';

interface BarRow {
  name: string;
  fill: number; // 0..1
  label: string;
  gauge: boolean; // true = resource gauge (L3/L4), false = throughput (L1/L2)
}

/** Fill color: gauges redden near their cap; throughput bars stay cool. */
function barColor(row: BarRow): string {
  if (row.gauge) {
    if (row.fill >= 1) return 'bg-red-500';
    if (row.fill >= 0.8) return 'bg-amber-400';
    return 'bg-neon-emerald';
  }
  return 'bg-neon-cyan';
}

export function LayerBudgetBars({ layers }: { layers: LayerBudget; candidatesSeen: number }) {
  const base = Math.max(layers[1].ticks, 1); // L1 is the funnel mouth
  const l3 = layers[3];
  const l4 = layers[4];

  const rows: BarRow[] = [
    { name: 'L1 Manual', fill: layers[1].ticks > 0 ? 1 : 0, label: String(layers[1].ticks), gauge: false },
    { name: 'L2 HTML', fill: layers[2].ticks / base, label: String(layers[2].ticks), gauge: false },
    {
      name: 'L3 LLM',
      fill: l3.cap ? (l3.used ?? 0) / l3.cap : 0,
      label: `${l3.used ?? 0}/${l3.cap ?? 0}`,
      gauge: true,
    },
    {
      name: 'L4 Vision',
      fill: l4.cap ? (l4.used ?? 0) / l4.cap : 0,
      label: `${l4.used ?? 0}/${l4.cap ?? 0}`,
      gauge: true,
    },
  ];

  return (
    <div className="flex h-full w-1/2 flex-col justify-center gap-2 px-1">
      <span className="micro-label text-neon-cyan mb-0.5">Layer Budget · scraper invocations</span>
      {rows.map((row) => (
        <div key={row.name} className="flex items-center gap-2">
          <span className="w-20 shrink-0 micro-label text-muted-foreground">{row.name}</span>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-border/40">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${barColor(row)}`}
              style={{ width: `${Math.min(100, Math.max(0, row.fill * 100))}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right font-data tabular-nums text-xs text-foreground/80">
            {row.label}
          </span>
        </div>
      ))}
    </div>
  );
}
