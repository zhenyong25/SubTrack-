import test from 'node:test';
import assert from 'node:assert/strict';
import { BUNDLED_SERVICES, findExactService, searchServices, isSubscriptionService } from '../services/serviceCatalog';
import { getServiceLogoUrl, getServiceLogoUrls, getSubscriptionLogoDataUrl } from '../services/subscriptionLogoService';
import { getServiceCatalogSnapshot, loadServiceCatalog } from '../services/serviceCatalogStore';

test('seed contains over 1,000 distinct valid entries and regional services', () => {
  assert.ok(BUNDLED_SERVICES.length >= 1000);
  assert.equal(new Set(BUNDLED_SERVICES.map(s => s.id)).size, BUNDLED_SERVICES.length);
  assert.ok(BUNDLED_SERVICES.every(isSubscriptionService));
  for (const name of ['Spotify', 'Astro', 'sooka', 'meWATCH', 'GrabUnlimited', 'The Straits Times']) assert.ok(findExactService(name));
});

test('search ranks exact aliases first, supports punctuation, domains, and categories', () => {
  assert.equal(searchServices('spotify premium', BUNDLED_SERVICES)[0].name, 'Spotify');
  assert.equal(searchServices('DISNEY PLUS', BUNDLED_SERVICES)[0].name, 'Disney+');
  assert.equal(searchServices('spotify.com', BUNDLED_SERVICES)[0].name, 'Spotify');
  assert.ok(searchServices('fitness', BUNDLED_SERVICES).some(s => s.name === 'Strava'));
  assert.ok(searchServices('', BUNDLED_SERVICES, 'Music').every(s => s.category === 'Music'));
  assert.equal(searchServices('unlisted custom service 87234', BUNDLED_SERVICES).length, 0);
});

test('legacy matching never guesses partial or ambiguous names', () => {
  assert.equal(findExactService('Spotify Premium')?.domain, 'spotify.com');
  assert.equal(findExactService('spot'), undefined);
  assert.equal(findExactService('Neon'), undefined);
  assert.equal(findExactService(''), undefined);
  assert.equal(findExactService('My personal gym'), undefined);
});

test('inactive services remain addressable but are excluded from selection', () => {
  const service = { ...BUNDLED_SERVICES[0], is_active: false };
  assert.equal(findExactService(service.name, [service])?.id, service.id);
  assert.deepEqual(searchServices(service.name, [service]), []);
});

test('logos use controlled domains, preserve overrides, and safely encode initials', () => {
  const spotify = findExactService('Spotify')!;
  assert.match(getServiceLogoUrl(spotify)!, /^\/service-logos\/spotify\.com\.(png|ico)$/);
  const urls = getServiceLogoUrls(spotify);
  const url = new URL(urls.find(candidate => candidate.startsWith('https://img.logo.dev/'))!);
  assert.equal(url.origin, 'https://img.logo.dev');
  assert.equal(url.pathname, '/spotify.com');
  assert.equal(url.searchParams.get('fallback'), '404');
  assert.ok(urls.some(candidate => candidate.startsWith('https://www.google.com/s2/favicons?')));
  assert.ok(urls.some(candidate => candidate.startsWith('https://icons.duckduckgo.com/')));
  assert.equal(getServiceLogoUrl(), undefined);
  assert.equal(getServiceLogoUrl({ ...spotify, logo_url: 'https://example.com/logo.png' }), 'https://example.com/logo.png');
  const svg = decodeURIComponent(getSubscriptionLogoDataUrl('<script>').split(',')[1]);
  assert.ok(svg.includes('&#60;'));
  assert.ok(!svg.includes('<script>'));
});

test('catalog loading handles pages beyond 1,000 and retains the last good result after failures', async () => {
  const target = globalThis as typeof globalThis & { __catalogClient: unknown };
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  let failAt = -1;
  const offsets: number[] = [];
  const query = {
    select() { return this; }, order() { return this; },
    async range(from: number, to: number) {
      offsets.push(from);
      return from === failAt ? { data: null, error: { code: '42P01' } }
        : { data: BUNDLED_SERVICES.slice(from, to + 1), error: null };
    },
  };
  target.__catalogClient = { from: (table: string) => { assert.equal(table, 'subscription_services'); return query; } };
  try {
    await loadServiceCatalog();
    assert.deepEqual(offsets, [0, 500, 1000]);
    assert.equal(getServiceCatalogSnapshot().length, BUNDLED_SERVICES.length);
    assert.equal(getServiceCatalogSnapshot().at(-1)?.id, BUNDLED_SERVICES.at(-1)?.id);
    const good = getServiceCatalogSnapshot();
    now += 61_000;
    failAt = 500;
    await loadServiceCatalog();
    assert.equal(getServiceCatalogSnapshot(), good, 'partial refresh must not replace a complete catalog');
    now += 61_000;
    failAt = 0;
    await loadServiceCatalog();
    assert.equal(getServiceCatalogSnapshot(), good, 'missing migration must retain the catalog');
  } finally { Date.now = originalNow; target.__catalogClient = null; }
});
