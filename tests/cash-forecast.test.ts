import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCashForecast, forecastDates, type ForecastInput } from '../services/cashForecastService';
const base = (): ForecastInput => ({ today: '2026-01-31', days: 30, currency: 'SGD', accounts: [], balances: [], incomes: [], subscriptions: [], expenses: [], loans: [], payments: [], goals: [], entries: [], convert: amount => amount, openingOverride: 1000 });
test('calendar expansion preserves month ends and excludes already-reflected activity', () => {
  assert.deepEqual(forecastDates('2026-01-31', 'Monthly', '2026-01-31', '2026-03-31'), ['2026-02-28', '2026-03-31']);
  assert.deepEqual(forecastDates('2020-02-29', 'Yearly', '2026-01-31', '2028-03-01'), ['2026-02-28', '2027-02-28', '2028-02-29']);
  assert.equal(forecastDates('2000-01-01', 'Daily', '2026-01-31', '2026-03-02').length, 30);
});
test('opening uses latest nonfuture active-account snapshots and excludes investments', () => {
  const input = base(); delete input.openingOverride;
  input.accounts = [{ id: 'bank', currency: 'USD', name: 'Bank' }, { id: 'old', isArchived: true, currency: 'SGD' }] as any;
  input.balances = [{ id: 'a', accountId: 'bank', balanceDate: '2026-01-20', balance: 500 }, { id: 'b', accountId: 'bank', balanceDate: '2026-01-30', balance: 700 }, { id: 'c', accountId: 'bank', balanceDate: '2026-02-01', balance: 9000 }] as any;
  input.convert = amount => amount * 2;
  const forecast = buildCashForecast(input); assert.equal(forecast.opening, 1400); assert.match(forecast.warnings[0], /2026-01-30/);
});
test('income, subscription, and future expense events reconcile to daily cash without past repeats', () => {
  const input = base();
  input.incomes = [{ id: 'salary', name: 'Salary', status: 'Active', incomeMode: 'Recurring', incomeCycle: 'Monthly', firstIncomeDate: '2025-01-31', nextIncomeDate: '2026-01-31', amount: 2000, currency: 'SGD' }] as any;
  input.subscriptions = [{ id: 'bill', name: 'Bill', status: 'Active', billingCycle: 'Monthly', firstPaymentDate: '2025-01-01', nextPaymentDate: '2026-02-01', price: 100, currency: 'SGD' }, { id: 'cancelled', status: 'Past' }] as any;
  input.expenses = [{ id: 'old', expenseDate: '2026-01-31', amount: 999 }, { id: 'future', name: 'Rent', expenseDate: '2026-02-02', amount: 300, currency: 'SGD' }] as any;
  const result = buildCashForecast(input); assert.equal(result.end.cash, 2500); assert.equal(result.events.length, 4); assert.equal(result.points.length, 31);
});
test('savings allocations and what-if savings reduce available money, never total cash', () => {
  const input = base(); input.extraMonthly = 50;
  input.goals = [{ id: 'g', name: 'Trip', targetAmount: 600, openingBalance: 100, currency: 'SGD', targetDate: '2026-03-31' }] as any;
  let result = buildCashForecast(input); assert.equal(result.end.cash, 1000); assert.equal(result.end.available, 300);
  input.includeGoals = false; result = buildCashForecast(input); assert.equal(result.end.available, 900);
});
test('shortfall dates, spending scenarios, and ranges are deterministic', () => {
  const input = base(); input.openingOverride = 20; input.dailySpending = 10;
  const result = buildCashForecast(input); assert.equal(result.firstShortfall?.date, '2026-02-03'); assert.equal(result.lowest.date, '2026-03-02'); assert.equal(result.end.cash, -280);
  assert.throws(() => buildCashForecast({ ...input, openingOverride: Infinity }), /valid forecast amount/);
});
test('debt forecasts reserve overdue payments and cap total repayments at remaining balance', () => {
  const input = base(); input.loans = [{ id: 'debt', name: 'Loan', principal: 150, annualRate: 0, interestMethod: 'Flat', termMonths: 3, startDate: '2025-12-01', paymentDay: 15, instalment: 100, currency: 'SGD' }] as any;
  const result = buildCashForecast(input); assert.equal(result.events.filter(event => event.kind === 'Debt').reduce((sum, event) => sum - event.amount, 0), 150); assert.equal(result.end.cash, 850);
});
test('goal deadlines reserve all remaining money and unknown trial prices are flagged', () => {
  const input = base(); input.goals = [{ id: 'g', name: 'Due', targetAmount: 1500, openingBalance: 0, currency: 'SGD', targetDate: '2026-02-05' }] as any;
  input.subscriptions = [{ id: 'trial', name: 'Trial', status: 'Active', billingCycle: 'Free Trial' }] as any;
  const result = buildCashForecast(input); assert.equal(result.end.available, -500); assert.equal(result.end.cash, 1000); assert.equal(result.firstShortfall?.date, '2026-02-01'); assert.match(result.warnings.at(-1)!, /trial renewal/);
});
