"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

// =============================================
// CTASection Component
// =============================================
// Final call-to-action section with gradient background
// Encourages users to sign up with compelling messaging
export default function CTASection() {
  return (
    <section className="relative py-24 lg:py-32 overflow-hidden">
      {/* ===== Gradient Background ===== */}
      {/* Dark gradient using primary/foreground tokens for theme consistency */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary-hover to-primary" />

      {/* ===== Decorative Background Elements ===== */}
      {/* Glowing orbs using brand color tokens */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Top-left glow - brand color with opacity */}
        <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-brand/10 rounded-full blur-3xl" />
        {/* Bottom-right glow - hero orb token */}
        <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-hero-orb-2 rounded-full blur-3xl" />
        {/* Center accent - brand with lower opacity */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-1/2 bg-brand/5 rounded-full blur-3xl" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* ===== CTA Content ===== */}
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          {/* Headline - uses on-dark token for white text on dark bg */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-on-dark leading-tight">
            Ready to transform your
            {/* Gradient text uses brand-light token colors */}
            <span className="block mt-2 bg-gradient-to-r from-brand-light to-brand-muted bg-clip-text text-transparent">
              quotation workflow?
            </span>
          </h2>

          {/* Description */}
          <p className="mt-6 text-lg text-on-dark leading-relaxed">
            Join hundreds of companies already using QuoteFlow AI to create professional
            quotations faster, close more deals, and grow their business.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            {/* Primary CTA - uses brand-foreground for text on brand bg */}
            <Button
              asChild
              size="lg"
              className="bg-brand hover:bg-brand-hover text-brand-foreground px-8 py-6 text-base font-medium shadow-lg shadow-brand/25 hover:shadow-xl hover:shadow-brand/30 transition-all"
            >
              <Link href="/signup">
                Start Free Trial
                <svg
                  className="w-4 h-4 ml-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                  />
                </svg>
              </Link>
            </Button>
            {/* Secondary CTA - uses on-dark token for text on dark bg */}
            <Button
              asChild
              variant="outline"
              size="lg"
              className="px-8 py-6 text-base font-medium border-border text-on-dark hover:bg-primary-hover hover:text-on-dark"
            >
              <Link href="#pricing">
                View Pricing
              </Link>
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-placeholder">
            <div className="flex items-center gap-2">
              {/* Checkmark icon */}
              <svg className="w-4 h-4 text-brand-light" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>14-day free trial</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-light" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-light" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Cancel anytime</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
