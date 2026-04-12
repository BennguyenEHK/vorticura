"use client";

// =============================================
// App Sidebar Component
// =============================================
// Collapsible navigation sidebar for dashboard and workspace
// Redesigned with: Dashboard, Workboard, RFQ Queue, Documents, System sections
// Uses SidebarProvider context for shared collapsed state

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Upload,
  Settings,
  GitBranch,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useSidebar,
  SIDEBAR_WIDTH_CLASSES,
} from "@/components/app/sidebar-provider";
import { RFQQueueList } from "@/components/app/rfq-queue";

// =============================================
// Navigation Configuration
// =============================================

// Navigation item type definition
interface NavItem {
  name: string;
  icon: typeof LayoutDashboard;
  href: string;
}

// Navigation section type definition
interface NavSection {
  title: string;
  items: NavItem[];
}

// Navigation menu structure with sections
// Workspace link dropped — the RFQ Queue below is the entry point to each workspace
const NAVIGATION_SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    ],
  },
  {
    title: "Documents",
    items: [
      { name: "Storage", icon: FolderOpen, href: "/storage" },
      { name: "Upload", icon: Upload, href: "/upload" },
    ],
  },
  {
    title: "System",
    items: [
      { name: "Settings", icon: Settings, href: "/settings" },
      { name: "Pipeline View", icon: GitBranch, href: "/pipeline" },
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
 * Features:
 * - Navigation sections: Workspace, Documents, System
 * - RFQ Queue with scrollable list (top 3 visible)
 * - Collapse/expand functionality
 * - Active route highlighting with brand accent
 */
export function DashboardSidebar({ className = "" }: SidebarProps) {
  // Get collapsed state and toggle function from context
  const { collapsed, toggleSidebar } = useSidebar();

  // Get current pathname for active state
  const pathname = usePathname();

  // Check if a nav item is active (exact match or starts with)
  const isActive = (href: string): boolean => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`
        fixed left-0 top-16 h-[calc(100vh-64px)]
        border-r border-sidebar-border
        bg-sidebar
        transition-all duration-300
        flex flex-col
        ${collapsed ? SIDEBAR_WIDTH_CLASSES.collapsed : SIDEBAR_WIDTH_CLASSES.expanded}
        ${className}
      `}
    >
      {/* Collapse/Expand toggle button */}
      <div className="flex justify-end p-4 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Main navigation content */}
      <div className="flex-1 overflow-y-auto px-3">
        <nav className="space-y-6" role="navigation">
          {/* Workspace Section (Dashboard + Workboard) */}
          <NavSectionComponent
            section={NAVIGATION_SECTIONS[0]}
            collapsed={collapsed}
            isActive={isActive}
          />

          {/* RFQ Queue Section */}
          <div>
            {/* Section title - hidden when collapsed */}
            {!collapsed && (
              <div className="flex items-center justify-between px-3 mb-2">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                  RFQ Queue
                </h3>
                <Inbox className="h-3 w-3 text-muted-foreground" />
              </div>
            )}

            {/* RFQ Queue list — active item is derived from the URL segment (decoded) */}
            <RFQQueueList
              isCollapsed={collapsed}
              activeRfqReference={
                pathname.startsWith("/workspace/")
                  ? decodeURIComponent(pathname.split("/workspace/")[1] ?? "")
                  : undefined
              }
              initialLimit={3}
            />
          </div>

          {/* Documents Section */}
          <NavSectionComponent
            section={NAVIGATION_SECTIONS[1]}
            collapsed={collapsed}
            isActive={isActive}
          />

          {/* System Section */}
          <NavSectionComponent
            section={NAVIGATION_SECTIONS[2]}
            collapsed={collapsed}
            isActive={isActive}
          />
        </nav>
      </div>
    </aside>
  );
}

// =============================================
// Navigation Section Sub-Component
// =============================================

interface NavSectionComponentProps {
  section: NavSection;
  collapsed: boolean;
  isActive: (href: string) => boolean;
}

/**
 * NavSectionComponent - Renders a navigation section with items
 */
function NavSectionComponent({
  section,
  collapsed,
  isActive,
}: NavSectionComponentProps) {
  return (
    <div>
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
          const active = isActive(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                w-full flex items-center gap-3 px-3 py-2 rounded-lg
                transition-all relative group
                ${active
                  ? "text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }
              `}
              title={collapsed ? item.name : undefined}
              aria-current={active ? "page" : undefined}
            >
              {/* Active indicator bar - brand accent color */}
              {active && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r bg-brand"
                  style={{
                    boxShadow: "0 0 8px oklch(0.685 0.169 237.323 / 0.3)",
                  }}
                  aria-hidden="true"
                />
              )}

              {/* Icon with glow effect for active state */}
              <div className="relative flex-shrink-0">
                <Icon
                  className={`h-5 w-5 ${active ? "relative z-10 text-brand" : ""}`}
                />
                {/* Glow effect behind active icon */}
                {active && (
                  <div
                    className="absolute inset-0 blur-md bg-brand-light opacity-20"
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Item label - hidden when collapsed */}
              {!collapsed && <span className="text-sm">{item.name}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
