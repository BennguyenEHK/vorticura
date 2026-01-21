"use client"

import { Card, CardContent } from "@/components/ui/card"

// =============================================
// Testimonial Data Configuration
// =============================================
// Array of customer testimonials with quotes and author info
const testimonials = [
  {
    quote:
      "QuoteFlow AI has completely transformed how we handle quotations. What used to take hours now takes minutes. Our sales team productivity has increased by 40%.",
    author: "Sarah Chen",
    role: "VP of Sales",
    company: "TechVentures Inc.",
    avatar: "SC",
  },
  {
    quote:
      "The AI-powered RFQ analysis is a game-changer. It catches details we might miss and ensures our quotations are always accurate and professional.",
    author: "Michael Rodriguez",
    role: "Operations Director",
    company: "GlobalSupply Co.",
    avatar: "MR",
  },
  {
    quote:
      "We've reduced our quotation turnaround time from 2 days to 2 hours. Our customers love the quick response, and we're closing more deals than ever.",
    author: "Emily Watson",
    role: "Sales Manager",
    company: "InnoTrade Ltd.",
    avatar: "EW",
  },
  {
    quote:
      "The workflow tracking feature keeps our entire team aligned. No more lost quotations or missed follow-ups. It's like having an extra team member.",
    author: "David Kim",
    role: "Founder & CEO",
    company: "ScaleUp Solutions",
    avatar: "DK",
  },
  {
    quote:
      "Implementation was seamless, and the support team is incredible. QuoteFlow AI paid for itself within the first month through time savings alone.",
    author: "Amanda Foster",
    role: "Head of Procurement",
    company: "NextGen Industries",
    avatar: "AF",
  },
  {
    quote:
      "The supplier search feature has helped us find better vendors and negotiate better prices. Our profit margins have improved by 15% since we started using QuoteFlow.",
    author: "James Mitchell",
    role: "Purchasing Manager",
    company: "Premier Manufacturing",
    avatar: "JM",
  },
]

// =============================================
// Star Rating Component
// =============================================
// Displays 5 filled stars for testimonial ratings
const StarRating = () => (
  <div className="flex gap-0.5">
    {[...Array(5)].map((_, i) => (
      <svg
        key={i}
        className="w-4 h-4 text-amber-400"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ))}
  </div>
)

// =============================================
// TestimonialsSection Component
// =============================================
// Displays customer testimonials in a masonry-style grid
export default function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      className="relative py-24 lg:py-32 bg-white scroll-mt-16 overflow-hidden"
    >
      {/* ===== Background Decorative Elements ===== */}
      <div className="absolute inset-0" aria-hidden="true">
        {/* Quote decorative elements */}
        <div className="absolute top-12 left-12 text-slate-100 opacity-50">
          <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
        </div>
        <div className="absolute bottom-12 right-12 text-slate-100 opacity-50 rotate-180">
          <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
        </div>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ===== Section Header ===== */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          {/* Section badge */}
          <span className="inline-block text-sm font-semibold text-sky-600 tracking-wide uppercase mb-4">
            Testimonials
          </span>
          {/* Section title */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">
            Loved by sales teams
            <span className="block text-sky-500">around the world</span>
          </h2>
          {/* Section description */}
          <p className="mt-6 text-lg text-slate-600 leading-relaxed">
            See what our customers have to say about how QuoteFlow AI has transformed their quotation workflow.
          </p>
        </div>

        {/* ===== Testimonials Grid ===== */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <Card
              key={testimonial.author}
              className="border-slate-200/50 bg-white hover:shadow-lg transition-shadow duration-300"
              style={{
                // Staggered animation delay
                animationDelay: `${index * 100}ms`,
              }}
            >
              <CardContent className="p-6">
                {/* Star rating */}
                <StarRating />

                {/* Quote text */}
                <blockquote className="mt-4 text-slate-600 leading-relaxed">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>

                {/* Author info */}
                <div className="mt-6 flex items-center gap-4">
                  {/* Avatar with initials */}
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 text-white font-medium text-sm">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">
                      {testimonial.author}
                    </div>
                    <div className="text-sm text-slate-500">
                      {testimonial.role}, {testimonial.company}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ===== Social Proof Stats ===== */}
        <div className="mt-16 flex flex-wrap justify-center items-center gap-8 lg:gap-16 text-center">
          {[
            { value: "500+", label: "Companies" },
            { value: "50,000+", label: "Quotations Generated" },
            { value: "4.9/5", label: "Average Rating" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-2xl lg:text-3xl font-bold text-slate-900">
                {stat.value}
              </div>
              <div className="text-sm text-slate-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
