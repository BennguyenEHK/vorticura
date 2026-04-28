'use client';

import { useEffect } from 'react';
import { useRFQContext } from '@/hooks/rfq-context';
import { usePreview } from '@/hooks/preview-context';
import { useWorkflow } from '@/hooks/workflow-context';
import { useWorkspaceData } from '@/hooks/workspace-data-context';
import { uiReload } from '@/lib/actions/ui-reload-actions';
import { hydrateDocumentFromWorkspace } from '@/hooks/use-preview-sse';
import type { WorkspacePayload } from '@/types/ui-reload';

export function WorkspacePreviewHydrator() {
  const rfqContext = useRFQContext();
  const rfqReference = rfqContext?.rfqReference;
  const preview = usePreview();
  const { setSteps } = useWorkflow();        // seed WorkflowContext from payload on mount
  const { getCachedData } = useWorkspaceData();

  useEffect(() => {
    if (!rfqReference) {
      return;
    }

    if (preview.state.activeDocument) {
      return;
    }

    let cancelled = false;

    const hydrate = async () => {
      // Try cached data first
      const cached = getCachedData('workspace', rfqReference);

      let payload: WorkspacePayload | undefined;

      if (cached?.success && cached.data && 'previewType' in cached.data && 'preview' in cached.data) {
        payload = cached.data as WorkspacePayload;
      } else {
        // Fallback to server fetch
        const result = await uiReload('workspace', rfqReference);
        if (result.success && result.data && 'previewType' in result.data && 'preview' in result.data) {
          payload = result.data as WorkspacePayload;
        }
      }

      if (!cancelled && payload) {
        const doc = hydrateDocumentFromWorkspace(payload.previewType, payload.preview);
        if (doc) {
          preview.actions.loadDocument(doc);
        }
        // Seed live workflow steps from server-computed array
        if (payload.workflowSteps?.length) {
          setSteps(payload.workflowSteps);
        }
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [rfqReference]);

  return null;
}
