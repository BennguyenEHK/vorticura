"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

// =============================================
// Pricing Tiers Configuration
// =============================================
// Array of pricing plans with features and pricing info
const pricingTiers = [
  {
    name: "Starter",
    description: "Perfect for small teams getting started with AI quotations.",
    price: "$49",
    period: "/month",
    features: [
      "Up to 50 quotations/month",
      "Basic AI analysis",
      "Email support",
      "1 team member",
      "Standard templates",
    ],
    cta: "Start Free Trial",
    highlighted: false,
  },
  {
    name: "Professional",
    description: "For growing businesses that need advanced features.",
    price: "$149",
    period: "/month",
    features: [
      "Unlimited quotations",
      "Advanced AI with RFQ analysis",
      "Priority support",
      "Up to 10 team members",
      "Custom templates",
      "Workflow automation",
      "API access",
    ],
    cta: "Start Free Trial",
    highlighted: true, // Most popular plan
    badge: "Most Popular",
  },
  {
    name: "Enterprise",
    description: "Custom solutions for large organizations.",
    price: "Custom",
    period: "",
    features: [
      "Everything in Professional",
      "Unlimited team members",
      "Dedicated account manager",
      "Custom integrations",
      "SLA guarantee",
      "On-premise deployment",
      "Advanced security",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
]

// =============================================
// Checkmark Icon Component
// =============================================
const CheckIcon = () => (
  <svg className="w-5 h-5 text-sky-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path
      fillRule="evenodd"
      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
      clipRule="evenodd"
    />
  </svg>
)

// =============================================
// PricingSection Component
// =============================================
// Displays pricing tiers with features comparison
export default function PricingSection() {
  return (
    <section
      id="pricing"
      className="relative py-24 lg:py-32 bg-slate-50 scroll-mt-16"
    >
      {/* ===== Background Pattern ===== */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Subtle dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #0f172a 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ===== Section Header ===== */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          {/* Section badge */}
          <span className="inline-block text-sm font-semibold text-sky-600 tracking-wide uppercase mb-4">
            Pricing
          </span>
          {/* Section title */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">
            Simple, transparent pricing
          </h2>
          {/* Section description */}
          <p className="mt-6 text-lg text-slate-600 leading-relaxed">
            Choose the plan that best fits your needs. All plans include a 14-day free trial.
            No credit card required to start.
          </p>
        </div>

        {/* ===== Pricing Cards Grid ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-6">
          {pricingTiers.map((tier) => (
            <Card
              key={tier.name}
              className={`relative flex flex-col ${
                tier.highlighted
                  ? "border-sky-500 border-2 shadow-xl shadow-sky-500/10 scale-105 z-10"
                  : "border-slate-200"
              }`}
            >
              {/* Popular badge for highlighted tier */}
              {tier.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center px-4 py-1 rounded-full text-sm font-semibold bg-sky-500 text-white shadow-lg">
                    {tier.badge}
                  </span>
                </div>
              )}

              <CardHeader className={`pb-8 ${tier.highlighted ? "pt-8" : ""}`}>
                {/* Tier name */}
                <CardTitle className="text-xl font-semibold text-slate-900">
                  {tier.name}
                </CardTitle>
                {/* Tier description */}
                <CardDescription className="mt-2">
                  {tier.description}
                </CardDescription>
                {/* Price display */}
                <div className="mt-6">
                  <span className="text-4xl font-bold text-slate-900">
                    {tier.price}
                  </span>
                  <span className="text-slate-500">{tier.period}</span>
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col">
                {/* Features list */}
                <ul className="space-y-4 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <CheckIcon />
                      <span className="text-slate-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <div className="mt-8">
                  <Link href={tier.name === "Enterprise" ? "#contact" : "/signup"}>
                    <Button
                      className={`w-full ${
                        tier.highlighted
                          ? "bg-sky-500 hover:bg-sky-600"
                          : ""
                      }`}
                      variant={tier.highlighted ? "default" : "outline"}
                      size="lg"
                    >
                      {tier.cta}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ===== Money-back Guarantee ===== */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-2 text-slate-600">
            {/* Shield icon */}
            <svg className="w-5 h-5 text-sky-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                clipRule="evenodd"
              />
            </svg>
            <span>30-day money-back guarantee. Cancel anytime.</span>
          </div>
        </div>
      </div>
    </section>
  )
}
