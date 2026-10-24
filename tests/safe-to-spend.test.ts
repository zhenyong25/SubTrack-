import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSafeToSpend, type SafeToSpendInput } from '../services/safeToSpendService';
const base = (): SafeToSpendInput => ({ today: '2026-06-01', days: 30, currency: 'SGD', accounts: [{ id: 'bank', name: 'Bank', currency: 'SGD' }] as any, balances: [{ id: 'b', accountId: 'bank', balanceDate: '2026-06-01', balance: 2000 }] as any, incomes: [], subscriptions: [], expenses: [], loans: [], payments: [], goals: [], entries: [], convert: amount => amount, buffer: 100 });

test('spendable reserves commitments, savings and buffer using current cash only', () => {
  const input = base();
  input.subscriptions = [{ id: 'rent', name: 'Rent', status: 'Active', firstPaymentDate: '2026-06-10', nextPaymentDate: '2026-06-10', billingCycle: 'Monthly', price: 400, currency: 'SGD' }] as any;
  input.expenses = [{ id: 'e', name: 'Bill', expenseDate: '2026-06-03', amount: 100, currency: 'SGD' }] as any;
  input.goals = [{ id: 'g', name: 'Trip', targetAmount: 500, openingBalance: 200, targetDate: '2026-07-01', currency: 'SGD' }] as any;
  const result = buildSafeToSpend(input);
  assert.equal(result.cash, 2000); assert.equal(result.saved, 200); assert.equal(result.plannedSavings, 300);
  assert.equal(result.reserved, 1100); assert.equal(result.spendable, 900); assert.equal(result.dailyAllowance, 30);
  assert.equal(result.provisional, false);
});
test('future income and forecast scenarios never inflate current spendable cash', () => {
  const input = base(); input.incomes = [{ id: 'pay', status: 'Active', incomeMode: 'One-time', firstIncomeDate: '2026-06-02', incomeDate: '2026-06-02', amount: 100000, currency: 'SGD' }] as any;
  input.openingOverride = 999999; input.extraMonthly = 5000; input.dailySpending = 300; input.includeGoals = false;
  input.goals = [{ id: 'g', targetAmount: 200, openingBalance: 200, currency: 'SGD' }] as any;
  const result = buildSafeToSpend(input); assert.equal(result.spendable, 1700); assert.equal(result.commitments.some(event => event.kind === 'Income'), false);
});
test('account selection respects currencies, archives, and dated snapshots', () => {
  const input = base(); input.accounts.push({ id: 'usd', name: 'USD', currency: 'USD' } as any, { id: 'old', isArchived: true, currency: 'SGD' } as any);
  input.balances.push({ id: 'u', accountId: 'usd', balanceDate: input.today, balance: 100 } as any, { id: 'future', accountId: 'bank', balanceDate: '2026-07-01', balance: 99999 } as any);
  input.convert = (amount, from) => from === 'USD' ? amount * 1.35 : amount;
  assert.equal(buildSafeToSpend(input).cash, 2135);
  input.selectedAccountIds = ['usd', 'old']; const result = buildSafeToSpend(input); assert.equal(result.cash, 135); assert.equal(result.spendable, 35); assert.equal(result.snapshots.length, 1);
});
test('empty and incomplete account selections are distinguishable from a real zero balance', () => {
  const input = base(); input.selectedAccountIds = []; assert.equal(buildSafeToSpend(input).hasBalances, false);
  input.selectedAccountIds = undefined; input.accounts.push({ id: 'missing', name: 'Missing', currency: 'SGD' } as any);
  assert.equal(buildSafeToSpend(input).missingBalances, true);
  input.accounts.pop(); input.balances[0].balance = 0; const result = buildSafeToSpend(input); assert.equal(result.hasBalances, true); assert.equal(result.spendable, 0); assert.equal(result.shortfall, 100);
});
test('shortfalls clamp the allowance to zero and cents never round the daily budget up', () => {
  const input = base(); input.buffer = 2000.01; let result = buildSafeToSpend(input); assert.equal(result.shortfall, 0.01); assert.equal(result.spendable, 0); assert.equal(result.dailyAllowance, 0);
  input.buffer = 1999; result = buildSafeToSpend(input); assert.equal(result.spendable, 1); assert.equal(result.dailyAllowance, 0.03);
  input.balances[0].balance = -100; result = buildSafeToSpend(input); assert.equal(result.shortfall, 2099);
});
test('invalid buffers reject and stale or incomplete schedules are flagged', () => {
  const input = base(); for (const buffer of [-1, Infinity, NaN, 0.001]) assert.throws(() => buildSafeToSpend({ ...input, buffer }));
  input.balances[0].balanceDate = '2026-05-31'; input.subscriptions = [{ id: 'trial', name: 'Trial', status: 'Active', billingCycle: 'Free Trial' }] as any;
  const result = buildSafeToSpend(input); assert.equal(result.provisional, true); assert.equal(result.warnings.length, 2);
});
test('reserves end at the selected window and existing funded savings are counted once', () => {
  const input = base(); input.buffer = 0;
  input.expenses = [{ id: 'in', name: 'In range', expenseDate: '2026-07-01', amount: 100, currency: 'SGD' }, { id: 'out', expenseDate: '2026-07-02', amount: 900, currency: 'SGD' }] as any;
  input.goals = [{ id: 'g', targetAmount: 200, openingBalance: 100, currency: 'SGD' }] as any;
  input.entries = [{ goalId: 'g', direction: 'Contribution', amount: 100 }] as any;
  let result = buildSafeToSpend(input); assert.equal(result.saved, 200); assert.equal(result.plannedSavings, 0); assert.equal(result.spendable, 1700);
  input.days = 60; result = buildSafeToSpend(input); assert.equal(result.spendable, 800);
});
test('debt repayments reduce spendable cash without subtracting the full outstanding principal', () => {
  const input = base(); input.loans = [{ id: 'l', name: 'Loan', principal: 10000, annualRate: 0, interestMethod: 'Reducing', termMonths: 100, startDate: '2026-06-01', paymentDay: 15, instalment: 100, currency: 'SGD' }] as any;
  const result = buildSafeToSpend(input); assert.equal(result.debt, 100); assert.equal(result.spendable, 1800);
});
