import type { MarketCard, MarketCardList, MarketCountry } from '../server/creditCardMarket';

export type { MarketCard, MarketCardList, MarketCountry };

export const MARKET_COUNTRIES: Record<MarketCountry, { label: string; title: string; source: string; sourceUrl: string }> = {
  sg: { label: 'Singapore', title: 'Singapore credit cards', source: 'MoneySmart', sourceUrl: 'https://www.moneysmart.sg/credit-cards' },
  my: { label: 'Malaysia', title: 'Malaysia credit cards', source: 'RinggitPlus', sourceUrl: 'https://ringgitplus.com/en/credit-card/' },
};

const CACHE_PREFIX = 'subtrack_card_market_v1:';
export const STALE_AFTER_MS = 24 * 3600_000; // lists older than this refresh on their own

// The last list fetched for a country, kept on this device so the tab opens instantly.
export const readCachedMarket = (country: MarketCountry): MarketCardList | null => {
  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_PREFIX + country) || 'null');
    return stored && stored.country === country && Array.isArray(stored.cards) ? stored : null;
  } catch {
    return null;
  }
};

const writeCachedMarket = (list: MarketCardList) => {
  try { localStorage.setItem(CACHE_PREFIX + list.country, JSON.stringify(list)); } catch { /* storage full or blocked */ }
};

// Same-origin route (server/creditCardMarket.ts). `refresh` skips the server's 6-hour cache.
export const fetchMarketCards = async (country: MarketCountry, refresh = false, signal?: AbortSignal): Promise<MarketCardList> => {
  const response = await fetch(`/api/credit-cards?country=${country}${refresh ? '&refresh=1' : ''}`, { signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `The card list couldn't be loaded (${response.status}).`);
  // A server without this route answers with the app's index.html instead.
  if (!data || !Array.isArray(data.cards)) throw new Error('The card list service isn\'t available on this server yet - restart the dev server or redeploy.');
  const list = { ...data, warnings: Array.isArray(data.warnings) ? data.warnings : [] } as MarketCardList;
  writeCachedMarket(list);
  return list;
};

// First amount in a fee or income string: "Free" is 0, "S$196.20" is 196.2, "RM3,000/month" is
// 3000, and "(a) Singaporeans: SGD 65,000 OR ..." is 65000. Unknown sorts last.
export const amountOf = (text: string | null): number => {
  if (!text) return Infinity;
  if (/^free\b/i.test(text.trim())) return 0;
  const match = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Infinity;
};

export type MarketSort = 'featured' | 'name' | 'fee' | 'income';

export interface MarketFilter {
  query: string;
  issuer: string; // '' for all
  category: string; // '' for all
  sort: MarketSort;
}

export const filterMarketCards = (cards: MarketCard[], filter: MarketFilter): MarketCard[] => {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  const matching = cards.filter(card => {
    if (filter.issuer && card.issuer !== filter.issuer) return false;
    if (filter.category && !card.categories.includes(filter.category)) return false;
    if (!words.length) return true;
    const text = [card.name, card.issuer, card.network, ...card.categories, ...card.highlights.flatMap(item => [item.value, item.label])].join(' ').toLowerCase();
    return words.every(word => text.includes(word));
  });
  if (filter.sort === 'featured') return matching; // the source's own order
  const sorted = [...matching];
  if (filter.sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
  if (filter.sort === 'fee') sorted.sort((a, b) => amountOf(a.annualFee) - amountOf(b.annualFee) || a.name.localeCompare(b.name));
  if (filter.sort === 'income') sorted.sort((a, b) => amountOf(a.minIncome) - amountOf(b.minIncome) || a.name.localeCompare(b.name));
  return sorted;
};

const nameKey = (name: string) => name.toLowerCase().replace(/\b(credit|card|cards|the)\b/g, '').replace(/[^a-z0-9]/g, '');

// Whether one of your own cards is this market card, by name ("UOB One" matches "UOB One Card").
export const ownsCard = (card: MarketCard, ownNames: string[]): boolean => {
  const key = nameKey(card.name);
  if (key.length < 4) return false;
  return ownNames.some(own => { const mine = nameKey(own); return mine.length >= 4 && (mine === key || (mine.length >= 6 && key.includes(mine)) || (key.length >= 6 && mine.includes(key))); });
};

export const categoriesOf = (cards: MarketCard[]): string[] => {
  const counts = new Map<string, number>();
  cards.forEach(card => card.categories.forEach(category => counts.set(category, (counts.get(category) || 0) + 1)));
  return [...counts].sort((a, b) => b[1] - a[1]).map(([category]) => category);
};

export const issuersOf = (cards: MarketCard[]): string[] => [...new Set(cards.map(card => card.issuer))].sort((a, b) => a.localeCompare(b));
