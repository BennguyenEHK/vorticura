// =============================================
// Input — Mission Control field
// =============================================
// Decisive: 1px ink/40% hairline border on a paper fill, with a 2px Azimuth
// border on focus (no glowing ring, no diffused shadow). This is the
// "instrument input" gesture — it should feel like writing on a calibration form.
// All colors resolve from tokens in app/globals.css.

import * as React from "react"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Tailwind class merger (handles overrides cleanly)
function cn(...inputs: (string | undefined | null | boolean)[]) {
  return twMerge(clsx(inputs))
}

// Public API kept compatible — `error` triggers the ember (oxidized red) state
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean // Visual error indicator
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base instrument field: paper fill, ink text, mono-friendly numerals
          "flex h-10 w-full rounded-sm bg-paper px-3 py-2 text-sm font-body text-ink",
          "tabular-nums", // Numeric inputs read as "data" by default
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink",
          "placeholder:text-graphite/55",
          // Decisive focus: thin 2px Azimuth border, no glow, no offset
          "focus-visible:outline-none focus-visible:border-azimuth focus-visible:border-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // 1px hairline by default; switches to ember on validation error
          error
            ? "border border-ember focus-visible:border-ember"
            : "border border-ink/40",
          className
        )}
        ref={ref}
        aria-invalid={error}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
