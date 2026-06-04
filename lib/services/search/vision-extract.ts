// Vision Extract: Layer 4 image OCR price extraction.

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

// --- Local types for multimodal message content ---
// ChatCompletionInputMessageChunk is not re-exported from @huggingface/tasks
// top-level; declare a structurally identical local interface instead.
interface MessageChunk {
  type: ChatCompletionInputMessageChunkType; // "text" | "image_url"
  text?: string;
  image_url?: { url: string };
  // Required for structural compatibility with MessageChunk.
  [property: string]: unknown;
}

// --- Public API ---

/** Price extracted from a product-page image. */
export interface VisionExtract {
  price: number;
  currency: string;
}

// --- Configuration ---

/** Vision model timeout in ms. */
const VISION_TIMEOUT_MS = 12_000;

/** Screenshot service timeout in ms. */
const SCREENSHOT_TIMEOUT_MS = 25_000;

/** Sentinel returned on every failure path. */
const ZERO_RESULT: VisionExtract = { price: 0, currency: '' };

/** True when SEARCH_VISION_ENABLED=1; check before calling extractFromVision. */
export function isVisionEnabled(): boolean {
  return process.env.SEARCH_VISION_ENABLED === '1';
}

// --- Helper: resolve relative image URL ---

/** Resolve src/content attribute to absolute URL; null if unresolvable. */
function resolveImageUrl(raw: string | undefined, pageUrl: string): string | null {
  if (!raw || !raw.trim()) return null;
  const src = raw.trim();
  try {
    const resolved = new URL(src, pageUrl);
    // Only http(s) fetchable by vision model.
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.href;
  } catch {
    return null;
  }
}

// --- Helper: build full-page screenshot URL ---

/**
 * Build screenshot URL: ScreenshotOne (access key) or
 * SCREENSHOT_URL_TEMPLATE. Returns null if neither configured.
 */
function buildScreenshotUrl(pageUrl: string): string | null {
  // Path 1: ScreenshotOne (turnkey).
  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY;
  if (accessKey) {
    const params = new URLSearchParams({
      access_key: accessKey,
      url: pageUrl,
      full_page: 'true',            // whole page, not just viewport
      format: 'jpg',                // compact raster for OCR
      response_type: 'by_format',   // raw image bytes
      image_quality: '80',          // good for OCR, small payload
      block_ads: 'true',
      block_cookie_banners: 'true', // strip price-hiding overlays
      block_trackers: 'true',
      timeout: '20',                // ScreenshotOne nav timeout (s)
    });
    return `https://api.screenshotone.com/take?${params.toString()}`;
  }

  // Path 2: generic template (any other provider).
  const template = process.env.SCREENSHOT_URL_TEMPLATE;
  if (template && template.includes('{{url}}')) {
    return template.replace('{{url}}', encodeURIComponent(pageUrl));
  }

  return null;
}

/**
 * Fetch screenshot server-side and return as base64 data URL.
 * Keeps access_key server-side; returns null on failure.
 */
async function fetchImageAsDataUrl(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      console.warn('[vision-extract] screenshot fetch failed:', res.status, res.statusText);
      return null;
    }
    // Default mime to jpeg (our requested format).
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
    if (!mime.startsWith('image/')) {
      // by_format errors return JSON, not an image.
      console.warn('[vision-extract] screenshot response was not an image:', mime);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (err) {
    console.warn('[vision-extract] screenshot fetch error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// --- Helper: find primary product image from HTML ---

/**
 * Find best product image: og:image, largest img, or first img.
 * Returns null when no usable image found.
 */
function findImageUrl(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);

  // Priority 1: og:image.
  const ogContent = $('meta[property="og:image"]').attr('content');
  const ogUrl = resolveImageUrl(ogContent, pageUrl);
  if (ogUrl) return ogUrl;

  // Priority 2: largest img by width × height.
  let bestUrl: string | null = null;
  let bestArea = 0;

  $('img').each((_i, el) => {
    const $el = $(el);
    const rawW = $el.attr('width');
    const rawH = $el.attr('height');

    // Score only when both dimension attrs are numeric.
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

  // Priority 3: first img with any src.
  let firstSrc: string | null = null;
  $('img').each((_i, el) => {
    if (firstSrc) return; // already found
    const resolved = resolveImageUrl($(el).attr('src'), pageUrl);
    if (resolved) firstSrc = resolved;
  });

  return firstSrc;
}

// --- Helper: parse vision model JSON response ---

/** Extract {price, currency} from raw model output; ZERO_RESULT on failure. */
function parseVisionResponse(raw: string): VisionExtract {
  // Strip ```json...``` fences.
  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  // Slice to first '{' ... last '}'; tolerate trailing text.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return ZERO_RESULT;

  cleaned = cleaned.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Malformed JSON.
    return ZERO_RESULT;
  }

  if (typeof parsed !== 'object' || parsed === null) return ZERO_RESULT;

  const obj = parsed as Record<string, unknown>;

  // Validate price: must be finite and positive.
  const rawPrice = obj['price'];
  if (typeof rawPrice !== 'number' || !isFinite(rawPrice) || rawPrice <= 0) {
    return ZERO_RESULT;
  }
  const price = rawPrice;

  // Validate currency: must be 3-letter ISO-4217 code.
  const rawCurrency = obj['currency'];
  let currency = '';
  if (typeof rawCurrency === 'string') {
    const upper = rawCurrency.trim().toUpperCase();
    currency = /^[A-Z]{3}$/.test(upper) ? upper : '';
  }

  return { price, currency };
}

// --- Main: extractFromVision ---

/**
 * Layer 4 — vision price extraction via HuggingFace model.
 * Called when Layers 1-3 returned price=0.
 * @param html       - Raw page HTML for image discovery.
 * @param pageUrl    - Page URL for resolving relative img src.
 * @param specTokens - RFQ spec tokens for variant disambiguation.
 */
export async function extractFromVision(
  html: string,
  pageUrl: string,
  specTokens: string[] = [],
): Promise<VisionExtract> {
  try {
    // Layer off unless SEARCH_VISION_ENABLED=1.
    if (process.env.SEARCH_VISION_ENABLED !== '1') {
      return ZERO_RESULT;
    }

    // pageUrl required; html needed only when no screenshot service.
    if (!pageUrl) return ZERO_RESULT;
    const hasScreenshotService = !!(
      process.env.SCREENSHOTONE_ACCESS_KEY ||
      process.env.SCREENSHOT_URL_TEMPLATE?.includes('{{url}}')
    );
    if (!html && !hasScreenshotService) return ZERO_RESULT;

    // Step 1: pick the image. Prefer full-page screenshot when configured.
    // Fallback: DOM og:image / largest img.
    const shotUrl = buildScreenshotUrl(pageUrl);
    let imageUrl: string | null = null;

    if (shotUrl) {
      imageUrl = await fetchImageAsDataUrl(shotUrl, SCREENSHOT_TIMEOUT_MS);
      if (!imageUrl) {
        // Screenshot failed — fall back to DOM image.
        console.warn('[vision-extract] screenshot download failed, falling back to DOM image for', pageUrl);
        imageUrl = findImageUrl(html, pageUrl);
      }
    } else {
      // No screenshot service — use DOM image.
      imageUrl = findImageUrl(html, pageUrl);
    }

    if (!imageUrl) {
      // No usable image found.
      return ZERO_RESULT;
    }

    // Step 2: resolve vision model ID.
    // Default: Qwen2.5-VL-72B-Instruct (verified on HF Inference).
    const model = process.env.HF_VISION_MODEL_ID || 'Qwen/Qwen2.5-VL-72B-Instruct';

    // Step 3: build multimodal message array.
    const userContent: MessageChunk[] = [
      {
        type: 'text',
        text: buildImageUserMessageText(specTokens),
      },
      {
        type: 'image_url',
        image_url: { url: imageUrl },
      },
    ];

    const messages: ChatCompletionInputMessage[] = [
      {
        role: 'system',
        content: EXTRACT_FROM_IMAGE_PROMPT,
      },
      {
        role: 'user',
        content: userContent,
      },
    ];

    // Step 4: call model with hard timeout via Promise.race.
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), VISION_TIMEOUT_MS),
    );

    const completionPromise = getHFClient().chatCompletion({
      model,
      messages,
      max_tokens: 200,    // Price JSON is small.
      temperature: 0.1,   // Near-deterministic extraction.
    });

    const response = await Promise.race([completionPromise, timeoutPromise]);

    // Timeout: model did not respond in time.
    if (response === null) {
      console.warn('[vision-extract] Vision model timed out after', VISION_TIMEOUT_MS, 'ms for', pageUrl);
      return ZERO_RESULT;
    }

    // Step 5: parse and validate JSON response.
    const rawContent = response.choices[0]?.message?.content ?? '';
    return parseVisionResponse(rawContent);

  } catch (err: unknown) {
    // Top-level fail-safe: never throw.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[vision-extract] Unhandled error for', pageUrl, '—', msg);
    return ZERO_RESULT;
  }
}
