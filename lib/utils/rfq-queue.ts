// =============================================
// RFQ QUEUE ORCHESTRATOR - Sequential workflow processor
// =============================================
// Handles sequential execution of workflow steps per RFQ:
// - Executes steps in order: analysis → email → supplier → quotation → pricing
// - Retry logic with exponential backoff (max 3 attempts)
// - Integrates with queue-manager for stage updates
// - Per-RFQ mutex to prevent concurrent processing

import type {
  WorkflowStepId,
  StepStatus,
  ActionResult,
  RFQContext,
  WorkflowStep,
} from '@/types/workflow';
import { DEFAULT_WORKFLOW_STEPS, STEP_TO_STAGE_MAP } from '@/types/workflow';
import { updateRFQStage } from '@/lib/services/rfq-queue/queue-manager';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** Orchestrator configuration */
const CONFIG = {
  maxAttempts: 3,                    // Maximum retry attempts per step
  baseDelayMs: 1000,                 // Base delay for exponential backoff
  maxDelayMs: 30000,                 // Maximum delay between retries
};

/** Step execution order (defines the workflow sequence) */
const STEP_ORDER: WorkflowStepId[] = [
  'analysis',
  'email',
  'supplier_search',
  'quotation',
  'pricing',
];

// ---------------------------------------------
// Types
// ---------------------------------------------

/** Step executor function signature */
export type StepExecutor = (rfqId: string, context: RFQContext) => Promise<ActionResult>;

/** Orchestrator options */
export interface OrchestratorOptions {
  onStepStart?: (stepId: WorkflowStepId, rfqId: string) => void;
  onStepComplete?: (stepId: WorkflowStepId, result: ActionResult) => void;
  onStepFailed?: (stepId: WorkflowStepId, error: string, attempts: number) => void;
  onWorkflowComplete?: (rfqId: string, success: boolean) => void;
}

/** Active RFQ processing state */
interface ProcessingState {
  rfqId: string;
  context: RFQContext;
  isProcessing: boolean;
  abortController: AbortController;
}

// ---------------------------------------------
// RFQ Queue Orchestrator Class
// ---------------------------------------------

/**
 * RFQQueueOrchestrator - Manages sequential workflow execution per RFQ
 */
export class RFQQueueOrchestrator {
  // Map of RFQ ID to processing state (mutex per RFQ)
  private activeProcesses: Map<string, ProcessingState> = new Map();

  // Step executor registry
  private executors: Map<WorkflowStepId, StepExecutor> = new Map();

  // Event callbacks
  private options: OrchestratorOptions;

  constructor(options: OrchestratorOptions = {}) {
    this.options = options;
  }

  // =========================================
  // EXECUTOR REGISTRATION
  // =========================================

  /**
   * Register a step executor function
   * @param stepId - Which step this executor handles
   * @param executor - Function to execute the step
   */
  registerExecutor(stepId: WorkflowStepId, executor: StepExecutor): void {
    this.executors.set(stepId, executor);
  }

  /**
   * Register multiple executors at once
   * @param executors - Map of step IDs to executors
   */
  registerExecutors(executors: Record<WorkflowStepId, StepExecutor>): void {
    for (const [stepId, executor] of Object.entries(executors)) {
      this.executors.set(stepId as WorkflowStepId, executor);
    }
  }

  // =========================================
  // WORKFLOW EXECUTION
  // =========================================

  /**
   * Start processing an RFQ through the workflow
   * @param rfqId - RFQ to process
   * @param workspaceId - Associated workspace
   * @param startFromStep - Optional step to start from (for resume)
   */
  async startWorkflow(
    rfqId: string,
    workspaceId: string,
    startFromStep?: WorkflowStepId
  ): Promise<void> {
    // Check if already processing
    if (this.activeProcesses.has(rfqId)) {
      console.warn(`[RFQ-Queue] RFQ ${rfqId} is already being processed`);
      return;
    }

    // Initialize context
    const context: RFQContext = {
      rfqId,
      workspaceId,
      currentStage: 'ingestion',
      queueStatus: 'active',
      steps: this.initializeSteps(startFromStep),
      currentStepIndex: startFromStep ? STEP_ORDER.indexOf(startFromStep) : 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Create processing state with abort controller
    const state: ProcessingState = {
      rfqId,
      context,
      isProcessing: true,
      abortController: new AbortController(),
    };

    this.activeProcesses.set(rfqId, state);

    try {
      // Execute workflow sequentially
      await this.executeWorkflow(state);
    } finally {
      // Cleanup
      this.activeProcesses.delete(rfqId);
    }
  }

  /**
   * Execute the workflow for a given state
   */
  private async executeWorkflow(state: ProcessingState): Promise<void> {
    const { context } = state;

    // Process each step in order
    for (let i = context.currentStepIndex; i < STEP_ORDER.length; i++) {
      // Check if aborted
      if (state.abortController.signal.aborted) {
        console.log(`[RFQ-Queue] Workflow aborted for ${state.rfqId}`);
        return;
      }

      const stepId = STEP_ORDER[i];
      const step = context.steps[i];

      // Skip completed or skipped steps
      if (step.status === 'completed' || step.status === 'skipped') {
        continue;
      }

      // Execute step with retry logic
      const success = await this.executeStepWithRetry(state, stepId, step);

      if (!success) {
        // Step failed after max retries
        this.options.onWorkflowComplete?.(state.rfqId, false);
        return;
      }

      // Update current step index
      context.currentStepIndex = i + 1;
      context.updatedAt = new Date().toISOString();
    }

    // Workflow completed successfully
    this.options.onWorkflowComplete?.(state.rfqId, true);
  }

  /**
   * Execute a single step with retry logic
   */
  private async executeStepWithRetry(
    state: ProcessingState,
    stepId: WorkflowStepId,
    step: WorkflowStep
  ): Promise<boolean> {
    const executor = this.executors.get(stepId);

    if (!executor) {
      console.error(`[RFQ-Queue] No executor registered for step: ${stepId}`);
      return false;
    }

    let attempts = step.attempts;

    while (attempts < CONFIG.maxAttempts) {
      // Check if aborted
      if (state.abortController.signal.aborted) {
        return false;
      }

      // Update step status
      step.status = 'in_progress';
      step.startedAt = new Date().toISOString();
      this.options.onStepStart?.(stepId, state.rfqId);

      try {
        // Execute the step
        const result = await executor(state.rfqId, state.context);

        if (result.success) {
          // Step completed successfully
          step.status = 'completed';
          step.completedAt = new Date().toISOString();
          step.result = result;

          // Update RFQ stage in queue-manager
          const newStage = STEP_TO_STAGE_MAP[stepId];
          await updateRFQStage(state.rfqId, newStage);

          this.options.onStepComplete?.(stepId, result);
          return true;
        } else {
          // Step failed but not an exception
          throw new Error(result.error || 'Step failed');
        }
      } catch (error) {
        attempts++;
        step.attempts = attempts;
        step.lastError = error instanceof Error ? error.message : 'Unknown error';

        this.options.onStepFailed?.(stepId, step.lastError, attempts);

        if (attempts < CONFIG.maxAttempts) {
          // Calculate backoff delay
          const delay = this.calculateBackoffDelay(attempts);
          console.log(`[RFQ-Queue] Retrying ${stepId} in ${delay}ms (attempt ${attempts + 1})`);
          await this.sleep(delay);
        } else {
          // Max retries exceeded
          step.status = 'failed';
          console.error(`[RFQ-Queue] Step ${stepId} failed after ${attempts} attempts`);
          return false;
        }
      }
    }

    return false;
  }

  // =========================================
  // REJECTION HANDLING
  // =========================================

  /**
   * Handle user rejection of a step output
   * Re-runs the step from the beginning
   * @param rfqId - RFQ to re-process
   * @param stepId - Step that was rejected
   */
  async handleRejection(rfqId: string, stepId: WorkflowStepId): Promise<void> {
    const state = this.activeProcesses.get(rfqId);

    if (!state) {
      console.warn(`[RFQ-Queue] No active process for RFQ ${rfqId}`);
      return;
    }

    const stepIndex = STEP_ORDER.indexOf(stepId);
    const step = state.context.steps[stepIndex];

    if (step) {
      // Mark as rejected and reset for retry
      step.status = 'rejected';
      step.attempts = 0; // Reset attempts for rejection re-run
      step.result = undefined;

      // Re-run from this step
      state.context.currentStepIndex = stepIndex;
      await this.executeWorkflow(state);
    }
  }

  // =========================================
  // CONTROL METHODS
  // =========================================

  /**
   * Stop processing an RFQ
   * @param rfqId - RFQ to stop
   */
  stopWorkflow(rfqId: string): void {
    const state = this.activeProcesses.get(rfqId);
    if (state) {
      state.abortController.abort();
      state.isProcessing = false;
      console.log(`[RFQ-Queue] Stopped workflow for ${rfqId}`);
    }
  }

  /**
   * Check if an RFQ is currently being processed
   * @param rfqId - RFQ to check
   */
  isProcessing(rfqId: string): boolean {
    return this.activeProcesses.has(rfqId);
  }

  /**
   * Get the current context for an RFQ
   * @param rfqId - RFQ to get context for
   */
  getContext(rfqId: string): RFQContext | null {
    return this.activeProcesses.get(rfqId)?.context ?? null;
  }

  /**
   * Get all active RFQ IDs
   */
  getActiveRfqIds(): string[] {
    return Array.from(this.activeProcesses.keys());
  }

  // =========================================
  // UTILITY METHODS
  // =========================================

  /**
   * Initialize workflow steps
   */
  private initializeSteps(startFromStep?: WorkflowStepId): WorkflowStep[] {
    const steps: WorkflowStep[] = DEFAULT_WORKFLOW_STEPS.map((step) => ({
      ...step,
      result: undefined,
    }));

    // If resuming, mark earlier steps as completed
    if (startFromStep) {
      const startIndex = STEP_ORDER.indexOf(startFromStep);
      for (let i = 0; i < startIndex; i++) {
        steps[i].status = 'completed';
      }
    }

    return steps;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff: baseDelay * 2^attempt
    const delay = CONFIG.baseDelayMs * Math.pow(2, attempt);
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    // Clamp to max delay
    return Math.min(delay + jitter, CONFIG.maxDelayMs);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------
// Singleton Instance
// ---------------------------------------------

/** Shared orchestrator instance */
export const rfqOrchestrator = new RFQQueueOrchestrator({
  onStepStart: (stepId, rfqId) => {
    console.log(`[RFQ-Queue] Starting step ${stepId} for ${rfqId}`);
  },
  onStepComplete: (stepId, result) => {
    console.log(`[RFQ-Queue] Completed step ${stepId}:`, result.success);
  },
  onStepFailed: (stepId, error, attempts) => {
    console.warn(`[RFQ-Queue] Step ${stepId} failed (attempt ${attempts}):`, error);
  },
  onWorkflowComplete: (rfqId, success) => {
    console.log(`[RFQ-Queue] Workflow ${success ? 'completed' : 'failed'} for ${rfqId}`);
  },
});

// ---------------------------------------------
// Helper Functions
// ---------------------------------------------

/**
 * Start workflow for an RFQ (convenience wrapper)
 */
export async function processRFQ(
  rfqId: string,
  workspaceId: string,
  startFromStep?: WorkflowStepId
): Promise<void> {
  return rfqOrchestrator.startWorkflow(rfqId, workspaceId, startFromStep);
}

/**
 * Handle rejection and re-run step (convenience wrapper)
 */
export async function rejectAndRetry(
  rfqId: string,
  stepId: WorkflowStepId
): Promise<void> {
  return rfqOrchestrator.handleRejection(rfqId, stepId);
}

/**
 * Stop RFQ processing (convenience wrapper)
 */
export function stopRFQProcessing(rfqId: string): void {
  rfqOrchestrator.stopWorkflow(rfqId);
}
