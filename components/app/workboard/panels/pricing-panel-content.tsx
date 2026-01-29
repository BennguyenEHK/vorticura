"use client";

// =============================================
// Pricing Panel Content
// =============================================
// Content component for the pricing editor panel
// Shows pricing variables and calculations

import { useState } from "react";
import { DollarSign, Percent, Truck, Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// =============================================
// Mock Data
// =============================================

// Initial pricing values (placeholder)
const initialPricing = {
  baseCost: 12500,
  markupPercent: 15,
  shippingCost: 250,
  taxPercent: 7,
};

// =============================================
// Content Component
// =============================================

interface PricingPanelContentProps {
  className?: string;
}

/**
 * PricingPanelContent - Pricing editor content
 * Shows: base cost, markup, shipping, tax, total calculation
 */
export function PricingPanelContent({
  className = "",
}: PricingPanelContentProps) {
  // Local state for pricing values
  const [pricing, setPricing] = useState(initialPricing);

  // Calculate derived values
  const markupAmount = pricing.baseCost * (pricing.markupPercent / 100);
  const subtotal = pricing.baseCost + markupAmount + pricing.shippingCost;
  const taxAmount = subtotal * (pricing.taxPercent / 100);
  const total = subtotal + taxAmount;

  // Handle input changes
  const handleChange = (field: keyof typeof pricing, value: string) => {
    const numValue = parseFloat(value) || 0;
    setPricing((prev) => ({ ...prev, [field]: numValue }));
  };

  return (
    <div className={`p-4 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">Pricing Editor</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Configure pricing variables
        </p>
      </div>

      {/* Pricing inputs */}
      <div className="flex-1 space-y-4 overflow-y-auto">
        {/* Supplier Pricing Section */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-label uppercase tracking-wide">
            Supplier Pricing
          </label>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Base Cost</label>
              <Input
                type="number"
                value={pricing.baseCost}
                onChange={(e) => handleChange("baseCost", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Your Pricing Section */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-label uppercase tracking-wide">
            Your Pricing
          </label>

          {/* Markup */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Percent className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Markup %</label>
              <Input
                type="number"
                value={pricing.markupPercent}
                onChange={(e) => handleChange("markupPercent", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="text-sm text-muted-foreground w-24 text-right">
              +${markupAmount.toLocaleString('en-US')}
            </div>
          </div>

          {/* Shipping */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Truck className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Shipping</label>
              <Input
                type="number"
                value={pricing.shippingCost}
                onChange={(e) => handleChange("shippingCost", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Tax */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Calculator className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Tax %</label>
              <Input
                type="number"
                value={pricing.taxPercent}
                onChange={(e) => handleChange("taxPercent", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="text-sm text-muted-foreground w-24 text-right">
              +${taxAmount.toLocaleString('en-US')}
            </div>
          </div>
        </div>
      </div>

      {/* Total section */}
      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">TOTAL</span>
          <span className="text-xl font-bold text-foreground">
            ${total.toLocaleString('en-US')}
          </span>
        </div>
        <Button className="w-full mt-3" size="sm">
          Apply Pricing
        </Button>
      </div>
    </div>
  );
}
