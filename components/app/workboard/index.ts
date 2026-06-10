// components/app/workboard/index.ts
// =============================================
// Workboard Components Barrel Export
// =============================================

// Context provider + hook
export { WorkboardProvider, useWorkboard } from "./workboard-provider";

// Main layout shell (replaces WorkboardGrid)
export { WorkboardLayout } from "./workboard-layout";

// Horizontal step progress component for workspace header
export { WorkflowStepper } from "./workflow-stepper";
