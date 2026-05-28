"use client";

// =============================================
// PROFIT SUMMARY TABLE - Displays profit per item
// =============================================
// Shows calculated pricing results in a table
// Highlights positive/negative profit

import { usePricingPanel } from "./pricing-panel-provider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/services/pricing/validation";

// ---------------------------------------------
// Component
// ---------------------------------------------

interface ProfitSummaryTableProps {
  className?: string;
}

/**
 * ProfitSummaryTable - Table showing profit calculations
 * Uses design tokens: text-success (positive), text-error (negative)
 */
export function ProfitSummaryTable({ className = "" }: ProfitSummaryTableProps) {
  // Get state from context
  const { items, calculatedPricing } = usePricingPanel();

  // Build lookup map for items (for description)
  const itemsMap = new Map(items.map((i) => [i.item_id, i]));

  // Calculate total profit
  const totalProfit = calculatedPricing.reduce(
    (sum, p) => sum + p.potential_profit,
    0
  );

  // Truncate text helper
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  // Empty state
  if (calculatedPricing.length === 0) {
    return (
      <div className={`bg-muted rounded-lg p-4 ${className}`}>
        <h4 className="text-xs font-medium text-label uppercase tracking-wide mb-3">
          Potential Profit
        </h4>
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">No calculations yet</p>
          <p className="text-xs text-placeholder mt-1">
            Click &quot;Apply&quot; to calculate pricing
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-muted rounded-lg p-3 ${className}`}>
      {/* Section header */}
      <h4 className="text-xs font-medium text-label uppercase tracking-wide mb-2">
        Potential Profit (VND)
      </h4>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* 6 body rows × 32px = 192px body + 32px sticky header = 224px viewport */}
        <div className={calculatedPricing.length > 6 ? "max-h-[224px] overflow-y-auto scroll-smooth" : ""}>
          <Table>
            <TableHeader className={calculatedPricing.length > 6 ? "sticky top-0 z-10 bg-card" : ""}>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 text-xs">Item</TableHead>
                <TableHead className="h-8 text-xs text-center w-16">Qty</TableHead>
                <TableHead className="h-8 text-xs text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {calculatedPricing.map((pricing) => {
              const item = itemsMap.get(pricing.item_id);
              const isPositive = pricing.potential_profit >= 0;

              return (
                <TableRow key={pricing.item_id}>
                  <TableCell className="py-2 text-xs">
                    {truncateText(
                      item?.bidder_description || `Item ${pricing.item_id}`,
                      25
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-center">
                    {item?.qty || 0}
                  </TableCell>
                  <TableCell
                    className={`py-2 text-xs text-right font-data tabular-nums font-medium ${
                      isPositive ? "text-neon-emerald" : "text-error"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {formatCurrency(pricing.potential_profit)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          </Table>
        </div>
      </div>

      {/* Total row */}
      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
        <span className="micro-label text-graphite">Total Profit</span>
        <span
          className={`font-data text-sm font-bold tabular-nums ${
            totalProfit >= 0
              ? "text-neon-emerald neon-glow-accept animate-neon-flicker"
              : "text-error"
          }`}
        >
          {totalProfit >= 0 ? "+" : ""}
          {formatCurrency(totalProfit)}
        </span>
      </div>
    </div>
  );
}
