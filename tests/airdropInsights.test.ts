import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAirdropInsights, safeProjectUrl, AIRDROP_CHAIN_NAMES } from '../services/airdropInsightsService';

const row = { slug: 'sample-protocol', name: 'Sample', symbol: '-', category: 'Dexs', chains: ['Base'], tvl: 500000, url: 'https://example.org', change_7d: 2 };
test('research excludes listed tokens, centralised exchanges and known token identifiers', () => {
  const items = parseAirdropInsights([row, { ...row, slug: 'token', symbol: 'TOK' }, { ...row, slug: 'exchange', category: 'CEX' }, { ...row, slug: 'known', gecko_id: 'known-token' }, { ...row, slug: 'missing', symbol: null }]);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].chains, ['Base']);
  assert.equal(items[0].change7d, 2);
});
test('rejects malformed rows, unsafe project URLs, invalid slugs and duplicates', () => {
  const items = parseAirdropInsights([null, row, row, { ...row, slug: '../evil' }, { ...row, slug: 'bad-value', tvl: NaN }, { ...row, slug: 'unsafe', url: 'javascript:alert(1)' }]);
  assert.equal(items.length, 2);
  assert.equal(items[1].website, undefined);
  assert.equal(safeProjectUrl('https://user:password@example.org'), undefined);
  assert.equal(safeProjectUrl('http://example.org'), undefined);
  assert.throws(() => parseAirdropInsights({ error: 'bad' }));
});
test('wallet network names match the upstream labels, including BNB Chain', () => {
  assert.equal(AIRDROP_CHAIN_NAMES.bsc, 'Binance');
  assert.equal(AIRDROP_CHAIN_NAMES.base, 'Base');
  assert.equal(AIRDROP_CHAIN_NAMES.arbitrum, 'Arbitrum');
});
