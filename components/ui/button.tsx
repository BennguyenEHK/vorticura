import * as React from "react"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Utility function to merge Tailwind classes safely
function cn(...inputs: (string | undefined | null | boolean)[]) {
  return twMerge(clsx(inputs))
}

// Button variant and size type definitions
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
  isLoading?: boolean // Loading state indicator
  asChild?: boolean // Render as child element (e.g., for composing with Link)
}

// Reusable Button component with multiple variants and asChild support
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", isLoading, asChild = false, children, disabled, ...props }, ref) => {
    // Base styles for all buttons
    const baseStyles = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"

    // Variant-specific styles (using design tokens from globals.css)
    const variantStyles = {
      default: "bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-foreground",           // slate-900 based
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive", // red-500 based
      outline: "border border-border bg-card hover:bg-secondary hover:text-foreground focus-visible:ring-foreground",   // outlined variant
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-foreground",          // slate-100 based
      ghost: "hover:bg-secondary hover:text-foreground focus-visible:ring-foreground",                                  // transparent until hover
      link: "text-foreground underline-offset-4 hover:underline focus-visible:ring-foreground",                         // text link style
    }

    // Size-specific styles
    const sizeStyles = {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-md px-3",
      lg: "h-11 rounded-lg px-8",
      icon: "h-10 w-10",
    }

    const buttonStyles = cn(
      baseStyles,
      variantStyles[variant],
      sizeStyles[size],
      className
    )

    // If asChild is true, apply styles to the first child element (typically a Link)
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, {
        className: cn(buttonStyles, (children as React.ReactElement<any>).props.className),
        ...props
      })
    }

    return (
      <button
        className={buttonStyles}
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading} // Accessibility: indicate loading state
        {...props}
      >
        {/* Loading spinner shown when isLoading is true */}
        {isLoading && (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button }
