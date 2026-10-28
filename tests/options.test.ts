import test from 'node:test';
import assert from 'node:assert/strict';
import { optionMetrics, optionPnl, validateOption, type OptionTrade } from '../services/optionsMath';

const call: OptionTrade = { id: 'test', symbol: 'TSLA', type: 'Call', strike: 100, premium: 3, contracts: 2, multiplier: 100, fees: 4, currency: 'USD', tradeDate: '2026-10-27', expiry: '2026-11-20', notes: '' };
test('long call includes contracts, multiplier and total fees', () => {
  const result = optionMetrics(call);
  assert.equal(result.cost, 604);
  assert.equal(result.maxLoss, 604);
  assert.equal(result.breakEven, 103.02);
  assert.equal(result.maxProfit, Infinity);
  assert.equal(result.payoff(90), -604);
  assert.equal(result.payoff(110), 1396);
  assert.ok(Math.abs(result.payoff(result.breakEven)) < 1e-8);
});
test('long put has bounded profit and the correct break-even', () => {
  const result = optionMetrics({ ...call, type: 'Put' });
  assert.equal(result.breakEven, 96.98);
  assert.equal(result.maxProfit, 19396);
  assert.equal(result.payoff(110), -604);
  assert.equal(result.payoff(90), 1396);
  assert.ok(Math.abs(result.payoff(result.breakEven)) < 1e-8);
});
test('adjusted contract multipliers are respected', () => {
  assert.equal(optionMetrics({ ...call, multiplier: 10 }).cost, 64);
});
test('realized P/L uses exit premium, including worthless expiration', () => {
  assert.equal(optionPnl(call), null);
  assert.equal(optionPnl({ ...call, exitPremium: 0 }), -604);
  assert.equal(optionPnl({ ...call, exitPremium: 5 }), 396);
});
test('invalid prices, contracts and dates cannot be saved', () => {
  assert.equal(validateOption(call), null);
  for (const changes of [{ symbol: '' }, { contracts: 1.5 }, { contracts: 0 }, { multiplier: 0 }, { premium: NaN }, { strike: Infinity }, { fees: -1 }, { expiry: '2026-10-26' }, { expiry: '2026-02-30' }, { exitPremium: -1, exitDate: '2026-11-01' }, { exitPremium: 0 }, { exitPremium: 1, exitDate: '2026-12-01' }]) {
    assert.ok(validateOption({ ...call, ...changes }), JSON.stringify(changes));
  }
  assert.equal(validateOption({ ...call, exitPremium: 0, exitDate: call.expiry }), null);
});
test('puts with a negative break-even cannot profit at expiration', () => {
  const result = optionMetrics({ ...call, type: 'Put', strike: 2 });
  assert.ok(result.breakEven < 0);
  assert.ok(result.maxProfit < 0);
});
