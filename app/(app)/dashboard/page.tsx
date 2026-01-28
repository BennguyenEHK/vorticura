"use client";

// =============================================
// Dashboard Page - Main Overview
// =============================================
// Displays stats overview, recent quotations, and quick actions
// Entry point for authenticated users
// Uses extracted card components from @/components/app/dashboard

import { FileText, Mail, TrendingUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StatsCard,
  RecentQuotationsCard,
  QuickActionsCard,
} from "@/components/app/dashboard";
import type { StatData, QuotationData, ActionData } from "@/components/app/dashboard";

// =============================================
// Dashboard Data (Mock)
// =============================================

// Stats data for dashboard overview cards
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
    title: "Avg. Response Time",
    value: "2.4h",
    change: "-15%",
    changeType: "positive",
    icon: Clock,
    description: "vs last month",
  },
];

// Recent quotations for activity table
const recentQuotations: QuotationData[] = [
  {
    id: "Q-2024-001",
    client: "Acme Corporation",
    amount: "$45,200",
    status: "draft",
    date: "Jan 24, 2026",
  },
  {
    id: "Q-2024-002",
    client: "TechStart Inc",
    amount: "$12,800",
    status: "pending",
    date: "Jan 23, 2026",
  },
  {
    id: "Q-2024-003",
    client: "Global Industries",
    amount: "$89,500",
    status: "complete",
    date: "Jan 22, 2026",
  },
  {
    id: "Q-2024-004",
    client: "StartUp Labs",
    amount: "$7,200",
    status: "pending",
    date: "Jan 21, 2026",
  },
];

// Quick action buttons configuration
const quickActions: ActionData[] = [
  {
    label: "Create New Quote",
    icon: FileText,
    onClick: () => console.log("Create new quote clicked"),
  },
  {
    label: "Import RFQ Email",
    icon: Mail,
    onClick: () => console.log("Import RFQ clicked"),
  },
  {
    label: "View Analytics",
    icon: TrendingUp,
    onClick: () => console.log("View analytics clicked"),
  },
];

// =============================================
// Dashboard Page Component
// =============================================

/**
 * DashboardPage - Main dashboard home with stats overview and recent activity
 * Uses design tokens from globals.css for all styling
 * Uses extracted card components for modularity
 */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header with title and actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-body">Welcome back! Here&apos;s your business overview.</p>
        </div>
        <Button className="bg-brand text-brand-foreground hover:bg-brand-hover">
          New Quotation
        </Button>
      </div>

      {/* Stats overview grid - 4 columns on large screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatsCard key={stat.title} stat={stat} />
        ))}
      </div>

      {/* Recent activity section - 2/3 + 1/3 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent quotations table card */}
        <RecentQuotationsCard
          quotations={recentQuotations}
          onViewAll={() => console.log("View all quotations clicked")}
        />

        {/* Quick actions card */}
        <QuickActionsCard actions={quickActions} />
      </div>
    </div>
  );
}
