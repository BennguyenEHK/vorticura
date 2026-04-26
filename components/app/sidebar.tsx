"use client";

// =============================================
// App Sidebar — Mission Control navigation rail
// =============================================
// Paper surface with hairline rule edges. Section heads are ALL-CAPS mono
// micro-labels. Active item is marked by a 2px Azimuth bar at the left edge —
// no glow, no rounded backgrounds, no gradient halos. Reads like a
// flight-deck panel manifest, not a SaaS sidebar.

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
import { useWorkspaceData } from "@/hooks/workspace-data-context";

// =============================================
// Navigation Configuration
// =============================================

interface NavItem {
  name: string;
  icon: typeof LayoutDashboard;
  href: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// Section structure — mono caps section titles map to procurement domains
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

interface SidebarProps {
  className?: string;
}

// =============================================
// Sidebar Component
// =============================================

/**
 * DashboardSidebar — Mission Control navigation rail.
 * Sections: Workspace · RFQ Queue · Documents · System.
 * Active marker: 2px Azimuth bar pinned to the left edge.
 */
export function DashboardSidebar({ className = "" }: SidebarProps) {
  const { collapsed, toggleSidebar } = useSidebar();
  const pathname = usePathname();

  // Active state — exact match for /dashboard, prefix match for nested routes
  const isActive = (href: string): boolean => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`
        fixed left-0 top-16 h-[calc(100vh-64px)]
        border-r border-rule
        bg-paper
        transition-all duration-300
        flex flex-col
        ${collapsed ? SIDEBAR_WIDTH_CLASSES.collapsed : SIDEBAR_WIDTH_CLASSES.expanded}
        ${className}
      `}
    >
      {/* Collapse/expand toggle — sits flush right with a hairline tray */}
      <div className="flex justify-end p-3 flex-shrink-0 border-b border-rule">
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

      {/* Main navigation column */}
      <div className="flex-1 overflow-y-auto py-5">
        <nav className="space-y-7" role="navigation">
          {/* Section: Workspace (Dashboard) */}
          <NavSectionComponent
            section={NAVIGATION_SECTIONS[0]}
            collapsed={collapsed}
            isActive={isActive}
          />

          {/* Section: RFQ Queue (live list) */}
          <div>
            {/* Section eyebrow — mono caps with a tiny inbox icon at the right */}
            {!collapsed && (
              <div className="flex items-center justify-between px-5 mb-3">
                <span className="micro-label text-graphite">RFQ Queue</span>
                <Inbox className="h-3 w-3 text-graphite" />
              </div>
            )}

            {/* Queue list — items derived from URL */}
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

          {/* Section: Documents */}
          <NavSectionComponent
            section={NAVIGATION_SECTIONS[1]}
            collapsed={collapsed}
            isActive={isActive}
          />

          {/* Section: System */}
          <NavSectionComponent
            section={NAVIGATION_SECTIONS[2]}
            collapsed={collapsed}
            isActive={isActive}
          />
        </nav>
      </div>

      {/* Footer rule — version stamp gives the rail a craftsmanship signal */}
      {!collapsed && (
        <div className="px-5 py-4 border-t border-rule">
          <span className="micro-label text-graphite">VORTICURA · OPS · v0.1</span>
        </div>
      )}
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
 * NavSectionComponent — Renders a single navigation section.
 * Section title is a mono micro-label; items are body-grotesque rows with
 * an Azimuth left bar marking the active route.
 */
function NavSectionComponent({
  section,
  collapsed,
  isActive,
}: NavSectionComponentProps) {
  const { prefetchDashboard } = useWorkspaceData();

  return (
    <div>
      {/* Mono-caps section title — instrument-label gesture */}
      {!collapsed && (
        <h3 className="px-5 mb-3 micro-label text-graphite">
          {section.title}
        </h3>
      )}

      {/* Item list */}
      <div className="space-y-px">
        {section.items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                relative w-full flex items-center gap-3 px-5 py-2
                transition-colors group font-body text-sm
                ${active
                  ? "text-ink bg-vellum"
                  : "text-graphite hover:bg-vellum hover:text-ink"
                }
              `}
              title={collapsed ? item.name : undefined}
              aria-current={active ? "page" : undefined}
              onMouseEnter={() => {
                if (item.href === "/dashboard") prefetchDashboard();
              }}
            >
              {/* Active marker — 2px Azimuth bar flush to the left edge (no glow) */}
              {active && (
                <span
                  className="absolute left-0 top-0 bottom-0 w-[2px] bg-azimuth"
                  aria-hidden="true"
                />
              )}

              {/* Icon — same stroke regardless of state, ink on active */}
              <Icon
                className={`h-4 w-4 flex-shrink-0 ${active ? "text-azimuth" : "text-graphite group-hover:text-ink"}`}
                strokeWidth={1.5}
              />

              {/* Label — hidden when collapsed */}
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
