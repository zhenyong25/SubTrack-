import type { PokemonShop, PokemonShopList, ShopType } from '../server/pokemonShops';

export type { PokemonShop, PokemonShopList, ShopType };

// The official store types, best places to play first.
export const SHOP_TYPES: Array<{ type: ShopType; label: string; play: boolean }> = [
  { type: 'gym-deluxe', label: 'Gym Deluxe', play: true },
  { type: 'gym', label: 'Gym', play: true },
  { type: 'pokemon-center', label: 'Pokémon Center', play: false },
  { type: 'card-store', label: 'Card store', play: false },
  { type: 'retail', label: 'Retail store', play: false },
  { type: 'department', label: 'Department store', play: false },
  { type: 'convenience', label: 'Convenience store', play: false },
];
export const SHOP_TYPE_LABEL = Object.fromEntries(SHOP_TYPES.map(item => [item.type, item.label])) as Record<ShopType, string>;
// Map dot and legend colours.
export const SHOP_TYPE_COLOR: Record<ShopType, string> = {
  'gym-deluxe': '#a855f7', gym: '#2563eb', 'pokemon-center': '#ef4444', 'card-store': '#f59e0b',
  retail: '#10b981', department: '#06b6d4', convenience: '#64748b',
};
const TYPE_ORDER = Object.fromEntries(SHOP_TYPES.map((item, index) => [item.type, index])) as Record<ShopType, number>;

const CACHE_KEY = 'subtrack_pokemon_shops_v1:sg';
export const SHOPS_STALE_AFTER_MS = 7 * 24 * 3600_000; // shops change slowly; refresh weekly on their own

export const readCachedShops = (): PokemonShopList | null => {
  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return stored && Array.isArray(stored.shops) ? stored : null;
  } catch {
    return null;
  }
};

// Same-origin route (server/pokemonShops.ts). `refresh` skips the server's 12-hour cache.
export const fetchPokemonShops = async (refresh = false, signal?: AbortSignal): Promise<PokemonShopList> => {
  const response = await fetch(`/api/pokemon/shops${refresh ? '?refresh=1' : ''}`, { signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `The shop list couldn't be loaded (${response.status}).`);
  if (!data || !Array.isArray(data.shops)) throw new Error('The shop list service isn\'t available on this server yet - restart the dev server or redeploy.');
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
  return data as PokemonShopList;
};

export interface Place { latitude: number; longitude: number; label: string }

export const inSingapore = (latitude: number, longitude: number) => latitude > 1.1 && latitude < 1.5 && longitude > 103.5 && longitude < 104.2;

// A postal code, street, building or MRT station to measure from, via OneMap (the Singapore
// Land Authority's public address search, onemap.gov.sg/apidocs). Null when nothing matches.
export const searchPlace = async (query: string, signal?: AbortSignal): Promise<Place | null> => {
  const term = query.trim();
  if (!term) return null;
  const response = await fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(term)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`, { signal });
  if (!response.ok) throw new Error(`OneMap search failed (${response.status}).`);
  const data = await response.json().catch(() => null) as { results?: Array<Record<string, string>> } | null;
  for (const result of data?.results || []) {
    const latitude = Number(result.LATITUDE);
    const longitude = Number(result.LONGITUDE);
    if (!inSingapore(latitude, longitude)) continue;
    const label = (result.SEARCHVAL || result.ADDRESS || term).toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
    return { latitude, longitude, label };
  }
  return null;
};

// Why the browser didn't give a location, in plain words.
export const locationErrorMessage = (code: number | 'unsupported' | 'outside') => {
  if (code === 'unsupported') return 'This browser can\'t share your location. Enter a postal code instead.';
  if (code === 'outside') return 'Your location looks outside Singapore. Enter a postal code instead.';
  if (code === 1) return 'Location is blocked for this site. Allow it from the lock icon in the address bar (and turn on location services for your device), or enter a postal code.';
  if (code === 3) return 'Finding your location took too long. Try again, or enter a postal code.';
  return 'Your device couldn\'t work out where you are (location services may be off). Enter a postal code instead.';
};

// Great-circle distance in km.
export const distanceKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

export type ShopSort = 'type' | 'name' | 'distance';

export interface ShopFilter {
  query: string;
  types: ShopType[]; // empty for all
  area: string; // '' for all
  showSevenEleven: boolean;
  sort: ShopSort;
  here: { latitude: number; longitude: number } | null;
}

export const filterShops = (shops: PokemonShop[], filter: ShopFilter): PokemonShop[] => {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  const matching = shops.filter(shop => {
    if (!filter.showSevenEleven && shop.sevenEleven) return false;
    if (filter.types.length && !filter.types.includes(shop.type)) return false;
    if (filter.area && shop.area !== filter.area) return false;
    const text = `${shop.name} ${shop.address} ${shop.postalCode || ''} ${SHOP_TYPE_LABEL[shop.type]}`.toLowerCase();
    return words.every(word => text.includes(word));
  });
  const byName = (a: PokemonShop, b: PokemonShop) => a.name.localeCompare(b.name);
  if (filter.sort === 'distance' && filter.here) {
    const here = filter.here;
    return matching.map(shop => [shop, distanceKm(here, shop)] as const).sort((a, b) => a[1] - b[1]).map(([shop]) => shop);
  }
  if (filter.sort === 'name') return [...matching].sort(byName);
  return [...matching].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || byName(a, b));
};

export const countByType = (shops: PokemonShop[], showSevenEleven: boolean) => {
  const counts = Object.fromEntries(SHOP_TYPES.map(item => [item.type, 0])) as Record<ShopType, number>;
  shops.forEach(shop => { if (showSevenEleven || !shop.sevenEleven) counts[shop.type] += 1; });
  return counts;
};
