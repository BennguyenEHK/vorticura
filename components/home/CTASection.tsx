"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

// =============================================
// Vorticura ClosingCTA Section
// =============================================
// Final call-to-action for the "Mission Control for Procurement" aesthetic.
// Minimal, left-aligned: one serif sentence + one button + support footer.
// Uses ONLY Mission Control tokens (--ink, --paper, --graphite, --azimuth, --rule).
// No gradient background, no orbs, no grid pattern, no second button.

export default function CTASection() {
  return (
    // Section: solid --paper background, left-aligned content, vertical padding.
    <section className="relative py-32 lg:py-40 bg-paper overflow-hidden">
      {/* Container: max-width for readability, left-aligned with standard padding */}
      <div className="mx-auto max-w-5xl px-6 lg:px-10">
        {/* Mono overline — "CTA · 03" identifying this as the third major section */}
        <div className="mb-8">
          <span className="micro-label text-graphite">CTA · 03</span>
        </div>

        {/* Serif display headline — one powerful sentence, left-aligned */}
        <h2
          className="font-display text-ink font-normal text-left"
          style={{
            fontSize: "clamp(2.5rem, 5vw, 4rem)", // ~40px mobile to 64px lg
            lineHeight: "1.0",
            letterSpacing: "-0.015em",
          }}
        >
          Ready to move at orbital speed?
        </h2>

        {/* Primary button — azimuth fill, ink hairline border, 6px radius */}
        <div className="mt-8">
          <Link href="/signup">
            <Button className="bg-azimuth hover:bg-azimuth-glow text-paper border border-ink rounded-[6px] font-body font-medium shadow-none h-12 px-7">
              Request access
            </Button>
          </Link>
        </div>

        {/* Support footer — hairline rule + mono micro-line with contact info */}
        <div className="mt-20 pt-6 border-t border-rule">
          <p className="micro-label text-graphite">
            SUPPORT · hello@vorticura.io · +84 28 7300 1284 · MON–FRI 09:00–18:00 ICT
          </p>
        </div>
      </div>
    </section>
  )
}
