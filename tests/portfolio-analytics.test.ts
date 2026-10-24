import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFifoLots,
  dateKeyToUtc,
  dividendPayments,
  forecastNextDividend,
  groupAllocation,
  holdingCashFlows,
  moneyWeightedReturn,
  reconstructOpeningPosition,
  trailingMonthKeys,
  utcToDateKey,
  xirr,
} from '../services/portfolioAnalyticsService';
import { applyInvestmentTransaction } from '../services/investmentService';
import type { InvestmentHolding, InvestmentTransaction } from '../types';

const d = dateKeyToUtc;
const near = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

const baseHolding = (overrides: Partial<InvestmentHolding> = {}): InvestmentHolding => ({
  id: 'h', name: 'Test', kind: 'Stocks', units: 0, averageCost: 0, currentPrice: 0,
  currency: 'USD', color: '#000', isActive: true, ...overrides,
});

let nextId = 0;
const tx = (type: InvestmentTransaction['transactionType'], tradeDate: string, units: number, price: number, fees = 0): InvestmentTransaction => ({
  id: `t${nextId++}`, investmentId: 'h', transactionType: type, tradeDate, units, price, fees, currency: 'USD',
});

// Applies trades the way App.tsx does, so tests start from the holding state the app would store.
const play = (start: InvestmentHolding, trades: InvestmentTransaction[]) => {
  let holding = start;
  const logged = trades.map(trade => {
    const result = applyInvestmentTransaction(holding, trade);
    holding = result.holding;
    return { ...trade, realizedPnl: result.realizedPnl };
  });
  return { holding, logged };
};

test('xirr: doubling over 365 days is 100%', () => {
  near(xirr([{ date: d('2025-01-01'), amount: -100 }, { date: d('2026-01-01'), amount: 200 }])!, 1, 1e-6);
});

test('xirr: matches a known spreadsheet example', () => {
  // Excel XIRR docs example: 0.373362535
  const flows = [
    { date: d('2008-01-01'), amount: -10000 },
    { date: d('2008-03-01'), amount: 2750 },
    { date: d('2008-10-30'), amount: 4250 },
    { date: d('2009-02-15'), amount: 3250 },
    { date: d('2009-04-01'), amount: 2750 },
  ];
  near(xirr(flows)!, 0.373362535, 1e-6);
});

test('xirr: no answer when every flow has the same sign', () => {
  assert.equal(xirr([{ date: d('2024-01-01'), amount: -100 }, { date: d('2024-06-01'), amount: -50 }]), null);
});

test('money-weighted return is not annualized under a year', () => {
  const result = moneyWeightedReturn([{ date: d('2026-01-01'), amount: -100 }, { date: d('2026-04-01'), amount: 110 }])!;
  assert.equal(result.annualized, false);
  near(result.rate, 0.10, 1e-6);
});

test('opening position: holding created with units and no logs', () => {
  const opening = reconstructOpeningPosition(baseHolding({ units: 10, averageCost: 50, acquiredDate: '2025-02-03' }), []);
  assert.deepEqual(opening, { units: 10, averageCost: 50, date: d('2025-02-03'), consistent: true });
});

test('opening position: recovered underneath later buys and sells', () => {
  const start = baseHolding({ units: 10, averageCost: 50, acquiredDate: '2025-01-01' });
  const { holding, logged } = play(start, [tx('Buy', '2025-03-01', 10, 70, 2), tx('Sell', '2025-06-01', 5, 80, 1), tx('Fee', '2025-07-01', 0, 0, 3)]);
  const opening = reconstructOpeningPosition(holding, logged);
  assert.equal(opening.units, 10);
  near(opening.averageCost, 50);
  assert.equal(opening.consistent, true);
});

test('opening position: fully closed then reopened uses the stored realized P&L', () => {
  const start = baseHolding({ units: 4, averageCost: 25, acquiredDate: '2024-01-01' });
  const { holding, logged } = play(start, [tx('Sell', '2024-05-01', 4, 30, 1), tx('Buy', '2024-09-01', 2, 40)]);
  const opening = reconstructOpeningPosition(holding, logged);
  assert.equal(opening.units, 4);
  near(opening.averageCost, 25);
  assert.equal(opening.consistent, true);
});

test('opening position: positions built only from logs have no opening lot', () => {
  const { holding, logged } = play(baseHolding(), [tx('Buy', '2025-01-01', 3, 10), tx('Sell', '2025-02-01', 3, 12), tx('Buy', '2025-03-01', 1, 9)]);
  const opening = reconstructOpeningPosition(holding, logged);
  assert.equal(opening.units, 0);
  assert.equal(opening.consistent, true);
});

test('opening position: flags logs that cannot explain the holding', () => {
  // A deleted Buy leaves the units in place, so the Sell now sells more than the logs bought.
  const holding = baseHolding({ units: 0, averageCost: 0 });
  const opening = reconstructOpeningPosition(holding, [tx('Sell', '2025-01-01', 5, 10)]);
  assert.equal(opening.consistent, false);
});

test('cash flows: long position with dividend and today\'s value', () => {
  const { holding, logged } = play(baseHolding(), [tx('Buy', '2025-01-01', 10, 100, 5), tx('Dividend', '2025-06-01', 0, 12), tx('Sell', '2025-09-01', 4, 120, 2)]);
  const { flows, consistent } = holdingCashFlows(holding, logged, 6 * 130, d('2026-01-01'));
  assert.equal(consistent, true);
  assert.deepEqual(flows.map(f => [utcToDateKey(f.date), f.amount]), [
    ['2025-01-01', -1005], ['2025-06-01', 12], ['2025-09-01', 478], ['2026-01-01', 780],
  ]);
});

test('cash flows: a short commits its proceeds and releases them plus the gain', () => {
  const start = baseHolding({ positionSide: 'Short' });
  const { holding, logged } = play(start, [tx('Sell', '2025-01-01', 10, 50), tx('Buy', '2025-02-01', 10, 40)]);
  const { flows } = holdingCashFlows(holding, logged, 0, d('2025-03-01'));
  // Shorted at 50, covered at 40: 500 in, 600 back.
  assert.deepEqual(flows.map(f => f.amount), [-500, 600]);
  assert.equal(logged[1].realizedPnl, 100);
});

test('FIFO lots: sells eat the oldest lot first', () => {
  const start = baseHolding({ units: 5, averageCost: 10, acquiredDate: '2024-01-01' });
  const { holding, logged } = play(start, [tx('Buy', '2024-06-01', 5, 20), tx('Sell', '2025-01-01', 7, 30, 1)]);
  const lots = buildFifoLots(holding, logged);
  assert.equal(lots.openLots.length, 1);
  assert.equal(lots.openLots[0].units, 3);
  assert.equal(lots.openLots[0].costPerUnit, 20);
  assert.equal(lots.openLots[0].openedOn, d('2024-06-01'));
  assert.equal(lots.closedLots, 1);
  // 5 @ (30-10) + 2 @ (30-20) - 1 fee
  assert.equal(lots.fifoRealized, 119);
  // Average cost books 7 * (30-15) - 1 instead.
  assert.equal(logged[1].realizedPnl, 104);
});

test('dividends: quarterly payer forecasts the next quarter', () => {
  const payments = dividendPayments([tx('Dividend', '2025-03-15', 0, 10), tx('Dividend', '2025-06-15', 0, 11), tx('Dividend', '2025-09-15', 0, 12)]);
  const forecast = forecastNextDividend(payments, d('2025-10-01'))!;
  assert.equal(forecast.cadence, 'Quarterly');
  assert.equal(utcToDateKey(forecast.nextDate), '2025-12-15');
  assert.equal(forecast.estimatedAmount, 12);
});

test('dividends: a payer that missed several cycles gets no forecast', () => {
  const payments = dividendPayments([tx('Dividend', '2024-01-10', 0, 5), tx('Dividend', '2024-02-10', 0, 5)]);
  assert.equal(forecastNextDividend(payments, d('2024-09-01')), null);
});

test('trailing months end with the current month', () => {
  assert.deepEqual(trailingMonthKeys(d('2026-02-14'), 3), ['2025-12', '2026-01', '2026-02']);
});

test('allocation folds the tail into Other', () => {
  const items = [5, 4, 3, 2, 1].map((value, index) => ({ value, key: `k${index}` }));
  const slices = groupAllocation(items, item => item.value, item => ({ key: item.key, label: item.key, color: '#000' }), 3);
  assert.deepEqual(slices.map(s => [s.label, s.value]), [['k0', 5], ['k1', 4], ['Other (3)', 6]]);
  near(slices.reduce((sum, s) => sum + s.share, 0), 1);
});
