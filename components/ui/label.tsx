import * as React from "react"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Utility function to merge Tailwind classes safely
function cn(...inputs: (string | undefined | null | boolean)[]) {
  return twMerge(clsx(inputs))
}

// Extended label props with optional error state
export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {
  error?: boolean // Visual error indicator
}

// Reusable Label component with consistent styling
const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          // Base label styles
          "text-sm font-medium leading-none",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
          // Conditional color based on error state
          error ? "text-red-500" : "text-slate-700",
          className
        )}
        {...props}
      />
    )
  }
)
Label.displayName = "Label"

export { Label }
