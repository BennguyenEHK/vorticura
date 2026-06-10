// =============================================
// App Components Barrel Export
// =============================================
// Central export file for all app-level components
// Re-exports from subfolders for convenient access

// Sidebar component (collapsible navigation)
export { DashboardSidebar } from "./sidebar";

// Topbar component (fixed header navigation)
export { DashboardTopBar } from "./topbar";

// Dashboard card components
export * from "./dashboard";

// Sidebar context provider
export { SidebarProvider, useSidebar } from "./sidebar-provider";
