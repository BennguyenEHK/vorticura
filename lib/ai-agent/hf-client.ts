// =============================================
// HF CLIENT - HuggingFace Inference API (remote mode)
// =============================================
// Singleton InferenceClient for remote AI calls via HuggingFace.
// Used by action files when AI_MODE !== 'local'.
//
// Provides:
//   getHFClient()      → singleton InferenceClient instance
//   hfChatCompletion() → send system+user prompt, parse JSON response
//
// Prompts are imported from ./prompt/ modules and re-exported
// under their legacy names for backward compatibility.
//
// Usage: import { hfChatCompletion } from '@/lib/ai-agent/hf-client';
//        const data = await hfChatCompletion<AnalysisData>(SYSTEM_PROMPT, userMsg);

import { InferenceClient } from '@huggingface/inference';

// Re-export prompts from centralized modules for backward compatibility
export {
  ANALYZE_RFQ_PROMPT as ANALYSIS_SYSTEM_PROMPT,
  SEARCH_SUPPLIERS_PROMPT as SUPPLIER_SEARCH_SYSTEM_PROMPT,
  EXTRACT_SUPPLIER_RESPONSE_PROMPT as SUPPLIER_RESPOND_SYSTEM_PROMPT,
} from './prompt';

// =============================================
// Configuration
// =============================================

/** HuggingFace model ID — override via env or use default */
const HF_MODEL = process.env.HF_MODEL_ID || 'Qwen/Qwen2.5-72B-Instruct';

// =============================================
// Singleton Client (survives HMR in dev)
// =============================================

const globalForHF = globalThis as unknown as {
  hfClient: InferenceClient | undefined;
};

/** Get singleton InferenceClient — reads HF_TOKEN from env */
export function getHFClient(): InferenceClient {
  if (!globalForHF.hfClient) {
    const token = process.env.HF_TOKEN;
    if (!token) {
      throw new Error(
        'HF_TOKEN is not set. Add your HuggingFace token to .env.local'
      );
    }
    globalForHF.hfClient = new InferenceClient(token);
  }
  return globalForHF.hfClient;
}

// =============================================
// Chat Completion Helper
// =============================================

/**
 * Send a chat completion request to HuggingFace Inference API.
 * Extracts the assistant's message content and parses it as JSON.
 *
 * @param systemPrompt - System instruction (defines output schema)
 * @param userMessage  - User content (email text, search query, etc.)
 * @returns Parsed JSON of type T
 * @throws Error if API call fails or JSON parsing fails
 */
export async function hfChatCompletion<T>(
  systemPrompt: string,
  userMessage: string
): Promise<T> {
  const client = getHFClient();
  const startTime = Date.now();

  console.log(`[hf-client] Calling model: ${HF_MODEL}`);

  // Call HuggingFace Inference API with chat completion format
  const response = await client.chatCompletion({
    model: HF_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },  // System prompt defines output schema
      { role: 'user', content: userMessage },      // User content to analyze
    ],
    max_tokens: 1024,       // Max output tokens
    temperature: 0.3,       // Low temperature for deterministic JSON output
  });

  // Extract the assistant's response text
  const rawText = response.choices[0]?.message?.content || '';
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[hf-client] Response received in ${elapsed}s (${rawText.length} chars)`);

  // Parse JSON from the response (handles markdown fences, trailing text)
  return parseJSON<T>(rawText);
}

// =============================================
// JSON Parser (same logic as local-model.ts)
// =============================================

/**
 * Extract and parse JSON from model output.
 * Handles common quirks: markdown code fences, trailing text after JSON.
 */
function parseJSON<T>(raw: string): T {
  let cleaned = raw.trim();

  // Strip markdown code fences if present (```json ... ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  // Find the first { or [ and last matching } or ]
  const startObj = cleaned.indexOf('{');
  const startArr = cleaned.indexOf('[');
  let start: number;
  let end: number;

  if (startArr >= 0 && (startObj < 0 || startArr < startObj)) {
    // JSON array
    start = startArr;
    end = cleaned.lastIndexOf(']') + 1;
  } else if (startObj >= 0) {
    // JSON object
    start = startObj;
    end = cleaned.lastIndexOf('}') + 1;
  } else {
    throw new Error('[hf-client] No JSON structure found in model output');
  }

  const jsonStr = cleaned.slice(start, end);
  return JSON.parse(jsonStr) as T;
}
