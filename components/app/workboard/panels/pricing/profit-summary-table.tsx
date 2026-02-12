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

  // Build lookup map for calculated pricing
  const pricingMap = new Map(
    calculatedPricing.map((p) => [p.item_id, p])
  );

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
        <Table>
          <TableHeader>
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
                    className={`py-2 text-xs text-right font-medium ${
                      isPositive ? "text-success" : "text-error"
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

      {/* Total row */}
      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Total Profit</span>
        <span
          className={`text-sm font-bold ${
            totalProfit >= 0 ? "text-success" : "text-error"
          }`}
        >
          {totalProfit >= 0 ? "+" : ""}
          {formatCurrency(totalProfit)}
        </span>
      </div>
    </div>
  );
}
