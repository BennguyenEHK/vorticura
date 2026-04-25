"use client"

import Link from "next/link"
import { Logo } from "@/components/ui/logo"

// =============================================
// Vorticura Instrument Footer
// =============================================
// Three columns (PRODUCT / COMPANY / TRUST) with mono micro-label headers.
// Brand block (left, col-span-2) with Logo + serif "Vorticura" wordmark + one-liner.
// Mono version string bottom-right: "VORTICURA OPS · v0.1 · BUILT IN HCMC".
// No social icons, no complex layouts, no brand description — instrument-grade simplicity.

const footerSections = {
  product: {
    title: "PRODUCT",
    links: [
      { label: "Workflow", href: "#workflow" },
      { label: "Metrics", href: "#metrics" },
      { label: "Customers", href: "#customers" },
      { label: "Pricing", href: "#pricing" },
      { label: "Changelog", href: "#" },
    ],
  },
  company: {
    title: "COMPANY",
    links: [
      { label: "About", href: "#" },
      { label: "Operators", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Press", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  trust: {
    title: "TRUST",
    links: [
      { label: "Security", href: "#" },
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "DPA", href: "#" },
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
    <footer className="bg-paper border-t border-rule-strong">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 py-16 lg:py-20">
        {/* ===== Main content grid ===== */}
        {/* 4-column grid on lg+: brand-block (col-span-2) + 3 link columns (col-span-1 each) = 5 total */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-8 mb-12 lg:mb-16">
          {/* Brand block (col-span-2): Logo + serif wordmark + one-liner */}
          <div className="lg:col-span-2">
            {/* Logo + "Vorticura" wordmark */}
            <div className="flex items-center gap-3 mb-6">
              <Logo className="w-8 h-8 text-ink" />
              <h2
                className="font-display text-ink tracking-tight"
                style={{
                  fontSize: "22px",
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                }}
              >
                Vorticura
              </h2>
            </div>

            {/* One-liner description */}
            <p className="font-body text-graphite text-sm max-w-xs leading-relaxed">
              Mission control for procurement teams. Faster bids, better suppliers, calmer Mondays.
            </p>
          </div>

          {/* PRODUCT column */}
          <div>
            <h3 className="micro-label text-graphite mb-5">
              {footerSections.product.title}
            </h3>
            <ul className="space-y-3">
              {footerSections.product.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    onClick={(e) => handleAnchorClick(e, link.href)}
                    className="font-body text-sm text-ink hover:text-azimuth transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* COMPANY column */}
          <div>
            <h3 className="micro-label text-graphite mb-5">
              {footerSections.company.title}
            </h3>
            <ul className="space-y-3">
              {footerSections.company.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    onClick={(e) => handleAnchorClick(e, link.href)}
                    className="font-body text-sm text-ink hover:text-azimuth transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* TRUST column */}
          <div>
            <h3 className="micro-label text-graphite mb-5">
              {footerSections.trust.title}
            </h3>
            <ul className="space-y-3">
              {footerSections.trust.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    onClick={(e) => handleAnchorClick(e, link.href)}
                    className="font-body text-sm text-ink hover:text-azimuth transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ===== Bottom strip ===== */}
        {/* Separated by border-t, with copyright (left) and version string (right) */}
        <div className="border-t border-rule pt-8 mt-12">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: copyright */}
            <p className="micro-label text-graphite">
              © 2026 VORTICURA — ALL RIGHTS RESERVED
            </p>

            {/* Right: version string */}
            <p className="micro-label text-graphite">
              VORTICURA OPS · v0.1 · BUILT IN HCMC
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
