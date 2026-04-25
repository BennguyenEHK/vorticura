// =============================================
// Vorticura Logo — instrument mark
// =============================================
// Mission Control / "trajectory + signal lamp" identity.
// - Outer ring: thin instrument bezel at low alpha (rule color)
// - Trajectory arc: rises left -> apogee at upper right (currentColor)
// - Origin marker: square at the start of the arc
// - Apogee marker: square in the --signal amber, calling out the peak of the bid
// All strokes monochrome — no gradients, no fills (except the two instrument squares).

interface LogoProps {
  className?: string; // sizing utility (default: w-8 h-8)
}

/**
 * Logo - Vorticura instrument mark
 *
 * Inherits color from `currentColor` so it adapts to dark/light mode wherever it's used.
 * The two square markers anchor the trajectory: origin (ink) -> apogee (signal).
 */
export function Logo({ className = "w-8 h-8" }: LogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true" // Decorative — wordmark is the accessible label
    >
      {/* Instrument bezel: thin ring at low alpha — reads as a watch dial / scope */}
      <circle
        cx="16"
        cy="16"
        r="14.5"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1"
        fill="none"
      />

      {/* Trajectory arc: origin (lower-left) -> apogee (upper-right) */}
      {/* Drawn as a single open curve, square-capped to feel engineered, not organic */}
      <path
        d="M5 23 Q 12 8 27 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
        fill="none"
      />

      {/* Origin marker (ink): the bid kickoff */}
      <rect x="3" y="21" width="4" height="4" fill="currentColor" />

      {/* Apogee marker (signal amber): the winning peak — only place color appears in the mark */}
      <rect x="25" y="7" width="4" height="4" fill="var(--signal)" />
    </svg>
  );
}
