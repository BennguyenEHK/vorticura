import type { Metadata } from "next"
import Link from "next/link"

// =============================================
// Auth Layout Metadata
// =============================================
export const metadata: Metadata = {
  title: "Authentication | QuoteFlow AI",
  description: "Sign in or create an account to access QuoteFlow AI",
}

// =============================================
// Auth Layout Component
// =============================================
// Split-screen authentication layout:
// - Desktop: 40% left form panel, 60% right brand panel
// - Mobile: Single column with form only
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <main className="flex min-h-screen w-full">
      {/* ===== Left Panel: Form Area (40% on desktop) ===== */}
      <section className="flex w-full flex-col justify-center px-6 py-12 lg:w-2/5 lg:px-12">
        {/* Logo and Brand Name */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 transition-opacity hover:opacity-80"
            aria-label="Go to QuoteFlow AI homepage"
          >
            {/* Logo SVG */}
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect width="32" height="32" rx="8" fill="#0f172a" />
              <path
                d="M8 12L16 8L24 12L16 16L8 12Z"
                fill="#38bdf8"
              />
              <path
                d="M8 16L16 20L24 16"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8 20L16 24L24 20"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xl font-bold text-foreground">QuoteFlow AI</span>
          </Link>
        </div>

        {/* Form Content (children from page.tsx) */}
        <div className="flex flex-1 items-center justify-center">
          {children}
        </div>

        {/* Footer (using design token) */}
        <footer className="mt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} QuoteFlow AI. All rights reserved.</p>
        </footer>
      </section>

      {/* ===== Right Panel: Brand Area (60% on desktop, hidden on mobile) ===== */}
      <section
        className="relative hidden lg:flex lg:w-3/5 lg:flex-col lg:items-center lg:justify-center lg:bg-gradient-to-br lg:from-slate-900 lg:via-slate-800 lg:to-slate-900"
        aria-hidden="true" // Decorative panel, not essential for accessibility
      >
        {/* Decorative Background Pattern */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -left-1/4 -top-1/4 h-1/2 w-1/2 rounded-full bg-brand/10 blur-3xl" />
          <div className="absolute -bottom-1/4 -right-1/4 h-1/2 w-1/2 rounded-full bg-chart-2/10 blur-3xl" />
        </div>

        {/* Brand Content */}
        <div className="relative z-10 max-w-lg px-8 text-center">
          {/* Large Logo for Brand Panel */}
          <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
            <svg
              width="48"
              height="48"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M8 12L16 8L24 12L16 16L8 12Z"
                fill="#38bdf8"
              />
              <path
                d="M8 16L16 20L24 16"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8 20L16 24L24 20"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Headline */}
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white">
            Streamline Your Quotations
          </h1>

          {/* Tagline (using design token for text on dark bg) */}
          <p className="mb-8 text-lg text-on-dark">
            AI-powered quotation management that helps you create, track, and close deals faster than ever.
          </p>

          {/* Feature Highlights */}
          <div className="space-y-4 text-left">
            {/* Feature 1 */}
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/20">
                <svg
                  className="h-3 w-3 text-brand-light"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <p className="text-sm text-on-dark">
                Generate professional quotations in seconds with AI assistance
              </p>
            </div>

            {/* Feature 2 */}
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/20">
                <svg
                  className="h-3 w-3 text-brand-light"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <p className="text-sm text-on-dark">
                Track workflow progress and collaborate with your team
              </p>
            </div>

            {/* Feature 3 */}
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/20">
                <svg
                  className="h-3 w-3 text-brand-light"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <p className="text-sm text-on-dark">
                Secure workspace isolation for multi-tenant environments
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
