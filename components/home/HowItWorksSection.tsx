"use client"

// =============================================
// Step Data Configuration
// =============================================
// Array of process steps with numbers, titles, and descriptions
const steps = [
  {
    number: "01",
    title: "Upload Your RFQ",
    description:
      "Simply upload your Request for Quotation documents. Our AI automatically extracts requirements, specifications, and deadlines.",
    icon: (
      // Upload cloud icon
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "AI Processes & Calculates",
    description:
      "QuoteFlow AI analyzes the RFQ, searches for suppliers, calculates pricing with 60+ formulas, and generates professional quotations.",
    icon: (
      // CPU/processing icon
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Review & Send",
    description:
      "Review the AI-generated quotation, make any final adjustments, and send professional documents to your clients in one click.",
    icon: (
      // Paper airplane/send icon
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    ),
  },
]

// =============================================
// HowItWorksSection Component
// =============================================
// Displays a 3-step process visualization showing how QuoteFlow AI works
export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="relative py-24 lg:py-32 bg-background scroll-mt-16 overflow-hidden"
    >
      {/* ===== Background Decorative Elements ===== */}
      <div className="absolute inset-0" aria-hidden="true">
        {/* Subtle gradient accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1/2 bg-gradient-to-b from-gradient-subtle to-transparent rounded-full blur-3xl opacity-60" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ===== Section Header ===== */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          {/* Section badge */}
          <span className="inline-block text-sm font-semibold text-brand-hover tracking-wide uppercase mb-4">
            How It Works
          </span>
          {/* Section title */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
            From RFQ to quotation
            <span className="block text-brand">in three simple steps</span>
          </h2>
          {/* Section description */}
          <p className="mt-6 text-lg text-body leading-relaxed">
            QuoteFlow AI automates the tedious parts of quotation creation so you
            can focus on what matters most: closing deals and growing your business.
          </p>
        </div>

        {/* ===== Steps Timeline ===== */}
        <div className="relative">
          {/* Connecting line between steps (desktop only) */}
          <div
            className="hidden lg:block absolute top-24 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gradient-line to-transparent"
            aria-hidden="true"
          />

          {/* Steps grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-8">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className="relative flex flex-col items-center text-center"
              >
                {/* Step Number Circle */}
                <div className="relative mb-8">
                  {/* Outer glow ring */}
                  <div className="absolute inset-0 bg-brand/20 rounded-full blur-xl scale-150" />
                  {/* Main circle with icon */}
                  <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-icon-circle-start to-icon-circle-end text-primary-foreground shadow-xl shadow-foreground/20">
                    {step.icon}
                  </div>
                  {/* Step number badge */}
                  <div className="absolute -top-2 -right-2 flex items-center justify-center w-8 h-8 rounded-full bg-brand text-white text-sm font-bold shadow-lg">
                    {step.number.replace("0", "")}
                  </div>
                </div>

                {/* Step Content */}
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {step.title}
                </h3>
                <p className="text-body leading-relaxed max-w-sm">
                  {step.description}
                </p>

                {/* Arrow connector for mobile (between steps) */}
                {index < steps.length - 1 && (
                  <div className="lg:hidden flex justify-center my-8">
                    <svg
                      className="w-6 h-6 text-on-dark"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ===== Stats Row ===== */}
        <div className="mt-24 grid grid-cols-2 lg:grid-cols-4 gap-8 py-12 border-t border-b border-border">
          {[
            { value: "90%", label: "Time Saved" },
            { value: "60+", label: "Pricing Formulas" },
            { value: "99.9%", label: "Accuracy Rate" },
            { value: "24/7", label: "AI Availability" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl lg:text-4xl font-bold text-foreground">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
