"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"  // Shared logo component

// =============================================
// Navigation Links Configuration
// =============================================
// Array of navigation items with labels and section IDs for smooth scrolling
const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  //{ label: "Pricing", href: "#pricing" },
  { label: "Testimonials", href: "#testimonials" },
]

// =============================================
// Navbar Component
// =============================================
// Sticky navigation bar with scroll-aware styling and mobile menu
export default function Navbar() {
  // Track scroll position for navbar background styling
  const [isScrolled, setIsScrolled] = useState(false)
  // Track mobile menu open/close state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Listen to scroll events to update navbar styling
  useEffect(() => {
    const handleScroll = () => {
      // Add background blur effect after scrolling 10px
      setIsScrolled(window.scrollY > 10)
    }
    window.addEventListener("scroll", handleScroll)
    // Cleanup listener on component unmount
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Handle smooth scroll to section when clicking nav links
  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault()
    // Extract section ID from href (remove # prefix)
    const targetId = href.replace("#", "")
    const element = document.getElementById(targetId)
    if (element) {
      // Smooth scroll to target section with offset for fixed navbar
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
    // Close mobile menu after navigation
    setIsMobileMenuOpen(false)
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-white/80 backdrop-blur-xl border-b border-border/50 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and Brand Name */}
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
            aria-label="QuoteFlow AI Homepage"
          >
            <Logo />
            <span className="text-lg font-bold tracking-tight text-foreground">
              QuoteFlow AI
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex md:items-center md:gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="px-4 py-2 text-sm font-medium text-body transition-colors hover:text-foreground rounded-lg hover:bg-secondary/50"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop Auth Buttons */}
          <div className="hidden md:flex md:items-center md:gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="bg-brand hover:bg-brand-hover">
                Get Started
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center p-2 rounded-lg text-body hover:text-foreground hover:bg-secondary"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {/* Hamburger/Close icon animation */}
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              {isMobileMenuOpen ? (
                // X icon when menu is open
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                // Hamburger icon when menu is closed
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-border/50 bg-white/95 backdrop-blur-xl py-4 space-y-1">
            {/* Mobile Navigation Links */}
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="block px-4 py-2.5 text-base font-medium text-body hover:text-foreground hover:bg-secondary/50 rounded-lg"
              >
                {link.label}
              </a>
            ))}
            {/* Mobile Auth Buttons */}
            <div className="pt-4 px-4 space-y-2 border-t border-border/50 mt-4">
              <Link href="/login" className="block">
                <Button variant="outline" className="w-full">
                  Log in
                </Button>
              </Link>
              <Link href="/signup" className="block">
                <Button className="w-full bg-brand hover:bg-brand-hover">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
