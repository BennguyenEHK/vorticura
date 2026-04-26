// =============================================
// Card — Mission Control surface
// =============================================
// Cards are paper artifacts: vellum surface, hairline rule, sharp corners.
// No shadow, no rounded-2xl. Weight comes from the warm vellum fill against
// the paper page background — exactly the gesture that makes a Bloomberg/Mercury
// surface feel "considered" instead of "v0 template."
// All colors resolve from Mission Control tokens in app/globals.css.

import * as React from "react"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Tailwind class merger (handles overrides cleanly)
function cn(...inputs: (string | undefined | null | boolean)[]) {
  return twMerge(clsx(inputs))
}

// Card container — vellum on paper, 1px rule, 6px corners, zero shadow
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Mission Control surface: vellum + hairline rule + sharp corners + no shadow
      "rounded-sm border border-rule bg-vellum text-ink",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

// Card header — generous padding, column flex with subtle gap
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

// Card title — editorial serif (font-display) at h3 weight, tight tracking
const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      // Display serif gives the card a magazine-grade headline tone
      "font-display text-ink text-xl leading-none tracking-[-0.01em]",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

// Card description — body grotesque, graphite tone
const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("font-body text-sm text-graphite", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

// Card body content — header already pads top, so omit top padding here
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("p-6 pt-0", className)}
    {...props}
  />
))
CardContent.displayName = "CardContent"

// Card footer — usually action row, sits below content with no top padding
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
