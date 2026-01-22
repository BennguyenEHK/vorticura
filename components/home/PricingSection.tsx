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
  <svg className="w-5 h-5 text-brand shrink-0" fill="currentColor" viewBox="0 0 20 20">
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
      className="relative py-24 lg:py-32 bg-muted scroll-mt-16"
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
          <span className="inline-block text-sm font-semibold text-brand-hover tracking-wide uppercase mb-4">
            Pricing
          </span>
          {/* Section title */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
            Simple, transparent pricing
          </h2>
          {/* Section description */}
          <p className="mt-6 text-lg text-body leading-relaxed">
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
                  ? "border-brand border-2 shadow-xl shadow-brand/10 scale-105 z-10"
                  : "border-border"
              }`}
            >
              {/* Popular badge for highlighted tier */}
              {tier.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center px-4 py-1 rounded-full text-sm font-semibold bg-brand text-white shadow-lg">
                    {tier.badge}
                  </span>
                </div>
              )}

              <CardHeader className={`pb-8 ${tier.highlighted ? "pt-8" : ""}`}>
                {/* Tier name */}
                <CardTitle className="text-xl font-semibold text-foreground">
                  {tier.name}
                </CardTitle>
                {/* Tier description */}
                <CardDescription className="mt-2">
                  {tier.description}
                </CardDescription>
                {/* Price display */}
                <div className="mt-6">
                  <span className="text-4xl font-bold text-foreground">
                    {tier.price}
                  </span>
                  <span className="text-muted-foreground">{tier.period}</span>
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col">
                {/* Features list */}
                <ul className="space-y-4 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <CheckIcon />
                      <span className="text-body">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <div className="mt-8">
                  <Link href={tier.name === "Enterprise" ? "#contact" : "/signup"}>
                    <Button
                      className={`w-full ${
                        tier.highlighted
                          ? "bg-brand hover:bg-brand-hover"
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
          <div className="inline-flex items-center gap-2 text-body">
            {/* Shield icon */}
            <svg className="w-5 h-5 text-brand" fill="currentColor" viewBox="0 0 20 20">
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
