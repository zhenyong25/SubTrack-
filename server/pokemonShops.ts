// Shops that sell or play the Pokémon Trading Card Game in Singapore, from the official Pokémon
// TCG Asia shop map (asia.pokemon-card.com/sg/shopmap). Its map loads stores for the visible area
// from ./api/poi; one request covering the whole island returns every store - Pokémon Card Gyms,
// card shops, retailers, department stores, convenience stores and the Pokémon Center. This isn't
// a published API, so the response is validated and anything malformed is dropped.

export type ShopType = 'gym-deluxe' | 'gym' | 'pokemon-center' | 'card-store' | 'retail' | 'department' | 'convenience';

export interface PokemonShop {
  id: string;
  name: string;
  type: ShopType;
  sevenEleven: boolean;
  address: string;
  postalCode: string | null;
  area: string;
  latitude: number;
  longitude: number;
  mapUrl: string;
}

export interface PokemonShopList {
  country: 'sg';
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  shops: PokemonShop[];
}

const SOURCE_URL = 'https://asia.pokemon-card.com/sg/shopmap/';
const POI_URL = 'https://asia.pokemon-card.com/sg/shopmap/api/poi?bounds=1.15,103.55,1.48,104.10';
// The shop map's "Select store type" list, in marker order.
const TYPES: ShopType[] = ['retail', 'gym', 'card-store', 'convenience', 'department', 'pokemon-center', 'gym-deluxe'];
const SEVEN_ELEVEN_CONDITION = 1; // the map's "7-Eleven" refinement
// The shop map's own area shortcuts; each shop goes to the nearest.
const AREAS: Array<[string, number, number]> = [
  ['East', 1.356846, 103.939764], ['North-East', 1.381467, 103.900936], ['Central', 1.297242, 103.835094],
  ['North', 1.41926, 103.758505], ['West', 1.280933, 103.699133],
];

// Some entries were saved as UTF-8 read back as Windows-1252, once or twice ("PokÃƒÂ©mon",
// "Singapore â€“ 179094", "Â " for a non-breaking space). Each garbled run is re-read as UTF-8.
const CP1252: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};
const GARBLED = /[Â-ô][\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]+/g;
const decoder = new TextDecoder('utf-8', { fatal: true });
export const repairText = (text: string): string => {
  let current = text;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = current.replace(GARBLED, run => {
      const bytes = [...run].map(char => CP1252[char] ?? char.charCodeAt(0));
      if (bytes.some(byte => byte > 0xff)) return run;
      try { return decoder.decode(new Uint8Array(bytes)); } catch { return run; }
    });
    if (next === current) break;
    current = next;
  }
  return current.replace(/ /g, ' ').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
};

export const postalCodeOf = (address: string) => address.match(/(\d{6})(?!.*\d{6})/)?.[1] || null;

export const areaOf = (latitude: number, longitude: number) => AREAS
  .map(([name, lat, lng]) => [name, (lat - latitude) ** 2 + (lng - longitude) ** 2] as const)
  .sort((a, b) => a[1] - b[1])[0][0];

export const parseShops = (rows: unknown): PokemonShop[] => {
  if (!Array.isArray(rows)) throw new Error('unexpected response');
  const seen = new Set<string>();
  return rows.flatMap((row: any): PokemonShop[] => {
    const latitude = Number(row?.latitude);
    const longitude = Number(row?.longitude);
    const id = typeof row?.key === 'string' ? row.key : row?.id != null ? String(row.id) : '';
    const name = typeof row?.name === 'string' ? repairText(row.name) : '';
    const address = typeof row?.address === 'string' ? repairText(row.address) : '';
    const type = TYPES[Number(row?.marker_index)];
    // Singapore is roughly 1.1-1.5°N, 103.6-104.1°E; anything else is a data error.
    if (!id || !name || !type || seen.has(id) || !(latitude > 1.1 && latitude < 1.5 && longitude > 103.5 && longitude < 104.2)) return [];
    seen.add(id);
    return [{
      id, name, type, address, latitude, longitude,
      sevenEleven: Array.isArray(row.condition_values) && row.condition_values.includes(SEVEN_ELEVEN_CONDITION),
      postalCode: postalCodeOf(address),
      area: areaOf(latitude, longitude),
      mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address || `${latitude},${longitude}`}`)}`,
    }];
  });
};

const CACHE_MS = 12 * 3600_000;
const MIN_REFRESH_MS = 60_000;
let cache: PokemonShopList | null = null;

export async function handlePokemonShops(request: Request): Promise<Response> {
  const refresh = new URL(request.url).searchParams.get('refresh') === '1';
  const age = cache ? Date.now() - Date.parse(cache.fetchedAt) : Infinity;
  if (cache && age < (refresh ? MIN_REFRESH_MS : CACHE_MS)) return Response.json(cache);
  try {
    const upstream = await fetch(POI_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
      signal: AbortSignal.timeout(20000),
    });
    if (!upstream.ok) throw new Error(`the shop map answered ${upstream.status}`);
    const shops = parseShops(await upstream.json());
    if (shops.length === 0) throw new Error('no shops found - the shop map may have changed');
    cache = { country: 'sg', source: 'Pokémon TCG Asia shop map', sourceUrl: SOURCE_URL, fetchedAt: new Date().toISOString(), shops };
    return Response.json(cache);
  } catch (error) {
    if (cache) return Response.json(cache);
    return Response.json({ error: `The official shop list couldn't be loaded: ${error instanceof Error ? error.message : 'unknown error'}.` }, { status: 502 });
  }
}
