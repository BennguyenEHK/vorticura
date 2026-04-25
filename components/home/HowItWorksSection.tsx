"use client"

import { useState, useEffect, useRef } from "react"

// =============================================
// WorkflowNarrative Section
// =============================================
// Scroll-driven workflow diagram: sticky-left trajectory markers,
// scrolling-right prose blocks describing the 4-station pipeline.
// Active-marker updates via IntersectionObserver on right-column blocks.

const BLOCKS = [
  {
    id: "station-01",
    overline: "STATION 01 · INGEST",
    headline: "The RFQ never sits in someone's inbox.",
    body: "Vorticura watches your shared inbox and pulls every RFQ — PDF, email body, scanned image — into the queue within 12 seconds of arrival.",
  },
  {
    id: "station-02",
    overline: "STATION 02 · PARSE",
    headline: "Forty-three line items, parsed in twenty-two seconds.",
    body: "Specs, quantities, deadlines, certifications, payment terms — every field extracted into a structured record. Mistakes are flagged, not silently corrected.",
  },
  {
    id: "station-03",
    overline: "STATION 03 · SOURCE",
    headline: "Three suppliers, ranked, with reasons.",
    body: "Vorticura cross-references your supplier graph and the open RFQ in real time. You see the top three matches with stated lead times, certifications, and the rationale for the rank order.",
  },
  {
    id: "station-04",
    overline: "STATION 04 · QUOTE",
    headline: "A draft you can send, or rewrite, in under a minute.",
    body: "Calculated line items, currency-aware totals, your firm's terms. Send it as-is, or override any field. Either way, the whole thing took under five minutes.",
  },
]

export default function HowItWorksSection() {
  const [activeIndex, setActiveIndex] = useState(0)
  const blockRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    // IntersectionObserver to track which block is in viewport center
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = blockRefs.current.indexOf(entry.target as HTMLDivElement)
            if (index !== -1) {
              setActiveIndex(index)
            }
          }
        })
      },
      {
        rootMargin: "-50% 0px -50% 0px", // Trigger when block center crosses viewport center
      }
    )

    blockRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <section id="workflow" className="bg-vellum py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        {/* ===== Section Header ===== */}
        <div className="mb-20">
          <span className="micro-label text-graphite block mb-3">PIPELINE</span>
          <h2
            className="font-display text-ink leading-tight"
            style={{
              fontSize: "clamp(1.875rem, 5vw, 2.5rem)", // ~30px -> ~40px
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            How a quote moves through Vorticura.
          </h2>
        </div>

        {/* ===== Two-Column Grid: Sticky Markers + Scrolling Prose ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
          {/* ===== LEFT COLUMN: Sticky Trajectory Markers ===== */}
          <div className="lg:col-span-3">
            <div className="lg:sticky lg:top-24">
              <div className="flex flex-col items-center gap-0">
                {/* Vertical marker column: 4 stations */}
                {BLOCKS.map((block, index) => (
                  <div
                    key={block.id}
                    className="flex flex-col items-center"
                    style={{
                      minHeight: "150px",
                    }}
                  >
                    {/* Marker square: 12x12, signal amber when active, ink/30 when inactive */}
                    <div
                      className={`w-3 h-3 transition-all duration-200 ${
                        index === activeIndex
                          ? "bg-signal ring-1 ring-signal"
                          : "bg-ink/30"
                      }`}
                      style={{
                        width: "12px",
                        height: "12px",
                      }}
                      aria-current={index === activeIndex ? "step" : undefined}
                    />

                    {/* Vertical connector line to next marker */}
                    {index < BLOCKS.length - 1 && (
                      <div
                        className="w-px bg-rule-strong flex-grow"
                        style={{
                          minHeight: "120px",
                        }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ===== RIGHT COLUMN: Scrolling Prose Blocks ===== */}
          <div className="lg:col-span-9">
            <div className="space-y-32">
              {BLOCKS.map((block, index) => (
                <div
                  key={block.id}
                  ref={(el) => {
                    blockRefs.current[index] = el
                  }}
                  className="min-h-[60vh] flex flex-col justify-center"
                >
                  {/* Mono overline label */}
                  <span
                    className="micro-label text-graphite block mb-6"
                    style={{
                      fontFamily: "var(--font-data)",
                      fontSize: "11px",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      fontWeight: 500,
                    }}
                  >
                    {block.overline}
                  </span>

                  {/* Serif headline */}
                  <h3
                    className="font-display text-ink leading-tight mb-6"
                    style={{
                      fontSize: "clamp(1.5rem, 4vw, 1.5rem)",
                      fontWeight: 400,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {block.headline}
                  </h3>

                  {/* Body copy */}
                  <p
                    className="font-body text-graphite leading-relaxed max-w-2xl"
                    style={{
                      fontSize: "clamp(1rem, 2vw, 1.125rem)",
                      lineHeight: 1.65,
                    }}
                  >
                    {block.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
