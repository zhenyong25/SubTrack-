import test from 'node:test';
import assert from 'node:assert/strict';
import type { SavingsGoal, SavingsEntry } from '../types';
import { advanceGoalDate, goalBalance, goalPlan, isValidDate, moneyInCents, validateEntry, validateGoal } from '../services/savingsGoalMath';
const goal: SavingsGoal = { id: 'g', name: 'Emergency fund', kind: 'Savings', targetAmount: 1000, openingBalance: 100, currency: 'SGD', targetDate: '2026-12-31', repeatMonths: 0, color: '#8b5cf6', createdAt: '2026-10-01', updatedAt: '2026-10-01' };
const entry = (amount: number, direction: SavingsEntry['direction'] = 'Contribution'): SavingsEntry => ({ id: 'e', goalId: goal.id, amount, direction, entryDate: '2026-10-24', createdAt: '2026-10-24' });
test('balances use integer cents and ignore other goals', () => {
  assert.equal(goalBalance({ ...goal, openingBalance: 0 }, [entry(.1), entry(.2), entry(.1, 'Withdrawal'), { ...entry(100), goalId: 'other' }]), .2);
  assert.equal(moneyInCents(12.34), 1234);
  for (const amount of [NaN, Infinity, 1.234, 1e13]) assert.throws(() => moneyInCents(amount));
});
test('monthly contributions round up and account for the actual target date', () => {
  const plan = goalPlan(goal, [], '2026-10-24');
  assert.equal(plan.months, 3); assert.equal(plan.monthlyNeeded, 300);
  assert.equal(goalPlan({ ...goal, openingBalance: 0, targetAmount: 100 }, [], '2026-10-24').monthlyNeeded, 33.34);
  assert.equal(goalPlan({ ...goal, targetDate: '2026-10-25' }, [], '2026-10-24').monthlyNeeded, 900);
});
test('funded, overdue, undated, and overfunded plans stay meaningful', () => {
  assert.equal(goalPlan({ ...goal, targetDate: undefined }, []).monthlyNeeded, null);
  assert.equal(goalPlan({ ...goal, targetDate: '2026-10-01' }, [], '2026-10-24').overdue, true);
  const funded = goalPlan(goal, [entry(1200)], '2027-01-01');
  assert.equal(funded.progress, 100); assert.equal(funded.remaining, 0); assert.equal(funded.overdue, false); assert.equal(funded.funded, true);
});
test('recurring cycles clamp month ends, preserve leap years, and skip overdue cycles', () => {
  assert.equal(advanceGoalDate('2027-01-31', 1, '2027-01-31'), '2027-02-28');
  assert.equal(advanceGoalDate('2028-01-31', 1, '2028-01-31'), '2028-02-29');
  assert.equal(advanceGoalDate('2026-02-28', 1, '2026-02-28'), '2026-03-31');
  assert.equal(advanceGoalDate('2025-01-31', 1, '2026-10-24'), '2026-10-31');
  assert.equal(advanceGoalDate('2026-12-31', 12, '2026-10-24'), '2027-12-31');
  assert.throws(() => advanceGoalDate('2026-02-30', 1));
});
test('goals require valid targets, currency, dates, and fund schedules', () => {
  validateGoal(goal);
  for (const changed of [{ name: '' }, { targetAmount: 0 }, { openingBalance: -1 }, { currency: 'ZZZ' }, { targetDate: '2026-02-30' }, { kind: 'Sinking fund', repeatMonths: 0 }, { kind: 'Savings', repeatMonths: 12 }] as Partial<SavingsGoal>[]) assert.throws(() => validateGoal({ ...goal, ...changed }));
  assert.throws(() => validateGoal({ ...goal, currency: 'USD' }, goal));
  assert.throws(() => validateGoal({ ...goal, openingBalance: 200 }, goal));
  assert.equal(isValidDate('2028-02-29'), true); assert.equal(isValidDate('2027-02-29'), false);
});
test('withdrawals cannot exceed saved money and future or fractional-cent entries are rejected', () => {
  validateEntry(goal, [], entry(100, 'Withdrawal'), '2026-10-24');
  assert.throws(() => validateEntry(goal, [], entry(100.01, 'Withdrawal'), '2026-10-24'));
  assert.throws(() => validateEntry(goal, [], entry(0), '2026-10-24'));
  assert.throws(() => validateEntry(goal, [], entry(1.001), '2026-10-24'));
  assert.throws(() => validateEntry(goal, [], { ...entry(1), entryDate: '2026-10-25' }, '2026-10-24'));
});
