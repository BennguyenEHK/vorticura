export { serperShoppingSearch, type ShoppingItem } from './serper-shopping';
export { fetchAsMarkdown, FETCH_MARKDOWN_MAX_CHARS } from './fetch-markdown';
export { fillShoppingMetadata, type FilledShoppingItem, type EnrichedSource } from './fill-shopping-metadata';
export { reviewAttempt, type ReviewResult } from './shopping-review';
export { agenticShoppingPipeline } from './agentic-shopping-pipeline';
export { lookupMemory, rememberSupplier, type MemoryScope, type MemoryHit } from './supplier-memory';
export { checkLivenessCached, clearLivenessCache } from './liveness';
export {
  enterSearchRun,
  emitRunStart,
  emitQuery,
  emitSerper,
  emitExtract,
  emitDrop,
  emitDedup,
  emitReview,
  emitDensity,
  emitRunSummary,
} from './telemetry';
export { specHash } from './spec-hash';

const HARD_JUNK_PREFIXES = [
  '/search', '/blog', '/news', '/about', '/about-us', '/contact',
  '/login', '/signin', '/account', '/cart', '/checkout',
  '/company', '/corporate', '/careers', '/press', '/investor',
];
const HARD_JUNK_INCLUDES = [
  '/company/', '/corporate/', '/about/', '/about-us/',
  '/careers/', '/press/', '/investor/',
];

export function isProductPage(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.pathname.length <= 1) return false;
    const path = u.pathname.toLowerCase();
    if (HARD_JUNK_PREFIXES.some(seg => path.startsWith(seg))) return false;
    if (HARD_JUNK_INCLUDES.some(sub => path.includes(sub))) return false;
    return true;
  } catch {
    return false;
  }
}
