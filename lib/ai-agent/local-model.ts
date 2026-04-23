// =============================================
// AI SERVER CLIENT - Remote inference via Railway
// =============================================
// Replaces the @xenova/transformers in-process model with an HTTP client
// that calls the self-hosted FastAPI + llama.cpp server on Railway.
// Keeps the same chatCompletion<T> interface — all callers unchanged.
//
// Usage: import { getLocalModel } from '@/lib/ai-agent/local-model';
//        const result = await getLocalModel().chatCompletion<T>(systemPrompt, userMsg);

const AI_SERVER_URL = process.env.AI_SERVER_URL;

// =============================================
// LocalAIModel Class
// =============================================

export class LocalAIModel {

  // =============================================
  // Chat Completion (mirrors hfChatCompletion<T>)
  // =============================================

  async chatCompletion<T>(systemPrompt: string, userMessage: string): Promise<T> {
    if (!AI_SERVER_URL) {
      throw new Error('[ai-server] AI_SERVER_URL is not configured. Set it in your environment variables.');
    }

    if (process.env.DEBUG_LOCAL_MODEL) {
      console.log(`[ai-server] chatCompletion: message length=${userMessage.length} chars`);
    } else {
      console.log('[ai-server] chatCompletion: sending request to Railway...');
    }

    const raw = await this.generate(systemPrompt, userMessage);
    return this.parseJSON<T>(raw);
  }

  // =============================================
  // Internal Helpers
  // =============================================

  private async generate(systemPrompt: string, userMessage: string): Promise<string> {
    const startTime = Date.now();

    const response = await fetch(`${AI_SERVER_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: systemPrompt, user: userMessage }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `[ai-server] Request failed: ${response.status} ${response.statusText}` +
        (body ? ` — ${body}` : '')
      );
    }

    const data = await response.json();
    const text = data.text as string;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[ai-server] Received ${text.length} chars in ${elapsed}s`);

    return text;
  }

  private parseJSON<T>(raw: string): T {
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

    const startObj = cleaned.indexOf('{');
    const startArr = cleaned.indexOf('[');
    let start: number;
    let end: number;

    if (startArr >= 0 && (startObj < 0 || startArr < startObj)) {
      start = startArr;
      end = cleaned.lastIndexOf(']') + 1;
    } else if (startObj >= 0) {
      start = startObj;
      end = cleaned.lastIndexOf('}') + 1;
    } else {
      throw new Error('[ai-server] No JSON structure found in model output');
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

export function getLocalModel(): LocalAIModel {
  if (!globalForModel.localAIModel) {
    globalForModel.localAIModel = new LocalAIModel();
  }
  return globalForModel.localAIModel;
}
