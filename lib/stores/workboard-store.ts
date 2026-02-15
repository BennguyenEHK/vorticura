// =============================================
// WORKBOARD STORE - Zustand state management
// =============================================
// Single store with slices for workflow state:
// - analysisSlice: RFQ analysis results
// - emailSlice: Email draft state
// - supplierSlice: Supplier search results
// - quotationSlice: Quotation data
// - pricingSlice: Pricing calculations
// - workflowSlice: Current workflow step tracking
// - previewSlice: Preview panel content

'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  WorkflowStepId,
  StepStatus,
  WorkflowStep,
  AnalysisOutput,
  EmailOutput,
  SupplierSearchOutput,
  QuotationOutput,
  PricingOutput,
  PreviewContentType,
  RFQContext,
} from '@/lib/types/workflow';
import { DEFAULT_WORKFLOW_STEPS } from '@/lib/types/workflow';

// ---------------------------------------------
// Slice State Types
// ---------------------------------------------

/** Analysis slice state */
interface AnalysisSlice {
  analysisResult: AnalysisOutput | null;      // Current analysis result
  isAnalyzing: boolean;                        // Loading state
  analysisError: string | null;                // Error message
  setAnalysisResult: (result: AnalysisOutput) => void;
  setAnalyzing: (loading: boolean) => void;
  setAnalysisError: (error: string | null) => void;
  clearAnalysis: () => void;
}

/** Email slice state */
interface EmailSlice {
  emailDrafts: EmailOutput | null;            // Generated email drafts
  isDrafting: boolean;                         // Loading state
  emailError: string | null;                   // Error message
  setEmailDrafts: (drafts: EmailOutput) => void;
  setDrafting: (loading: boolean) => void;
  setEmailError: (error: string | null) => void;
  clearEmails: () => void;
}

/** Supplier slice state */
interface SupplierSlice {
  supplierResults: SupplierSearchOutput | null; // Search results
  isSearching: boolean;                          // Loading state
  supplierError: string | null;                  // Error message
  setSupplierResults: (results: SupplierSearchOutput) => void;
  setSearching: (loading: boolean) => void;
  setSupplierError: (error: string | null) => void;
  clearSuppliers: () => void;
}

/** Quotation slice state */
interface QuotationSlice {
  quotationData: QuotationOutput | null;      // Current quotation
  isGenerating: boolean;                       // Loading state
  quotationError: string | null;               // Error message
  setQuotationData: (data: QuotationOutput) => void;
  setGenerating: (loading: boolean) => void;
  setQuotationError: (error: string | null) => void;
  clearQuotation: () => void;
}

/** Pricing slice state */
interface PricingSlice {
  pricingResult: PricingOutput | null;        // Calculated pricing
  isCalculating: boolean;                      // Loading state
  pricingError: string | null;                 // Error message
  setPricingResult: (result: PricingOutput) => void;
  setCalculating: (loading: boolean) => void;
  setPricingError: (error: string | null) => void;
  clearPricing: () => void;
}

/** Workflow slice state */
interface WorkflowSlice {
  currentRfqId: string | null;                 // Active RFQ being processed
  workspaceId: string | null;                  // Current workspace
  steps: WorkflowStep[];                       // All workflow steps
  currentStepIndex: number;                    // Active step index
  isProcessing: boolean;                       // Workflow running
  setCurrentRfq: (rfqId: string, workspaceId: string) => void;
  updateStepStatus: (stepId: WorkflowStepId, status: StepStatus, error?: string) => void;
  advanceToNextStep: () => void;
  retryCurrentStep: () => void;
  resetWorkflow: () => void;
  initializeWorkflow: (context: Partial<RFQContext>) => void;
}

/** Preview slice state */
interface PreviewSlice {
  previewType: PreviewContentType | null;     // Current content type
  previewContent: unknown;                     // Content data (type depends on previewType)
  isPreviewLoading: boolean;                   // Loading state
  previewError: string | null;                 // Error message
  setPreview: (type: PreviewContentType, content: unknown) => void;
  setPreviewLoading: (loading: boolean) => void;
  setPreviewError: (error: string | null) => void;
  clearPreview: () => void;
}

// ---------------------------------------------
// Combined Store Type
// ---------------------------------------------

/** Complete workboard store type */
export interface WorkboardStore extends
  AnalysisSlice,
  EmailSlice,
  SupplierSlice,
  QuotationSlice,
  PricingSlice,
  WorkflowSlice,
  PreviewSlice {}

// ---------------------------------------------
// Store Implementation
// ---------------------------------------------

/**
 * Workboard store with all slices
 * Uses subscribeWithSelector for cross-slice sync
 */
export const useWorkboardStore = create<WorkboardStore>()(
  subscribeWithSelector((set: (partial: Partial<WorkboardStore>) => void, get: () => WorkboardStore) => ({
    // =========================================
    // ANALYSIS SLICE
    // =========================================
    analysisResult: null,
    isAnalyzing: false,
    analysisError: null,

    setAnalysisResult: (result: AnalysisOutput) => {
      set({ analysisResult: result, isAnalyzing: false, analysisError: null });
      // Auto-sync to preview panel
      get().setPreview('analysis', result);
    },

    setAnalyzing: (loading: boolean) => set({ isAnalyzing: loading }),

    setAnalysisError: (error: string | null) => set({ analysisError: error, isAnalyzing: false }),

    clearAnalysis: () => set({ analysisResult: null, analysisError: null }),

    // =========================================
    // EMAIL SLICE
    // =========================================
    emailDrafts: null,
    isDrafting: false,
    emailError: null,

    setEmailDrafts: (drafts: EmailOutput) => {
      set({ emailDrafts: drafts, isDrafting: false, emailError: null });
      // Auto-sync to preview panel
      get().setPreview('email', drafts);
    },

    setDrafting: (loading: boolean) => set({ isDrafting: loading }),

    setEmailError: (error: string | null) => set({ emailError: error, isDrafting: false }),

    clearEmails: () => set({ emailDrafts: null, emailError: null }),

    // =========================================
    // SUPPLIER SLICE
    // =========================================
    supplierResults: null,
    isSearching: false,
    supplierError: null,

    setSupplierResults: (results: SupplierSearchOutput) => {
      set({ supplierResults: results, isSearching: false, supplierError: null });
      // Auto-sync to preview panel
      get().setPreview('suppliers', results);
    },

    setSearching: (loading: boolean) => set({ isSearching: loading }),

    setSupplierError: (error: string | null) => set({ supplierError: error, isSearching: false }),

    clearSuppliers: () => set({ supplierResults: null, supplierError: null }),

    // =========================================
    // QUOTATION SLICE
    // =========================================
    quotationData: null,
    isGenerating: false,
    quotationError: null,

    setQuotationData: (data: QuotationOutput) => {
      set({ quotationData: data, isGenerating: false, quotationError: null });
      // Auto-sync to preview panel
      get().setPreview('quotation', data);
    },

    setGenerating: (loading: boolean) => set({ isGenerating: loading }),

    setQuotationError: (error: string | null) => set({ quotationError: error, isGenerating: false }),

    clearQuotation: () => set({ quotationData: null, quotationError: null }),

    // =========================================
    // PRICING SLICE
    // =========================================
    pricingResult: null,
    isCalculating: false,
    pricingError: null,

    setPricingResult: (result: PricingOutput) => {
      set({ pricingResult: result, isCalculating: false, pricingError: null });
      // Auto-sync to preview panel
      get().setPreview('pricing', result);
    },

    setCalculating: (loading: boolean) => set({ isCalculating: loading }),

    setPricingError: (error: string | null) => set({ pricingError: error, isCalculating: false }),

    clearPricing: () => set({ pricingResult: null, pricingError: null }),

    // =========================================
    // WORKFLOW SLICE
    // =========================================
    currentRfqId: null,
    workspaceId: null,
    steps: [...DEFAULT_WORKFLOW_STEPS] as WorkflowStep[],
    currentStepIndex: 0,
    isProcessing: false,

    setCurrentRfq: (rfqId: string, workspaceId: string) => {
      set({ currentRfqId: rfqId, workspaceId });
    },

    updateStepStatus: (stepId: WorkflowStepId, status: StepStatus, error?: string) => {
      const { steps } = get();
      const updatedSteps = steps.map((step) => {
        if (step.id === stepId) {
          return {
            ...step,
            status,
            lastError: error,
            // Increment attempts on failure or rejection
            attempts: status === 'failed' || status === 'rejected'
              ? step.attempts + 1
              : step.attempts,
            // Set timestamps
            startedAt: status === 'in_progress' ? new Date().toISOString() : step.startedAt,
            completedAt: status === 'completed' ? new Date().toISOString() : step.completedAt,
          };
        }
        return step;
      });
      set({ steps: updatedSteps });
    },

    advanceToNextStep: () => {
      const { currentStepIndex, steps } = get();
      const nextIndex = currentStepIndex + 1;
      if (nextIndex < steps.length) {
        set({ currentStepIndex: nextIndex });
        // Mark next step as in_progress
        get().updateStepStatus(steps[nextIndex].id, 'in_progress');
      } else {
        // Workflow complete
        set({ isProcessing: false });
      }
    },

    retryCurrentStep: () => {
      const { steps, currentStepIndex } = get();
      const currentStep = steps[currentStepIndex];
      if (currentStep && currentStep.attempts < currentStep.maxAttempts) {
        get().updateStepStatus(currentStep.id, 'in_progress');
      }
    },

    resetWorkflow: () => {
      set({
        currentRfqId: null,
        steps: [...DEFAULT_WORKFLOW_STEPS] as WorkflowStep[],
        currentStepIndex: 0,
        isProcessing: false,
      });
      // Clear all slice data
      get().clearAnalysis();
      get().clearEmails();
      get().clearSuppliers();
      get().clearQuotation();
      get().clearPricing();
      get().clearPreview();
    },

    initializeWorkflow: (context: Partial<RFQContext>) => {
      set({
        currentRfqId: context.rfqId ?? null,
        workspaceId: context.workspaceId ?? null,
        steps: context.steps ?? ([...DEFAULT_WORKFLOW_STEPS] as WorkflowStep[]),
        currentStepIndex: context.currentStepIndex ?? 0,
        isProcessing: true,
      });
    },

    // =========================================
    // PREVIEW SLICE
    // =========================================
    previewType: null,
    previewContent: null,
    isPreviewLoading: false,
    previewError: null,

    setPreview: (type: PreviewContentType, content: unknown) => {
      set({
        previewType: type,
        previewContent: content,
        isPreviewLoading: false,
        previewError: null,
      });
    },

    setPreviewLoading: (loading: boolean) => set({ isPreviewLoading: loading }),

    setPreviewError: (error: string | null) => set({ previewError: error, isPreviewLoading: false }),

    clearPreview: () => set({
      previewType: null,
      previewContent: null,
      previewError: null,
    }),
  }))
);

// ---------------------------------------------
// Selector Hooks for Components
// ---------------------------------------------

/** Select analysis state */
export const useAnalysisState = () => useWorkboardStore((state) => ({
  result: state.analysisResult,
  isLoading: state.isAnalyzing,
  error: state.analysisError,
}));

/** Select email state */
export const useEmailState = () => useWorkboardStore((state) => ({
  drafts: state.emailDrafts,
  isLoading: state.isDrafting,
  error: state.emailError,
}));

/** Select supplier state */
export const useSupplierState = () => useWorkboardStore((state) => ({
  results: state.supplierResults,
  isLoading: state.isSearching,
  error: state.supplierError,
}));

/** Select quotation state */
export const useQuotationState = () => useWorkboardStore((state) => ({
  data: state.quotationData,
  isLoading: state.isGenerating,
  error: state.quotationError,
}));

/** Select pricing state */
export const usePricingState = () => useWorkboardStore((state) => ({
  result: state.pricingResult,
  isLoading: state.isCalculating,
  error: state.pricingError,
}));

/** Select workflow state */
export const useWorkflowState = () => useWorkboardStore((state) => ({
  rfqId: state.currentRfqId,
  workspaceId: state.workspaceId,
  steps: state.steps,
  currentStepIndex: state.currentStepIndex,
  isProcessing: state.isProcessing,
  currentStep: state.steps[state.currentStepIndex],
}));

/** Select preview state */
export const usePreviewState = () => useWorkboardStore((state) => ({
  type: state.previewType,
  content: state.previewContent,
  isLoading: state.isPreviewLoading,
  error: state.previewError,
}));

// ---------------------------------------------
// Cross-Slice Subscriptions
// ---------------------------------------------

/**
 * Subscribe to workflow step changes
 * Automatically triggers appropriate actions when steps complete
 */
export const subscribeToWorkflowChanges = (
  onStepComplete: (stepId: WorkflowStepId, status: StepStatus) => void
) => {
  return useWorkboardStore.subscribe(
    (state) => state.steps,
    (steps, prevSteps) => {
      // Find steps that just completed
      steps.forEach((step, index) => {
        const prevStep = prevSteps[index];
        if (prevStep && prevStep.status !== step.status) {
          onStepComplete(step.id, step.status);
        }
      });
    }
  );
};
