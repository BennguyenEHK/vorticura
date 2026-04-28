// =============================================
// Recent Quotations Card — Mission Control ledger
// =============================================
// Renders recent quotations as a Mission Control ledger:
// - Mono ALL-CAPS column heads
// - Hairline rule between rows, vellum hover
// - Tabular numerals for amounts (right-aligned)
// - Rectangular hairline status pills with a leading instrument-dot
// Replaces the previous rounded grid + colored pill aesthetic.

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// =============================================
// Types
// =============================================

export type QuotationStatus = "draft" | "pending" | "complete";

export interface QuotationData {
  id: string;                  // Quotation reference (e.g., "Q-2024-001")
  client: string;              // Client name
  amount: string;              // Formatted amount (e.g., "$45,200")
  status: QuotationStatus;     // Pipeline status
  date: string;                // Formatted date (e.g., "Jan 24, 2026")
}

interface RecentQuotationsCardProps {
  quotations: QuotationData[];
  onViewAll?: () => void;
}

// =============================================
// Status pill palette
// =============================================
// Mission Control rule: never more than two chromatic colors in a viewport.
// Draft = signal amber (live data). Pending = azimuth (interaction). Complete = verdigris.
const STATUS_STYLES: Record<
  QuotationStatus,
  { dot: string; text: string; border: string; label: string }
> = {
  draft:    { dot: "bg-neon-amber",                   text: "text-neon-amber",    border: "border-neon-amber/40",    label: "DRAFT" },
  pending:  { dot: "bg-neon-cyan animate-neon-pulse", text: "text-neon-cyan",     border: "border-neon-cyan/40",     label: "PENDING" },
  complete: { dot: "bg-neon-emerald",                 text: "text-neon-emerald",  border: "border-neon-emerald/40",  label: "COMPLETE" },
};

// =============================================
// Recent Quotations Card
// =============================================

/**
 * RecentQuotationsCard — Procurement ledger for the most recent quotations.
 * Uses the Table primitive so it inherits the Mission Control row treatment.
 */
export function RecentQuotationsCard({
  quotations,
  onViewAll,
}: RecentQuotationsCardProps) {
  return (
    // Spans 2/3 of the dashboard activity row
    <Card className="lg:col-span-2">
      {/* Header — display serif title, body description */}
      <CardHeader className="pb-4">
        <CardTitle>Recent Quotations</CardTitle>
        <CardDescription>Latest activity across the open pipeline</CardDescription>
      </CardHeader>

      {/* Body — full-width ledger table, no horizontal padding so the rules run edge-to-edge */}
      <CardContent className="pb-0 px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Client</TableHead>
              {/* Amount column right-aligned for ledger alignment */}
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotations.map((quote) => {
              const status = STATUS_STYLES[quote.status];
              return (
                <TableRow
                  key={quote.id}
                  className={quote.status === "pending" ? "bg-neon-cyan/[0.025]" : ""}
                >
                  {/* ID — mono data, ink color */}
                  <TableCell className="font-data text-ink tracking-[0.02em]">
                    {quote.id}
                  </TableCell>
                  {/* Client — body grotesque, ink */}
                  <TableCell className="font-body text-ink">
                    {quote.client}
                  </TableCell>
                  {/* Amount — mono tabular, right-aligned (ledger convention) */}
                  <TableCell className="font-data text-ink text-right tabular-nums">
                    {quote.amount}
                  </TableCell>
                  {/* Status — rectangular hairline pill with leading dot + mono caps */}
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-[2px] border px-1.5 py-0.5 ${status.border}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 ${status.dot}`}
                        aria-hidden="true"
                      />
                      <span
                        className={`font-data text-[10px] tracking-[0.16em] ${status.text}`}
                      >
                        {status.label}
                      </span>
                    </span>
                  </TableCell>
                  {/* Date — graphite, body grotesque, right-aligned */}
                  <TableCell className="font-body text-graphite text-right">
                    {quote.date}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Footer link — sits below the table inside its own padded zone */}
        <div className="mt-2 px-6 py-4 border-t border-rule">
          <Button
            variant="link"
            className="px-0 h-auto"
            onClick={onViewAll}
          >
            View all quotations →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
