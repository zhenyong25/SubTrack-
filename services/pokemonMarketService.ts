import type { PokemonTrackedCard, CardGrade } from './pokemonCardService';
export interface PokemonMarketQuote {
  source: string;
  sourceId: string;
  grade: CardGrade;
  amount: number;
  currency: string;
  variant: string;
  updatedAt: string | null;
  url: string;
  basis: string;
}
export interface PokemonMarketResult {
  fetchedAt: string;
  quotes: PokemonMarketQuote[];
  messages: string[];
}
export function marketIdentityKey(card: PokemonTrackedCard): string {
  return JSON.stringify([card.language, card.catalogSetId, card.catalogId, card.set, card.number, card.name, card.englishSpeciesName, card.rarity]);
}
export async function fetchPokemonMarket(card: PokemonTrackedCard, signal?: AbortSignal): Promise<PokemonMarketResult> {
  const response = await fetch('/api/pokemon/market', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: card.name, englishName: card.englishSpeciesName, pokedexNumber: card.pokedexNumber, language: card.language, set: card.set, setCode: card.catalogSetId, number: card.number, catalogId: card.catalogId }),
    signal,
  });
  if (!response.ok) throw new Error('Market prices could not be fetched. Try again later.');
  const result = await response.json();
  if (!Array.isArray(result.quotes) || !Array.isArray(result.messages)) throw new Error('The market source returned an invalid response.');
  return result;
}

export interface PsaCertLookup {
  certificate: string; name: string; set: string; number: string; year: string; language: string;
  grade: number | null; gradeLabel: string; variety: string; population: number | null; url: string;
}
// The slab's details from PSA, by the certificate number on its label (see server/psaCert.ts).
export async function fetchPsaCert(certificate: string, signal?: AbortSignal): Promise<PsaCertLookup> {
  const response = await fetch(`/api/pokemon/psa-cert?cert=${encodeURIComponent(certificate.trim())}`, { signal });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.name) throw new Error(result?.error || 'PSA could not be reached. Enter the card by hand for now.');
  return result;
}
