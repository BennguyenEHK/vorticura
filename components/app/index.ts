// =============================================
// App Components Barrel Export
// =============================================
// Central export file for all app-level components
// Re-exports from subfolders for convenient access

// Dashboard components (sidebar, topbar)
export * from "./dashboard";

// Sidebar context provider
export { SidebarProvider, useSidebar } from "./sidebar-provider";
