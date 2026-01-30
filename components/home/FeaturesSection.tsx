"use client"

import { Card, CardContent } from "@/components/ui/card"

// =============================================
// Feature Data Configuration
// =============================================
// Array of features with icons, titles, and descriptions
const features = [
  {
    title: "AI Quotation Generation",
    description:
      "Generate professional quotations in seconds using AI. Automatically extract pricing variables and calculate complex formulas.",
    icon: (
      // Document with sparkle icon representing AI document generation
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    gradient: "from-sky-500 to-sky-600",
  },
  {
    title: "RFQ Analysis",
    description:
      "Automatically analyze incoming RFQs to extract key requirements, specifications, and deadlines with AI-powered parsing.",
    icon: (
      // Magnifying glass with document icon for analysis
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    gradient: "from-indigo-500 to-indigo-600",
  },
  {
    title: "Workflow Tracking",
    description:
      "Track your quotation workflow from draft to approval. Real-time status updates and collaborative team features.",
    icon: (
      // Workflow/process icon
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
    gradient: "from-emerald-500 to-emerald-600",
  },
  {
    title: "Supplier Search",
    description:
      "Find the best suppliers with AI-powered search. Compare pricing, lead times, and reliability scores instantly.",
    icon: (
      // Globe/search icon for supplier discovery
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    gradient: "from-amber-500 to-amber-600",
  },
  {
    title: "Document Management",
    description:
      "Centralized file storage for all your quotation documents. Easy upload, organization, and version control.",
    icon: (
      // Folder icon for document management
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    ),
    gradient: "from-rose-500 to-rose-600",
  },
  {
    title: "Team Collaboration",
    description:
      "Multi-tenant workspace isolation ensures your team's data stays secure. Role-based access control included.",
    icon: (
      // Users group icon for collaboration
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
    gradient: "from-violet-500 to-violet-600",
  },
]

// =============================================
// FeaturesSection Component
// =============================================
// Displays a grid of feature cards showcasing QuoteFlow AI capabilities
export default function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative py-24 lg:py-32 bg-muted scroll-mt-16"
    >
      {/* ===== Section Header ===== */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          {/* Section badge */}
          <span className="inline-block text-sm font-semibold text-brand-hover tracking-wide uppercase mb-4">
            Features
          </span>
          {/* Section title */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
            Everything you need to
            <span className="block text-brand">close deals faster</span>
          </h2>
          {/* Section description */}
          <p className="mt-6 text-lg text-body leading-relaxed">
            QuoteFlow AI combines powerful AI capabilities with intuitive design
            to streamline your entire quotation workflow from start to finish.
          </p>
        </div>

        {/* ===== Features Grid ===== */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <Card
              key={feature.title}
              className="group relative overflow-hidden border-border/50 bg-card hover:shadow-lg hover:shadow-border/50 transition-all duration-300 hover:-translate-y-1 animate-fadeIn"
              style={{
                // Staggered animation delay for visual interest
                animationDelay: `${index * 100}ms`,
              }}
            >
              <CardContent className="p-6 lg:p-8">
                {/* Feature Icon with gradient background */}
                {/* Icon uses white text for contrast against gradient, shadow uses foreground token */}
                <div
                  className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} text-on-dark mb-5 shadow-lg shadow-foreground/5`}
                >
                  {feature.icon}
                </div>

                {/* Feature Title */}
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {feature.title}
                </h3>

                {/* Feature Description */}
                <p className="text-body leading-relaxed">
                  {feature.description}
                </p>

                {/* Hover accent line at bottom */}
                <div
                  className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${feature.gradient} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left`}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
