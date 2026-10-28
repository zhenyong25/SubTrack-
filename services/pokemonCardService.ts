export type CardGrade = 'Raw' | `PSA ${number}`;
export interface PokemonPrice {
  id: string;
  source: string;
  grade: CardGrade;
  amount: number;
  currency: string;
  date: string;
  kind: 'Market estimate' | 'Asking price' | 'Completed sale';
  url: string;
}
export interface PokemonTrackedCard {
  id: string;
  name: string;
  set: string;
  number: string;
  language: string;
  grade: CardGrade;
  certificate: string;
  notes: string;
  prices: PokemonPrice[];
  catalogId?: string;
  catalogSetId?: string;
  imageUrl?: string;
  rarity?: string;
  catalogSourceUrl?: string;
  pokedexNumber?: number;
  englishSpeciesName?: string;
}
export const CARD_GRADES: CardGrade[] = ['Raw', ...Array.from({ length: 10 }, (_, i) => `PSA ${i + 1}` as CardGrade)];
export function safeMarketUrl(value: string): string | undefined {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
// Compare only matching grades, currencies and price types. Each source contributes
// its newest observation; older observations remain available in the history.
export function latestPokemonPrices(prices: PokemonPrice[]): PokemonPrice[] {
  const latest = new Map<string, PokemonPrice>();
  for (const price of prices) {
    const key = JSON.stringify([price.source.trim().toLowerCase(), price.grade, price.currency, price.kind]);
    const existing = latest.get(key);
    if (!existing || price.date >= existing.date) latest.set(key, price);
  }
  return [...latest.values()];
}
