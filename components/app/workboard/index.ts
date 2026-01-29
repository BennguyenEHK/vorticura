// =============================================
// Workboard Components Barrel Export
// =============================================
// Central export file for workboard panel system

// Context provider for workboard state management
export { WorkboardProvider, useWorkboard } from "./workboard-provider";

// Main grid layout component
export { WorkboardGrid } from "./workboard-grid";

// Generic resizable/draggable panel wrapper
export { WorkboardPanel } from "./workboard-panel";

// Drop zone for AI Chat FAB
export { WorkboardDropZone } from "./workboard-drop-zone";

// Panel header with drag handle and controls
export { PanelHeader } from "./panel-header";

// Hook for persisting layout to localStorage
export { useWorkboardLayout } from "./use-workboard-layout";
