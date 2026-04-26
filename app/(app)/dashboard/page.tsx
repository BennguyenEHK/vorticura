"use client";

// =============================================
// Dashboard Page — Mission Control overview
// =============================================
// Editorial dashboard shell. The page header pairs a mono ALL-CAPS overline
// ("VORTICURA · OPS · DASHBOARD") with a serif display headline — the same
// instrument-then-headline cadence used on the home page hero. The KPI strip
// renders four ledger tiles, then a 2/3+1/3 row pairs the recent quotations
// ledger with a quick-actions panel.

import { FileText, Mail, TrendingUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StatsCard,
  RecentQuotationsCard,
  QuickActionsCard,
} from "@/components/app/dashboard";
import type { StatData, QuotationData, ActionData } from "@/components/app/dashboard";

// =============================================
// Dashboard Data (Mock — wire to real queries later)
// =============================================

// KPI tiles — the dashboard's "metric strip"
const stats: StatData[] = [
  {
    title: "Total Quotations",
    value: "142",
    change: "+12%",
    changeType: "positive",
    icon: FileText,
    description: "vs last month",
  },
  {
    title: "Pending RFQs",
    value: "23",
    change: "-5%",
    changeType: "negative",
    icon: Mail,
    description: "vs last month",
  },
  {
    title: "Conversion Rate",
    value: "68%",
    change: "+8%",
    changeType: "positive",
    icon: TrendingUp,
    description: "vs last month",
  },
  {
    title: "Avg. Response",
    value: "2.4h",
    change: "-15%",
    changeType: "positive",
    icon: Clock,
    description: "vs last month",
  },
];

// Recent quotations ledger
const recentQuotations: QuotationData[] = [
  { id: "Q-2024-001", client: "Acme Corporation",  amount: "$45,200", status: "draft",    date: "Jan 24, 2026" },
  { id: "Q-2024-002", client: "TechStart Inc",     amount: "$12,800", status: "pending",  date: "Jan 23, 2026" },
  { id: "Q-2024-003", client: "Global Industries", amount: "$89,500", status: "complete", date: "Jan 22, 2026" },
  { id: "Q-2024-004", client: "StartUp Labs",      amount: "$7,200",  status: "pending",  date: "Jan 21, 2026" },
];

// Quick action panel — fast paths into the pipeline
const quickActions: ActionData[] = [
  { label: "Create New Quote",  icon: FileText,    onClick: () => console.log("Create new quote clicked") },
  { label: "Import RFQ Email",  icon: Mail,        onClick: () => console.log("Import RFQ clicked") },
  { label: "View Analytics",    icon: TrendingUp,  onClick: () => console.log("View analytics clicked") },
];

// =============================================
// Dashboard Page Component
// =============================================

/**
 * DashboardPage — Mission Control overview of the procurement pipeline.
 * Layout:
 *   1. Editorial header (mono overline + serif display headline + new quotation CTA)
 *   2. KPI strip (4 columns) — ledger tiles with tabular numerals
 *   3. Activity row — 2/3 ledger of recent quotations + 1/3 quick actions
 */
export default function DashboardPage() {
  return (
    // Outer page paint: warm paper background, ink foreground, generous breathing room
    <div className="bg-paper text-ink min-h-full space-y-8">
      {/* ===== Editorial header ===== */}
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          {/* Mono overline — instrument identifier, NASA mission-patch styling */}
          <div className="flex items-center gap-3 mb-3">
            <span className="micro-label text-graphite">VORTICURA · OPS</span>
            <span className="h-px w-8 bg-rule-strong" aria-hidden="true" />
            <span className="micro-label text-graphite">DASHBOARD</span>
          </div>

          {/* Serif display headline — display font at editorial scale */}
          <h1 className="font-display text-ink text-[2.25rem] leading-[1.05] tracking-[-0.015em]">
            Pipeline overview
          </h1>

          {/* Body copy — graphite, body grotesque, generous leading */}
          <p className="font-body mt-3 text-graphite text-[15px] leading-[1.55] max-w-xl">
            Live snapshot of every RFQ moving through the system — from the
            inbound email to the dispatched quote.
          </p>
        </div>

        {/* Primary CTA — Azimuth instrument button */}
        <Button>New Quotation</Button>
      </div>

      {/* ===== KPI strip — 4-column ledger ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatsCard key={stat.title} stat={stat} />
        ))}
      </div>

      {/* ===== Activity row — 2/3 ledger + 1/3 actions ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent quotations table card (2/3 width) */}
        <RecentQuotationsCard
          quotations={recentQuotations}
          onViewAll={() => console.log("View all quotations clicked")}
        />

        {/* Quick actions panel (1/3 width) */}
        <QuickActionsCard actions={quickActions} />
      </div>
    </div>
  );
}
