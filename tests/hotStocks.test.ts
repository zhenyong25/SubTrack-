import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeHotQuotes, toHotQuote, type HotQuote } from '../server/hotStocks';
import { DEFAULT_HOT_FILTERS, rankHotStocks, scoreHotStock, sessionProgress } from '../services/hotStocks';

// 12:45 New York on a weekday: halfway through the 09:30-16:00 session.
const MIDDAY = Date.UTC(2026, 10, 11, 17, 45);
const quote = (symbol: string, over: Partial<HotQuote> = {}): HotQuote => ({
  symbol, name: symbol, exchange: 'NasdaqGS', quoteType: 'EQUITY', currency: 'USD', price: 100, changePct: 0.02,
  open: 99, previousClose: 98, dayHigh: 103, dayLow: 98, volume: 5e6, avgVolume10Day: 5e6, avgVolume3Month: 5e6,
  marketCap: 50e9, bid: 99.99, ask: 100.01, earningsAt: null, marketState: 'REGULAR', quoteTime: MIDDAY, lists: ['most_actives'], ...over,
});

test('maps a Yahoo screener quote, treating zero bid/ask as missing', () => {
  const mapped = toHotQuote({ symbol: 'MARA', shortName: 'MARA Holdings', regularMarketPrice: 7.34, regularMarketVolume: 65975648, regularMarketChangePercent: 10.54, averageDailyVolume10Day: 4e7, bid: 0, ask: 0, earningsTimestamp: 1762800000, marketState: 'CLOSED' }, 'day_gainers');
  assert.equal(mapped?.symbol, 'MARA');
  assert.ok(Math.abs(mapped!.changePct - 0.1054) < 1e-9);
  assert.equal(mapped?.bid, null);
  assert.equal(mapped?.earningsAt, 1762800000000);
  assert.equal(toHotQuote({ symbol: 'X', regularMarketPrice: 0, regularMarketVolume: 5 }, 'most_actives'), null);
});

test('merging keeps one row per symbol and every list it came from', () => {
  const merged = mergeHotQuotes([[quote('NVDA')], [quote('NVDA', { lists: ['day_losers'] }), quote('AMD', { lists: ['day_losers'] })]]);
  assert.deepEqual(merged.map(q => [q.symbol, q.lists]), [['NVDA', ['most_actives', 'day_losers']], ['AMD', ['day_losers']]]);
});

test('relative volume is pro-rated while the market is open', () => {
  assert.ok(Math.abs(sessionProgress(MIDDAY, 'REGULAR') - 0.5) < 0.01);
  assert.equal(sessionProgress(MIDDAY, 'CLOSED'), 1);
  // Half a normal day's volume by midday is a normal pace.
  assert.ok(Math.abs(scoreHotStock(quote('A', { volume: 2.5e6 }), MIDDAY).rvol! - 1) < 0.02);
  assert.ok(Math.abs(scoreHotStock(quote('B', { volume: 2.5e6, marketState: 'CLOSED' }), MIDDAY).rvol! - 0.5) < 1e-9);
});

test('an in-play liquid stock outranks a quiet one, with reasons and risk flags', () => {
  const hot = scoreHotStock(quote('HOT', { volume: 10e6, dayHigh: 106, dayLow: 99, open: 104, previousClose: 100, earningsAt: MIDDAY + 3600000 }), MIDDAY);
  const quiet = scoreHotStock(quote('QUIET', { volume: 2e6, dayHigh: 100.5, dayLow: 99.5 }), MIDDAY);
  assert.ok(hot.score > quiet.score + 20, `${hot.score} vs ${quiet.score}`);
  assert.ok(hot.reasons.includes('4.0× usual volume'));
  assert.ok(hot.reasons.includes('Gapped +4.0%'));
  assert.ok(hot.reasons.includes('Tight spread'));
  assert.ok(hot.flags.includes('Earnings soon'));
  const risky = scoreHotStock(quote('RISKY', { price: 4, bid: 3.9, ask: 4.1, changePct: 0.35, marketCap: 300e6 }), MIDDAY);
  assert.deepEqual(risky.flags, ['Wide spread 5.0%', 'Extreme move - chasing risk', 'Low price - big % swings', 'Small cap']);
  // Pre-market quotes are too thin to judge the spread by.
  assert.equal(scoreHotStock(quote('PRE', { bid: 90, ask: 110, marketState: 'PRE' }), MIDDAY).spreadPct, null);
});

test('filters drop illiquid, cheap and small stocks and respect direction', () => {
  const quotes = [
    quote('LIQUID'),
    quote('THIN', { avgVolume3Month: 1e5, avgVolume10Day: 1e5, volume: 1e5 }), // $10M a day
    quote('PENNY', { price: 2 }),
    quote('TINY', { marketCap: 100e6 }),
    quote('DOWN', { changePct: -0.04 }),
  ];
  assert.deepEqual(rankHotStocks(quotes, DEFAULT_HOT_FILTERS, 'score', MIDDAY).map(s => s.symbol).sort(), ['DOWN', 'LIQUID']);
  assert.deepEqual(rankHotStocks(quotes, { ...DEFAULT_HOT_FILTERS, direction: 'down' }, 'score', MIDDAY).map(s => s.symbol), ['DOWN']);
  assert.deepEqual(rankHotStocks(quotes, { ...DEFAULT_HOT_FILTERS, minPrice: 0, minAvgDollarVolume: 0, minMarketCap: 0 }, 'dollarVolume', MIDDAY).length, 5);
});
