"use client";

// =============================================
// Preview Panel Content
// =============================================
// Content component for the quotation preview panel
// Shows a live preview of the generated quotation

import { FileText, Download, Edit, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================
// Mock Data
// =============================================

// Placeholder quotation data
const quotationData = {
  id: "Q-2024-001",
  customer: "Acme Corporation",
  date: "January 29, 2026",
  items: [
    { name: "Industrial Bearings", qty: 500, price: 15.5 },
    { name: "Hydraulic Seals", qty: 200, price: 8.25 },
    { name: "Steel Plates", qty: 50, price: 120.0 },
  ],
  subtotal: 15175,
  tax: 1062.25,
  total: 16237.25,
};

// =============================================
// Content Component
// =============================================

interface PreviewPanelContentProps {
  className?: string;
}

/**
 * PreviewPanelContent - Quotation preview content
 * Shows: formatted quotation preview with download/edit actions
 */
export function PreviewPanelContent({
  className = "",
}: PreviewPanelContentProps) {
  return (
    <div className={`p-4 h-full flex flex-col ${className}`}>
      {/* Header with actions */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            Quotation Preview
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live preview updates with pricing
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Edit className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Printer className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Download className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Preview area - styled as document */}
      <div className="flex-1 overflow-auto bg-background border border-border rounded-lg p-4 shadow-inner">
        {/* Document header */}
        <div className="text-center border-b border-border pb-3 mb-4">
          <FileText className="w-8 h-8 mx-auto text-brand mb-2" />
          <h4 className="text-lg font-bold text-foreground">QUOTATION</h4>
          <p className="text-xs text-muted-foreground">
            {quotationData.id} | {quotationData.date}
          </p>
        </div>

        {/* Customer info */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground">Bill To:</p>
          <p className="text-sm font-medium text-foreground">
            {quotationData.customer}
          </p>
        </div>

        {/* Items table */}
        <div className="mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1 text-muted-foreground font-medium">
                  Item
                </th>
                <th className="text-center py-1 text-muted-foreground font-medium">
                  Qty
                </th>
                <th className="text-right py-1 text-muted-foreground font-medium">
                  Price
                </th>
                <th className="text-right py-1 text-muted-foreground font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {quotationData.items.map((item, index) => (
                <tr key={index} className="border-b border-border/50">
                  <td className="py-2 text-foreground">{item.name}</td>
                  <td className="py-2 text-center text-foreground">
                    {item.qty}
                  </td>
                  <td className="py-2 text-right text-foreground">
                    ${item.price.toFixed(2)}
                  </td>
                  <td className="py-2 text-right text-foreground">
                    ${(item.qty * item.price).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal:</span>
            <span className="text-foreground">
              ${quotationData.subtotal.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax (7%):</span>
            <span className="text-foreground">
              ${quotationData.tax.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between pt-2 border-t border-border font-bold">
            <span className="text-foreground">TOTAL:</span>
            <span className="text-foreground text-base">
              ${quotationData.total.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex gap-2">
        <Button variant="outline" className="flex-1" size="sm">
          <Edit className="w-4 h-4 mr-2" />
          Edit
        </Button>
        <Button className="flex-1" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Download PDF
        </Button>
      </div>
    </div>
  );
}
