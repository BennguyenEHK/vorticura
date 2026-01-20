import * as React from "react"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Utility function to merge Tailwind classes safely
function cn(...inputs: (string | undefined | null | boolean)[]) {
  return twMerge(clsx(inputs))
}

// Extended input props with optional error state
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean // Visual error indicator
}

// Reusable Input component with consistent styling
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base input styles with focus and placeholder states
          "flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-slate-400",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Conditional styling based on error state
          error
            ? "border-red-500 focus-visible:ring-red-500" // Error state: red border and ring
            : "border-slate-200 focus-visible:ring-slate-400", // Normal state: neutral styling
          className
        )}
        ref={ref}
        aria-invalid={error} // Accessibility: indicate invalid input
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
