import test from 'node:test';
import assert from 'node:assert/strict';
import type { InvestmentTransaction, InvestmentTransactionType } from '../types';
import { placeTrades, tradeMarkerLetter, tradingDay } from '../services/tradeMarkers';

const trade = (id: string, tradeDate: string, transactionType: InvestmentTransactionType = 'Buy'): InvestmentTransaction =>
  ({ id, investmentId: 'h', transactionType, tradeDate, units: 1, price: 10, fees: 0, currency: 'USD' });
// Daily candles at the US open (14:30 UTC) from Monday 2 Nov to Friday 6 Nov 2026.
const days = [2, 3, 4, 5, 6].map(day => ({ timestamp: Date.UTC(2026, 10, day, 14, 30) }));

test('letters for buys, sells, transfers and dividends', () => {
  assert.deepEqual((['Buy', 'Sell', 'Transfer In', 'Transfer Out', 'Dividend', 'Fee', 'Split'] as const).map(tradeMarkerLetter), ['B', 'S', 'T', 'T', 'D', null, null]);
});

test('trades sit on their trading day, weekends move to the next session, outside ones are counted', () => {
  const { placed, outside } = placeTrades(days, [trade('a', '2026-11-04'), trade('b', '2026-11-04', 'Sell'), trade('c', '2026-11-01'), trade('d', '2026-11-09'), trade('e', '2026-11-03', 'Fee')], 'America/New_York');
  assert.deepEqual([...placed].map(([index, list]) => [index, list.map(t => t.id)]), [[2, ['a', 'b']]]);
  assert.equal(outside, 2);
  const weekend = [...days, { timestamp: Date.UTC(2026, 10, 9, 14, 30) }];
  assert.deepEqual([...placeTrades(weekend, [trade('s', '2026-11-07')], 'America/New_York').placed.keys()], [5]);
});

test("an intraday US candle after midnight in Asia still belongs to the exchange's day", () => {
  const lateSession = Date.UTC(2026, 10, 4, 19, 0); // 3 pm New York, 3 am next day in Kuala Lumpur
  assert.equal(tradingDay(lateSession, 'America/New_York'), '2026-11-04');
  assert.equal(tradingDay(lateSession, 'Asia/Kuala_Lumpur'), '2026-11-05');
});
