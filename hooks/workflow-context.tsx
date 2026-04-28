'use client';

// =============================================
// WORKFLOW CONTEXT — Live step state for WorkflowPanel
// =============================================
// Holds WorkflowStep[] computed server-side and seeded by WorkspacePreviewHydrator.
// Mirrors the PreviewContext pattern so WorkflowPanelContent can read steps
// without prop drilling through WorkboardGrid.

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { WorkflowStep } from '@/types/workflow';

interface WorkflowContextValue {
  steps: WorkflowStep[];
  setSteps: (steps: WorkflowStep[]) => void; // called by hydrator on mount
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  return (
    <WorkflowContext.Provider value={{ steps, setSteps }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow(): WorkflowContextValue {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflow must be used within WorkflowProvider');
  return ctx;
}
