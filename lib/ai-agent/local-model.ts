// =============================================
// LOCAL AI MODEL - Offline inference via @xenova/transformers
// =============================================
// Singleton model that runs locally using ONNX runtime.
// Downloads model from HuggingFace on first use, caches to lib/ai-agent/ai-model/.
//
// Provides a single generic inference method matching the remote hf-client API:
//   chatCompletion<T>(systemPrompt, userMessage) → T
//
// Usage: import { getLocalModel } from '@/lib/ai-agent/local-model';
//        const result = await getLocalModel().chatCompletion<T>(systemPrompt, userMsg);

import path from 'path';

// =============================================
// Configuration
// =============================================

/** Model ID on HuggingFace — must be ONNX-compatible with @xenova/transformers */
// Qwen2.5-0.5B-Instruct: lightweight (~ 400MB quantized), supports instruction-following
// Change via LOCAL_MODEL_ID env var if you want a different model
const MODEL_ID = process.env.LOCAL_MODEL_ID || 'Xenova/Qwen1.5-0.5B-Chat';

/** Local cache directory for downloaded model weights */
const MODEL_CACHE_DIR = path.join(process.cwd(), 'lib', 'ai-agent', 'ai-model');

/** Max tokens for model generation output */
const MAX_NEW_TOKENS = 1024;

// =============================================
// LocalAIModel Class
// =============================================

export class LocalAIModel {
  // Pipeline instance (lazy loaded)
  private generator: any = null;
  // Loading lock to prevent concurrent model downloads
  private loadingPromise: Promise<void> | null = null;
  // Track model readiness
  private loaded = false;

  /**
   * Ensure the model is downloaded and loaded into memory.
   * Safe to call multiple times — only loads once.
   */
  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    // Prevent concurrent loads (multiple requests hitting before first load completes)
    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    this.loadingPromise = this.loadModel();
    await this.loadingPromise;
  }

  /**
   * Download (if not cached) and load the model pipeline.
   * Model weights are cached in lib/ai-agent/ai-model/ for subsequent runs.
   */
  private async loadModel(): Promise<void> {
    console.log(`[local-model] Loading model: ${MODEL_ID}`);
    console.log(`[local-model] Cache directory: ${MODEL_CACHE_DIR}`);
    const startTime = Date.now();

    try {
      // Dynamic import to avoid bundling issues in Next.js client code
      const { pipeline, env } = await import('@xenova/transformers');

      // Point cache to our local directory (not the default ~/.cache)
      env.cacheDir = MODEL_CACHE_DIR;
      // Disable remote model loading check (use local cache if available)
      env.allowRemoteModels = true;

      // Create text-generation pipeline — downloads model on first call
      this.generator = await pipeline('text-generation', MODEL_ID, {
        // Use quantized model for smaller size + faster inference
        quantized: true,
      });

      this.loaded = true;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[local-model] Model loaded in ${elapsed}s`);
    } catch (error) {
      this.loadingPromise = null; // Reset so next call retries
      console.error('[local-model] Failed to load model:', error);
      throw new Error(
        `Failed to load local AI model (${MODEL_ID}). ` +
        `Ensure you have internet for first download. Error: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  // =============================================
  // Chat Completion (mirrors hfChatCompletion<T>)
  // =============================================

  /**
   * Generic chat completion — mirrors hfChatCompletion<T>(systemPrompt, userMessage).
   * Builds a chat prompt, runs local inference, parses JSON response.
   * @param systemPrompt - System instruction (defines output schema)
   * @param userMessage  - User content (email text, search query, etc.)
   * @returns Parsed JSON of type T
   * @throws Error if inference fails or JSON parsing fails
   */
  async chatCompletion<T>(systemPrompt: string, userMessage: string): Promise<T> {
    await this.ensureLoaded();
    console.log(`[local-model] chatCompletion: ${userMessage.slice(0, 80)}...`);

    // Build chat-style prompt using Chatml format
    const prompt = this.buildChatPrompt(systemPrompt, userMessage);
    // Run inference
    const rawOutput = await this.generate(prompt);
    // Parse JSON from model output (throws on failure)
    return this.parseJSON<T>(rawOutput);
  }

  // =============================================
  // Internal Helpers
  // =============================================

  /**
   * Build a chat-formatted prompt string.
   * Uses Chatml format: <|im_start|>system\n...<|im_end|>\n<|im_start|>user\n...<|im_end|>
   * This format works with Qwen and most instruction-tuned models.
   */
  private buildChatPrompt(systemPrompt: string, userMessage: string): string {
    return [
      `<|im_start|>system\n${systemPrompt}<|im_end|>`,
      `<|im_start|>user\n${userMessage}<|im_end|>`,
      `<|im_start|>assistant\n`,
    ].join('\n');
  }

  /**
   * Run text generation on the loaded model pipeline.
   * @param prompt - Full formatted prompt string
   * @returns Raw generated text (after the prompt)
   */
  private async generate(prompt: string): Promise<string> {
    const startTime = Date.now();

    const outputs = await this.generator(prompt, {
      max_new_tokens: MAX_NEW_TOKENS,
      temperature: 0.3,        // Low temperature for more deterministic JSON output
      top_p: 0.9,              // Nucleus sampling
      do_sample: true,         // Enable sampling (required for temperature to take effect)
      return_full_text: false,  // Only return generated text, not the prompt
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const generated = outputs[0]?.generated_text || '';
    console.log(`[local-model] Generated ${generated.length} chars in ${elapsed}s`);

    return generated;
  }

  /**
   * Extract and parse JSON from model output.
   * Handles common model quirks: markdown code fences, trailing text after JSON.
   * Throws on failure — no fallback, matching hf-client behavior.
   *
   * @param raw - Raw model output string
   * @returns Parsed JSON of type T
   * @throws Error if no JSON structure found or JSON is malformed
   */
  private parseJSON<T>(raw: string): T {
    // Strip markdown code fences if present (```json ... ```)
    let cleaned = raw.trim();
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
      throw new Error('[local-model] No JSON structure found in model output');
    }

    const jsonStr = cleaned.slice(start, end);
    return JSON.parse(jsonStr) as T;
  }
}

// =============================================
// SINGLETON VIA globalThis (survives HMR in dev)
// =============================================

const globalForModel = globalThis as unknown as {
  localAIModel: LocalAIModel | undefined;
};

/**
 * Get the singleton LocalAIModel instance.
 * Creates on first call, reuses on subsequent calls.
 * Model is lazy-loaded (not downloaded until first inference call).
 */
export function getLocalModel(): LocalAIModel {
  if (!globalForModel.localAIModel) {
    globalForModel.localAIModel = new LocalAIModel();
  }
  return globalForModel.localAIModel;
}
