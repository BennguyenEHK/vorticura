"use client"

// =============================================
// Vorticura MetricsStrip — "Mission Control for Procurement"
// =============================================
// A horizontal ledger band of three live-feeling metrics in mono, huge typeface.
// - 38h → 4m47s (MEDIAN RFQ → SENT, FROM v0.1 BENCHMARK)
// - 94% (RFQ AUTO-PARSE ACCURACY)
// - $2.1M (AVG SAVINGS UNLOCKED / CUSTOMER / YEAR)
// Each metric: mono caps micro-label caption below, 1px hairline dividers between on lg+.
// Looks like a Bloomberg ticker frozen in time — instrument-grade precision.

const metrics = [
  {
    number: "38h → 4m47s",
    caption: "MEDIAN RFQ → SENT, FROM v0.1 BENCHMARK",
    // Special sizing: smaller to fit the arrow notation
    mobileSize: "text-[44px]",
    desktopSize: "lg:text-[56px]",
  },
  {
    number: "94%",
    caption: "RFQ AUTO-PARSE ACCURACY",
    mobileSize: "text-[44px]",
    desktopSize: "lg:text-[64px]",
  },
  {
    number: "$2.1M",
    caption: "AVG SAVINGS UNLOCKED / CUSTOMER / YEAR",
    mobileSize: "text-[44px]",
    desktopSize: "lg:text-[64px]",
  },
]

export default function FeaturesSection() {
  return (
    // Section: ledger band with hairline rules above and below
    <section
      id="metrics"
      className="relative bg-paper py-20 lg:py-28 border-t border-b border-rule"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        {/* ===== Benchmark label — mono micro-line in graphite ===== */}
        <div className="mb-12 lg:mb-16">
          <p className="micro-label text-graphite">
            LIVE BENCHMARK · UPDATED Q2 2026
          </p>
        </div>

        {/* ===== Metrics strip — three columns, dividers on lg+ ===== */}
        {/* `divide-x` on lg+ paints a 1px --rule hairline between each metric; on mobile we
            stack vertically and the divide turns off (each metric sits in its own row). */}
        <div className="flex flex-col lg:flex-row lg:items-stretch lg:gap-0 lg:divide-x lg:divide-rule">
          {metrics.map((metric) => (
            <div
              key={metric.caption}
              className="flex-1 py-8 lg:py-2 lg:px-10 first:lg:pl-0 last:lg:pr-0 flex flex-col items-center lg:items-start text-center lg:text-left"
            >
              {/* Number — Data XL, tabular mono, --ink color (the eye-magnet) */}
              <div
                className={`${metric.mobileSize} ${metric.desktopSize} font-data tabular-nums text-ink leading-none mb-4`}
                style={{ letterSpacing: "-0.01em" }}
              >
                {metric.number}
              </div>

              {/* Caption — micro-label mono ALL-CAPS in graphite */}
              <p className="micro-label text-graphite max-w-xs">
                {metric.caption}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
