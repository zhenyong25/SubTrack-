import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BARS_PER_SESSION,
  DEFAULT_RULES,
  atr,
  checkRisk,
  dailySetups,
  dayUsage,
  isFullSession,
  journalStats,
  nyTime,
  openingRange,
  orbState,
  replayHistory,
  rsi,
  simulate,
  sizePosition,
  stopPrice,
  targetPrice,
  toSessions,
  verdict,
  type JournalTrade,
  type Session,
} from '../services/tradingMath';
import type { StockCandle } from '../services/stockQuoteService';

const near = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

// 2026-10-26 09:30 New York = 13:30 UTC (EDT).
const sessionStart = (day: string) => Date.parse(`${day}T13:30:00Z`);
const bar = (timestamp: number, open: number, high: number, low: number, close: number): StockCandle => ({ timestamp, open, high, low, close });
const flatSession = (day: string, price = 100, opening?: Array<[number, number, number, number]>): Session => ({
  day,
  bars: Array.from({ length: BARS_PER_SESSION }, (_, i) => {
    const o = opening?.[i];
    return o ? bar(sessionStart(day) + i * 300000, ...o) : bar(sessionStart(day) + i * 300000, price, price + 0.1, price - 0.1, price);
  }),
});

test('sizing: the smallest of the four limits (repo TSLA example)', () => {
  const stop = stopPrice('or-mid', 364.18, { range: { high: 362.18, low: 354.47, mid: (362.18 + 354.47) / 2 } })!;
  assert.equal(stop, 358.32);
  assert.equal(targetPrice(364.18, stop, 1), 370.04);
  assert.equal(targetPrice(364.18, stop, 2), 375.90);
  const size = sizePosition(DEFAULT_RULES, 364.18, stop)!;
  assert.deepEqual(size.limits, { 'max loss': 8, 'position cap': 10, 'max order': 10, cash: 12 });
  assert.equal(size.shares, 8);
  assert.equal(size.limitedBy, 'max loss');
  assert.equal(size.cost, 2913.44);
  assert.equal(size.lossAtStop, 46.88);
});

test('sizing: a stop too far for the max loss sizes to zero', () => {
  assert.equal(sizePosition(DEFAULT_RULES, 364.18, 300)!.shares, 0);
  assert.equal(sizePosition(DEFAULT_RULES, 100, 101), undefined);
});

test('stops round down, targets round half up', () => {
  assert.equal(stopPrice('pct', 100.03, { pct: 1.5 }), 98.52);
  assert.equal(stopPrice('atr', 50, { atr: 0.333, atrK: 2 }), 49.33);
});

test('risk check: passes a sized plan, blocks with reasons', () => {
  const ok = checkRisk(DEFAULT_RULES, { symbol: 'TSLA', entry: 364.18, stop: 358.32, target: 375.9, shares: 8, entryMinute: 10 * 60 }, { trades: 0, committedLoss: 0, dayTradesLast5: 0 });
  assert.equal(ok.pass, true);
  const bad = checkRisk({ ...DEFAULT_RULES, blocked: ['tsla'] }, { symbol: 'TSLA', entry: 364.18, stop: 358.32, target: 365, shares: 10, entryMinute: 9 * 60 + 40 }, { trades: 3, committedLoss: 120, dayTradesLast5: 0 });
  assert.equal(bad.pass, false);
  assert.deepEqual(bad.checks.filter(c => !c.pass).map(c => c.name), ['Ticker', 'Loss', 'Reward:risk', 'Daily loss', 'Trades', 'Window']);
});

test('RSI uses Wilder smoothing', () => {
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
  near(rsi(closes)[14], 70.46, 0.05);
});

test('daily setups follow the repo rules', () => {
  const breakout = [...Array.from({ length: 20 }, (_, i) => 100 + (i % 3)), 110];
  assert.ok(dailySetups(breakout).setups.includes('breakout_20d'));
  // +12% over ten sessions, then five closes inside a 2% band.
  const flag = [...Array(5).fill(100), 100, 101, 102, 104, 105, 106, 108, 109, 110, 111, 112, 111, 112, 113, 112, 111.5];
  assert.ok(dailySetups(flag).setups.includes('bull_flag'));
  const falling = Array.from({ length: 30 }, (_, i) => 100 - i * 2);
  const bounce = [...falling, falling[falling.length - 1] + 1];
  const result = dailySetups(bounce);
  assert.ok(result.setups.includes('oversold_bounce'));
});

test('sessions: regular hours only, full when all 78 bars are there', () => {
  assert.deepEqual(nyTime(sessionStart('2026-10-26')), { day: '2026-10-26', minute: 570 });
  const premarket = bar(sessionStart('2026-10-26') - 3600000, 1, 1, 1, 1);
  const sessions = toSessions([premarket, ...flatSession('2026-10-26').bars]);
  assert.equal(sessions.length, 1);
  assert.equal(isFullSession(sessions[0]), true);
  assert.equal(isFullSession({ ...sessions[0], bars: sessions[0].bars.slice(0, 77) }), false);
});

test('opening range breakout: first close above the 15-minute high', () => {
  const session = flatSession('2026-10-26', 100, [
    [100, 101, 99, 100.5], [100.5, 102, 100, 101.5], [101.5, 101.8, 100.8, 101], // range 99-102
    [101, 102.5, 100.9, 101.9], // closes inside
    [101.9, 103, 101.8, 102.6], // first close above 102 -> trigger at 9:55
  ]);
  assert.deepEqual(openingRange(session), { high: 102, low: 99, mid: 100.5 });
  const state = orbState(session, 15 * 60 + 30);
  assert.equal(state.status, 'triggered');
  if (state.status === 'triggered') {
    assert.equal(state.price, 102.6);
    assert.equal(state.minute, 9 * 60 + 55);
  }
  assert.equal(orbState(session, 9 * 60 + 50).status, 'expired');
});

test('ATR averages true ranges, all bars when fewer than 14', () => {
  const bars = [bar(0, 10, 11, 9, 10), bar(1, 10, 10.5, 9.5, 10)];
  assert.deepEqual(atr(bars), { value: 1.5, bars: 2 });
});

test('time machine: deterministic for a seed, and a quiet market never moves', () => {
  const pool = Array.from({ length: 20 }, (_, i) => flatSession(`2026-09-${String(i + 1).padStart(2, '0')}`));
  const plan = { entry: 100, stop: 99, target: 101, entryBar: 10, untilBar: 76 };
  const a = simulate(pool, plan, 500, 7);
  const b = simulate(pool, plan, 500, 7);
  assert.deepEqual(a.odds, b.odds);
  // Bars only wiggle 0.1%, so nothing reaches a 1% stop or target.
  assert.equal(a.odds.neither, 1);
  near(a.averageR, 0);
  assert.equal(a.bands.length, 67);
  assert.equal(verdict(a, 1), 'No replay reached the stop or the target.');
});

test('time machine: a steadily rising market hits the target first', () => {
  const rising = (day: string): Session => ({
    day,
    bars: Array.from({ length: BARS_PER_SESSION }, (_, i) => {
      const p = 100 * Math.pow(1.002, i);
      return bar(sessionStart(day) + i * 300000, p / 1.002, p * 1.0005, p / 1.002 * 0.9999, p);
    }),
  });
  const pool = Array.from({ length: 20 }, (_, i) => rising(`2026-09-${String(i + 1).padStart(2, '0')}`));
  const result = simulate(pool, { entry: 100, stop: 99, target: 101, entryBar: 10, untilBar: 76 }, 300, 19);
  assert.equal(result.odds.target, 1);
  near(result.averageR, 1);
  assert.equal(verdict(result, 1), 'Strongly toward the target');
});

test('history replay: runs the opening-range rule on past sessions', () => {
  const winner = flatSession('2026-10-26', 100, [
    [100, 101, 99, 100.5], [100.5, 102, 100, 101.5], [101.5, 101.8, 100.8, 101],
    [101, 103, 101, 102.6], // trigger 102.6, stop or-mid 100.5, risk 2.1, 1R target 104.7
    [102.6, 105, 102.5, 104.8], // hits target
  ]);
  const loser = flatSession('2026-10-27', 100, [
    [100, 101, 99, 100.5], [100.5, 102, 100, 101.5], [101.5, 101.8, 100.8, 101],
    [101, 103, 101, 102.6],
    [102.6, 102.7, 100, 100.2], // hits stop
  ]);
  const history = replayHistory([winner, loser], { stopMethod: 'or-mid', rMultiple: 1, lastEntryMinute: 15 * 60 + 30, untilBar: 76 })!;
  assert.deepEqual({ ...history, averageR: Number(history.averageR.toFixed(6)) }, { fires: 2, target: 1, stop: 1, neither: 0, averageR: 0 });
});

const trade = (overrides: Partial<JournalTrade>): JournalTrade => ({
  id: Math.random().toString(36), tradeDate: '2026-10-20', symbol: 'TSLA', setup: 'Opening-range breakout',
  entry: 100, stop: 98, shares: 10, fees: 0, followedPlan: true, mistakes: [], ...overrides,
});

test('journal stats: R, expectancy, profit factor, drawdown, plan adherence', () => {
  const trades = [
    trade({ exitPrice: 104, exitDate: '2026-10-20' }), // +2R
    trade({ exitPrice: 98, exitDate: '2026-10-21', followedPlan: false, mistakes: ['Moved the stop'] }), // -1R
    trade({ exitPrice: 97, exitDate: '2026-10-22', followedPlan: false, mistakes: ['Moved the stop', 'Oversized'] }), // -1.5R
    trade({ exitPrice: 103, exitDate: '2026-10-23', setup: 'Bull flag' }), // +1.5R
    trade({}), // still open
  ];
  const stats = journalStats(trades);
  assert.equal(stats.closed, 4);
  assert.equal(stats.open, 1);
  near(stats.winRate, 0.5);
  near(stats.expectancy, (2 - 1 - 1.5 + 1.5) / 4);
  near(stats.profitFactor!, 70 / 50);
  near(stats.maxDrawdownR, 2.5);
  assert.equal(stats.longestLosingStreak, 2);
  assert.deepEqual(stats.equity.map(p => p.r), [2, 1, -0.5, 1]);
  near(stats.followed.averageR, 1.75);
  near(stats.broke.averageR, -1.25);
  assert.equal(stats.byMistake.find(b => b.label === 'Moved the stop')!.trades, 2);
});

test('day usage: today\'s trades, losses at risk, and PDT round trips', () => {
  const trades = [
    trade({ tradeDate: '2026-10-26', exitPrice: 99, exitDate: '2026-10-26' }), // lost 10, day trade
    trade({ tradeDate: '2026-10-26' }), // open: 20 at risk
    trade({ tradeDate: '2026-10-23', exitPrice: 101, exitDate: '2026-10-23' }), // day trade Friday
    trade({ tradeDate: '2026-10-16', exitPrice: 101, exitDate: '2026-10-16' }), // too old
  ];
  assert.deepEqual(dayUsage(trades, '2026-10-26'), { trades: 2, committedLoss: 30, dayTradesLast5: 2 });
});

test('journal P&L converts each trade into the rules currency; R stays currency-free', () => {
  const trades = [
    trade({ exitPrice: 104, exitDate: '2026-10-20', currency: 'HKD' }), // +40 HKD, +2R
    trade({ exitPrice: 98, exitDate: '2026-10-21' }), // -20 USD, -1R
  ];
  const stats = journalStats(trades, (amount, currency) => (currency === 'HKD' ? amount / 8 : amount));
  near(stats.totalPnl, 5 - 20);
  near(stats.expectancy, 0.5);
  near(stats.profitFactor!, 5 / 20);
});
