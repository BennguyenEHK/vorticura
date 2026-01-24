"use client";

import { Search, Bell, ChevronDown, Download, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * DashboardTopBar - Fixed header navigation with search, actions, and user info
 * Uses design tokens from globals.css for all styling
 */
export function DashboardTopBar() {
  // Theme toggle hook from next-themes
  const { theme, setTheme } = useTheme();

  // Toggle between light and dark themes
  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 h-16 border-b border-border bg-card z-50"
    >
      <div className="h-full flex items-center justify-between px-6 gap-4">
        {/* Left Section - Logo, workspace, and current document */}
        <div className="flex items-center gap-6">
          {/* Logo and brand name */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-brand">
              <span className="text-brand-foreground font-bold text-sm">Q</span>
            </div>
            <span className="font-semibold text-foreground">QuoteFlow</span>
          </div>

          {/* Workspace selector and document info */}
          <div className="flex items-center gap-3">
            {/* Workspace dropdown trigger */}
            <button
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-label hover:bg-secondary transition-colors"
              aria-haspopup="listbox"
              aria-label="Select workspace"
            >
              <span className="text-sm">Acme Corp Workspace</span>
              <ChevronDown className="h-4 w-4" />
            </button>

            {/* Divider */}
            <div className="h-6 w-px bg-border" aria-hidden="true" />

            {/* Current document with status badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-body">
                Q-2024-001 • Enterprise Package
              </span>
              {/* Status badge using design token colors */}
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-status-draft text-status-draft-foreground">
                Draft
              </span>
            </div>
          </div>
        </div>

        {/* Right Section - Search, actions, and user */}
        <div className="flex items-center gap-3">
          {/* Search input with icon */}
          <div className="relative w-64">
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

          {/* Primary CTA - Generate button with glow effect */}
          <Button
            className="relative overflow-visible bg-brand text-brand-foreground hover:bg-brand-hover"
          >
            <span className="relative z-10">Generate</span>
            {/* Glow effect behind button */}
            <div
              className="absolute inset-0 blur-lg opacity-25 bg-brand-light"
              aria-hidden="true"
            />
          </Button>

          {/* Export button */}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Export document"
          >
            <Download className="h-4 w-4" />
          </Button>

          {/* Theme toggle button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

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
