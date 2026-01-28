"use client";

// =============================================
// Dashboard Sidebar Component
// =============================================
// Collapsible navigation sidebar for dashboard and workspace
// Uses SidebarProvider context for shared collapsed state

import {
  LayoutDashboard,
  FileText,
  Mail,
  FileStack,
  FolderOpen,
  Workflow,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useSidebar,
  SIDEBAR_WIDTH_CLASSES,
} from "@/components/app/sidebar-provider";

// =============================================
// Navigation Configuration
// =============================================

// Navigation menu structure with sections and items
const menuSections = [
  {
    title: "Workspace",
    items: [
      { name: "Dashboard", icon: LayoutDashboard, href: "/" },
      { name: "Quotations", icon: FileText, href: "/quotations" },
    ],
  },
  {
    title: "Documents",
    items: [
      { name: "Emails", icon: Mail, href: "/emails" },
      { name: "Templates", icon: FileStack, href: "/templates" },
      { name: "Storage", icon: FolderOpen, href: "/storage" },
    ],
  },
  {
    title: "System",
    items: [
      { name: "Workflow", icon: Workflow, href: "/workflow" },
      { name: "Settings", icon: Settings, href: "/settings" },
    ],
  },
];

// Props interface for sidebar customization
interface SidebarProps {
  className?: string;
}

// =============================================
// Sidebar Component
// =============================================

/**
 * DashboardSidebar - Collapsible navigation sidebar for app
 * Uses context for collapsed state (shared with layout for margin sync)
 * Uses design tokens from globals.css for all styling
 */
export function DashboardSidebar({ className = "" }: SidebarProps) {
  // Get collapsed state and toggle function from context
  const { collapsed, toggleSidebar } = useSidebar();

  // Track active menu item (will be replaced with router pathname)
  // TODO: Replace with usePathname() for actual route matching
  const activeItem = "Dashboard";

  return (
    <aside
      className={`
        fixed left-0 top-16 h-[calc(100vh-64px)]
        border-r border-sidebar-border
        bg-sidebar
        transition-all duration-300
        ${collapsed ? SIDEBAR_WIDTH_CLASSES.collapsed : SIDEBAR_WIDTH_CLASSES.expanded}
        ${className}
      `}
    >
      <div className="flex flex-col h-full">
        {/* Collapse/Expand toggle button */}
        <div className="flex justify-end p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {/* Arrow icon changes direction based on state */}
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation menu sections */}
        <nav className="flex-1 px-3 space-y-6" role="navigation">
          {menuSections.map((section, idx) => (
            <div key={idx}>
              {/* Section title - hidden when collapsed */}
              {!collapsed && (
                <h3 className="px-3 mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h3>
              )}

              {/* Menu items within section */}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeItem === item.name;

                  return (
                    <button
                      key={item.name}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2 rounded-lg
                        transition-all relative group
                        ${
                          isActive
                            ? "text-sidebar-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }
                      `}
                      title={collapsed ? item.name : undefined}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {/* Active indicator bar - brand accent color */}
                      {isActive && (
                        <div
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r bg-brand"
                          style={{
                            boxShadow: "0 0 8px oklch(0.685 0.169 237.323 / 0.3)",
                          }}
                        />
                      )}

                      {/* Icon with glow effect for active state */}
                      <div className="relative">
                        <Icon
                          className={`h-5 w-5 ${isActive ? "relative z-10 text-brand" : ""}`}
                        />
                        {/* Glow effect behind active icon */}
                        {isActive && (
                          <div
                            className="absolute inset-0 blur-md bg-brand-light opacity-20"
                            aria-hidden="true"
                          />
                        )}
                      </div>

                      {/* Item label - hidden when collapsed */}
                      {!collapsed && <span className="text-sm">{item.name}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
