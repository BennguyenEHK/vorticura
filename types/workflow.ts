// =============================================
// WORKFLOW TYPES - Shared types for workflow system
// =============================================
// Defines TypeScript interfaces and Zod schemas for:
// - Action results and workflow steps
// - RFQ context and step status
// - Cross-module communication types

import { z } from 'zod';
import type { RFQStage, QueueStatus } from '@/types/rfq-queue';

// ---------------------------------------------
// Step Status Types
// ---------------------------------------------

/** Status of a workflow step execution */
export type StepStatus =
  | 'pending'      // Step not yet started
  | 'in_progress'  // Step currently executing
  | 'completed'    // Step finished successfully
  | 'failed'       // Step failed (will retry)
  | 'rejected'     // User rejected output (will re-run)
  | 'skipped';     // Step skipped (not applicable)

/** Workflow step identifiers matching action files */
export type WorkflowStepId =
  | 'analysis'           // analysis-actions.ts
  | 'email'              // email-actions.ts
  | 'supplier_search'    // supplier-search-actions.ts
  | 'quotation'          // quotation-actions.ts
  | 'pricing';           // pricing-actions.ts

// ---------------------------------------------
// Action Result Types
// ---------------------------------------------

/** Generic result wrapper for all server actions */
export interface ActionResult<T = unknown> {
  success: boolean;           // Whether action completed successfully
  data?: T;                   // Payload on success
  error?: string;             // Error message on failure
  timestamp: string;          // ISO timestamp of execution
  stepId: WorkflowStepId;     // Which step produced this result
  rfqId: string;              // Associated RFQ ID
}

/** Zod schema for ActionResult validation */
export const ActionResultSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  timestamp: z.string().datetime(),
  stepId: z.enum(['analysis', 'email', 'supplier_search', 'quotation', 'pricing']),
  rfqId: z.string(),
});

// ---------------------------------------------
// Workflow Step Types
// ---------------------------------------------

/** Workflow step with execution metadata */
export interface WorkflowStep {
  id: WorkflowStepId;           // Step identifier
  status: StepStatus;           // Current status
  startedAt?: string;           // When step started (ISO)
  completedAt?: string;         // When step completed (ISO)
  attempts: number;             // Number of execution attempts
  maxAttempts: number;          // Maximum retry attempts (default: 3)
  lastError?: string;           // Last error message if failed
  result?: ActionResult;        // Result from last execution
}

/** Zod schema for WorkflowStep validation */
export const WorkflowStepSchema = z.object({
  id: z.enum(['analysis', 'email', 'supplier_search', 'quotation', 'pricing']),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'rejected', 'skipped']),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1).default(3),
  lastError: z.string().optional(),
  result: ActionResultSchema.optional(),
});

// ---------------------------------------------
// RFQ Context Types
// ---------------------------------------------

/** Complete RFQ workflow context */
export interface RFQContext {
  rfqId: string;                // Unique RFQ identifier
  workspaceId: string;          // Associated workspace
  currentStage: RFQStage;       // Current RFQ stage from queue-manager
  queueStatus: QueueStatus;     // Current queue status
  steps: WorkflowStep[];        // All workflow steps with status
  currentStepIndex: number;     // Index of currently active step
  createdAt: string;            // When context was created
  updatedAt: string;            // Last update timestamp
}

/** Zod schema for RFQContext validation */
export const RFQContextSchema = z.object({
  rfqId: z.string().min(1),
  workspaceId: z.string().min(1),
  currentStage: z.string(), // RFQStage is a string union
  queueStatus: z.enum(['active', 'waiting', 'action', 'completed', 'error']),
  steps: z.array(WorkflowStepSchema),
  currentStepIndex: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ---------------------------------------------
// Analysis Types (for analysis-actions.ts)
// ---------------------------------------------

/** Input for RFQ analysis */
export interface AnalysisInput {
  rfqId: string;
  emailContent: string;         // Raw email content
  attachments?: string[];       // File paths/URLs of attachments
  senderEmail: string;
  senderName?: string;
  subject: string;
}

/** Output from RFQ analysis */
export interface AnalysisOutput {
  rfqId: string;
  summary: string;              // AI-generated summary
  items: AnalysisItem[];        // Extracted line items
  customerInfo: CustomerInfo;   // Extracted customer details
  deadlines?: string[];         // Extracted deadlines
  specialRequirements?: string[];
  confidence: number;           // AI confidence score (0-1)
}

/** Single item extracted from RFQ */
export interface AnalysisItem {
  description: string;
  quantity?: number;
  unit?: string;
  specifications?: string;
}

/** Customer information from RFQ */
export interface CustomerInfo {
  name: string;
  email: string;
  company?: string;
  phone?: string;
}

/** Zod schema for AnalysisInput */
export const AnalysisInputSchema = z.object({
  rfqId: z.string().min(1),
  emailContent: z.string().min(1),
  attachments: z.array(z.string()).optional(),
  senderEmail: z.string().email(),
  senderName: z.string().optional(),
  subject: z.string().min(1),
});

// ---------------------------------------------
// Email Types (for email-actions.ts)
// ---------------------------------------------

/** Input for email drafting */
export interface EmailInput {
  rfqId: string;
  templateType: 'supplier_inquiry' | 'customer_response' | 'follow_up';
  recipients: string[];
  context: Record<string, unknown>; // Data to populate template
}

/** Output from email drafting */
export interface EmailOutput {
  rfqId: string;
  drafts: EmailDraft[];
}

/** Single email draft */
export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  attachments?: string[];
}

/** Zod schema for EmailInput */
export const EmailInputSchema = z.object({
  rfqId: z.string().min(1),
  templateType: z.enum(['supplier_inquiry', 'customer_response', 'follow_up']),
  recipients: z.array(z.string().email()).min(1),
  context: z.record(z.string(), z.unknown()),
});

// ---------------------------------------------
// Supplier Search Types (for supplier-search-actions.ts)
// ---------------------------------------------

/** Input for supplier search */
export interface SupplierSearchInput {
  rfqId: string;
  items: AnalysisItem[];        // Items to find suppliers for
  preferences?: {
    region?: string;
    minRating?: number;
    maxLeadTime?: number;
  };
}

/** Output from supplier search */
export interface SupplierSearchOutput {
  rfqId: string;
  suppliers: SupplierResult[];
  searchTimestamp: string;
}

/** Single supplier result */
export interface SupplierResult {
  id: string;
  name: string;
  email: string;
  rating?: number;
  specialties: string[];
  estimatedLeadTime?: number;
  matchScore: number;           // Relevance score (0-1)
}

/** Zod schema for SupplierSearchInput */
export const SupplierSearchInputSchema = z.object({
  rfqId: z.string().min(1),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    specifications: z.string().optional(),
  })).min(1),
  preferences: z.object({
    region: z.string().optional(),
    minRating: z.number().min(0).max(5).optional(),
    maxLeadTime: z.number().positive().optional(),
  }).optional(),
});

// ---------------------------------------------
// Quotation Types (for quotation-actions.ts)
// ---------------------------------------------

/** Action type for quotation operations */
export type QuotationActionType = 'generate' | 'update';

/** Input for quotation operations */
export interface QuotationInput {
  rfqId: string;
  actionType: QuotationActionType;
  supplierResponses?: SupplierResponse[];  // For 'generate'
  updates?: QuotationUpdate[];              // For 'update'
}

/** Supplier response data */
export interface SupplierResponse {
  supplierId: string;
  items: QuotationItem[];
  validUntil?: string;
}

/** Single quotation item */
export interface QuotationItem {
  itemId: number;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  leadTime?: number;
}

/** Quotation update data */
export interface QuotationUpdate {
  itemId: number;
  field: string;
  value: unknown;
}

/** Output from quotation operations */
export interface QuotationOutput {
  rfqId: string;
  quotationId: string;
  actionType: QuotationActionType;
  items: QuotationItem[];
  totalAmount: number;
  currency: string;
  generatedAt: string;
}

/** Zod schema for QuotationInput */
export const QuotationInputSchema = z.object({
  rfqId: z.string().min(1),
  actionType: z.enum(['generate', 'update']),
  supplierResponses: z.array(z.object({
    supplierId: z.string(),
    items: z.array(z.object({
      itemId: z.number(),
      description: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      currency: z.string(),
      leadTime: z.number().optional(),
    })),
    validUntil: z.string().optional(),
  })).optional(),
  updates: z.array(z.object({
    itemId: z.number(),
    field: z.string(),
    value: z.unknown(),
  })).optional(),
});

// ---------------------------------------------
// Pricing Types (for pricing-actions.ts)
// ---------------------------------------------

/** Input for pricing calculation */
export interface PricingInput {
  rfqId: string;
  quotationId: string;
  variables: PricingVariableInput[];
  targetCurrency: string;
}

/** Pricing variable input per item */
export interface PricingVariableInput {
  itemId: number;
  shippingCost: number;
  taxRate: number;
  exchangeRate: number;
  profitRate: number;
  discountRate: number;
}

/** Output from pricing calculation */
export interface PricingOutput {
  rfqId: string;
  quotationId: string;
  calculatedItems: CalculatedItem[];
  totalAmount: number;
  totalProfit: number;
  currency: string;
  calculatedAt: string;
}

/** Single calculated item */
export interface CalculatedItem {
  itemId: number;
  salesUnitPrice: number;
  extendedPrice: number;
  potentialProfit: number;
}

/** Zod schema for PricingInput */
export const PricingInputSchema = z.object({
  rfqId: z.string().min(1),
  quotationId: z.string().min(1),
  variables: z.array(z.object({
    itemId: z.number(),
    shippingCost: z.number().nonnegative(),
    taxRate: z.number().positive(),
    exchangeRate: z.number().positive(),
    profitRate: z.number().positive(),
    discountRate: z.number().min(0).max(1),
  })).min(1),
  targetCurrency: z.string().length(3),
});

// ---------------------------------------------
// Preview Panel Types (for cross-slice sync)
// ---------------------------------------------

/** Content type displayed in preview panel */
export type PreviewContentType =
  | 'analysis'     // Show RFQ analysis
  | 'email'        // Show email drafts
  | 'suppliers'    // Show supplier search results
  | 'quotation'    // Show quotation document
  | 'pricing';     // Show pricing breakdown

/** Preview panel state */
export interface PreviewState {
  contentType: PreviewContentType | null;
  content: unknown;               // Type depends on contentType
  isLoading: boolean;
  error?: string;
  lastUpdated: string;
}

// ---------------------------------------------
// Error Types
// ---------------------------------------------

/** Structured error for workflow failures */
export interface WorkflowError {
  code: string;
  message: string;
  stepId?: WorkflowStepId;
  rfqId?: string;
  timestamp: string;
  retryable: boolean;
}

/** Zod schema for WorkflowError */
export const WorkflowErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  stepId: z.enum(['analysis', 'email', 'supplier_search', 'quotation', 'pricing']).optional(),
  rfqId: z.string().optional(),
  timestamp: z.string().datetime(),
  retryable: z.boolean(),
});

// ---------------------------------------------
// Utility Types
// ---------------------------------------------

/** Default workflow step configuration */
export const DEFAULT_WORKFLOW_STEPS: Omit<WorkflowStep, 'result'>[] = [
  { id: 'analysis', status: 'pending', attempts: 0, maxAttempts: 3 },
  { id: 'email', status: 'pending', attempts: 0, maxAttempts: 3 },
  { id: 'supplier_search', status: 'pending', attempts: 0, maxAttempts: 3 },
  { id: 'quotation', status: 'pending', attempts: 0, maxAttempts: 3 },
  { id: 'pricing', status: 'pending', attempts: 0, maxAttempts: 3 },
];

/** Map workflow step to RFQ stage */
export const STEP_TO_STAGE_MAP: Record<WorkflowStepId, RFQStage> = {
  analysis: 'user_validation',
  email: 'outbound_rfq',
  supplier_search: 'supplier_discovery',
  quotation: 'quotation_processing',
  pricing: 'customer_quotation',
};
