// =============================================
// LOCAL AI MODEL - Offline inference via @xenova/transformers
// =============================================
// Singleton model that runs locally using ONNX runtime.
// Downloads model from HuggingFace on first use, caches to lib/ai-agent/ai-model/.
//
// Provides two inference methods matching remote API contracts:
//   analyzeRFQ()      → AnalysisData   (used by analysis-actions.ts)
//   searchSuppliers() → SupplierResult[] (used by supplier-search-actions.ts)
//
// Usage: import { getLocalModel } from '@/lib/ai-agent/local-model';
//        const result = await getLocalModel().analyzeRFQ(input);

import path from 'path';
import type {
  AICallInput,
  AnalysisData,
  SearchAPIInput,
  SupplierResult,
} from '@/types/ai-agent';

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
// System Prompts
// =============================================

/** System prompt for RFQ analysis — instructs model to output strict JSON */
const ANALYSIS_SYSTEM_PROMPT = `You are an RFQ (Request for Quotation) analysis assistant.
Analyze the provided email/document and extract structured information.

You MUST return ONLY valid JSON (no markdown, no explanation) with this exact schema:
{
  "summary": "brief summary of the RFQ content",
  "items": [
    {
      "description": "item description",
      "quantity": 100,
      "unit": "pcs",
      "specifications": "technical specs if any"
    }
  ],
  "customerInfo": {
    "name": "contact person name",
    "email": "email@example.com",
    "company": "company name",
    "phone": "phone number"
  },
  "deadlines": ["2026-04-01"],
  "specialRequirements": ["any special conditions"],
  "confidence": 0.85
}

Rules:
- Extract ALL items mentioned in the document
- Set confidence between 0.0 and 1.0 based on how clear the RFQ is
- If a field is not found, use empty string or empty array
- Return ONLY the JSON object, nothing else`;

/** System prompt for supplier search — instructs model to output strict JSON array */
const SUPPLIER_SEARCH_SYSTEM_PROMPT = `You are a supplier discovery assistant.
Based on the provided item requirements, suggest matching suppliers.

You MUST return ONLY a valid JSON array (no markdown, no explanation) with this schema:
[
  {
    "id": "SUP-001",
    "name": "Supplier Company Name",
    "email": "contact@supplier.com",
    "rating": 4.5,
    "specialties": ["Category1", "Category2"],
    "estimatedLeadTime": 14,
    "matchScore": 0.92
  }
]

Rules:
- Suggest 2-5 realistic suppliers based on the item categories
- matchScore should be between 0.0 and 1.0
- estimatedLeadTime is in days
- rating is between 0 and 5
- Return ONLY the JSON array, nothing else`;

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
  // Inference Methods
  // =============================================

  /**
   * Analyze an RFQ email/document and extract structured data.
   * @param input - Subject, content, and action type
   * @returns Parsed AnalysisData JSON
   */
  async analyzeRFQ(input: AICallInput): Promise<AnalysisData> {
    await this.ensureLoaded();
    console.log(`[local-model] analyzeRFQ: "${input.subject}" (${input.actionType})`);

    // Build chat-style prompt for the model
    const prompt = this.buildChatPrompt(
      ANALYSIS_SYSTEM_PROMPT,
      `Subject: ${input.subject}\n\nContent:\n${input.analysisContent}`
    );

    // Run inference
    const rawOutput = await this.generate(prompt);

    // Parse JSON from model output, fallback to mock if parsing fails
    return this.parseJSON<AnalysisData>(rawOutput, () => this.fallbackAnalysis(input));
  }

  /**
   * Search for suppliers matching given requirements.
   * @param input - Subject, search content, and action type
   * @returns Parsed SupplierResult array
   */
  async searchSuppliers(input: SearchAPIInput): Promise<SupplierResult[]> {
    await this.ensureLoaded();
    console.log(`[local-model] searchSuppliers: "${input.subject}" (${input.actionType})`);

    // Build chat-style prompt for the model
    const prompt = this.buildChatPrompt(
      SUPPLIER_SEARCH_SYSTEM_PROMPT,
      `Subject: ${input.subject}\n\nRequirements:\n${input.searchContent}`
    );

    // Run inference
    const rawOutput = await this.generate(prompt);

    // Parse JSON array from model output, fallback to mock if parsing fails
    return this.parseJSON<SupplierResult[]>(rawOutput, () => this.fallbackSuppliers());
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
   * Falls back to provided fallback function if parsing fails.
   *
   * @param raw - Raw model output string
   * @param fallbackFn - Function returning fallback data if parsing fails
   * @returns Parsed JSON of type T
   */
  private parseJSON<T>(raw: string, fallbackFn: () => T): T {
    try {
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
        throw new Error('No JSON structure found in model output');
      }

      const jsonStr = cleaned.slice(start, end);
      return JSON.parse(jsonStr) as T;
    } catch (parseError) {
      console.warn('[local-model] JSON parse failed, using fallback:', parseError);
      console.warn('[local-model] Raw output was:', raw.slice(0, 500));
      return fallbackFn();
    }
  }

  // =============================================
  // Fallback Data (when model output fails to parse)
  // =============================================

  /** Fallback analysis data when JSON parsing fails */
  private fallbackAnalysis(input: AICallInput): AnalysisData {
    return {
      summary: `Analysis of: ${input.subject} (local model parse fallback)`,
      items: [],
      customerInfo: { name: '', email: '' },
      deadlines: [],
      specialRequirements: [],
      confidence: 0.3, // Low confidence since we couldn't parse
    };
  }

  /** Fallback supplier list when JSON parsing fails */
  private fallbackSuppliers(): SupplierResult[] {
    return [];
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
