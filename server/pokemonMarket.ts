import type { PokemonMarketResult, PokemonMarketQuote } from '../services/pokemonMarketService';
export interface MarketIdentity { name: string; englishName?: string; pokedexNumber?: number; language: string; set: string; setCode?: string; number: string; catalogId?: string }
interface GuardianCard {
  id: number; name: string; set: string; game: string; collectorNumber: string;
  currentPrice?: number; updatedAt?: string; cachedPsa8Price?: number; cachedPsa9Price?: number; cachedPsa10Price?: number;
}
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const numberKey = (value: string) => value.split('/')[0].replace(/\s/g, '').toLowerCase().replace(/\d+/g, digits => String(Number(digits)));
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
export function matchesGuardianCard(row: GuardianCard, identity: MarketIdentity): boolean {
  const gem = identity.setCode?.match(/^CBB(\d+)C$/i);
  const set = gem ? `gempack${Number(gem[1]) === 1 ? '' : Number(gem[1])}` : normalize(identity.set).replace(/^pokemon/, '');
  const game = identity.language === 'Simplified Chinese' ? 'pokemon-chn' : identity.language === 'English' ? 'pokemon' : null;
  return !!game && row.game === game && normalize(row.set).replace(/^pokemon/, '') === set &&
    numberKey(row.collectorNumber) === numberKey(identity.number) &&
    [identity.name, identity.englishName].some(name => name && normalize(name) === normalize(row.name));
}
async function json(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Source unavailable');
  return response.json() as Promise<any>;
}
export function guardianQuotes(row: GuardianCard): PokemonMarketQuote[] {
  const url = `https://guardiantcg.app/${row.game}/${encodeURIComponent(row.set.toLowerCase().replace(/\s+/g, '-'))}/${encodeURIComponent(row.name.toLowerCase().replace(/\s+/g, '-'))}-${encodeURIComponent(row.collectorNumber)}?id=${row.id}`;
  const quotes: PokemonMarketQuote[] = [];
  if (positive(row.currentPrice)) quotes.push({ source: 'Guardian TCG', sourceId: String(row.id), grade: 'Raw', amount: row.currentPrice, currency: 'USD', variant: 'Provider default printing', updatedAt: validDate(row.updatedAt), url, basis: 'Published market quote; not an individual completed sale' });
  for (const grade of [8, 9, 10] as const) {
    const amount = row[`cachedPsa${grade}Price`];
    if (positive(amount)) quotes.push({ source: 'Guardian TCG', sourceId: String(row.id), grade: `PSA ${grade}`, amount, currency: 'USD', variant: 'Provider default printing', updatedAt: null, url, basis: 'Cached PSA quote; provider does not supply its price date or sale sample' });
  }
  return quotes;
}
function validDate(value?: string): string | null { return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null; }
// Short shared cache limits load on the free endpoints. No caller-provided URLs,
// credentials, or private portfolio data are forwarded to a provider.
const cache = new Map<string, { expires: number; result: PokemonMarketResult }>();
export async function lookupPokemonMarket(identity: MarketIdentity): Promise<PokemonMarketResult> {
  const key = JSON.stringify(identity);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const result: PokemonMarketResult = { fetchedAt: new Date().toISOString(), quotes: [], messages: [] };
  if (identity.language === 'Simplified Chinese' || identity.language === 'English') {
    try {
      if (!identity.englishName && identity.pokedexNumber) {
        const species = await json(`https://pokeapi.co/api/v2/pokemon-species/${identity.pokedexNumber}`);
        identity = { ...identity, englishName: species.names?.find((n: any) => n.language?.name === 'en')?.name };
      }
      const query = new URLSearchParams({ q: identity.englishName || identity.name, scope: 'cards', game: identity.language === 'Simplified Chinese' ? 'pokemon-chn' : 'pokemon' });
      const search = await json(`https://guardiantcg.app/api/search/typeahead?${query}`);
      const candidates: GuardianCard[] = Array.isArray(search.data?.cards) ? search.data.cards.filter((row: GuardianCard) => matchesGuardianCard(row, identity)) : [];
      if (candidates.length === 1) {
        const detail = await json(`https://guardiantcg.app/api/cards/${candidates[0].id}`);
        // Search quotes and detail snapshots can differ. Use the detail response
        // consistently, and revalidate identity before accepting any amount.
        if (detail.success && detail.data && matchesGuardianCard(detail.data, identity)) result.quotes.push(...guardianQuotes(detail.data));
        else result.messages.push('Guardian TCG could not verify this exact printing.');
      } else result.messages.push(candidates.length ? 'Multiple market printings matched; no price was selected automatically.' : 'Guardian TCG has no exact set, number and name match.');
    } catch { result.messages.push('Guardian TCG is temporarily unavailable.'); }
  }
  // TCGdex publishes real raw Cardmarket/TCGplayer fields for covered languages.
  if (identity.catalogId && !identity.catalogId.startsWith('chs-')) {
    const languages: Record<string, string> = { English: 'en', Japanese: 'ja', French: 'fr', German: 'de', Spanish: 'es', Italian: 'it', 'Traditional Chinese': 'zh-tw', Korean: 'ko' };
    const language = languages[identity.language];
    if (language) try {
      const card = await json(`https://api.tcgdex.net/v2/${language}/cards/${encodeURIComponent(identity.catalogId)}`);
      if (card.id === identity.catalogId && card.set?.id === identity.setCode && numberKey(card.localId) === numberKey(identity.number)) {
        const variants = card.variants_detailed?.length ? card.variants_detailed : [{ pricing: card.pricing, type: 'Unspecified finish' }];
        for (const variant of variants) {
          const label = [variant.type, variant.subtype, ...(variant.stamp || [])].filter(Boolean).join(' · ') || 'Unspecified finish';
          const cm = variant.pricing?.cardmarket;
          if (positive(cm?.trend)) result.quotes.push({ source: 'Cardmarket via TCGdex', sourceId: String(cm.idProduct), grade: 'Raw', amount: cm.trend, currency: 'EUR', variant: label, updatedAt: validDate(cm.updated), url: `https://www.cardmarket.com/en/Pokemon/Products?idProduct=${encodeURIComponent(cm.idProduct)}`, basis: 'Cardmarket trend price for the displayed variant' });
          const tcg = variant.pricing?.tcgplayer;
          if (tcg) {
            const prices: Array<[string, any]> = positive(tcg.marketPrice) ? [['', tcg]] : Object.entries(tcg).filter(([, value]: [string, any]) => value && typeof value === 'object' && positive(value.marketPrice));
            const productId = tcg.productId || tcg.idProduct || variant.thirdParty?.tcgplayer;
            for (const [printing, price] of prices) result.quotes.push({ source: 'TCGplayer via TCGdex', sourceId: String(productId || card.id), grade: 'Raw', amount: price.marketPrice, currency: 'USD', variant: [label, printing].filter(Boolean).join(' · '), updatedAt: validDate(tcg.updated), url: productId ? `https://www.tcgplayer.com/product/${encodeURIComponent(productId)}` : 'https://www.tcgplayer.com/categories/trading-and-collectible-card-games/pokemon', basis: 'TCGplayer market price for the displayed variant' });
          }
        }
      }
    } catch { result.messages.push('TCGdex marketplace pricing is temporarily unavailable.'); }
  }
  if (!result.quotes.length && !result.messages.length) result.messages.push('No free market quote is available for this exact printing.');
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + (result.quotes.length ? 30 * 60000 : 60000), result });
  return result;
}
export async function handlePokemonMarket(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'Use POST' }, { status: 405 });
  try {
    const body = await request.text();
    if (body.length > 4000) return Response.json({ error: 'Request too large' }, { status: 413 });
    const identity = JSON.parse(body) as MarketIdentity;
    for (const field of ['name', 'language', 'set', 'number'] as const) if (typeof identity[field] !== 'string' || !identity[field].trim() || identity[field].length > 200) return Response.json({ error: 'Missing card identity' }, { status: 400 });
    for (const field of ['englishName', 'setCode', 'catalogId'] as const) if (identity[field] !== undefined && (typeof identity[field] !== 'string' || identity[field]!.length > 200)) return Response.json({ error: 'Invalid card identity' }, { status: 400 });
    if (identity.pokedexNumber !== undefined && (!Number.isInteger(identity.pokedexNumber) || identity.pokedexNumber < 1 || identity.pokedexNumber > 2000)) return Response.json({ error: 'Invalid Pokémon number' }, { status: 400 });
    return Response.json(await lookupPokemonMarket(identity));
  } catch { return Response.json({ error: 'Invalid market request' }, { status: 400 }); }
}
