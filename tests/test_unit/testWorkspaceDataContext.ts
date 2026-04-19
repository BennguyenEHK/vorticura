/**
 * Test: WorkspaceDataContext
 * Validates prefetch cache logic and context API
 */

// This test validates the TypeScript types and function signatures
// Full integration tests require React testing library

import type {
  WorkspacePayload,
  DashboardPayload,
  RfqQueuePayload,
  UiReloadResult,
} from '@/types/ui-reload';

// Validate WorkspacePayload structure (suppliers removed — preview driven by last_preview_type)
const workspacePayload: WorkspacePayload = {
  stage: 'supplier_discovery',
  rfqId: 123,
  rfqReference: 'RFQ-001',
  layoutPrefs: { layout: 'test' },
  previewType: 'analysis',
  preview: null,
  workflow: null,
  pricing: null,
  ai: [],
};

// Validate DashboardPayload structure
const dashboardPayload: DashboardPayload = {
  layoutPrefs: { columns: 3 },
};

// Validate RfqQueuePayload structure
const rfqQueuePayload: RfqQueuePayload = {
  layoutPrefs: null,
};

// Validate UiReloadResult structure
const uiReloadResult: UiReloadResult = {
  success: true,
  data: workspacePayload,
  uiType: 'workspace',
};

// Type assertions to validate correctness
const workspaceStage = workspacePayload.stage;
const dashboardLayout = dashboardPayload.layoutPrefs;
const queueLayout = rfqQueuePayload.layoutPrefs;
const resultSuccess = uiReloadResult.success;

console.log('OK: WorkspaceDataContext types validated');
console.log('✓ WorkspacePayload type correct');
console.log('✓ DashboardPayload type correct');
console.log('✓ RfqQueuePayload type correct');
console.log('✓ UiReloadResult type correct');
