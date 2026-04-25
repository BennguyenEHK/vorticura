"use client"

import Link from "next/link"

// =============================================
// Vorticura Instrument Footer
// =============================================
// Three columns (PRODUCT / COMPANY / TRUST) with mono micro-label headers.
// Serif "Vorticura" wordmark bottom-left.
// Mono version string bottom-right: "VORTICURA OPS · v0.1 · BUILT IN HCMC".
// No social icons, no complex layouts, no brand description — instrument-grade simplicity.

const footerSections = {
  product: {
    title: "PRODUCT",
    links: [
      { label: "Features", href: "#features" },
      { label: "How It Works", href: "#workflow" },
      { label: "Metrics", href: "#metrics" },
      { label: "Customers", href: "#customers" },
    ],
  },
  company: {
    title: "COMPANY",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  trust: {
    title: "TRUST",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
      { label: "Security", href: "#" },
      { label: "Status", href: "#" },
    ],
  },
}

export default function Footer() {
  // Handle smooth scroll for anchor links
  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith("#") && href.length > 1) {
      e.preventDefault()
      const targetId = href.replace("#", "")
      const element = document.getElementById(targetId)
      element?.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <footer className="bg-paper border-t border-rule">
      {/* ===== Main footer content ===== */}
      <div className="mx-auto max-w-7xl px-6 lg:px-10 py-16 lg:py-20">
        {/* Three-column grid: PRODUCT / COMPANY / TRUST */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16 mb-16">
          {/* Product column */}
          <div>
            <h3 className="micro-label text-graphite mb-6">
              {footerSections.product.title}
            </h3>
            <ul className="space-y-3">
              {footerSections.product.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    onClick={(e) => handleAnchorClick(e, link.href)}
                    className="text-sm font-body text-graphite hover:text-ink transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company column */}
          <div>
            <h3 className="micro-label text-graphite mb-6">
              {footerSections.company.title}
            </h3>
            <ul className="space-y-3">
              {footerSections.company.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm font-body text-graphite hover:text-ink transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Trust column */}
          <div>
            <h3 className="micro-label text-graphite mb-6">
              {footerSections.trust.title}
            </h3>
            <ul className="space-y-3">
              {footerSections.trust.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm font-body text-graphite hover:text-ink transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ===== Bottom bar: wordmark + version string ===== */}
        <div className="border-t border-rule pt-12 lg:pt-16 flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
          {/* Serif "Vorticura" wordmark bottom-left */}
          <Link href="/" className="font-display text-[1.25rem] tracking-[-0.01em] leading-none text-ink hover:text-azimuth transition-colors">
            Vorticura
          </Link>

          {/* Mono version string bottom-right */}
          <p className="micro-label text-graphite">
            VORTICURA OPS · v0.1 · BUILT IN HCMC
          </p>
        </div>
      </div>
    </footer>
  )
}
