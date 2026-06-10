"use client";

// =============================================
// App Layout — dashboard & workspace
// =============================================
// Shared layout for all authenticated app pages.
// DnD context and AI Chat FAB/Popover removed — AI chat
// is now a fixed pane toggled from the topbar.

import { DashboardSidebar } from "@/components/app/sidebar";
import { DashboardTopBar } from "@/components/app/topbar";
import {
  SidebarProvider,
  useSidebar,
  MAIN_MARGIN_CLASSES,
} from "@/components/app/sidebar-provider";
import { AIChatProvider } from "@/components/app/ai-chat";
import { WorkboardProvider } from "@/components/app/workboard";
import { LocationTracker } from "@/components/app/LocationTracker";
import { WorkspaceDataProvider } from "@/hooks/workspace-data-context";

// =============================================
// Inner layout (consumes sidebar context)
// =============================================

function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-paper">
      {/* Fixed top navigation bar */}
      <DashboardTopBar />

      {/* Collapsible sidebar navigation */}
      <DashboardSidebar />

      {/* Main content area — dynamic margin based on sidebar state */}
      <main
        className={`
          ${collapsed ? MAIN_MARGIN_CLASSES.collapsed : MAIN_MARGIN_CLASSES.expanded}
          pt-16
          min-h-screen
          transition-all duration-300
          bg-paper text-ink
        `}
      >
        <div className="p-6 min-h-[calc(100vh-64px)]">
          {children}
        </div>
      </main>
    </div>
  );
}

// =============================================
// Root layout
// =============================================

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // Provider hierarchy: Sidebar → AIChat → Workboard → WorkspaceData → Content
    <SidebarProvider>
      <AIChatProvider>
        <WorkboardProvider>
          <WorkspaceDataProvider>
            <LocationTracker />
            <AppLayoutContent>{children}</AppLayoutContent>
          </WorkspaceDataProvider>
        </WorkboardProvider>
      </AIChatProvider>
    </SidebarProvider>
  );
}
