import test from 'node:test';
import assert from 'node:assert/strict';
import { areaOf, handlePokemonShops, parseShops, postalCodeOf, repairText } from '../server/pokemonShops';
import { countByType, distanceKm, filterShops } from '../services/pokemonShopService';

const row = (key: string, name: string, marker: number, extra: Record<string, unknown> = {}) => ({
  id: Number(key.replace(/\D/g, '')), key, name, latitude: 1.3, longitude: 103.85, address: `1 Test Road, Singapore 1${key.replace(/\D/g, '').padStart(5, '0')}`,
  marker_index: marker, condition_values: [0], ...extra,
});

test('repairs text that was garbled once or twice', () => {
  // The actual strings from the shop map.
  assert.equal(repairText('PokÃƒÂ©mon Center Singapore'), 'Pokémon Center Singapore');
  assert.equal(repairText('Â 1A Thomson Ridge, #2nd Floor, Singapore 574633'), '1A Thomson Ridge, #2nd Floor, Singapore 574633');
  assert.equal(repairText('1 Kim Seng Promenade, #02-134 Great World City,Ã‚Â  Singapore 237994'), '1 Kim Seng Promenade, #02-134 Great World City, Singapore 237994');
  assert.equal(repairText('1 North Bridge Road, #02-20 High Street Centre, Singapore â€“ 179094'), '1 North Bridge Road, #02-20 High Street Centre, Singapore – 179094');
  assert.equal(repairText('150 Orchard Road, Orchard PlazaÂ #04-36 S238841'), '150 Orchard Road, Orchard Plaza #04-36 S238841');
  // Correct text is left alone.
  assert.equal(repairText('Pokémon Café · Pikku Play '), 'Pokémon Café · Pikku Play');
});

test('reads postal codes and areas', () => {
  assert.equal(postalCodeOf('464 Crawford Lane #02-01 (190464)'), '190464');
  assert.equal(postalCodeOf('150 Orchard Road #04-36 S238841'), '238841');
  assert.equal(postalCodeOf('Blk 254A serangoon center Dr #01-177'), null);
  assert.equal(areaOf(1.3, 103.84), 'Central');
  assert.equal(areaOf(1.35, 103.94), 'East');
  assert.equal(areaOf(1.34, 103.7), 'West');
});

test('maps store types and drops malformed or foreign rows', () => {
  const shops = parseShops([
    row('SG0001-EN', 'MYTOYSHOP', 0),
    row('SG0007-EN', 'Dimension Gaming', 1),
    row('SG0012-EN', 'Cards citadel', 2),
    row('SG0100-EN', '7-Eleven Bishan', 3, { condition_values: [1] }),
    row('SG0200-EN', 'Best Denki', 4),
    row('SG0300-EN', 'PokÃƒÂ©mon Center Singapore', 5),
    row('SG0400-EN', 'Rowell TCG @ *SCAPE', 6),
    row('SG0400-EN', 'Duplicate', 6),
    row('SG0500-EN', 'Unknown type', 9),
    row('SG0600-EN', 'In Johor', 2, { latitude: 1.6, longitude: 103.7 }),
    { key: 'SG0700-EN', name: '', latitude: 1.3, longitude: 103.8, marker_index: 0 },
    null,
  ]);
  assert.deepEqual(shops.map(shop => shop.type), ['retail', 'gym', 'card-store', 'convenience', 'department', 'pokemon-center', 'gym-deluxe']);
  assert.equal(shops[3].sevenEleven, true);
  assert.equal(shops[5].name, 'Pokémon Center Singapore');
  assert.ok(shops[1].mapUrl.startsWith('https://www.google.com/maps/search/?api=1&query=Dimension%20Gaming'));
  assert.throws(() => parseShops({ error: 'x' }), /unexpected response/);
});

test('filters, sorts gyms first and by distance', () => {
  const shops = parseShops([
    row('SG0001-EN', 'Zed Toys', 0, { latitude: 1.30, longitude: 103.80 }),
    row('SG0002-EN', 'Alpha Gym', 1, { latitude: 1.35, longitude: 103.94 }),
    row('SG0003-EN', 'Beta Cards', 2, { latitude: 1.29, longitude: 103.85 }),
    row('SG0004-EN', '7-Eleven Raffles', 3, { condition_values: [1] }),
    row('SG0005-EN', 'Deluxe Arena', 6, { latitude: 1.28, longitude: 103.70 }),
  ]);
  const base = { query: '', types: [], area: '', showSevenEleven: false, sort: 'type' as const, here: null };
  assert.deepEqual(filterShops(shops, base).map(shop => shop.name), ['Deluxe Arena', 'Alpha Gym', 'Beta Cards', 'Zed Toys']);
  assert.equal(filterShops(shops, { ...base, showSevenEleven: true }).length, 5);
  assert.deepEqual(filterShops(shops, { ...base, sort: 'name' }).map(shop => shop.name), ['Alpha Gym', 'Beta Cards', 'Deluxe Arena', 'Zed Toys']);
  assert.deepEqual(filterShops(shops, { ...base, types: ['gym', 'gym-deluxe'] }).map(shop => shop.name), ['Deluxe Arena', 'Alpha Gym']);
  assert.deepEqual(filterShops(shops, { ...base, area: 'East' }).map(shop => shop.name), ['Alpha Gym']);
  assert.deepEqual(filterShops(shops, { ...base, query: '100003' }).map(shop => shop.name), ['Beta Cards']); // postal code
  const here = { latitude: 1.29, longitude: 103.851 };
  assert.equal(filterShops(shops, { ...base, sort: 'distance', here })[0].name, 'Beta Cards');
  assert.deepEqual(countByType(shops, false).convenience, 0);
  assert.deepEqual(countByType(shops, true).convenience, 1);
});

test('distance between two points', () => {
  // Jewel Changi to Orchard Road is about 20 km in a straight line.
  const km = distanceKm({ latitude: 1.3602, longitude: 103.9898 }, { latitude: 1.3048, longitude: 103.8318 });
  assert.ok(km > 17 && km < 19, `${km}`);
});

test('the route caches, and reports a failure before anything is cached', async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (async () => { calls += 1; return new Response('down', { status: 503 }); }) as unknown as typeof fetch;
    const failed = await handlePokemonShops(new Request('http://x/api/pokemon/shops'));
    assert.equal(failed.status, 502);
    assert.match((await failed.json()).error, /503/);
    globalThis.fetch = (async () => { calls += 1; return Response.json([row('SG0007-EN', 'Dimension Gaming', 1)]); }) as unknown as typeof fetch;
    const ok = await (await handlePokemonShops(new Request('http://x/api/pokemon/shops'))).json();
    assert.equal(ok.shops.length, 1);
    assert.equal(ok.sourceUrl, 'https://asia.pokemon-card.com/sg/shopmap/');
    const before = calls;
    await handlePokemonShops(new Request('http://x/api/pokemon/shops?refresh=1')); // within a minute: served from cache
    assert.equal(calls, before);
  } finally { globalThis.fetch = realFetch; }
});

test('finds a postal code or place in Singapore via OneMap', async () => {
  const { searchPlace, locationErrorMessage } = await import('../services/pokemonShopService');
  const realFetch = globalThis.fetch;
  try {
    let asked = '';
    globalThis.fetch = (async (url: string) => { asked = String(url); return Response.json({ found: 2, results: [
      { SEARCHVAL: 'SOMEWHERE ABROAD', LATITUDE: '40.7', LONGITUDE: '-74.0' },
      { SEARCHVAL: 'ORCHARD PLAZA', LATITUDE: '1.3007', LONGITUDE: '103.8395' },
    ] }); }) as unknown as typeof fetch;
    const place = await searchPlace(' 238841 ');
    assert.ok(asked.startsWith('https://www.onemap.gov.sg/api/common/elastic/search?searchVal=238841&'));
    assert.deepEqual(place, { latitude: 1.3007, longitude: 103.8395, label: 'Orchard Plaza' }); // outside-Singapore result skipped
    globalThis.fetch = (async () => Response.json({ found: 0, results: [] })) as unknown as typeof fetch;
    assert.equal(await searchPlace('nowhere'), null);
    assert.equal(await searchPlace('   '), null);
  } finally { globalThis.fetch = realFetch; }
  assert.match(locationErrorMessage(1), /blocked/);
  assert.match(locationErrorMessage(2), /location services/);
  assert.match(locationErrorMessage(3), /too long/);
  assert.match(locationErrorMessage('outside'), /outside Singapore/);
});
