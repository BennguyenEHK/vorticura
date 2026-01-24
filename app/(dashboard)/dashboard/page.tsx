"use client";

import { FileText, Mail, TrendingUp, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Stats data for dashboard overview cards
const stats = [
  {
    title: "Total Quotations",
    value: "142",
    change: "+12%",
    changeType: "positive" as const,
    icon: FileText,
    description: "vs last month",
  },
  {
    title: "Pending RFQs",
    value: "23",
    change: "-5%",
    changeType: "negative" as const,
    icon: Mail,
    description: "vs last month",
  },
  {
    title: "Conversion Rate",
    value: "68%",
    change: "+8%",
    changeType: "positive" as const,
    icon: TrendingUp,
    description: "vs last month",
  },
  {
    title: "Avg. Response Time",
    value: "2.4h",
    change: "-15%",
    changeType: "positive" as const,
    icon: Clock,
    description: "vs last month",
  },
];

// Recent quotations for activity table
const recentQuotations = [
  {
    id: "Q-2024-001",
    client: "Acme Corporation",
    amount: "$45,200",
    status: "draft" as const,
    date: "Jan 24, 2026",
  },
  {
    id: "Q-2024-002",
    client: "TechStart Inc",
    amount: "$12,800",
    status: "pending" as const,
    date: "Jan 23, 2026",
  },
  {
    id: "Q-2024-003",
    client: "Global Industries",
    amount: "$89,500",
    status: "complete" as const,
    date: "Jan 22, 2026",
  },
  {
    id: "Q-2024-004",
    client: "StartUp Labs",
    amount: "$7,200",
    status: "pending" as const,
    date: "Jan 21, 2026",
  },
];

// Status badge styling based on quotation status
const statusStyles = {
  draft: "bg-status-draft text-status-draft-foreground",
  pending: "bg-status-pending text-status-pending-foreground",
  complete: "bg-status-complete text-status-complete-foreground",
};

/**
 * DashboardPage - Main dashboard home with stats overview and recent activity
 * Uses design tokens from globals.css for all styling
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

      {/* Stats overview grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="bg-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {/* Change indicator with color based on type */}
                  <span
                    className={
                      stat.changeType === "positive"
                        ? "text-status-complete-foreground"
                        : "text-destructive"
                    }
                  >
                    {stat.change}
                  </span>{" "}
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent activity section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent quotations table */}
        <Card className="lg:col-span-2 bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Recent Quotations</CardTitle>
            <CardDescription>Your latest quotation activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Table header */}
              <div className="grid grid-cols-5 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border pb-2">
                <span>ID</span>
                <span>Client</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Date</span>
              </div>

              {/* Table rows */}
              {recentQuotations.map((quote) => (
                <div
                  key={quote.id}
                  className="grid grid-cols-5 items-center py-2 text-sm hover:bg-muted rounded-lg px-1 transition-colors"
                >
                  <span className="font-medium text-foreground">{quote.id}</span>
                  <span className="text-body">{quote.client}</span>
                  <span className="text-foreground">{quote.amount}</span>
                  <span>
                    {/* Status badge with token-based colors */}
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${statusStyles[quote.status]}`}
                    >
                      {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">{quote.date}</span>
                </div>
              ))}
            </div>

            {/* View all link */}
            <div className="mt-4 pt-4 border-t border-border">
              <Button variant="link" className="px-0 text-brand hover:text-brand-hover">
                View all quotations →
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick actions panel */}
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Quick Actions</CardTitle>
            <CardDescription>Common tasks at your fingertips</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start">
              <FileText className="mr-2 h-4 w-4" />
              Create New Quote
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <Mail className="mr-2 h-4 w-4" />
              Import RFQ Email
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <TrendingUp className="mr-2 h-4 w-4" />
              View Analytics
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
