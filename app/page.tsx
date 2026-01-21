// =============================================
// QuoteFlow AI Homepage
// =============================================
// Main landing page that assembles all homepage sections
// Uses Single Page Scroll design pattern for smooth navigation

import {
  Navbar,
  HeroSection,
  FeaturesSection,
  HowItWorksSection,
  PricingSection,
  TestimonialsSection,
  CTASection,
  Footer,
} from "@/components/home"

// =============================================
// Home Page Component
// =============================================
// Public landing page - accessible without authentication
// Displays company information, features, pricing, and CTAs
export default function Home() {
  return (
    <>
      {/* Sticky navigation bar with scroll-to-section links */}
      <Navbar />

      {/* Main content wrapper */}
      <main>
        {/* Hero: Main headline, description, and primary CTAs */}
        <HeroSection />

        {/* Features: Grid showcasing QuoteFlow AI capabilities */}
        <FeaturesSection />

        {/* How It Works: 3-step process visualization */}
        <HowItWorksSection />

        {/* Pricing: Tier comparison cards */}
        <PricingSection />

        {/* Testimonials: Customer reviews and social proof */}
        <TestimonialsSection />

        {/* CTA: Final call-to-action with gradient background */}
        <CTASection />
      </main>

      {/* Footer: Navigation links, social icons, copyright */}
      <Footer />
    </>
  )
}
