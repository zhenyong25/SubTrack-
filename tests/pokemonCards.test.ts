import test from 'node:test';
import assert from 'node:assert/strict';
import { latestPokemonPrices, safeMarketUrl, type PokemonPrice } from '../services/pokemonCardService';
import { searchCatalogCards, normalizeCardNumber, catalogImageUrl, fetchPokemonSet, fetchPokemonSets, exactCardNumberMatches, cardThumbnail } from '../services/pokemonCatalogService';
import { parseChineseCatalog, CHINESE_CATALOG_URL } from '../services/chinesePokemonCatalog';

const price = (id: string, changes: Partial<PokemonPrice> = {}): PokemonPrice => ({ id, source: 'PriceCharting', grade: 'Raw', amount: 100, currency: 'USD', kind: 'Market estimate', date: '2026-10-01', url: '', ...changes });
test('only the newest observation from each source enters comparisons, preserving history', () => {
  const observations = [price('new', { date: '2026-10-20' }), price('old'), price('other', { source: 'SNKRDUNK' })];
  assert.deepEqual(latestPokemonPrices(observations).map(p => p.id), ['new', 'other']);
  assert.equal(observations.length, 3);
});
test('raw, PSA grades, currencies and sale types remain separate', () => {
  const observations = [price('raw'), price('psa9', { grade: 'PSA 9' }), price('psa10', { grade: 'PSA 10' }), price('jpy', { currency: 'JPY' }), price('sale', { kind: 'Completed sale' }), price('ask', { kind: 'Asking price' })];
  assert.equal(latestPokemonPrices(observations).length, 6);
});
test('source matching ignores casing and whitespace, with last entry winning same-day ties', () => {
  assert.deepEqual(latestPokemonPrices([price('first'), price('last', { source: ' pricecharting ' })]).map(p => p.id), ['last']);
});
test('source links permit web URLs and reject executable schemes', () => {
  assert.equal(safeMarketUrl('javascript:alert(1)'), undefined);
  assert.equal(safeMarketUrl('data:text/html,test'), undefined);
  assert.equal(safeMarketUrl('invalid'), undefined);
  assert.equal(safeMarketUrl('https://www.pricecharting.com/'), 'https://www.pricecharting.com/');
});

const catalog = [
  { id: 'base1-4', localId: '4', name: 'Charizard' },
  { id: 'base1-40', localId: '40', name: 'Raticate' },
  { id: 'base1-TG04', localId: 'TG04', name: 'Trainer Gallery' },
];
test('printed numbers resolve exactly, allowing leading zeros and printed totals', () => {
  assert.deepEqual(searchCatalogCards(catalog, '004/102').map(c => c.id), ['base1-4']);
  assert.deepEqual(searchCatalogCards(catalog, 'TG4/TG30').map(c => c.id), ['base1-TG04']);
  assert.equal(normalizeCardNumber(' 001 / 165 '), '1');
});
test('name search is case insensitive and missing numbers do not fabricate results', () => {
  assert.deepEqual(searchCatalogCards(catalog, 'CHARIZARD').map(c => c.id), ['base1-4']);
  assert.equal(searchCatalogCards(catalog, '999').length, 0);
  assert.equal(searchCatalogCards(catalog, '').length, 3);
});
test('catalog thumbnails only use the trusted image host', () => {
  assert.equal(catalogImageUrl('https://assets.tcgdex.net/en/base/base1/4'), 'https://assets.tcgdex.net/en/base/base1/4/low.webp');
  assert.equal(catalogImageUrl('https://example.com/card'), undefined);
});
test('catalog requests scope sets and card lists to the selected language and cache successes', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async url => {
    urls.push(String(url));
    return new Response(JSON.stringify(String(url).endsWith('/sets') ? [{ id: 'SV2a', name: '151', cardCount: { total: 210, official: 165 } }] : { id: 'SV2a', name: '151', cards: catalog }), { status: 200 });
  }) as typeof fetch;
  try {
    const sets = await fetchPokemonSets('ja');
    const detail = await fetchPokemonSet('ja', sets[0].id);
    assert.equal(detail.cards.length, 3);
    await fetchPokemonSets('ja');
    assert.deepEqual(urls, ['https://api.tcgdex.net/v2/ja/sets', 'https://api.tcgdex.net/v2/ja/sets/SV2a']);
  } finally { globalThis.fetch = originalFetch; }
});
test('failed catalog calls can be retried instead of caching the error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
  try {
    await assert.rejects(fetchPokemonSets('en'), /unavailable/);
    globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch;
    assert.deepEqual(await fetchPokemonSets('en'), []);
  } finally { globalThis.fetch = originalFetch; }
});
const chineseFixture = { collections: [{ id: 511, commodityCode: 'CBB6C', name: '宝石包 VOL.6', cards: [
  { id: 21375, name: '变隐龙', image: 'img/511/76.png', details: { collectionNumber: '11 07/07', rarityText: '★★★', pokedexCode: '0352' } },
  { id: 21376, name: '变隐龙', image: 'img/511/70.png', details: { collectionNumber: '11 01/07', rarityText: '●' } },
] }] };
test('Chinese catalog resolves full grouped numbers to the exact name, rarity, image and stable ID', () => {
  const set = parseChineseCatalog(chineseFixture).get('CBB6C')!;
  assert.equal(set.cardCount.total, 2);
  const matches = exactCardNumberMatches(set.cards, '1107/07');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, '变隐龙');
  assert.equal(matches[0].localId, '11 07/07');
  assert.equal(matches[0].rarity, '★★★');
  assert.equal(matches[0].pokedexNumber, 352);
  assert.match(cardThumbnail(matches[0])!, /img\/511\/76\.png$/);
  assert.equal(searchCatalogCards(set.cards, '1107/15').length, 0);
  assert.equal(searchCatalogCards(set.cards, '变隐龙').length, 2);
});
test('Chinese provider loads real card identities instead of empty reference entries', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async url => {
    assert.equal(String(url), CHINESE_CATALOG_URL);
    return new Response(JSON.stringify(chineseFixture), { status: 200 });
  }) as typeof fetch;
  try {
    const sets = await fetchPokemonSets('zh-cn');
    assert.equal(sets.find(s => s.id === 'CBB6C')?.cardCount.total, 2);
    const detail = await fetchPokemonSet('zh-cn', 'CBB6C');
    assert.equal(detail.cards[0].name, '变隐龙');
    assert.equal(detail.cards[0].localId, '11 07/07');
    await assert.rejects(fetchPokemonSet('zh-cn', 'MISSING'), /not in the Chinese catalog/);
  } finally { globalThis.fetch = originalFetch; }
});
test('duplicate collection rows preserve distinct card variants without duplicating stable IDs', () => {
  const source = chineseFixture.collections[0];
  const set = parseChineseCatalog({ collections: [source, { ...source, cards: [source.cards[0], { ...source.cards[0], id: 90000, details: { ...source.cards[0].details, rarityText: 'Alternate' } }] }] }).get('CBB6C')!;
  assert.equal(set.cards.length, 3);
  assert.equal(exactCardNumberMatches(set.cards, '1107/07').length, 2);
});
test('live CBB6C source resolves the reported card and actual checklist size', { skip: !process.env.POKEMON_LIVE_CATALOG }, async () => {
  const response = await fetch(CHINESE_CATALOG_URL);
  assert.ok(response.ok);
  const set = parseChineseCatalog(await response.json()).get('CBB6C')!;
  assert.equal(set.cards.length, 196);
  const [card] = exactCardNumberMatches(set.cards, '1107/07');
  assert.equal(card.name, '变隐龙');
  assert.equal(card.rarity, '★★★');
});
