// =============================================
// Workspace Components Barrel Export
// =============================================
// Central export file for workspace panel components
// NOTE: Main panels now use workboard system (react-grid-layout)
// This file exports the original chat and workflow panels for backward compatibility

// Chat panel component (kept for reference, use AIChatPanel from ai-chat for workboard)
export { ChatPanel } from "./chat-panel";

// Workflow panel component (kept for reference, use WorkflowPanelContent for workboard)
export { WorkflowPanel } from "./workflow-panel";

// =============================================
// NEW: Import workboard components for modern usage
// =============================================
// For new implementations, use these instead:
// import { WorkboardGrid, WorkboardProvider } from "@/components/app/workboard"
// import { AIChatFab, AIChatPopover, AIChatProvider } from "@/components/app/ai-chat"
