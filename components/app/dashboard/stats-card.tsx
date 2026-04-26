// =============================================
// Stats Card — Mission Control KPI tile
// =============================================
// Each KPI tile is a vellum surface with:
// - A 6px ink "origin marker" square in the top-left corner (instrument lamp)
// - A mono ALL-CAPS micro-label title (graphite)
// - A serif-mono hybrid number with tabular-nums (the data IS the hero)
// - A rectangular hairline-bordered change pill (verdigris up / ember down)
// No icon-circles, no gradient halos, no shadow.

import { LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

// =============================================
// Types
// =============================================

export interface StatData {
  title: string;                          // Stat label (e.g., "Total Quotations")
  value: string;                          // Display value (e.g., "142")
  change: string;                         // Change indicator (e.g., "+12%")
  changeType: "positive" | "negative";    // Drives the pill color
  icon: LucideIcon;                       // Lucide icon component
  description: string;                    // Comparison text (e.g., "vs last month")
}

interface StatsCardProps {
  stat: StatData;
}

// =============================================
// Stats Card Component
// =============================================

/**
 * StatsCard — Mission Control KPI tile.
 * Renders title + numeric value + change pill. Numbers are mono tabular for
 * vertical alignment across the four-column row (the procurement ledger feel).
 */
export function StatsCard({ stat }: StatsCardProps) {
  // Resolve the icon component from the stat data
  const Icon = stat.icon;

  // Direction-driven palette for the change pill
  const isPositive = stat.changeType === "positive";
  const pillTextColor = isPositive ? "text-verdigris" : "text-ember";
  const pillBorderColor = isPositive ? "border-verdigris/40" : "border-ember/40";
  const pillDotColor = isPositive ? "bg-verdigris" : "bg-ember";

  return (
    <Card className="relative overflow-hidden">
      {/* Origin marker — 6px ink square pinned to the top-left edge */}
      {/* Reads as an instrument lamp / ledger anchor */}
      <span
        className="absolute top-0 left-0 w-1.5 h-1.5 bg-ink"
        aria-hidden="true"
      />

      {/* Header — mono caps title on the left, faint icon on the right */}
      <CardHeader className="flex flex-row items-start justify-between pb-3 pt-5">
        <span className="micro-label text-graphite">{stat.title}</span>
        <Icon
          className="h-4 w-4 text-graphite mt-[-2px]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </CardHeader>

      {/* Value + change — tabular mono number, then a hairline rectangular pill */}
      <CardContent className="pb-5">
        {/* Big number — mono, tight leading, ink color */}
        <div className="font-data text-ink text-[2rem] leading-none tabular-nums tracking-[-0.02em]">
          {stat.value}
        </div>

        {/* Change pill row */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {/* Rectangular hairline pill — 2px corners, mono caps, leading dot */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-[2px] border px-1.5 py-0.5 ${pillBorderColor}`}
          >
            {/* Status dot — verdigris/ember square, instrument lamp gesture */}
            <span className={`w-1.5 h-1.5 ${pillDotColor}`} aria-hidden="true" />
            {/* Mono caps change figure */}
            <span className={`font-data text-[10px] tracking-[0.08em] tabular-nums ${pillTextColor}`}>
              {stat.change}
            </span>
          </span>

          {/* Comparison text — body grotesque, graphite */}
          <span className="font-body text-xs text-graphite">
            {stat.description}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
