import test from 'node:test';
import assert from 'node:assert/strict';
import { priceBalances, priceKeysFor, summarize, toUnits, valueHistory, type PricedBalance } from '../services/cryptoPortfolio';
import { detectAddressFamily } from '../services/cryptoChains';
import type { CoinPrice } from '../services/cryptoPriceService';
import type { RawBalance } from '../services/cryptoScanService';

const near = (actual: number | undefined, expected: number, tolerance = 1e-6) =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('base units convert exactly, including amounts beyond 2^53', () => {
  assert.equal(toUnits('150000000', 8), 1.5);
  assert.equal(toUnits('1', 18), 1e-18);
  near(toUnits('123456789012345678901234', 18), 123456.789012345678901234);
  assert.equal(toUnits('42', 0), 42);
  assert.equal(toUnits('not a number', 6), 0);
});

test('addresses are recognised by network family', () => {
  assert.equal(detectAddressFamily('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'), 'bitcoin');
  assert.equal(detectAddressFamily('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'), 'bitcoin');
  assert.equal(detectAddressFamily('0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'), 'evm');
  assert.equal(detectAddressFamily('vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg'), 'solana');
  assert.equal(detectAddressFamily('TNaRAoLUyYEV2uF7GUrzSjRQTU8v5ZJ5VR'), 'tron');
  assert.equal(detectAddressFamily('hello'), null);
});

const raw: RawBalance[] = [
  { chain: 'bitcoin', priceKey: 'coingecko:bitcoin', rawAmount: '50000000', decimals: 8, symbol: 'BTC' },
  { chain: 'base', priceKey: 'base:0xusdc', rawAmount: '2500000000' }, // decimals from the price
  { chain: 'ethereum', priceKey: 'ethereum:0xusdc', rawAmount: '500000000', decimals: 6, symbol: 'USDC' },
  { chain: 'ethereum', priceKey: 'ethereum:0xscam', rawAmount: '1000000000000000000000', decimals: 18, symbol: 'VISIT-SITE', flagged: true },
  { chain: 'ethereum', priceKey: 'ethereum:0xlow', rawAmount: '1000000000000000000', decimals: 18, symbol: 'LOW' },
  { chain: 'ethereum', priceKey: 'ethereum:0xnone', rawAmount: '1000', decimals: 0, symbol: 'NONE' },
  { chain: 'ethereum', priceKey: 'ethereum:0xdust', rawAmount: '1', decimals: 6, symbol: 'DUST' },
];
const prices = new Map<string, CoinPrice>([
  ['coingecko:bitcoin', { price: 80000, confidence: 0.99 }],
  ['base:0xusdc', { price: 1, symbol: 'USDC', decimals: 6, confidence: 0.99 }],
  ['ethereum:0xusdc', { price: 1, confidence: 0.99 }],
  ['ethereum:0xscam', { price: 5 }],
  ['ethereum:0xlow', { price: 3, confidence: 0.4 }],
  ['ethereum:0xdust', { price: 1, confidence: 0.99 }],
]);
const changes = new Map([['coingecko:bitcoin', 25], ['base:0xusdc', 0]]);

test('only listed, unflagged balances need a price lookup', () => {
  assert.deepEqual(priceKeysFor([...raw, { chain: 'ethereum', priceKey: 'ethereum:0xair', rawAmount: '5', decimals: 0, unlisted: true }, raw[0]]),
    ['coingecko:bitcoin', 'base:0xusdc', 'ethereum:0xusdc', 'ethereum:0xlow', 'ethereum:0xnone', 'ethereum:0xdust']);
});

test('exchange balances use the exchange price unless a live one exists; cex keys skip the lookup', () => {
  const cex: RawBalance[] = [
    { priceKey: 'cex:NEWCOIN', rawAmount: '2000000000000000000', decimals: 18, symbol: 'NEWCOIN', wallet: 'Spot', priceUsd: 3, change24h: 10 },
    { priceKey: 'coingecko:bitcoin', rawAmount: '500000000000000000', decimals: 18, symbol: 'BTC', wallet: 'Earn', priceUsd: 1 },
  ];
  assert.deepEqual(priceKeysFor(cex), ['coingecko:bitcoin']);
  const priced = priceBalances('ex', cex, prices, changes);
  near(priced[0].valueUsd, 6);
  assert.equal(priced[0].change24h, 10);
  assert.equal(priced[0].wallet, 'Spot');
  near(priced[1].valueUsd, 40000); // live BTC price wins over the exchange snapshot
  assert.equal(priced[1].change24h, 25);
  assert.equal(summarize(priced).byChain.exchange, 40006);
});

test('pricing hides spam, low-confidence, unpriced and dust balances', () => {
  const priced = priceBalances('w1', raw, prices, changes);
  const bySymbol = Object.fromEntries(priced.map(b => [b.symbol, b]));
  near(bySymbol.BTC.valueUsd, 40000);
  assert.equal(bySymbol['VISIT-SITE'].hidden, 'spam');
  assert.equal(bySymbol.LOW.hidden, 'spam');
  assert.equal(bySymbol.NONE.hidden, 'unpriced');
  assert.equal(bySymbol.DUST.hidden, 'dust');
  assert.equal(priced.filter(b => !b.hidden).length, 3);
});

test('summary merges a coin across networks and works out the 24h change', () => {
  const priced = priceBalances('w1', raw, prices, changes);
  const manual: PricedBalance = { sourceId: 'manual', symbol: 'ETH', amount: 2, priceUsd: 2500, valueUsd: 5000 };
  const s = summarize([...priced, manual]);
  near(s.totalUsd, 40000 + 2500 + 500 + 5000);
  const usdc = s.assets.find(a => a.key === 'USDC')!;
  near(usdc.amount, 3000);
  assert.deepEqual(usdc.chains.sort(), ['base', 'ethereum']);
  assert.equal(usdc.isStable, true);
  near(s.stableUsd, 3000);
  // BTC was worth 40000 / 1.25 = 32000 a day ago; everything else unchanged.
  near(s.change24hUsd, 8000);
  near(s.change24hPct, (48000 / 40000 - 1) * 100);
  assert.equal(s.assets[0].symbol, 'BTC');
  near(s.assets[0].share, 40000 / 48000);
  near(s.bySource.manual, 5000);
  near(s.byChain.base, 2500);
  near(s.byChain.manual, 5000);
  assert.equal(s.hidden.length, 4);
});

test('history values today\'s amounts at past prices; no history means today\'s value', () => {
  const priced = priceBalances('w1', raw.slice(0, 1), prices, changes); // 0.5 BTC
  const manual: PricedBalance = { sourceId: 'manual', symbol: 'X', amount: 1, valueUsd: 100 };
  const history = new Map([['coingecko:bitcoin', [{ timestamp: 1, price: 60000 }, { timestamp: 2, price: 70000 }, { timestamp: 3, price: 80000 }]]]);
  assert.deepEqual(valueHistory([...priced, manual], history), [
    { timestamp: 1, value: 30100 },
    { timestamp: 2, value: 35100 },
    { timestamp: 3, value: 40100 },
  ]);
  assert.deepEqual(valueHistory(priced, new Map()), []);
});

test('exchange decimal amounts convert to base units exactly', async () => {
  const { decimalToRaw } = await import('../services/cryptoExchangeService');
  assert.equal(decimalToRaw('0.00123'), '1230000000000000');
  assert.equal(decimalToRaw('12'), '12000000000000000000');
  assert.equal(decimalToRaw('1.5', 6), '1500000');
  assert.equal(decimalToRaw('1e-7'), '100000000000');
  assert.equal(toUnits(decimalToRaw('98765.4321'), 18), 98765.4321);
});

test('wallet names are told apart from addresses', async () => {
  const { isWalletName } = await import('../services/cryptoNames');
  assert.equal(isWalletName('blueknight0225.base.eth'), true);
  assert.equal(isWalletName('vitalik.eth'), true);
  assert.equal(isWalletName(' Vitalik.ETH '), true);
  assert.equal(isWalletName('0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'), false);
  assert.equal(isWalletName('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'), false);
  assert.equal(isWalletName('eth'), false);
});
