import { callQwen, extractJson, type ModelMessage } from './qwen-client';

/**
 * Unified chat completion — delegates to Qwen3.6 via qwen-client.ts.
 * All callers (email, RFQ analysis, quotation, thread AI) pick up Qwen3.6
 * automatically. The schema param is accepted for backward compatibility but
 * ignored — Qwen uses prompt-based JSON formatting.
 */
export async function aiChatCompletion<T>(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1024,
  _schema?: object,
): Promise<T> {
  const messages: ModelMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
  const { text } = await callQwen(messages, { thinking: false, maxTokens });
  const parsed = extractJson<T>(text);
  if (parsed === null) {
    throw new Error(`[ai-router] Failed to parse JSON from Qwen response: ${text.slice(0, 200)}`);
  }
  return parsed;
}
