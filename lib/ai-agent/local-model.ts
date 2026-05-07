// =============================================
// AI SERVER CLIENT — vLLM OpenAI-compatible inference
// =============================================
// Talks to the self-hosted vLLM server (RunPod) via the OpenAI
// /v1/chat/completions protocol. Same chatCompletion<T> contract as
// hf-client.ts so all callers (analysis, supplier-search, respond) stay
// identical regardless of AI_MODE.
//
// Server-side reference: ../../vorticura-ai-server/Documents/ai-deploy.md

import { jsonrepair } from 'jsonrepair';

const AI_SERVER_URL = process.env.AI_SERVER_URL;
const AI_API_KEY = process.env.AI_API_KEY;
const AI_MODEL_ID = process.env.AI_MODEL_ID || 'vorticura';

// =============================================
// LocalAIModel Class
// =============================================

export class LocalAIModel {

  // =============================================
  // Chat Completion (mirrors hfChatCompletion<T>)
  // =============================================

  async chatCompletion<T>(
    systemPrompt: string,
    userMessage: string,
    maxTokens = 1024,
    schema?: object,  // Optional JSON-Schema for vLLM xgrammar guided decoding (locks output shape)
  ): Promise<T> {
    if (!AI_SERVER_URL) {
      throw new Error('[ai-server] AI_SERVER_URL is not configured. Set it in your environment variables.');
    }

    if (process.env.DEBUG_LOCAL_MODEL) {
      console.log(`[ai-server] chatCompletion: message length=${userMessage.length} chars, max_tokens=${maxTokens}, guided=${schema ? 'yes' : 'no'}`);
    } else {
      console.log('[ai-server] chatCompletion: sending request to vLLM...');
    }

    const raw = await this.generate(systemPrompt, userMessage, maxTokens, schema);
    return this.parseJSON<T>(raw);
  }

  // =============================================
  // Internal Helpers
  // =============================================

  private async generate(
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
    schema?: object,
  ): Promise<string> {
    const startTime = Date.now();

    // Body construction: when a schema is supplied we use vLLM's xgrammar
    // guided_json (stricter — enforces field shapes); otherwise fall back to
    // the looser response_format json_object grammar. Mixing both is invalid.
    const body: Record<string, unknown> = {
      model: AI_MODEL_ID,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
    };
    if (schema) {
      // vLLM accepts guided_json under extra_body in the OpenAI-compat layer.
      // xgrammar is set as guided-decoding-backend on the pod start command.
      body.extra_body = { guided_json: schema };
    } else {
      // Default JSON-object mode keeps existing analysis/respond callers working
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(`${AI_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AI_API_KEY ? { 'Authorization': `Bearer ${AI_API_KEY}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `[ai-server] Request failed: ${response.status} ${response.statusText}` +
        (body ? ` — ${body}` : '')
      );
    }

    const data = await response.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    if (!text) {
      throw new Error(`[ai-server] Empty response from vLLM: ${JSON.stringify(data).slice(0, 300)}`);
    }
    // vLLM tells us directly when generation hit the token cap. Fail fast with
    // a clear message rather than letting parseJSON throw a misleading bracket
    // / syntax error downstream.
    const finishReason: string | undefined = data?.choices?.[0]?.finish_reason;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[ai-server] Received ${text.length} chars in ${elapsed}s (finish_reason=${finishReason ?? 'unknown'})`);

    if (finishReason === 'length') {
      throw new Error(
        `[ai-server] Output truncated: vLLM hit max_tokens cap (${maxTokens}). ` +
        `Received ${text.length} chars before stop. Increase max_tokens for this caller.`
      );
    }

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

    // Detect truncated arrays before throwing a misleading SyntaxError
    const openCount = (jsonStr.match(/\[/g) || []).length;
    const closeCount = (jsonStr.match(/\]/g) || []).length;
    if (openCount !== closeCount) {
      throw new Error(`[ai-server] Truncated JSON output detected (${openCount} '[' vs ${closeCount} ']'). Increase max_tokens.`);
    }

    try {
      return JSON.parse(jsonStr) as T;
    } catch (firstErr) {
      try {
        const repaired = jsonrepair(jsonStr);
        return JSON.parse(repaired) as T;
      } catch (secondErr) {
        console.error(
          `[ai-server] parseJSON failed after repair attempt.\n` +
          `  primary: ${firstErr instanceof Error ? firstErr.message : firstErr}\n` +
          `  repair:  ${secondErr instanceof Error ? secondErr.message : secondErr}\n` +
          `  --- raw head (600) ---\n${raw.slice(0, 600)}\n` +
          `  --- raw tail (400) ---\n${raw.slice(-400)}`
        );
        throw firstErr;
      }
    }
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
