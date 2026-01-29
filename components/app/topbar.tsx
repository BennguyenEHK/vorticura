"use client";

// =============================================
// App Top Bar Component
// =============================================
// Fixed header navigation with logo, search, Comms Hub, and user info
// Includes theme toggle using next-themes

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
 * DashboardTopBar - Fixed header navigation with search, Comms Hub, and user info
 * Features:
 * - Logo and brand name
 * - Hamburger menu to toggle sidebar
 * - Workspace selector dropdown
 * - Search input
 * - Comms Hub dropdown (email, WhatsApp, SMS)
 * - Notifications with badge
 * - Theme toggle (light/dark)
 * - User avatar
 */
export function DashboardTopBar() {
  // Track if component has mounted (for hydration-safe theme rendering)
  const [mounted, setMounted] = useState(false);
  // Track Comms Hub dropdown state
  const [commsOpen, setCommsOpen] = useState(false);
  // Theme toggle hook from next-themes
  const { setTheme, resolvedTheme } = useTheme();
  // Sidebar context for toggle
  const { toggleSidebar } = useSidebar();

  // Set mounted to true after hydration completes
  useEffect(() => {
    setMounted(true);
  }, []);

  // Toggle between light and dark themes
  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  // Toggle Comms Hub dropdown
  const toggleCommsHub = () => {
    setCommsOpen(!commsOpen);
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 border-b border-border bg-card z-50">
      <div className="h-full flex items-center justify-between px-6 gap-4">
        {/* Left Section - Hamburger, Logo, workspace */}
        <div className="flex items-center gap-4">
          {/* Hamburger menu button - toggles sidebar */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-9 w-9"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Logo and brand name */}
          <div className="flex items-center gap-2.5">
            <Logo className="w-8 h-8" />
            <span className="text-lg font-bold tracking-tight text-foreground">
              QuoteFlow AI
            </span>
          </div>

          {/* Workspace selector */}
          <div className="hidden md:flex items-center gap-3 ml-4">
            {/* Divider */}
            <div className="h-6 w-px bg-border" aria-hidden="true" />

            {/* Workspace dropdown trigger */}
            <button
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-label hover:bg-secondary transition-colors"
              aria-haspopup="listbox"
              aria-label="Select workspace"
            >
              <span className="text-sm">Acme Corp Workspace</span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Right Section - Search, Comms Hub, actions, and user */}
        <div className="flex items-center gap-3">
          {/* Search input with icon - hidden on mobile */}
          <div className="relative hidden md:block w-64">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-placeholder"
              aria-hidden="true"
            />
            <Input
              placeholder="Search..."
              className="pl-9 h-9"
              aria-label="Search"
            />
          </div>

          {/* Comms Hub - Communication channels dropdown */}
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

          {/* Notifications button with indicator */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 relative"
            aria-label="View notifications"
          >
            <Bell className="h-4 w-4" />
            {/* Notification indicator dot */}
            <span
              className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive"
              aria-hidden="true"
            />
          </Button>

          {/* Theme toggle button */}
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
            {/* Show sun icon in dark mode, moon icon in light mode */}
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

          {/* User avatar */}
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center bg-avatar text-avatar-foreground text-sm font-medium"
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
