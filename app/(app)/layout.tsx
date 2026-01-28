"use client";

// =============================================
// App Layout - Dashboard & Workspace
// =============================================
// Shared layout for all authenticated app pages (dashboard, workspace)
// Includes: Topbar, Sidebar, and dynamic main content area

// Import sidebar and topbar from components/app folder (moved from dashboard subfolder)
import { DashboardSidebar } from "@/components/app/sidebar";
import { DashboardTopBar } from "@/components/app/topbar";
import {
  SidebarProvider,
  useSidebar,
  MAIN_MARGIN_CLASSES,
} from "@/components/app/sidebar-provider";

/**
 * AppLayoutContent - Inner layout that consumes sidebar context
 * Separated to allow useSidebar hook usage (requires SidebarProvider parent)
 */
function AppLayoutContent({ children }: { children: React.ReactNode }) {
  // Get sidebar collapsed state from context
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed top navigation bar */}
      <DashboardTopBar />

      {/* Collapsible sidebar navigation */}
      <DashboardSidebar />

      {/* Main content area - dynamic margin based on sidebar state */}
      <main
        className={`
          ${collapsed ? MAIN_MARGIN_CLASSES.collapsed : MAIN_MARGIN_CLASSES.expanded}
          pt-16
          min-h-screen
          transition-all duration-300
          bg-muted
        `}
      >
        {/* Content wrapper with consistent padding */}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * AppLayout - Root layout for all app pages (dashboard, workspace)
 * Wraps content with SidebarProvider for shared sidebar state
 *
 * @param children - Page content
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // SidebarProvider wraps entire app section for shared sidebar state
    <SidebarProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  );
}
