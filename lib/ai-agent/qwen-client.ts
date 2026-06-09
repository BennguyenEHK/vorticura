export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallModelParams {
  model?: string;
  messages: ModelMessage[];
  enable_thinking?: boolean;
  budget_tokens?: number;
  temperature?: number;
  max_tokens?: number;
}

export const QWEN_MODEL = 'Qwen/Qwen3.6-35B-A3B:featherless-ai';
const HF_BASE_URL = 'https://router.huggingface.co/v1/chat/completions';

export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export function extractThinking(raw: string): { thinking: string | null; text: string } {
  const match = raw.match(/<think>([\s\S]*?)<\/think>/);
  return {
    thinking: match ? match[1].trim() : null,
    text: raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
  };
}

export function extractJson<T>(raw: string): T | null {
  const cleaned = stripThinking(raw).trim();
  try { return JSON.parse(cleaned) as T; } catch { /* fall through */ }
  const noFence = cleaned.replace(/```(?:json)?/gi, '');
  const start = noFence.indexOf('{');
  const end = noFence.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(noFence.slice(start, end + 1)) as T; } catch { /* fall through */ }
  }
  return null;
}

function buildRawContent(msg: {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
}): string {
  const content = msg.content ?? '';
  const reasoning = msg.reasoning_content ?? msg.reasoning ?? null;
  if (reasoning && !content.includes('<think>')) return `<think>${reasoning}</think>${content}`;
  return content;
}

async function tryRunPod(payload: Record<string, unknown>): Promise<string | null> {
  const url = process.env.RUNPOD_REASONING_URL;
  if (!url) return null;
  const rpModel = process.env.RUNPOD_REASONING_MODEL;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.RUNPOD_API_KEY) headers.Authorization = `Bearer ${process.env.RUNPOD_API_KEY}`;
  const res = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...payload, ...(rpModel ? { model: rpModel } : {}) }),
    signal: AbortSignal.timeout(Number(process.env.RUNPOD_TIMEOUT_MS ?? 90_000)),
  });
  if (!res.ok) throw new Error(`RunPod HTTP ${res.status}`);
  const data = await res.json() as {
    choices?: { message: { content?: string | null; reasoning_content?: string | null } }[];
  };
  const msg = data.choices?.[0]?.message;
  return msg ? buildRawContent(msg) : null;
}

async function getModelContent(params: CallModelParams): Promise<string> {
  const {
    model = QWEN_MODEL,
    messages,
    enable_thinking = false,
    budget_tokens = 8000,
    temperature = 0.1,
    max_tokens = 1024,
  } = params;

  // CRITICAL: always send explicit enable_thinking — Qwen3.6 defaults thinking ON.
  // Omitting it on "non-thinking" calls causes the model to consume max_tokens on
  // the reasoning chain and truncate the JSON response.
  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: Math.min(enable_thinking ? budget_tokens : max_tokens, 4096),
    chat_template_kwargs: { enable_thinking },
  };

  const hfToken = process.env.HF_TOKEN ?? process.env.HF_API_KEY;
  const hfUrl = process.env.HF_BASE_URL ?? HF_BASE_URL;
  try {
    const res = await fetch(hfUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hfToken}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(enable_thinking ? 290_000 : 60_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`HF HTTP ${res.status}${errBody ? ` — ${errBody.slice(0, 200)}` : ''}`);
    }
    const data = await res.json() as {
      choices?: { message: { content?: string | null; reasoning_content?: string | null } }[];
    };
    if (data.choices?.[0]) return buildRawContent(data.choices[0].message);
    throw new Error('HF returned no choices');
  } catch (err) {
    console.error('[qwen-client] HF failed → RunPod fallback:', err instanceof Error ? err.message : err);
  }

  const rpResult = await tryRunPod(payload);
  if (rpResult) return rpResult;
  throw new Error(`Qwen inference failed — both HF and RunPod unavailable`);
}

export async function callModel(params: CallModelParams): Promise<string> {
  return stripThinking(await getModelContent(params));
}

export async function callQwen(
  messages: ModelMessage[],
  opts?: { thinking?: boolean; budgetTokens?: number; temperature?: number; maxTokens?: number },
): Promise<{ text: string; thinking: string | null }> {
  const raw = await getModelContent({
    model: QWEN_MODEL,
    messages,
    enable_thinking: opts?.thinking ?? false,
    budget_tokens: opts?.budgetTokens,
    temperature: opts?.temperature,
    max_tokens: opts?.maxTokens,
  });
  return extractThinking(raw);
}
