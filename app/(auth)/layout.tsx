import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/ui/logo"

// =============================================
// Auth Layout Metadata — Vorticura Mission Control
// =============================================
export const metadata: Metadata = {
  title: "Mission Control | Vorticura",
  description: "AI-powered procurement automation. Warp-speed results. Zero setup friction.",
}

// =============================================
// Auth Layout Component — Instrument-Grade Split Screen
// =============================================
// Left: warm paper form column (40%) with wordmark + auth shell + footer.
// Right: deep ink brand panel (60%, desktop only) with mission narrative, metrics.
// No gradients, no orbs, no legacy tokens. Vorticura all the way down.
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <main className="flex min-h-screen w-full">
      {/* ===== Left Panel: Form Area (40% on desktop, 100% on mobile) ===== */}
      <section className="flex w-full flex-col justify-between px-6 py-12 lg:w-2/5 lg:px-12 bg-paper">
        {/* Wordmark cluster: Logo + serif "Vorticura" + mono "OPS" superscript */}
        <div className="mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-3 hover:opacity-80 transition-opacity"
            aria-label="Vorticura — home"
          >
            {/* Instrument mark */}
            <Logo className="w-7 h-7 text-ink" />
            {/* Serif wordmark + mono micro superscript */}
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[1.375rem] tracking-[-0.01em] leading-none text-ink">
                Vorticura
              </span>
              <span className="micro-label text-graphite hidden sm:inline">OPS</span>
            </div>
          </Link>
          {/* Station identifier micro-label */}
          <p className="micro-label text-graphite mt-4">STATION 00 · ACCESS</p>
        </div>

        {/* Form Content (children from page.tsx) */}
        <div className="flex flex-1 items-center justify-center">
          {children}
        </div>

        {/* Footer: mono micro-label, Vorticura copyright */}
        <footer className="text-center">
          <p className="micro-label text-graphite">
            © 2026 VORTICURA · ALL RIGHTS RESERVED
          </p>
        </footer>
      </section>

      {/* ===== Right Panel: Brand/Mission Area (60% on desktop, hidden on mobile) ===== */}
      {/* Solid ink background — the deep instrument console. No gradients, no orbs. */}
      <section
        className="relative hidden lg:flex lg:w-3/5 lg:flex-col lg:items-center lg:justify-center bg-ink"
        aria-hidden="true"
      >
        {/* Brand Content: centered in a max-width container */}
        <div className="relative z-10 max-w-lg px-12 flex flex-col">
          {/* Mono overline: mission control live status */}
          <p className="micro-label text-paper/60 mb-6">
            MISSION CONTROL · LIVE
          </p>

          {/* Serif headline: the core hook — 48-56px, leading tight */}
          <h1
            className="font-display text-paper mb-6"
            style={{
              fontSize: "clamp(3rem, 6vw, 3.5rem)",
              lineHeight: "1.05",
              letterSpacing: "-0.015em",
            }}
          >
            You're four minutes from a sent quote.
          </h1>

          {/* Serif italic body: operational context, max-width to anchor rhythm */}
          <p className="font-display italic text-paper/70 text-lg leading-relaxed max-w-md mb-12">
            Sign in to pick up where you left off — every active RFQ, every supplier ranking, every draft, exactly where the last shift left them.
          </p>

          {/* Divider rule: 1px border-paper/15 */}
          <div className="border-t border-paper/15 pt-8 mb-8" />

          {/* Three operational metrics: mono micro-labels with signal squares */}
          <div className="space-y-3 mb-12">
            {/* Metric 1: INGEST */}
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-signal shrink-0" />
              <span className="micro-label text-paper/80">INGEST · 12S MEDIAN</span>
            </div>
            {/* Metric 2: PARSE */}
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-signal shrink-0" />
              <span className="micro-label text-paper/80">PARSE · 22S MEDIAN</span>
            </div>
            {/* Metric 3: SEND */}
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-signal shrink-0" />
              <span className="micro-label text-paper/80">SEND · 4M 47S MEDIAN</span>
            </div>
          </div>

          {/* Benchmark footnote: lighter mono micro-label */}
          <p className="micro-label text-paper/40">
            BENCHMARK · Q2 2026 · N = 47 TEAMS
          </p>
        </div>
      </section>
    </main>
  )
}
