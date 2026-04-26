"use client"

// =============================================
// Table — Mission Control ledger
// =============================================
// "Procurement is spreadsheets — own that." Tables are styled like a printed
// ledger: hairline rules between rows, mono ALL-CAPS column heads, tabular
// numerals, no zebra-shadow vibes. This single component carries a huge share
// of the Mission Control feel for any data-dense surface.
// All colors resolve from Mission Control tokens in app/globals.css.

import * as React from "react"

import { cn } from "@/lib/utils"

// Wrap the raw <table> in a horizontal-scroll container — keeps layouts honest
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        // Body grotesque type, tabular nums by default — every figure aligns
        className={cn("w-full caption-bottom text-sm font-body tabular-nums text-ink", className)}
        {...props}
      />
    </div>
  )
}

// Header — sits above a stronger 1px ink/30% rule (the "ledger column line")
function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-rule-strong", className)}
      {...props}
    />
  )
}

// Body — last row gets no bottom border to avoid a doubled rule against the card edge
function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

// Footer — vellum strip + medium weight; reads as a totals row
function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-vellum border-t border-rule-strong font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

// Row — 1px hairline rule, vellum solid on hover (no opacity-based wash)
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-rule transition-colors",
        "hover:bg-vellum",
        "data-[state=selected]:bg-vellum",
        className
      )}
      {...props}
    />
  )
}

// Column header cell — mono ALL-CAPS 11px micro-label (the instrument column head)
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // Mission Control column header: mono caps, wide tracking, graphite tone
        "text-graphite h-10 px-3 text-left align-middle whitespace-nowrap",
        "font-data text-[11px] font-medium uppercase tracking-[0.16em]",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

// Body cell — ink text, tabular nums (inherited from <table>), generous padding
function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-3 align-middle whitespace-nowrap text-ink",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

// Caption — subdued graphite footnote
function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-graphite mt-4 text-sm font-body", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
