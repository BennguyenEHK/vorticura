// =============================================
// QuoteFlow AI Logo Component
// =============================================
// Shared logo SVG used across the application:
// - Homepage navbar
// - Dashboard topbar
// - Auth pages
// Configurable size via className prop

interface LogoProps {
  className?: string;  // Tailwind classes for sizing (default: w-8 h-8)
}

/**
 * Logo - QuoteFlow AI brand logo SVG
 *
 * Design:
 * - Dark slate background with rounded corners
 * - Sky-blue layered shape (diamond + two chevrons)
 * - Creates depth effect with filled and stroked elements
 *
 * @param className - Size classes (default: "w-8 h-8" = 32x32px)
 */
export function Logo({ className = "w-8 h-8" }: LogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"  // Decorative, not announced by screen readers
    >
      {/* Background: dark slate rounded rectangle */}
      <rect width="32" height="32" rx="8" fill="#0f172a" />

      {/* Top layer: filled sky-blue diamond shape */}
      <path d="M8 12L16 8L24 12L16 16L8 12Z" fill="#38bdf8" />

      {/* Middle layer: stroked sky-blue chevron */}
      <path
        d="M8 16L16 20L24 16"
        stroke="#38bdf8"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Bottom layer: stroked sky-blue chevron */}
      <path
        d="M8 20L16 24L24 20"
        stroke="#38bdf8"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
