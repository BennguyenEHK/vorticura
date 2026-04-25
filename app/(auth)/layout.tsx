import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/ui/logo"

// =============================================
// Vorticura Auth Layout — "Mission Control · Station 00"
// =============================================
// Two-column instrument-grade split:
//   Left  (40%) — warm paper form column with wordmark + auth shell + footer
//   Right (60%) — deep ink console with editorial mission narrative + 3 mono benchmarks
// No gradient meshes, no orbs, no glassmorphism. Only Vorticura tokens.
export const metadata: Metadata = {
  title: "Sign in — Vorticura",
  description: "Access your Vorticura mission control.",
}

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <main className="flex min-h-screen w-full">
      {/* ===== LEFT — Form column (paper, 40% on desktop, 100% on mobile) ===== */}
      <section className="flex w-full flex-col justify-between px-6 py-12 lg:w-2/5 lg:px-12 bg-paper">
        {/* Wordmark cluster: instrument mark + serif "Vorticura" + mono "OPS" superscript */}
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-3 text-ink hover:text-azimuth transition-colors"
            aria-label="Vorticura — home"
          >
            <Logo className="w-7 h-7" />
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[1.375rem] tracking-[-0.01em] leading-none">
                Vorticura
              </span>
              {/* Mono superscript label, hidden on small screens to save room */}
              <span className="micro-label text-graphite hidden sm:inline">OPS</span>
            </div>
          </Link>

          {/* Station identifier — frames auth as the first step in the trajectory metaphor */}
          <p className="micro-label text-graphite mt-5">STATION 00 · ACCESS</p>
        </div>

        {/* Form area — AuthForm renders here via {children} */}
        <div className="flex flex-1 items-center justify-center py-10">
          {children}
        </div>

        {/* Footer — single mono micro line, NO QuoteFlow naming, NO marketing copy */}
        <footer>
          <p className="micro-label text-graphite text-center">
            © 2026 VORTICURA · ALL RIGHTS RESERVED
          </p>
        </footer>
      </section>

      {/* ===== RIGHT — Deep ink mission console (60% desktop, hidden on mobile) ===== */}
      {/* Solid bg-ink — the marketing inverse of the paper form column. No gradient, no orbs. */}
      <section
        className="relative hidden lg:flex lg:w-3/5 lg:flex-col lg:justify-center bg-ink"
        aria-hidden="true"
      >
        {/* Faint instrument grid — single 1px hairline ledger pattern, NO orbs / blur */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(90deg, var(--paper) 1px, transparent 1px),
              linear-gradient(0deg, var(--paper) 1px, transparent 1px)
            `,
            backgroundSize: "96px 96px",
          }}
        />

        {/* Editorial content — left-aligned, NOT centered */}
        <div className="relative z-10 max-w-xl px-12 xl:px-20">
          {/* Mono overline — live indicator on the console */}
          <div className="flex items-center gap-3 mb-10">
            <span className="block w-2 h-2 bg-signal" aria-hidden="true" />
            <span className="micro-label text-paper/60">MISSION CONTROL · LIVE</span>
          </div>

          {/* Serif display headline — specific, numeric, on-brand */}
          <h1
            className="font-display text-paper"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 3.5rem)",
              lineHeight: 1.05,
              letterSpacing: "-0.015em",
              fontWeight: 400,
            }}
          >
            You&apos;re four minutes from a sent quote.
          </h1>

          {/* Editorial italic body — picks up the trajectory metaphor */}
          <p className="font-display italic text-paper/70 mt-8 max-w-md text-[1.0625rem] leading-[1.55]">
            Sign in to pick up where you left off — every active RFQ, every supplier
            ranking, every draft, exactly where the last shift left&nbsp;them.
          </p>

          {/* 1px hairline rule + 3 mono benchmark rows — the instrument readout */}
          <div className="mt-12 pt-8 border-t border-paper/15 space-y-3">
            {/* Each row: 6px signal-amber square + mono ALL-CAPS station label.
                NO icons, NO checkmarks — the squares ARE the visual. */}
            <div className="flex items-center gap-3">
              <span className="block w-1.5 h-1.5 bg-signal" aria-hidden="true" />
              <span className="micro-label text-paper/80">INGEST · 12s MEDIAN</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="block w-1.5 h-1.5 bg-signal" aria-hidden="true" />
              <span className="micro-label text-paper/80">PARSE · 22s MEDIAN</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="block w-1.5 h-1.5 bg-signal" aria-hidden="true" />
              <span className="micro-label text-paper/80">SEND · 4m 47s MEDIAN</span>
            </div>
          </div>

          {/* Benchmark footnote — quietest line on the panel */}
          <p className="micro-label text-paper/40 mt-10">
            BENCHMARK · Q2 2026 · n = 47 TEAMS
          </p>
        </div>
      </section>
    </main>
  )
}
