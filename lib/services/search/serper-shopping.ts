export interface ShoppingItem {
  title: string;
  source: string;
  link: string;
  price: number;
  currency: string;
  imageUrl?: string;
}

const SYMBOL_MAP: Array<[string, string]> = [
  ['AU$', 'AUD'], ['CA$', 'CAD'], ['NZ$', 'NZD'], ['SG$', 'SGD'], ['US$', 'USD'],
  ['$', 'USD'], ['€', 'EUR'], ['£', 'GBP'], ['¥', 'JPY'], ['₫', 'VND'],
];

export function parseShoppingPrice(raw: string): { price: number; currency: string } | null {
  if (!raw?.trim()) return null;
  const upper = raw.toUpperCase();
  for (const [sym, cur] of SYMBOL_MAP) {
    if (!upper.includes(sym.toUpperCase())) continue;
    const numStr = raw
      .replace(new RegExp(sym.replace(/[$]/g, '\\$'), 'gi'), '')
      .replace(/,/g, '')
      .trim();
    const price = parseFloat(numStr);
    if (isFinite(price) && price > 0) return { price, currency: cur };
  }
  const codeMatch = raw.match(/^(USD|AUD|EUR|GBP|SGD|CAD|NZD|VND)\s*([\d,.]+)/i);
  if (codeMatch) {
    const price = parseFloat(codeMatch[2].replace(/,/g, ''));
    if (isFinite(price) && price > 0) return { price, currency: codeMatch[1].toUpperCase() };
  }
  return null;
}

interface RawItem { title?: string; source?: string; link?: string; price?: string; imageUrl?: string }

export function parseShoppingItem(item: RawItem): ShoppingItem | null {
  const parsed = parseShoppingPrice(item.price ?? '');
  if (!parsed) return null;
  return {
    title: item.title ?? '',
    source: item.source ?? '',
    link: item.link ?? '',
    price: parsed.price,
    currency: parsed.currency,
    imageUrl: item.imageUrl,
  };
}

export async function serperShoppingSearch(query: string): Promise<ShoppingItem[]> {
  if (!query.trim()) return [];
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error('SERPER_API_KEY is not set');
  const res = await fetch('https://google.serper.dev/shopping', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query.trim(), num: 10 }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Serper shopping failed: ${res.status} ${res.statusText}`);
  const data = await res.json() as { shopping?: RawItem[] };
  return (data.shopping ?? [])
    .map(parseShoppingItem)
    .filter((item): item is ShoppingItem => item !== null);
}
