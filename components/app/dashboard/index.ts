// =============================================
// Dashboard Components Barrel Export
// =============================================
// Central export file for dashboard UI components
// Note: Sidebar and Topbar moved to components/app folder
// Card components are exported from this folder

// Re-export sidebar and topbar from parent folder for backward compatibility
export { DashboardSidebar } from "../sidebar";
export { DashboardTopBar } from "../topbar";

// Dashboard card components
export { StatsCard } from "./stats-card";
export type { StatData } from "./stats-card";

export { RecentQuotationsCard } from "./recent-quotations-card";
export type { QuotationData, QuotationStatus } from "./recent-quotations-card";

export { QuickActionsCard } from "./quick-actions-card";
export type { ActionData } from "./quick-actions-card";
