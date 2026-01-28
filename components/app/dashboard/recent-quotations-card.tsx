// =============================================
// Recent Quotations Card Component
// =============================================
// Displays a table of recent quotations with status badges
// Used in the dashboard recent activity section

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// =============================================
// Types
// =============================================

// Quotation status type
export type QuotationStatus = "draft" | "pending" | "complete";

// Quotation data structure for table rows
export interface QuotationData {
  id: string;                 // Quotation ID (e.g., "Q-2024-001")
  client: string;             // Client name
  amount: string;             // Formatted amount (e.g., "$45,200")
  status: QuotationStatus;    // Current status
  date: string;               // Formatted date (e.g., "Jan 24, 2026")
}

// Component props
interface RecentQuotationsCardProps {
  quotations: QuotationData[];  // Array of quotation data
  onViewAll?: () => void;       // Optional callback for "View all" button
}

// =============================================
// Status Styles
// =============================================

// Status badge styling based on quotation status (using design tokens)
const statusStyles: Record<QuotationStatus, string> = {
  draft: "bg-status-draft text-status-draft-foreground",
  pending: "bg-status-pending text-status-pending-foreground",
  complete: "bg-status-complete text-status-complete-foreground",
};

// =============================================
// Recent Quotations Card Component
// =============================================

/**
 * RecentQuotationsCard - Displays a table of recent quotations
 * Uses design tokens from globals.css for all styling
 */
export function RecentQuotationsCard({
  quotations,
  onViewAll
}: RecentQuotationsCardProps) {
  return (
    <Card className="lg:col-span-2 bg-card">
      {/* Card header with title and description */}
      <CardHeader>
        <CardTitle className="text-foreground">Recent Quotations</CardTitle>
        <CardDescription>Your latest quotation activity</CardDescription>
      </CardHeader>

      {/* Card content with table */}
      <CardContent>
        <div className="space-y-4">
          {/* Table header row */}
          <div className="grid grid-cols-5 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border pb-2">
            <span>ID</span>
            <span>Client</span>
            <span>Amount</span>
            <span>Status</span>
            <span>Date</span>
          </div>

          {/* Table data rows */}
          {quotations.map((quote) => (
            <div
              key={quote.id}
              className="grid grid-cols-5 items-center py-2 text-sm hover:bg-muted rounded-lg px-1 transition-colors"
            >
              {/* Quotation ID */}
              <span className="font-medium text-foreground">{quote.id}</span>
              {/* Client name */}
              <span className="text-body">{quote.client}</span>
              {/* Amount */}
              <span className="text-foreground">{quote.amount}</span>
              {/* Status badge */}
              <span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${statusStyles[quote.status]}`}
                >
                  {/* Capitalize first letter of status */}
                  {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                </span>
              </span>
              {/* Date */}
              <span className="text-muted-foreground">{quote.date}</span>
            </div>
          ))}
        </div>

        {/* View all link */}
        <div className="mt-4 pt-4 border-t border-border">
          <Button
            variant="link"
            className="px-0 text-brand hover:text-brand-hover"
            onClick={onViewAll}
          >
            View all quotations &rarr;
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
