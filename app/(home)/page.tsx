// =============================================
// Vorticura Homepage
// =============================================
// Main landing page that assembles all homepage sections
// Mission Control for Procurement — single-page scroll design

import {
  Navbar,
  HeroSection,
  FeaturesSection,
  HowItWorksSection,
  TestimonialsSection,
  CTASection,
  Footer,
} from "@/components/home"

// =============================================
// Home Page Component
// =============================================
// Public landing page - accessible without authentication
// Vorticura procurement platform overview
export default function Home() {
  return (
    <>
      {/* Sticky navigation bar with scroll-to-section links */}
      <Navbar />

      {/* Main editorial column — paper background, ink foreground (Mission Control tokens) */}
      <main className="bg-paper text-ink">
        {/* Hero: Main headline, description, and primary CTAs */}
        <HeroSection />

        {/* MetricsStrip: Benchmark metrics in ledger format */}
        <FeaturesSection />

        {/* WorkflowNarrative: 4-station scroll-driven pipeline diagram */}
        <HowItWorksSection />

        {/* EditorialQuote: Large blockquote + customer wordmarks */}
        <TestimonialsSection />

        {/* ClosingCTA: Final call-to-action with gradient background */}
        <CTASection />
      </main>

      {/* Footer: Navigation links, social icons, copyright */}
      <Footer />
    </>
  )
}
