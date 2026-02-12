"use client";

// =============================================
// ITEM SEARCH - Search/filter items by keyword
// =============================================
// Allows user to search items by description
// Shows results count

import { Search, X } from "lucide-react";
import { usePricingPanel } from "./pricing-panel-provider";
import { Input } from "@/components/ui/input";

// ---------------------------------------------
// Component
// ---------------------------------------------

interface ItemSearchProps {
  className?: string;
}

/**
 * ItemSearch - Search input with results info
 * Uses design tokens: bg-muted, text-placeholder, text-muted-foreground
 */
export function ItemSearch({ className = "" }: ItemSearchProps) {
  // Get state and actions from context
  const { items, searchTerm, setSearchTerm } = usePricingPanel();

  // Calculate filtered count
  const filteredCount = searchTerm
    ? items.filter(
        (item) =>
          item.bidder_description
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          String(item.item_id).includes(searchTerm)
      ).length
    : items.length;

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Handle clear button
  const handleClear = () => {
    setSearchTerm("");
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClear();
    }
  };

  return (
    <div className={`bg-muted rounded-lg p-2 ${className}`}>
      {/* Search input container */}
      <div className="relative">
        {/* Search icon */}
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />

        {/* Input field */}
        <Input
          type="text"
          value={searchTerm}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search items by keyword..."
          className="pl-8 pr-8 h-8 text-sm bg-card"
        />

        {/* Clear button - only show when there's text */}
        {searchTerm && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5
                       hover:bg-secondary rounded-full transition-colors"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Results info */}
      <div className="mt-1.5 text-xs text-muted-foreground">
        {searchTerm ? (
          <span>
            <span className="font-medium text-foreground">{filteredCount}</span>{" "}
            of {items.length} items match &quot;{searchTerm}&quot;
          </span>
        ) : (
          <span>{items.length} items available</span>
        )}
      </div>
    </div>
  );
}
