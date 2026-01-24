import { DashboardSidebar, DashboardTopBar } from "@/components/dashboard";

// Metadata for dashboard pages
export const metadata = {
  title: "Dashboard | QuoteFlow AI",
  description: "Manage your quotations, workflows, and documents",
};

/**
 * DashboardLayout - Root layout for all dashboard pages
 * Includes fixed topbar and collapsible sidebar navigation
 * Uses design tokens from globals.css for consistent styling
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Fixed top navigation bar */}
      <DashboardTopBar />

      {/* Collapsible sidebar navigation */}
      <DashboardSidebar />

      {/* Main content area - offset for sidebar (240px) and topbar (64px) */}
      <main
        className="
          ml-60 pt-16
          min-h-screen
          transition-all duration-300
          bg-muted
        "
      >
        {/* Content wrapper with consistent padding */}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
