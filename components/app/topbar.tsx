"use client";

// =============================================
// App Top Bar — Mission Control header
// =============================================
// Solid paper surface with a single hairline rule beneath. NO glassmorphism,
// no backdrop blur — those are the AI-tell-tale fingerprints. The wordmark
// pairs a serif "Vorticura" with a tiny mono superscript (NASA mission-patch
// gesture). Search, Comms Hub, notifications and theme toggle live to the
// right; everything aligned to the same baseline rule.

import { useState, useEffect } from "react";
import { Search, Bell, ChevronDown, Moon, Sun, Menu } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { useSidebar } from "@/components/app/sidebar-provider";
import { CommsHubTrigger, CommsHubDropdown } from "@/components/app/comms-hub";

// =============================================
// Top Bar Component
// =============================================

/**
 * DashboardTopBar — Mission Control header bar.
 * Solid --paper background, 1px --rule bottom border, no blur.
 * Wordmark is serif + mono superscript, theme toggle + Comms Hub on the right.
 */
export function DashboardTopBar() {
  // Hydration-safe theme rendering
  const [mounted, setMounted] = useState(false);
  // Comms Hub dropdown state
  const [commsOpen, setCommsOpen] = useState(false);
  // Theme toggle hook
  const { setTheme, resolvedTheme } = useTheme();
  // Sidebar context for hamburger toggle
  const { toggleSidebar } = useSidebar();

  // Wait for hydration to complete before resolving theme icon
  useEffect(() => {
    setMounted(true);
  }, []);

  // Toggle between light and dark
  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  // Toggle Comms Hub dropdown
  const toggleCommsHub = () => setCommsOpen(!commsOpen);

  return (
    <header className="fixed top-0 left-0 right-0 h-16 border-b border-rule bg-paper z-50">
      <div className="h-full flex items-center justify-between px-6 gap-4">
        {/* Left cluster — hamburger, wordmark, workspace selector */}
        <div className="flex items-center gap-4">
          {/* Hamburger menu — toggles the sidebar rail */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-9 w-9"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Wordmark: instrument logo + serif name + mono superscript */}
          <div className="flex items-baseline gap-2.5">
            {/* Logo aligned to the cap-height of the serif word */}
            <Logo className="w-6 h-6 self-center text-ink" />

            {/* Serif wordmark — display font, tight tracking */}
            <span className="font-display text-ink text-[22px] leading-none tracking-[-0.01em]">
              Vorticura
            </span>

            {/* Mono superscript — NASA mission-patch detail */}
            <span className="hidden md:inline micro-label text-graphite">
              · OPS
            </span>
          </div>

          {/* Workspace selector — divider + mono caps button */}
          <div className="hidden md:flex items-center gap-3 ml-4">
            {/* Vertical hairline divider between identity and workspace */}
            <div className="h-6 w-px bg-rule" aria-hidden="true" />

            {/* Workspace dropdown trigger — mono caps, hairline bottom on hover */}
            <button
              className="flex items-center gap-2 px-3 py-1.5 rounded-sm font-body text-sm text-ink hover:bg-vellum transition-colors"
              aria-haspopup="listbox"
              aria-label="Select workspace"
            >
              <span>Acme Corp Workspace</span>
              <ChevronDown className="h-4 w-4 text-graphite" />
            </button>
          </div>
        </div>

        {/* Right cluster — search, comms, notifications, theme, avatar */}
        <div className="flex items-center gap-3">
          {/* Search — paper-on-paper field with hairline ink/40 border */}
          <div className="relative hidden md:block w-64">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-graphite"
              aria-hidden="true"
            />
            <Input
              placeholder="Search RFQs, suppliers, quotes…"
              className="pl-9 h-9"
              aria-label="Search"
            />
          </div>

          {/* Comms Hub */}
          <div className="relative">
            <CommsHubTrigger
              isOpen={commsOpen}
              onClick={toggleCommsHub}
            />
            <CommsHubDropdown
              isOpen={commsOpen}
              onClose={() => setCommsOpen(false)}
            />
          </div>

          {/* Notifications — bell with a small ember dot for unread */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 relative"
            aria-label="View notifications"
          >
            <Bell className="h-4 w-4" />
            <span
              className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-ember"
              aria-hidden="true"
            />
          </Button>

          {/* Theme toggle — sun in dark mode, moon in light */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9"
            aria-label={
              mounted
                ? resolvedTheme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
                : "Toggle theme"
            }
          >
            {mounted ? (
              resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          {/* User avatar — Azimuth fill (depth color, not indigo cliché) */}
          <div
            className="h-8 w-8 rounded-sm flex items-center justify-center bg-azimuth text-paper font-data text-xs font-medium tracking-wider"
            role="img"
            aria-label="User avatar"
          >
            JD
          </div>
        </div>
      </div>
    </header>
  );
}
