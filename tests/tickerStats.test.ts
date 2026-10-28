import test from 'node:test';
import assert from 'node:assert/strict';
import { breakEven, tickerStats } from '../services/tickerStatsService';
import type { StockCandle } from '../services/stockQuoteService';

const near = (actual: number | undefined, expected: number, tolerance = 1e-9) =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('long below its average needs a rise to break even', () => {
  const result = breakEven('Long', 80, 100)!;
  assert.equal(result.status, 'loss');
  near(result.movePct, 0.25); // 80 -> 100 is +25%, not +20%
  near(result.movePerUnit, 20);
  near(result.pnlPct, -0.2);
});

test('long above its average can fall before turning into a loss', () => {
  const result = breakEven('Long', 125, 100)!;
  assert.equal(result.status, 'profit');
  near(result.movePct, -0.2);
  near(result.pnlPerUnit, 25);
});

test('short below its entry can rise before losing money', () => {
  const result = breakEven('Short', 80, 100)!;
  assert.equal(result.status, 'profit');
  near(result.movePct, 0.25);
  near(result.pnlPerUnit, 20);
  near(result.pnlPct, 0.2);
});

test('short above its entry needs a fall to break even', () => {
  const result = breakEven('Short', 125, 100)!;
  assert.equal(result.status, 'loss');
  near(result.movePct, -0.2);
  near(result.pnlPerUnit, -25);
});

test('break-even needs real prices', () => {
  assert.equal(breakEven('Long', 0, 100), null);
  assert.equal(breakEven('Long', 100, 0), null);
  assert.equal(breakEven('Long', 100, 100)!.status, 'even');
});

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 27, 20);
// 320 sessions, one per calendar day back to early December 2025, rising 1 per day from 100.
const daily: StockCandle[] = Array.from({ length: 320 }, (_, index) => {
  const close = 100 + index;
  return { timestamp: NOW - (319 - index) * DAY, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1000 + index };
});

test('statistics from a year of daily bars', () => {
  const stats = tickerStats(daily, 419, {}, NOW);
  near(stats.previousClose, 418);
  near(stats.dayChangePct, 419 / 418 - 1);
  near(stats.high52, 420);
  near(stats.low52, 99);
  near(stats.ma50, 419 - 24.5);
  assert.equal(stats.ma200 !== undefined, true);
  near(stats.rsi14, 100); // only ever rose
  near(stats.avgVolume30, 1000 + (290 + 319) / 2);
  near(stats.returns.find(item => item.label === '1W')?.pct, 419 / 412 - 1);
  near(stats.returns.find(item => item.label === 'YTD')?.pct, 419 / 119 - 1); // last close of 2025, Dec 31
  assert.equal(stats.returns.some(item => item.label === '1Y'), false); // history doesn't reach a year back
  assert.deepEqual(stats.returns.map(item => item.label), ['1W', '1M', '3M', 'YTD', '6M']);
});

test('Yahoo 52-week figures win over the bars, and short histories skip what they cannot know', () => {
  const stats = tickerStats(daily.slice(-5), 419, { fiftyTwoWeekHigh: 450, fiftyTwoWeekLow: 90 }, NOW);
  near(stats.high52, 450);
  near(stats.low52, 90);
  near(stats.rangePosition, (419 - 90) / 360);
  assert.equal(stats.ma50, undefined);
  assert.equal(stats.volatility30, undefined);
  assert.deepEqual(stats.returns, []);
});
