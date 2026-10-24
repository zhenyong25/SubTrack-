import test from 'node:test';
import assert from 'node:assert/strict';
import { recordedHoldingValueAt } from '../services/portfolioHistoryService';
import type { InvestmentHolding, InvestmentValuation } from '../types';
const holding = { id: 'h', units: 99, currency: 'USD' } as InvestmentHolding;
const records = [
  { valuationDate: '2026-01-01', marketValue: 1000, price: 100, currency: 'USD' },
  { valuationDate: '2026-01-03', marketValue: 2400, price: 120, currency: 'USD' },
] as InvestmentValuation[];
const at = (date: string) => Date.parse(date);
const market = { symbol: 'TEST', currency: 'USD', candles: [
  { timestamp: at('2025-01-01'), close: 90, open: 90, high: 90, low: 90 },
  { timestamp: at('2026-01-02'), close: 110, open: 110, high: 110, low: 110 },
  { timestamp: at('2026-01-04'), close: 125, open: 125, high: 125, low: 125 },
] };
test('unrecorded years are zero even with market prices', () => {
  assert.equal(recordedHoldingValueAt(holding, records, market, at('2025-01-01')).value, 0);
});
test('first record anchors value; prices fluctuate using recorded quantity', () => {
  assert.equal(recordedHoldingValueAt(holding, records, market, at('2026-01-01')).value, 1000);
  assert.equal(recordedHoldingValueAt(holding, records, market, at('2026-01-02')).value, 1100);
});
test('subsequent records reset the value and quantity anchor', () => {
  assert.equal(recordedHoldingValueAt(holding, records, market, at('2026-01-03')).value, 2400);
  assert.equal(recordedHoldingValueAt(holding, records, market, at('2026-01-04')).value, 2500);
});
test('missing history or currency mismatch holds the recorded value', () => {
  assert.equal(recordedHoldingValueAt(holding, records, undefined, at('2026-01-02')).value, 1000);
  assert.equal(recordedHoldingValueAt(holding, records, { ...market, currency: 'SGD' }, at('2026-01-02')).value, 1000);
});
