import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCryptoHistory, cryptoMarkets, fetchCryptoMarket, manualCryptoPriceKey, priceManualCrypto } from '../services/cryptoMarketService';
import type { PricedBalance } from '../services/cryptoPortfolio';

const balance: PricedBalance = { sourceId: 'manual', symbol: 'BTC', amount: 2, priceUsd: 100, valueUsd: 200 };
test('known manual and exchange symbols use stable market IDs; unknown tickers stay unsupported', () => {
  assert.equal(manualCryptoPriceKey('BTC-USD'), 'coingecko:bitcoin');
  assert.equal(manualCryptoPriceKey('ETH/USDT'), 'coingecko:ethereum');
  assert.equal(manualCryptoPriceKey('USDT'), 'coingecko:tether');
  assert.equal(manualCryptoPriceKey('UNKNOWN'), undefined);
});
test('same-symbol tokens retain exact contract identity and deduplicate only the same market', () => {
  const markets = cryptoMarkets('BTC', [balance, { ...balance, chain: 'ethereum', priceKey: 'ethereum:0xabc' }, { ...balance, chain: 'base', priceKey: 'base:0xdef' }, { ...balance, sourceId: 'exchange', priceKey: 'coingecko:bitcoin' }]);
  assert.deepEqual(markets.map(market => market.key).sort(), ['base:0xdef', 'coingecko:bitcoin', 'ethereum:0xabc']);
  assert.deepEqual(cryptoMarkets('UNKNOWN', [{ ...balance, symbol: 'UNKNOWN', priceKey: 'cex:UNKNOWN' }]), []);
});
test('manual holdings use fetched prices; missing or unreliable quotes preserve their recorded value', () => {
  const prices = new Map([['coingecko:bitcoin', { price: 500, confidence: 0.99 }]]);
  const [live] = priceManualCrypto([balance], prices, new Map([['coingecko:bitcoin', 5]]));
  assert.equal(live.valueUsd, 1000);
  assert.equal(live.priceUsd, 500);
  assert.equal(live.change24h, 5);
  assert.equal(live.priceKey, 'coingecko:bitcoin');
  assert.equal(priceManualCrypto([balance], new Map(), new Map())[0].valueUsd, 200);
  assert.equal(priceManualCrypto([balance], new Map([['coingecko:bitcoin', { price: 100000, confidence: 0.1 }]]), new Map())[0].valueUsd, 200);
});
test('history filters malformed and future values, deduplicates and sorts', () => {
  assert.deepEqual(cleanCryptoHistory([{ timestamp: 20, price: 2 }, { timestamp: 10, price: 1 }, { timestamp: 20, price: 3 }, { timestamp: 30, price: NaN }, { timestamp: 40, price: -1 }, { timestamp: 60, price: 5 }], 50), [{ timestamp: 10, price: 1 }, { timestamp: 20, price: 3 }]);
});
test('market chart uses quote and historical API prices, never the portfolio total', async () => {
  const originalFetch = globalThis.fetch;
  const now = Math.floor(Date.now() / 1000);
  const calls: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input); calls.push(url);
    const value = url.includes('/chart/') ? { prices: [{ timestamp: now - 3600, price: 100 }, { timestamp: now - 1800, price: 110 }] } : url.includes('/percentage/') ? 5 : { price: 120, timestamp: now - 60, confidence: 0.99 };
    return new Response(JSON.stringify({ coins: { 'coingecko:bitcoin': value } }));
  };
  try {
    const data = await fetchCryptoMarket({ key: 'coingecko:bitcoin', symbol: 'BTC' }, '24h');
    assert.equal(data.price, 120);
    assert.equal(data.quoteTimestamp, now - 60);
    assert.equal(data.change24h, 5);
    assert.equal(data.points.length, 2);
    assert.ok(calls.some(url => url.includes('/chart/coingecko%3Abitcoin')));
  } finally { globalThis.fetch = originalFetch; }
});
test('missing quotes remain unavailable and do not fabricate a price from history', async () => {
  const originalFetch = globalThis.fetch;
  const timestamp = Math.floor(Date.now() / 1000) - 3600;
  globalThis.fetch = async input => new Response(JSON.stringify({ coins: String(input).includes('/chart/') ? { 'coingecko:bitcoin': { prices: [{ timestamp, price: 50 }] } } : {} }));
  try {
    const data = await fetchCryptoMarket({ key: 'coingecko:bitcoin', symbol: 'BTC' }, '7d');
    assert.equal(data.price, undefined);
    assert.ok(data.quoteError);
    assert.ok(data.historyError);
    assert.deepEqual(data.points, [{ timestamp, price: 50 }]);
  } finally { globalThis.fetch = originalFetch; }
});
test('provider failures and cancelled requests surface as errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 429 });
  try {
    await assert.rejects(() => fetchCryptoMarket({ key: 'coingecko:bitcoin', symbol: 'BTC' }, '7d'), /unavailable/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(() => fetchCryptoMarket({ key: 'coingecko:bitcoin', symbol: 'BTC' }, '7d', controller.signal), { name: 'AbortError' });
  } finally { globalThis.fetch = originalFetch; }
});
