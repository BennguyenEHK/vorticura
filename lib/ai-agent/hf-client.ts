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
// Usage: import { hfChatCompletion } from '@/lib/ai-agent/hf-client';
//        const data = await hfChatCompletion<AnalysisData>(SYSTEM_PROMPT, userMsg);

import { InferenceClient } from '@huggingface/inference';

// =============================================
// Configuration
// =============================================

/** HuggingFace model ID — override via env or use default */
const HF_MODEL = process.env.HF_MODEL_ID || 'mistralai/Mistral-7B-Instruct-v0.3';

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
// System Prompts (shared with local-model.ts)
// =============================================

/** System prompt for RFQ analysis — outputs strict JSON matching AnalysisData */
export const ANALYSIS_SYSTEM_PROMPT = `You are an RFQ (Request for Quotation) analysis assistant.
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

/** System prompt for supplier search — outputs strict JSON array matching SupplierResult[] */
export const SUPPLIER_SEARCH_SYSTEM_PROMPT = `You are a supplier discovery assistant.
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

/** System prompt for supplier response extraction — outputs strict JSON matching AIExtractionResult */
export const SUPPLIER_RESPOND_SYSTEM_PROMPT = `You are a supplier response extraction assistant.
Analyze the supplier's email reply and extract per-item pricing and delivery information.

You MUST return ONLY valid JSON (no markdown, no explanation) with this exact schema:
{
  "supplier_name": "Supplier Company Name",
  "items": [
    {
      "item_id": 1,
      "status": "available",
      "currency_code": "USD",
      "bidder_proposal": {
        "bidder_description": "supplier's product description",
        "bidder_unit_price": 25.50,
        "delivery_time": "4 weeks ARO",
        "compliance_deviation": "Meets all specifications"
      }
    }
  ],
  "confidence": 0.85
}

Rules:
- Extract ALL items mentioned in the supplier's response
- status must be "available" or "unavailable"
- If price is not mentioned, set bidder_unit_price to 0
- confidence between 0.0 and 1.0 based on clarity of the response
- Return ONLY the JSON object, nothing else`;

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
