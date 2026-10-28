import { fetchChineseCatalog } from './chinesePokemonCatalog';
export const POKEMON_LANGUAGES = [
  ['en', 'English'], ['ja', 'Japanese'], ['zh-tw', 'Traditional Chinese'],
  ['zh-cn', 'Simplified Chinese'], ['ko', 'Korean'], ['fr', 'French'],
  ['de', 'German'], ['es', 'Spanish'], ['it', 'Italian'],
  ['pt-br', 'Portuguese (Brazilian)'], ['id', 'Indonesian'], ['th', 'Thai'],
] as const;
export interface CatalogCard { id: string; localId: string; name: string; image?: string; imageUrl?: string; rarity?: string; pokedexNumber?: number; sourceUrl?: string }
export interface CatalogSet {
  id: string; name: string; cardCount: { total: number; official: number };
  verifiedPrintings?: number;
  cardListUnavailable?: boolean;
  referenceUrl?: string;
  sourceUrl?: string;
}
export interface CatalogSetDetail extends CatalogSet { cards: CatalogCard[] }
const cache = new Map<string, unknown>();
async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (cache.has(path)) return cache.get(path) as T;
  const response = await fetch(`https://api.tcgdex.net/v2/${path}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('The card catalog is unavailable. Retry or use manual entry.');
  const data = await response.json();
  cache.set(path, data);
  return data;
}
export async function fetchPokemonSets(language: string, signal?: AbortSignal): Promise<CatalogSet[]> {
  if (language === 'zh-cn') {
    const catalog = await fetchChineseCatalog(signal);
    return [...catalog.values()].map(({ cards, ...set }) => set);
  }
  const data = await request<CatalogSet[]>(`${encodeURIComponent(language)}/sets`, signal);
  if (!Array.isArray(data)) throw new Error('The catalog returned an invalid set list.');
  return data;
}
export async function fetchPokemonSet(language: string, setId: string, signal?: AbortSignal): Promise<CatalogSetDetail> {
  if (language === 'zh-cn') {
    const set = (await fetchChineseCatalog(signal)).get(setId.toUpperCase());
    if (!set) throw new Error('This set is not in the Chinese catalog. Check the printed product code.');
    return set;
  }
  const data = await request<CatalogSetDetail>(`${encodeURIComponent(language)}/sets/${encodeURIComponent(setId)}`, signal);
  if (!Array.isArray(data.cards)) throw new Error('This set has no card list available. Try manual entry.');
  return data;
}
export function normalizeCardNumber(value: string): string {
  return value.trim().split('/')[0].replace(/\s/g, '').toLowerCase().replace(/\d+/g, digits => String(Number(digits)));
}
export function exactCardNumberMatches(cards: CatalogCard[], query: string): CatalogCard[] {
  const term = query.trim();
  if (!term) return [];
  const [number, denominator] = term.replace(/\s/g, '').split('/');
  return cards.filter(card => {
    const [printedNumber, printedTotal] = card.localId.replace(/\s/g, '').split('/');
    return normalizeCardNumber(printedNumber) === normalizeCardNumber(number) &&
      (denominator === undefined || (denominator !== '' && (printedTotal === undefined || Number(denominator) === Number(printedTotal))));
  });
}
export function searchCatalogCards(cards: CatalogCard[], query: string): CatalogCard[] {
  const term = query.trim().toLowerCase();
  if (!term) return cards;
  const number = normalizeCardNumber(term);
  const exact = exactCardNumberMatches(cards, term);
  // A full fraction must match its denominator too. Ordinary TCGdex local IDs
  // don't include a denominator, so allow their usual number/total input form.
  const simpleExact = !cards.some(c => c.localId.includes('/')) ? cards.filter(c => normalizeCardNumber(c.localId) === number) : [];
  if (simpleExact.length) return simpleExact;
  if (term.includes('/')) return exact;
  return exact.length ? exact : cards.filter(card => card.name.toLowerCase().includes(term) || normalizeCardNumber(card.localId).includes(number));
}
export function catalogImageUrl(image?: string): string | undefined {
  return image?.startsWith('https://assets.tcgdex.net/') ? `${image}/low.webp` : undefined;
}
export function cardThumbnail(card: CatalogCard): string | undefined {
  return card.imageUrl?.startsWith('https://raw.githubusercontent.com/duanxr/PTCG-CHS-Datasets/main/img/') ? card.imageUrl : catalogImageUrl(card.image);
}
const speciesNames = new Map<number, string>();
export async function fetchEnglishSpeciesName(number: number, signal?: AbortSignal): Promise<string | undefined> {
  if (!Number.isInteger(number) || number <= 0) return undefined;
  if (speciesNames.has(number)) return speciesNames.get(number);
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${number}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
  if (!response.ok) return undefined;
  const data = await response.json();
  const name = data.names?.find((item: { language: { name: string } }) => item.language.name === 'en')?.name;
  if (typeof name === 'string') speciesNames.set(number, name);
  return name;
}
