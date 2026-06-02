/* ========================================================================
   Vision Extract: Last-resort image OCR price layer — Layer 4 of the
   extraction cascade.

   Operates on the product-page HTML (to locate the primary product image)
   and then sends that image URL to a HuggingFace vision model for price
   extraction via chat completion.

   This layer is OFF by default (SEARCH_VISION_ENABLED !== '1') because
   the vision model may not be available on all HF serverless provider
   configurations — the same pattern used by supplier-memory to gate its
   read path. Set SEARCH_VISION_ENABLED=1 in .env.local to enable.

   This module MUST NEVER THROW. Every error path returns { price: 0,
   currency: '' } and emits a console.warn. Timeouts are enforced via
   Promise.race so a hung model cannot stall the serverless function.
   ======================================================================== */

import * as cheerio from 'cheerio';
import { getHFClient } from '@/lib/ai-agent/hf-client';
import {
  EXTRACT_FROM_IMAGE_PROMPT,
  buildImageUserMessageText,
} from '@/lib/ai-agent/prompt/extract-from-image';
import type {
  ChatCompletionInputMessage,
  ChatCompletionInputMessageChunkType,
} from '@huggingface/tasks';

// =============================================
// Local types for multimodal message content
// =============================================

// ChatCompletionInputMessageChunk is defined in @huggingface/tasks/tasks/chat-completion
// but is NOT re-exported from the package top-level index. Rather than importing
// from a private sub-path (fragile across package versions), we declare a structurally
// identical local interface and cast the content array when assigning to the message.
// ChatCompletionInputMessage.content is typed as
//   ChatCompletionInputMessageChunk[] | string | undefined
// and ChatCompletionInputMessage has [property: string]: unknown, so we assign
// via the `content` property of a typed object literal to satisfy strict mode
// without hiding real type errors.
interface MessageChunk {
  type: ChatCompletionInputMessageChunkType; // "text" | "image_url" — from the exported union
  text?: string;
  image_url?: { url: string };
  // Index signature required for structural compatibility with
  // ChatCompletionInputMessageChunk (which also carries [property: string]: unknown).
  [property: string]: unknown;
}

// =============================================
// Public API
// =============================================

/** Price extracted from a product-page image by a vision model. */
export interface VisionExtract {
  price: number;
  currency: string;
}

// =============================================
// Configuration
// =============================================

/** How long (ms) to wait for the vision model before giving up. */
const VISION_TIMEOUT_MS = 12_000;

/** Sentinel returned on every failure path — never throws. */
const ZERO_RESULT: VisionExtract = { price: 0, currency: '' };

// =============================================
// Helper: resolve a potentially relative image URL
// =============================================

/**
 * Resolve a raw src/content attribute value to an absolute URL.
 * Returns null when the value is empty or cannot be resolved.
 */
function resolveImageUrl(raw: string | undefined, pageUrl: string): string | null {
  if (!raw || !raw.trim()) return null;
  const src = raw.trim();
  try {
    // Resolve relative paths against the page origin.
    const resolved = new URL(src, pageUrl);
    // Only http(s) images are fetchable by the remote vision model — reject
    // data:/blob:/javascript: schemes that would bloat the payload or break the call.
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.href;
  } catch {
    // Unresolvable — skip this candidate.
    return null;
  }
}

// =============================================
// Helper: find the primary product image from HTML
// =============================================

/**
 * Use cheerio to locate the best product image URL in the page HTML.
 *
 * Priority order:
 *   1. <meta property="og:image"> — most reliable (explicit social/product intent).
 *   2. Largest <img> by width*height attrs (if attrs are present).
 *   3. First <img> with any src attribute.
 *
 * Returns null when no usable image is found.
 */
function findImageUrl(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);

  // --- Priority 1: OpenGraph og:image meta tag ---
  const ogContent = $('meta[property="og:image"]').attr('content');
  const ogUrl = resolveImageUrl(ogContent, pageUrl);
  if (ogUrl) return ogUrl;

  // --- Priority 2: largest <img> by explicit width × height attributes ---
  let bestUrl: string | null = null;
  let bestArea = 0;

  $('img').each((_i, el) => {
    const $el = $(el);
    const rawW = $el.attr('width');
    const rawH = $el.attr('height');

    // Only score this <img> when both dimension attrs are present and numeric.
    if (rawW && rawH) {
      const w = parseFloat(rawW);
      const h = parseFloat(rawH);
      if (isFinite(w) && isFinite(h) && w > 0 && h > 0) {
        const area = w * h;
        if (area > bestArea) {
          const resolved = resolveImageUrl($el.attr('src'), pageUrl);
          if (resolved) {
            bestArea = area;
            bestUrl = resolved;
          }
        }
      }
    }
  });

  if (bestUrl) return bestUrl;

  // --- Priority 3: first <img> with any src ---
  let firstSrc: string | null = null;
  $('img').each((_i, el) => {
    if (firstSrc) return; // already found — jQuery-style early exit via flag.
    const resolved = resolveImageUrl($(el).attr('src'), pageUrl);
    if (resolved) firstSrc = resolved;
  });

  return firstSrc;
}

// =============================================
// Helper: parse the vision model's JSON response
// =============================================

/**
 * Strip markdown fences and extract a { price, currency } pair from the
 * model's raw text output. Returns ZERO_RESULT when parsing fails or the
 * values are out of range.
 */
function parseVisionResponse(raw: string): VisionExtract {
  // Strip ```json ... ``` fences the model might emit despite instructions.
  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  // Slice from the first '{' to the last '}' to tolerate trailing commentary.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return ZERO_RESULT;

  cleaned = cleaned.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Malformed JSON — treat as no price.
    return ZERO_RESULT;
  }

  if (typeof parsed !== 'object' || parsed === null) return ZERO_RESULT;

  const obj = parsed as Record<string, unknown>;

  // --- Validate price ---
  const rawPrice = obj['price'];
  if (typeof rawPrice !== 'number' || !isFinite(rawPrice) || rawPrice <= 0) {
    // price must be a finite positive number; 0 or missing means no price found.
    return ZERO_RESULT;
  }
  const price = rawPrice;

  // --- Validate currency ---
  const rawCurrency = obj['currency'];
  let currency = '';
  if (typeof rawCurrency === 'string') {
    const upper = rawCurrency.trim().toUpperCase();
    // Accept only valid 3-letter ISO-4217 codes; discard anything else.
    currency = /^[A-Z]{3}$/.test(upper) ? upper : '';
  }

  return { price, currency };
}

// =============================================
// Main: extractFromVision
// =============================================

/**
 * Layer 4 — Vision/image-to-text price extraction.
 *
 * Locates the primary product image in the page HTML, sends it to a
 * HuggingFace vision model (Qwen2.5-VL by default), and parses the
 * returned price JSON.
 *
 * Called by the extraction cascade ONLY when Layers 1–3 (html-gate,
 * html-extract, manual-extract / LLM) all returned price=0.
 *
 * @param html        - Raw HTML of the product page (used for image discovery).
 * @param pageUrl     - Canonical URL of the page (used to resolve relative img src).
 * @param specTokens  - Parsed RFQ spec tokens for variant disambiguation
 *                      (e.g. ["gate valve", "2 inch", "class 150"]).
 * @returns           { price, currency } or { price:0, currency:'' } on any failure.
 */
export async function extractFromVision(
  html: string,
  pageUrl: string,
  specTokens: string[] = [],
): Promise<VisionExtract> {
  try {
    // --- ENV GATE: layer is OFF by default ---
    // SEARCH_VISION_ENABLED guards this layer because the vision model may
    // not be provisioned on all HF serverless accounts. Mirror of how
    // supplier-memory gates its read path (isMemoryEnabled in supplier-memory.ts).
    if (process.env.SEARCH_VISION_ENABLED !== '1') {
      return ZERO_RESULT;
    }

    // Guard: refuse to proceed without both HTML and URL.
    if (!html || !pageUrl) return ZERO_RESULT;

    // --- Step 1: locate the primary product image URL ---
    const imageUrl = findImageUrl(html, pageUrl);
    if (!imageUrl) {
      // No usable image on this page — vision layer cannot help.
      return ZERO_RESULT;
    }

    // --- Step 2: resolve the vision model ID ---
    // Override via HF_VISION_MODEL_ID; default to Qwen2.5-VL-7B-Instruct
    // which has strong multilingual OCR and product-page comprehension.
    const model = process.env.HF_VISION_MODEL_ID || 'Qwen/Qwen2.5-VL-7B-Instruct';

    // --- Step 3: build the multimodal message array ---
    // The user message carries both the spec-hint text and the image URL so
    // the model can pick the correct variant price when multiple are shown.
    const userContent: MessageChunk[] = [
      {
        type: 'text',
        // Short instruction embedding the spec hint (or generic if no tokens).
        text: buildImageUserMessageText(specTokens),
      },
      {
        type: 'image_url',
        // Pass the resolved absolute image URL for the model to fetch.
        image_url: { url: imageUrl },
      },
    ];

    const messages: ChatCompletionInputMessage[] = [
      {
        role: 'system',
        // System prompt instructs strict JSON-only output format.
        content: EXTRACT_FROM_IMAGE_PROMPT,
      },
      {
        role: 'user',
        // Multimodal content: text hint + image.
        content: userContent,
      },
    ];

    // --- Step 4: call the vision model with a hard timeout ---
    // Promise.race ensures a hung or slow model never parks the serverless
    // function beyond VISION_TIMEOUT_MS; the race winner resolves to null
    // on timeout, which is handled as a graceful no-price result below.
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), VISION_TIMEOUT_MS),
    );

    const completionPromise = getHFClient().chatCompletion({
      model,
      messages,
      max_tokens: 200,    // Price JSON is tiny; cap to avoid runaway generation.
      temperature: 0.1,   // Near-deterministic for structured extraction.
    });

    const response = await Promise.race([completionPromise, timeoutPromise]);

    // Timeout path — model did not respond in time.
    if (response === null) {
      console.warn('[vision-extract] Vision model timed out after', VISION_TIMEOUT_MS, 'ms for', pageUrl);
      return ZERO_RESULT;
    }

    // --- Step 5: parse and validate the JSON response ---
    const rawContent = response.choices[0]?.message?.content ?? '';
    return parseVisionResponse(rawContent);

  } catch (err: unknown) {
    // Top-level fail-safe: this module MUST NEVER THROW.
    // Log with enough context to diagnose but do not propagate.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[vision-extract] Unhandled error for', pageUrl, '—', msg);
    return ZERO_RESULT;
  }
}
