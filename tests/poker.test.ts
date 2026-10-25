import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bankrollStats,
  cashStats,
  groupByPeriod,
  homeCurrency,
  homeCurrencyStats,
  inRange,
  periodKey,
  periodLabel,
  profitSeries,
  tournamentStats,
} from '../services/pokerService';
import type { PokerCashSession, PokerMttBankrollTransaction, PokerMttTournament } from '../types';

const near = (actual: number | undefined, expected: number, tolerance = 1e-9) =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

let n = 0;
const mtt = (date: string, entries: number, buyIn: number, cashout = 0, bounty = 0, isBounty = false): PokerMttTournament => ({
  id: `t${n++}`, investmentId: 'p', tournamentDate: date, tournamentName: 'Daily', entries, buyInUsd: buyIn, cashoutUsd: cashout, bountyUsd: bounty, isBounty,
});
const cash = (date: string, buyIn: number, cashOut: number, hours?: number): PokerCashSession => ({ id: `c${n++}`, investmentId: 'p', sessionDate: date, buyInUsd: buyIn, cashOutUsd: cashOut, durationHours: hours });
const event = (date: string, eventType: PokerMttBankrollTransaction['eventType'], amount: number): PokerMttBankrollTransaction => ({ id: `e${n++}`, investmentId: 'p', eventDate: date, eventType, amountUsd: amount });

const tournaments = [
  mtt('2026-10-01', 1, 11, 0),                 // bust
  mtt('2026-10-02', 3, 33, 120),               // 3 bullets, cashed
  mtt('2026-10-05', 1, 55, 0, 25, true),       // bounty event, no cash: not ITM
  mtt('2026-10-08', 2, 2.2, 15, 4.5, true),    // cashed in a bounty
];

test('tournaments: ITM counts end rewards only; buy-ins are per entry', () => {
  const s = tournamentStats(tournaments);
  assert.equal(s.count, 4);
  assert.equal(s.entries, 7);
  near(s.buyIns, 101.2);
  near(s.winnings, 164.5);
  near(s.profit, 63.3);
  near(s.roi, 63.3 / 101.2);
  assert.equal(s.itm, 2);
  near(s.itmRate, 0.5);
  near(s.largestWin, 120);
  near(s.averageBuyIn, 101.2 / 7);
  near(s.highestBuyIn, 55);
  near(s.lowestBuyIn, 1.1);
  assert.equal(s.bountyEvents, 2);
});

test('tournaments: empty list has no rates', () => {
  const s = tournamentStats([]);
  assert.equal(s.roi, undefined);
  assert.equal(s.itmRate, undefined);
  assert.equal(s.averageBuyIn, undefined);
});

test('cash: results, win rate, biggest win/loss and hourly over timed sessions', () => {
  const s = cashStats([cash('2026-10-03', 200, 340, 3), cash('2026-10-04', 200, 50, 2), cash('2026-10-06', 100, 180)]);
  assert.equal(s.sessions, 3);
  near(s.profit, 70);
  assert.equal(s.winningSessions, 2);
  near(s.winRate, 2 / 3);
  near(s.biggestWin, 140);
  near(s.biggestLoss, -150);
  near(s.hours, 5);
  near(s.hourly, (140 - 150) / 5);
});

test('bankroll: deposits fund it, results grow it, return is profit over deposits', () => {
  const events = [event('2026-09-28', 'Deposit', 500), event('2026-10-10', 'Withdrawal', 100), event('2026-10-12', 'Adjustment', 12)];
  const sessions = [cash('2026-10-03', 200, 340)];
  const s = bankrollStats(events, tournaments, sessions);
  near(s.netDeposits, 400);
  near(s.tournamentProfit, 63.3);
  near(s.cashProfit, 140);
  near(s.totalProfit, 215.3);
  near(s.bankroll, 615.3);
  near(s.returnOnDeposits, 215.3 / 500);
});

test('home currency: SGD deposits are valued as sent; return includes the exchange rate', () => {
  const events: PokerMttBankrollTransaction[] = [
    { id: 'a', investmentId: 'p', eventDate: '2026-09-01', eventType: 'Deposit', amountUsd: 380, currency: 'SGD', amount: 500 },
    { id: 'b', investmentId: 'p', eventDate: '2026-09-10', eventType: 'Deposit', amountUsd: 100 }, // sent in USD
    { id: 'c', investmentId: 'p', eventDate: '2026-10-01', eventType: 'Withdrawal', amountUsd: 75, currency: 'SGD', amount: 100 },
    { id: 'd', investmentId: 'p', eventDate: '2026-10-02', eventType: 'Adjustment', amountUsd: 5 },
  ];
  assert.equal(homeCurrency(events), 'SGD');
  assert.equal(homeCurrency([events[1]]), undefined);
  const s = homeCurrencyStats(events, 500, 'SGD', 1.3);
  near(s.deposited, 500 + 130);
  near(s.withdrawn, 100);
  near(s.valueNow, 650);
  near(s.profit, 650 + 100 - 630);
  near(s.returnOnDeposits, 120 / 630);
  const rows = groupByPeriod(events, [], [], 'month', { currency: 'SGD', rate: 1.3 });
  near(rows[1].depositsHome, 630);
  near(rows[1].deposits, 480);
  near(rows[0].withdrawalsHome, 100);
});

test('periods: weeks start on Monday; labels read naturally', () => {
  assert.equal(periodKey('2026-10-24', 'week'), '2026-10-19'); // Saturday -> Monday
  assert.equal(periodKey('2026-10-19', 'week'), '2026-10-19');
  assert.equal(periodKey('2026-10-18T09:00:00Z', 'week'), '2026-10-12'); // Sunday belongs to the week before
  assert.equal(periodKey('2026-10-24', 'month'), '2026-10');
  assert.equal(periodLabel('2026-10-19', 'week'), 'Week of 19 Oct 2026');
  assert.equal(periodLabel('2026-10', 'month'), 'Oct 2026');
});

test('grouping: deposits and results land in their period, newest first', () => {
  const rows = groupByPeriod([event('2026-09-28', 'Deposit', 500)], tournaments, [cash('2026-10-03', 200, 340)], 'month');
  assert.deepEqual(rows.map(r => r.key), ['2026-10', '2026-09']);
  assert.equal(rows[1].deposits, 500);
  assert.equal(rows[0].tournaments, 4);
  assert.equal(rows[0].itm, 2);
  near(rows[0].profit, 63.3 + 140);
});

test('profit series is cumulative by day', () => {
  const series = profitSeries([mtt('2026-10-01', 1, 10), mtt('2026-10-02', 1, 10, 50)], [cash('2026-10-01', 100, 130)]);
  assert.deepEqual(series.map(p => [p.date, p.tournaments, p.cash, p.total]), [['2026-10-01', -10, 30, 20], ['2026-10-02', 30, 30, 60]]);
});

test('ranges include today and look back the right number of days', () => {
  assert.equal(inRange('2026-10-24', '30d', '2026-10-24'), true);
  assert.equal(inRange('2026-09-25', '30d', '2026-10-24'), true);
  assert.equal(inRange('2026-09-24', '30d', '2026-10-24'), false);
  assert.equal(inRange('2026-01-01', 'ytd', '2026-10-24'), true);
  assert.equal(inRange('2025-12-31', 'ytd', '2026-10-24'), false);
});
