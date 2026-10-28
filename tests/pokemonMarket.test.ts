import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesGuardianCard, guardianQuotes, lookupPokemonMarket, handlePokemonMarket, type MarketIdentity } from '../server/pokemonMarket';

const identity: MarketIdentity = { name: '变隐龙', englishName: 'Kecleon', language: 'Simplified Chinese', set: '宝石包 VOL.6', setCode: 'CBB6C', number: '11 07/07', catalogId: 'chs-511-21375' };
const row = { id: 2929059, name: 'Kecleon', set: 'Gem Pack 6', collectorNumber: '1107', game: 'pokemon-chn', currentPrice: 6.48, cachedPsa10Price: 87, updatedAt: '2026-10-19T08:42:30.255Z' };
test('market matching requires exact language, name, set and printed number', () => {
  assert.ok(matchesGuardianCard(row, identity));
  assert.equal(matchesGuardianCard({ ...row, collectorNumber: '1106' }, identity), false);
  assert.equal(matchesGuardianCard({ ...row, set: 'Gem Pack 5' }, identity), false);
  assert.equal(matchesGuardianCard({ ...row, game: 'pokemon-jp' }, identity), false);
  assert.equal(matchesGuardianCard({ ...row, name: 'Another Pokémon' }, identity), false);
  assert.equal(matchesGuardianCard({ ...row, collectorNumber: 'TG04' }, { ...identity, number: 'TG05' }), false);
});
test('prices are published source values, never grade multiples; missing and zero prices stay absent', () => {
  const quotes = guardianQuotes(row);
  assert.deepEqual(quotes.map(q => [q.grade, q.amount]), [['Raw', 6.48], ['PSA 10', 87]]);
  assert.equal(quotes[0].updatedAt, row.updatedAt);
  assert.equal(quotes[1].updatedAt, null);
  assert.match(quotes[1].basis, /Cached PSA quote/);
  assert.deepEqual(guardianQuotes({ ...row, currentPrice: 0, cachedPsa10Price: undefined }), []);
});
test('automatic lookup fetches detail rather than trusting an inconsistent search snippet', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async url => {
    urls.push(String(url));
    return Response.json(String(url).includes('typeahead') ? { data: { cards: [{ ...row, currentPrice: 11.64 }] } } : { success: true, data: row });
  }) as typeof fetch;
  try {
    const result = await lookupPokemonMarket(identity);
    assert.equal(result.quotes[0].amount, 6.48);
    assert.equal(urls.length, 2);
    await lookupPokemonMarket(identity);
    assert.equal(urls.length, 2, 'source responses are cached');
  } finally { globalThis.fetch = original; }
});
test('ambiguous printings are rejected instead of using the first search result', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ data: { cards: [row, { ...row, id: 1234 }] } })) as typeof fetch;
  try {
    const result = await lookupPokemonMarket({ ...identity, name: ' Kecleon ' });
    assert.equal(result.quotes.length, 0);
    assert.match(result.messages.join(' '), /Multiple/);
  } finally { globalThis.fetch = original; }
});
test('market proxy rejects invalid identities and unsupported methods', async () => {
  assert.equal((await handlePokemonMarket(new Request('https://local/api/pokemon/market'))).status, 405);
  assert.equal((await handlePokemonMarket(new Request('https://local/api/pokemon/market', { method: 'POST', body: '{}' }))).status, 400);
  assert.equal((await handlePokemonMarket(new Request('https://local/api/pokemon/market', { method: 'POST', body: JSON.stringify({ ...identity, pokedexNumber: 'https://example.com/' }) }))).status, 400);
});
test('live free market feed returns the exact reported Chinese card', { skip: !process.env.POKEMON_LIVE_MARKET }, async () => {
  const result = await lookupPokemonMarket({ ...identity, englishName: 'Kecleon ' });
  assert.ok(result.quotes.some(q => q.grade === 'Raw' && q.amount > 0));
  assert.ok(result.quotes.every(q => q.sourceId === '2929059' && q.source === 'Guardian TCG'));
});
