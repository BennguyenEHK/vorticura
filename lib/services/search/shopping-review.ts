import { callModel, extractJson, QWEN_MODEL } from '@/lib/ai-agent/qwen-client';
import {
  SHOPPING_REVIEW_PROMPT,
  buildShoppingReviewMessage,
} from '@/lib/ai-agent/prompt/shopping-review';
import type { EnrichedSource } from './fill-shopping-metadata';

export interface ReviewResult {
  sufficient: boolean;
  retained: EnrichedSource[];
  rejected: Array<EnrichedSource & { reason: string }>;
  nextQueryHint: string | null;
}

const TARGET_SOURCES = 3;

export async function reviewAttempt(
  sources: EnrichedSource[],
  itemDescription: string,
  ctx: { triedQueries: string[]; researchAttempt: number },
): Promise<ReviewResult> {
  if (sources.length === 0) {
    return { sufficient: false, retained: [], rejected: [], nextQueryHint: null };
  }

  if (sources.length < TARGET_SOURCES) {
    return { sufficient: false, retained: sources, rejected: [], nextQueryHint: null };
  }

  const raw = await callModel({
    model: QWEN_MODEL,
    enable_thinking: true,
    budget_tokens: 4096,
    temperature: 0.1,
    messages: [
      { role: 'system', content: SHOPPING_REVIEW_PROMPT },
      {
        role: 'user',
        content: buildShoppingReviewMessage(
          itemDescription,
          sources,
          ctx.triedQueries,
          ctx.researchAttempt,
        ),
      },
    ],
  }).catch(err => {
    console.error('[shopping-review] reviewAttempt failed:', err instanceof Error ? err.message : err);
    return null;
  });

  if (!raw) {
    return { sufficient: sources.length >= TARGET_SOURCES, retained: sources, rejected: [], nextQueryHint: null };
  }

  const result = extractJson<{
    sufficient: boolean;
    retained_ids: number[];
    rejected_ids: Array<{ id: number; reason: string }>;
    next_query_hint?: string | null;
  }>(raw);

  if (!result) {
    return { sufficient: true, retained: sources, rejected: [], nextQueryHint: null };
  }

  const retainedSet = new Set(result.retained_ids ?? []);
  const rejectedMap = new Map((result.rejected_ids ?? []).map(r => [r.id, r.reason]));
  const retained = sources.filter((_, i) => retainedSet.has(i));
  const rejected = sources
    .map((s, i) => retainedSet.has(i) ? null : { ...s, reason: rejectedMap.get(i) ?? 'rejected by review' })
    .filter((s): s is EnrichedSource & { reason: string } => s !== null);

  return {
    sufficient: result.sufficient,
    retained,
    rejected,
    nextQueryHint: result.next_query_hint ?? null,
  };
}
