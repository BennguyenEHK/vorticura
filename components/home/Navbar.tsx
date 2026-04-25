"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"

// =============================================
// Vorticura Navbar — instrument-grade top bar
// =============================================
// - Solid --paper background (no glassmorphism).
// - 1px --rule bottom border ALWAYS visible; deepens to --rule-strong on scroll.
// - Wordmark: serif "Vorticura" + mono micro superscript "OPS".
// - Nav items: ALL-CAPS mono micro-labels with a 2px hover underline that animates from left.

// Anchor links into the redesigned page sections.
const navLinks = [
  { label: "PRODUCT", href: "#workflow" },        // workflow narrative section
  { label: "METRICS", href: "#metrics" },         // metric strip section
  { label: "CUSTOMERS", href: "#customers" },     // editorial quote section
]

export default function Navbar() {
  // Track scroll position so the bottom rule deepens — single subtle state change.
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { setTheme, resolvedTheme } = useTheme()

  // Toggle dark/light theme.
  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  // Hydration guard for theme-dependent UI.
  useEffect(() => {
    setMounted(true)
  }, [])

  // Update scroll state — single 8px threshold, no continuous interpolation.
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Smooth-scroll handler for in-page section anchors.
  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault()
    const targetId = href.replace("#", "")
    const element = document.getElementById(targetId)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
    setIsMobileMenuOpen(false)
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 bg-paper transition-[border-color] duration-200 border-b ${
        isScrolled ? "border-rule-strong" : "border-rule"
      }`}
    >
      <nav className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="flex h-14 items-center justify-between">
          {/* ===== Wordmark ===== */}
          <Link
            href="/"
            className="flex items-center gap-3 text-ink hover:text-azimuth transition-colors"
            aria-label="Vorticura — home"
          >
            {/* Instrument mark — inherits text color via currentColor */}
            <Logo className="w-7 h-7" />
            {/* Serif wordmark + mono superscript stacked vertically — NASA-patch styling */}
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[1.25rem] tracking-[-0.01em] leading-none">
                Vorticura
              </span>
              <span className="micro-label text-graphite hidden sm:inline">OPS</span>
            </div>
          </Link>

          {/* ===== Desktop nav links ===== */}
          {/* Mono ALL-CAPS micro-labels; hover underline animates in from the left. */}
          <div className="hidden md:flex md:items-center md:gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="micro-label text-graphite hover:text-ink transition-colors relative group py-1"
              >
                {link.label}
                {/* Underline that scales from left on hover — single signature interaction */}
                <span
                  className="absolute left-0 -bottom-0.5 h-px w-full bg-ink origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-200"
                  aria-hidden="true"
                />
              </a>
            ))}
          </div>

          {/* ===== Right cluster: theme + auth ===== */}
          <div className="hidden md:flex md:items-center md:gap-4">
            {/* Theme toggle — small, no chrome */}
            <button
              type="button"
              onClick={toggleTheme}
              className="h-8 w-8 flex items-center justify-center text-graphite hover:text-ink transition-colors"
              aria-label={mounted ? (resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode") : "Toggle theme"}
            >
              {mounted && resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Sign-in: text link, mono micro-label */}
            <Link
              href="/login"
              className="micro-label text-graphite hover:text-ink transition-colors"
            >
              SIGN IN
            </Link>

            {/* Primary CTA: azimuth fill, ink hairline border, sharp 6px corners */}
            <Link href="/signup">
              <Button
                size="sm"
                className="bg-azimuth hover:bg-azimuth-glow text-paper border border-ink rounded-[6px] font-body font-medium shadow-none h-9 px-5"
              >
                Request access
              </Button>
            </Link>
          </div>

          {/* ===== Mobile menu toggle ===== */}
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center p-2 text-graphite hover:text-ink"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              {isMobileMenuOpen ? (
                <path strokeLinecap="square" strokeLinejoin="miter" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="square" strokeLinejoin="miter" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>

        {/* ===== Mobile menu drawer — solid paper, hairline-divided ===== */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-rule bg-paper py-4">
            <div className="space-y-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className="block px-2 py-2.5 micro-label text-graphite hover:text-ink"
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="pt-4 mt-4 px-2 space-y-3 border-t border-rule">
              <button
                type="button"
                onClick={toggleTheme}
                className="w-full flex items-center gap-2 micro-label text-graphite hover:text-ink py-2"
              >
                {mounted && resolvedTheme === "dark" ? (
                  <>
                    <Sun className="h-4 w-4" />
                    LIGHT MODE
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4" />
                    DARK MODE
                  </>
                )}
              </button>
              <Link
                href="/login"
                className="block micro-label text-graphite hover:text-ink py-2"
              >
                SIGN IN
              </Link>
              <Link href="/signup" className="block">
                <Button
                  className="w-full bg-azimuth hover:bg-azimuth-glow text-paper border border-ink rounded-[6px] font-body font-medium shadow-none h-10"
                >
                  Request access
                </Button>
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
