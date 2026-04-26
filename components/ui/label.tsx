// =============================================
// Label — Mission Control form labels
// =============================================
// Default: standard form label in graphite body type.
// `variant="micro"`: ALL-CAPS mono micro-label — the "instrument label" gesture.
//   Used for column headers, section eyebrows, status pill text, etc.
// All colors resolve from tokens in app/globals.css.

import * as React from "react"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Tailwind class merger (handles overrides cleanly)
function cn(...inputs: (string | undefined | null | boolean)[]) {
  return twMerge(clsx(inputs))
}

// Public API: backwards compatible — adds `variant`
export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {
  error?: boolean                       // Visual error indicator (switches to ember)
  variant?: "default" | "micro"         // "micro" = ALL-CAPS mono instrument label
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, error, variant = "default", ...props }, ref) => {
    // Mission Control instrument label — ALL-CAPS, mono, wide tracking
    // The .micro-label utility is defined in globals.css under @layer utilities
    if (variant === "micro") {
      return (
        <label
          ref={ref}
          className={cn(
            "micro-label", // 11px / mono / 0.16em tracking / uppercase
            error ? "text-ember" : "text-graphite",
            "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
            className
          )}
          {...props}
        />
      )
    }

    // Default form label — body grotesque, graphite by default, ember on error
    return (
      <label
        ref={ref}
        className={cn(
          "font-body text-sm font-medium leading-none",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
          error ? "text-ember" : "text-graphite",
          className
        )}
        {...props}
      />
    )
  }
)
Label.displayName = "Label"

export { Label }
