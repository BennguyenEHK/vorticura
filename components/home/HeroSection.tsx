"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

// =============================================
// HeroSection Component
// =============================================
// Main landing hero section with headline, description, and CTA buttons
// Features decorative gradient background and animated elements
export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      {/* ===== Decorative Background Elements ===== */}
      {/* Gradient mesh background for depth and visual interest */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Top-left gradient orb: sky blue with blur effect */}
        <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-hero-orb-1 rounded-full blur-3xl" />
        {/* Bottom-right gradient orb: indigo with blur effect */}
        <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-hero-orb-2 rounded-full blur-3xl" />
        {/* Center accent orb: subtle sky tint */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-1/2 bg-brand-muted/50 rounded-full blur-3xl" />

        {/* Geometric grid pattern overlay for texture */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f172a' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* ===== Main Hero Content ===== */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-32 lg:py-40">
        <div className="text-center">
          {/* Badge/Tag above headline */}
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-muted border border-brand/20 px-4 py-1.5 text-sm font-medium text-brand-dark mb-8">
            {/* Sparkle icon */}
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L10 6.477l-3.763 1.105 1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
            </svg>
            <span>AI-Powered Quotation Management</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight text-foreground leading-[1.1]">
            Create Professional
            <span className="block mt-2 bg-gradient-to-r from-sky-500 via-sky-400 to-indigo-500 bg-clip-text text-transparent">
              Quotations in Seconds
            </span>
          </h1>

          {/* Subheadline/Description */}
          <p className="mt-6 mx-auto max-w-2xl text-lg sm:text-xl text-body leading-relaxed">
            Streamline your sales workflow with AI-powered quotation generation.
            From RFQ analysis to professional documents, QuoteFlow AI handles it all
            so you can close deals faster.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            {/* Primary CTA: Get Started */}
            <Link href="/signup">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary-hover text-white px-8 py-6 text-base font-medium shadow-lg shadow-slate-900/10 hover:shadow-xl hover:shadow-slate-900/20 transition-all"
              >
                Start Free Trial
                {/* Arrow icon */}
                <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Button>
            </Link>
            {/* Secondary CTA: Watch Demo */}
            <Button
              variant="outline"
              size="lg"
              className="px-8 py-6 text-base font-medium border-border hover:bg-muted"
              onClick={() => {
                // Scroll to how-it-works section for demo
                const element = document.getElementById("how-it-works")
                element?.scrollIntoView({ behavior: "smooth" })
              }}
            >
              {/* Play icon */}
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
              See How It Works
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="mt-16 pt-8 border-t border-border/50">
            <p className="text-sm text-muted-foreground mb-6">Trusted by innovative sales teams worldwide</p>
            {/* Company logos placeholder - subtle grayscale treatment */}
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-60 grayscale">
              {/* Placeholder company names as text - in production, replace with actual logos */}
              {["TechCorp", "GlobalSales", "InnovateCo", "ScaleUp", "NextGen"].map((company) => (
                <span
                  key={company}
                  className="text-lg font-semibold text-placeholder tracking-tight"
                >
                  {company}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom fade gradient for section transition */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent"
        aria-hidden="true"
      />
    </section>
  )
}
