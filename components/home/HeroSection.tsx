"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

// =============================================
// Vorticura HeroSection
// =============================================
// "Mission Control for Procurement" — left-weighted asymmetric hero.
// - Left column (5/12): mono overline + serif headline + body + dual CTAs + cert micro-line.
// - Right column (7/12): a single trajectory arc with five station markers — one signature SVG.
// No orbs, no grid mesh, no gradient text, no badge, no glassmorphism.

// Five stations on the trajectory arc — these are the literal procurement pipeline.
// (Time stamps are illustrative; the data tells the speed story without prose.)
const STATIONS = [
  { label: "RFQ", time: "00:12" },
  { label: "PARSE", time: "00:34" },
  { label: "SOURCE", time: "01:08" },
  { label: "DRAFT", time: "02:21" },
  { label: "SEND", time: "04:47" },
]

export default function HeroSection() {
  return (
    // Section: solid --paper background, no decorative orbs, full viewport height.
    <section className="relative min-h-screen flex items-center bg-paper overflow-hidden">
      {/* Faint vertical guide rule on the right gutter — feels like a printed grid sheet */}
      <div
        className="absolute top-0 bottom-0 right-[7%] w-px bg-rule pointer-events-none hidden lg:block"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-7xl w-full px-6 lg:px-10 pt-32 pb-20 lg:pt-40 lg:pb-28">
        {/* 12-col grid: 5/7 split between text column and trajectory artifact */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          {/* ===== LEFT — text column (5/12) ===== */}
          <div className="lg:col-span-5">
            {/* Mono overline — instrument identifier, NASA mission-patch styling */}
            <div className="flex items-center gap-3 mb-10">
              <span className="micro-label text-graphite">VORTICURA · OPS</span>
              <span className="h-px w-10 bg-rule-strong" aria-hidden="true" />
              <span className="micro-label text-graphite">v0.1</span>
            </div>

            {/* Serif display headline — the entire hook lives in this sentence */}
            <h1
              className="font-display text-ink leading-[0.95]"
              style={{
                fontSize: "clamp(2.75rem, 7vw, 6.5rem)", // ~44px -> ~104px fluid
                letterSpacing: "-0.02em",
                fontWeight: 400,
              }}
            >
              The peak of every bid,
              {/* Subordinate clause on its own line — italic adds editorial cadence */}
              <span className="block italic text-graphite mt-2">
                four minutes after the&nbsp;RFQ lands.
              </span>
            </h1>

            {/* Body paragraph — Inter Tight, 18px, generous leading */}
            <p className="font-body mt-8 max-w-xl text-graphite text-[1.125rem] leading-[1.55]">
              Procurement teams using Vorticura cut quote response from a median of
              {" "}
              {/* Numbers in mono draw the eye and feel "data-grade" */}
              <span className="font-data tabular-nums text-ink">38h</span>
              {" to "}
              <span className="font-data tabular-nums text-ink">4m&nbsp;47s</span>
              . Same RFQ. Same suppliers. Different instrument.
            </p>

            {/* CTAs — primary is azimuth, secondary is text-link with arrow.
                No third button, no trust pile-on, no "Watch Demo" cliché. */}
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href="/signup">
                <Button
                  className="bg-azimuth hover:bg-azimuth-glow text-paper font-body font-medium border border-ink px-7 h-12 rounded-[6px] shadow-none"
                >
                  Request access
                </Button>
              </Link>

              <Link
                href="#workflow"
                className="font-body font-medium text-ink hover:text-azimuth transition-colors inline-flex items-center gap-2 underline underline-offset-[6px] decoration-rule-strong hover:decoration-azimuth"
              >
                See how it moves
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            {/* Mono certifications strip — replaces fake-logo trust band */}
            <div className="mt-16 pt-6 border-t border-rule">
              <p className="micro-label text-graphite">
                SOC 2 TYPE II · ISO 27001 · TRUSTED BY 47 PROCUREMENT TEAMS
              </p>
            </div>
          </div>

          {/* ===== RIGHT — trajectory artifact (7/12) ===== */}
          {/* The single signature visual: an arc that draws on load with 5 station markers. */}
          <div className="lg:col-span-7 relative" aria-hidden="true">
            <TrajectoryArc />
          </div>
        </div>
      </div>
    </section>
  )
}

// =============================================
// TrajectoryArc — the hero artifact
// =============================================
// SVG drawing of a single sweeping arc from lower-left -> upper-right, with five station
// markers placed along its path. The arc itself uses a stroke-dashoffset draw-on; the
// markers fade in staggered. One signature animation, played once on load.
function TrajectoryArc() {
  // Arc geometry: viewBox 700 x 420, arc rises gently from (60, 360) to (650, 60).
  // Path uses a quadratic curve so the trajectory feels like a launch, not a parabola.
  const pathD = "M 60 360 Q 280 60 650 60"
  // Approximate length for the dash animation (calibrated to the curve above).
  const arcLength = 760

  // Pre-computed station coordinates along the arc at 5%, 25%, 50%, 75%, 95% of length.
  // (Eyeballed from the curve — close enough for an editorial illustration.)
  const points = [
    { x: 88, y: 305 },   // RFQ
    { x: 200, y: 175 },  // PARSE
    { x: 350, y: 105 },  // SOURCE
    { x: 500, y: 75 },   // DRAFT
    { x: 640, y: 62 },   // SEND
  ]

  return (
    <div className="relative w-full">
      <svg
        viewBox="0 0 700 420"
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Trajectory diagram from RFQ to sent quote"
      >
        {/* Faint instrument grid under the arc — barely visible, prints once on a paper background */}
        <g stroke="var(--rule)" strokeWidth="1">
          {/* Three baseline rules at 25/50/75% height */}
          <line x1="0" y1="105" x2="700" y2="105" />
          <line x1="0" y1="210" x2="700" y2="210" />
          <line x1="0" y1="315" x2="700" y2="315" />
        </g>

        {/* Trajectory arc — the protagonist */}
        <path
          d={pathD}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1.5"
          strokeLinecap="square"
          // Dash array equals path length; offset starts equal so nothing renders, animates to 0.
          strokeDasharray={arcLength}
          strokeDashoffset={arcLength}
          className="animate-trajectory"
          style={{ ["--arc-length" as string]: arcLength }}
        />

        {/* Station markers — small squares + mono labels, fade in staggered */}
        {points.map((p, i) => {
          const station = STATIONS[i]
          // Last station = apogee = signal amber (the winning bid)
          const isApogee = i === points.length - 1
          return (
            <g
              key={station.label}
              className="animate-marker"
              style={{ animationDelay: `${1.0 + i * 0.18}s` }}
            >
              {/* Station marker square — 8x8, sits centered on the path point */}
              <rect
                x={p.x - 4}
                y={p.y - 4}
                width="8"
                height="8"
                fill={isApogee ? "var(--signal)" : "var(--ink)"}
              />
              {/* Vertical tick from the marker down to its caption */}
              <line
                x1={p.x}
                y1={p.y + 8}
                x2={p.x}
                y2={p.y + 28}
                stroke="var(--rule-strong)"
                strokeWidth="1"
              />
              {/* Time stamp (top line, mono, tabular) */}
              <text
                x={p.x}
                y={p.y + 44}
                textAnchor="middle"
                fill="var(--ink)"
                style={{
                  fontFamily: "var(--font-data)",
                  fontSize: "12px",
                  letterSpacing: "0.04em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {station.time}
              </text>
              {/* Station label (bottom line, mono caps, lighter) */}
              <text
                x={p.x}
                y={p.y + 60}
                textAnchor="middle"
                fill="var(--graphite)"
                style={{
                  fontFamily: "var(--font-data)",
                  fontSize: "10px",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                {station.label}
              </text>
            </g>
          )
        })}

        {/* Apogee callout: a small mono badge near the SEND marker */}
        <g className="animate-marker" style={{ animationDelay: "2.0s" }}>
          <line
            x1={points[4].x}
            y1={points[4].y - 12}
            x2={points[4].x}
            y2={points[4].y - 30}
            stroke="var(--signal)"
            strokeWidth="1"
          />
          <text
            x={points[4].x}
            y={points[4].y - 38}
            textAnchor="middle"
            fill="var(--ink)"
            style={{
              fontFamily: "var(--font-data)",
              fontSize: "10px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            APOGEE
          </text>
        </g>
      </svg>
    </div>
  )
}
