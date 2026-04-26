// =============================================
// Button — Mission Control primitive
// =============================================
// Buttons read as engineering controls, not SaaS gradients.
// - Sharp 6px corners (rounded-sm via the design-token map)
// - Hairline ink border on filled buttons (the "engineering drawing" gesture)
// - No drop shadow, no gradient, no scale-on-hover
// - Body-grotesque type, medium weight, neutral tracking
// All color values resolve from Mission Control tokens in app/globals.css
// (--azimuth, --ink, --paper, --vellum, --rule, --ember, --graphite).

import * as React from "react"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Tailwind class merger (handles overrides cleanly)
function cn(...inputs: (string | undefined | null | boolean)[]) {
  return twMerge(clsx(inputs))
}

// Public API kept compatible with existing call sites
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
  isLoading?: boolean // Loading state indicator
  asChild?: boolean   // Compose with Link/anchor children
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", isLoading, asChild = false, children, disabled, ...props }, ref) => {
    // Base: editorial body type, sharp 6px corners, no shadow, no scale
    const baseStyles = [
      "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
      "font-body font-medium text-sm tracking-normal",
      "rounded-sm transition-colors", // 6px corners from the design-token scale
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azimuth focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
      "disabled:pointer-events-none disabled:opacity-50",
    ].join(" ")

    // Mission Control variant map (no gradients, no shadows)
    const variantStyles = {
      // Primary instrument action — deep instrument blue with ink hairline border
      default: "bg-azimuth text-paper border border-ink hover:bg-azimuth-glow",
      // Destructive — oxidized ember red, same hairline gesture
      destructive: "bg-ember text-paper border border-ink hover:opacity-90",
      // Outline — transparent with hairline ink border at 25%, opens on hover
      outline: "bg-transparent text-ink border border-ink/25 hover:border-ink/60 hover:bg-vellum",
      // Secondary — vellum surface, faint rule border (sits quietly inside cards)
      secondary: "bg-vellum text-ink border border-rule hover:bg-vellum/70",
      // Ghost — fully transparent until hover lifts it onto vellum
      ghost: "bg-transparent text-ink hover:bg-vellum",
      // Link — text-only, Azimuth on hover with custom underline offset
      link: "bg-transparent text-ink underline-offset-[6px] hover:text-azimuth hover:underline decoration-rule-strong hover:decoration-azimuth",
    } as const

    // Sizes: sm 32, md 40, lg 48 — no bloated 56-60 button heights
    const sizeStyles = {
      default: "h-10 px-4",
      sm: "h-8 px-3 text-xs",
      lg: "h-12 px-7",
      icon: "h-9 w-9",
    } as const

    const buttonStyles = cn(baseStyles, variantStyles[variant], sizeStyles[size], className)

    // Inline spinner used by both the native button and the asChild path
    const LoadingSpinner = (
      <svg
        className="h-4 w-4 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    )

    // asChild composition — forwards button styles to the wrapped element (e.g. <Link>)
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, {
        ref,
        className: cn(buttonStyles, (children as React.ReactElement<any>).props.className),
        disabled: disabled || isLoading,
        'aria-busy': isLoading,
        ...props,
        children: (
          <>
            {isLoading && LoadingSpinner}
            {(children as React.ReactElement<any>).props.children}
          </>
        ),
      })
    }

    return (
      <button
        className={buttonStyles}
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading && LoadingSpinner}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button }
