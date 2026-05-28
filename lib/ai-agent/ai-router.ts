// =============================================
// AI ROUTER — unified entry point with HF→local fallback
// =============================================
// Single switchboard between remote (HuggingFace) and local (self-hosted vLLM).
// All action modules call aiChatCompletion() instead of binding directly to one
// provider so toggling AI_MODE flips the whole pipeline at once.
//
// AI_MODE=local  → go straight to the local vLLM server (explicit user choice;
//                  no HF fallback because the operator chose offline mode).
// AI_MODE=remote → call HF first; on failure (missing HF_TOKEN, network error,
//                  rate-limit, JSON parse error) fall back to the local model
//                  so the request still completes instead of bubbling a 500 to
//                  the UI. Default mode when AI_MODE is unset.
//
// Note: callers needing vLLM-only features (xgrammar guided_json) must keep
// calling getLocalModel() directly — this router does NOT expose the schema
// argument because HF has no equivalent.

import { hfChatCompletion } from './hf-client';
import { getLocalModel } from './local-model';

/** Resolved at module-load; env changes require a process restart (standard Next.js behavior). */
const AI_MODE = process.env.AI_MODE || 'remote';

/**
 * Unified chat completion — routes by AI_MODE, falls back HF→local on remote failure.
 *
 * @param systemPrompt - System instruction (defines output schema)
 * @param userMessage  - User content (email text, prompt, etc.)
 * @param maxTokens    - Max output tokens (default 1024, matches both providers)
 * @returns Parsed JSON of type T from whichever provider succeeded
 */
export async function aiChatCompletion<T>(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1024,
): Promise<T> {
  // Local mode: skip HF entirely, talk to vLLM
  if (AI_MODE === 'local') {
    return await getLocalModel().chatCompletion<T>(systemPrompt, userMessage, maxTokens);
  }

  // Remote mode: try HF first, fall back to local on any error
  try {
    return await hfChatCompletion<T>(systemPrompt, userMessage, maxTokens);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ai-router] HF call failed (${msg}) — falling back to local model`);
    return await getLocalModel().chatCompletion<T>(systemPrompt, userMessage, maxTokens);
  }
}
