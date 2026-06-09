import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

export const FETCH_MARKDOWN_MAX_CHARS = 12_000;

const REMOVE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'object', 'embed',
  'img', 'picture', 'source', 'video', 'audio', 'canvas', 'svg',
  'header', 'nav', 'aside',
  '[aria-hidden="true"]',
  '.breadcrumb', '.breadcrumbs', '[class*="breadcrumb"]',
  '.banner', '[class*="banner"]', '[class*="advertisement"]', '[class*="promo"]',
  '[class*="social"]', '[class*="share"]', '[class*="follow"]',
  '[class*="cookie"]', '[class*="gdpr"]', '[id*="cookie"]',
  '[class*="related"]', '[class*="recommend"]', '[class*="upsell"]',
  '[class*="cross-sell"]', '[class*="also-bought"]',
  '[class*="review-stars"]', '[class*="rating-bar"]',
  '[class*="wishlist"]', '[class*="compare"]',
];

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

export function cleanHtmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);
  REMOVE_SELECTORS.forEach(sel => $(sel).remove());
  const contentEl = $("main, article, [role='main'], #main, #center_col").first();
  const cleaned = contentEl.length ? contentEl.html()! : $('body').html() ?? '';
  const md = td.turndown(cleaned).replace(/\n{3,}/g, '\n\n').trim();
  return md.slice(0, FETCH_MARKDOWN_MAX_CHARS);
}

export async function fetchAsMarkdown(
  url: string,
  timeoutMs = 15_000,
): Promise<{ markdown: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const finalUrl = res.url;
    const html = await res.text();
    return { markdown: cleanHtmlToMarkdown(html), finalUrl };
  } catch {
    return null;
  }
}
