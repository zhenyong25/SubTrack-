// Loaded directly from the community source for this personal collection tracker.
// Do not bundle or redistribute its dataset/images; see its usage terms in docs.
export const CHINESE_CATALOG_SOURCE = 'https://github.com/duanxr/PTCG-CHS-Datasets';
export const CHINESE_CATALOG_URL = 'https://raw.githubusercontent.com/duanxr/PTCG-CHS-Datasets/main/ptcg_chs_infos.json';
const imageBase = 'https://raw.githubusercontent.com/duanxr/PTCG-CHS-Datasets/main/';
export interface ChineseCatalogCard {
  id: string; localId: string; name: string; image?: string;
  imageUrl?: string; rarity?: string; pokedexNumber?: number; sourceUrl?: string;
}
export interface ChineseCatalogSet {
  id: string; name: string; cardCount: { total: number; official: number };
  cards: ChineseCatalogCard[]; sourceUrl: string;
}
interface SourceCard {
  id: number; name: string; image?: string;
  details?: { collectionNumber?: string; cardName?: string; rarityText?: string; pokedexCode?: string };
}
interface SourceSet { id: number; commodityCode: string; name: string; cards: SourceCard[] }
export function parseChineseCatalog(data: unknown): Map<string, ChineseCatalogSet> {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { collections?: unknown }).collections)) throw new Error('The Chinese card catalog returned an invalid list.');
  const result = new Map<string, ChineseCatalogSet>();
  for (const collection of (data as { collections: SourceSet[] }).collections) {
    if (!collection.commodityCode || !collection.name || !Array.isArray(collection.cards)) continue;
    const id = collection.commodityCode.toUpperCase();
    const cards: ChineseCatalogCard[] = collection.cards.flatMap(card => {
      const number = card.details?.collectionNumber;
      const name = card.details?.cardName || card.name;
      if (!number || !name) return [];
      const path = card.image && /^img\/\d+\/\d+\.png$/.test(card.image) ? card.image : undefined;
      return [{
        id: `chs-${collection.id}-${card.id}`, localId: number.trim(), name,
        imageUrl: path ? `${imageBase}${path}` : undefined,
        rarity: card.details?.rarityText,
        pokedexNumber: Number(card.details?.pokedexCode) || undefined,
        sourceUrl: CHINESE_CATALOG_SOURCE,
      }];
    });
    // Some product codes appear in several collection entries. Preserve print IDs
    // and variants instead of overwriting one product's cards with another's.
    const prior = result.get(id);
    const unique = new Map([...(prior?.cards || []), ...cards].map(card => [card.id, card]));
    const merged = [...unique.values()];
    result.set(id, { id, name: collection.name, cards: merged, cardCount: { total: merged.length, official: 0 }, sourceUrl: CHINESE_CATALOG_SOURCE });
  }
  return result;
}
let catalog: Map<string, ChineseCatalogSet> | undefined;
export async function fetchChineseCatalog(signal?: AbortSignal) {
  if (catalog) return catalog;
  const response = await fetch(CHINESE_CATALOG_URL, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Chinese card-name lookup is unavailable. Retry the catalog download.');
  const parsed = parseChineseCatalog(await response.json());
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  catalog = parsed;
  return parsed;
}
