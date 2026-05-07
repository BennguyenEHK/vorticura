// =============================================
// QUERY BUILDER — region-tiered search keywords
// =============================================
// Bakes "Vietnam > SEA > Asia > International" priority directly into the
// search keywords. The orchestrator walks tiers in order until enough results
// come back; combined with Tavily's country:'vietnam' param this gives us
// defence-in-depth on geographic preference (keywords + Tavily ranking).

// Single RFQ item — caller maps DB rows to this shape
export interface QueryItem {
  description: string;
  qty?: number;
  uom?: string;
}

/**
 * Build a tiered list of queries. Order matters: tier 1 first, fall through
 * to 2 / 3 only when fewer than 3 results come back. Keep each query short —
 * Tavily ranks better on focused keyword strings than long natural sentences.
 */
export function buildQueriesForItem(item: QueryItem): string[] {
  // Trim & collapse whitespace so multi-line descriptions don't bloat the URL.
  const desc = (item.description || '').replace(/\s+/g, ' ').trim();
  if (!desc) return [];

  return [
    // Tier 1 — Vietnamese suppliers only (.vn TLD bias via site: operator)
    `${desc} supplier site:.vn`,
    // Tier 2 — Southeast Asia hub countries
    `${desc} supplier Vietnam OR Thailand OR Malaysia OR Indonesia`,
    // Tier 3 — broader Asia / manufacturers
    `${desc} supplier Asia manufacturer`,
  ];
}
