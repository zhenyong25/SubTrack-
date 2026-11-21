import test from 'node:test';
import assert from 'node:assert/strict';
import type { Income } from '../types';
import type { InsurancePolicy } from '../services/insuranceService';
import {
  annualEarnedIncome, budgetMode, checkTrip, emergencyCardHtml, emergencyPolicies, linkedTo, parseCoverAnswer, peopleOf,
  premiumExpense, premiumSubscription, protectionGaps, travelOverlaps,
} from '../services/insuranceInsightsService';

const base: InsurancePolicy = { id: 'base', name: 'Plan', insurer: 'Insurer', insuredPerson: 'Alex Tan', policyNumber: 'P1', kind: 'Medical', currency: 'SGD', premium: 100, frequency: 'Monthly', coverage: 0, deductible: 0, startDate: '2026-01-01', endDate: '', renewalDate: '', destination: '', emergencyPhone: '', notes: '', archived: false };
const trip = (id: string, start: string, end: string, extra: Partial<InsurancePolicy> = {}): InsurancePolicy => ({ ...base, id, name: id, kind: 'Travel', frequency: 'One-time', premium: 30, startDate: start, endDate: end, destination: 'Asia', ...extra });
const same = (amount: number) => amount;
const today = '2026-11-21';

test('travel overlaps match people regardless of capitals and skip expired, archived and quotations', () => {
  const chubb = trip('chubb', '2026-12-29', '2027-01-03', { insuredPerson: 'Alex Tan' });
  const fwd = trip('fwd', '2026-12-29', '2027-01-03', { insuredPerson: 'ALEX TAN' });
  const income = trip('income', '2026-12-03', '2026-12-10');
  const other = trip('other', '2026-12-30', '2027-01-01', { insuredPerson: 'Sam' });
  const quote = trip('quote', '2026-12-29', '2027-01-03', { recordType: 'Quotation' });
  const old = trip('old', '2026-01-01', '2026-01-05');
  const overlaps = travelOverlaps([chubb, fwd, income, other, quote, old, { ...fwd, id: 'arch', archived: true }], today);
  assert.equal(overlaps.length, 1);
  assert.deepEqual([overlaps[0].a.id, overlaps[0].b.id, overlaps[0].start, overlaps[0].end], ['chubb', 'fwd', '2026-12-29', '2027-01-03']);
});

test('trip check splits a trip into covered runs and gaps, across a year end', () => {
  const spans = checkTrip([trip('a', '2026-12-29', '2026-12-31'), trip('b', '2026-12-31', '2027-01-02')], '2026-12-28', '2027-01-03');
  assert.deepEqual(spans.map(s => [s.start, s.end, s.policies.map(p => p.id).join('+')]), [
    ['2026-12-28', '2026-12-28', ''], ['2026-12-29', '2026-12-30', 'a'], ['2026-12-31', '2026-12-31', 'a+b'], ['2027-01-01', '2027-01-02', 'b'], ['2027-01-03', '2027-01-03', ''],
  ]);
  assert.deepEqual(checkTrip([trip('a', '2026-12-29', '2026-12-31')], '2026-12-29', '2026-12-31', 'someone else').map(s => s.policies.length), [0]);
  assert.deepEqual(checkTrip([], '2026-12-05', '2026-12-01'), []);
  assert.throws(() => checkTrip([], '2026-01-01', '2027-06-01'), /year/);
});

test('people list prefers mixed-case spellings and merges duplicates', () => {
  assert.deepEqual(peopleOf([{ ...base, insuredPerson: 'ALEX TAN' }, { ...base, insuredPerson: 'Alex  Tan' }, { ...base, people: ['Sam', 'Alex Tan'] }]).map(p => p.name), ['Alex Tan', 'Sam']);
});

test('premiums map to subscriptions or expenses with a policy marker', () => {
  assert.equal(budgetMode(base), 'subscription');
  assert.equal(budgetMode({ ...base, frequency: 'Quarterly' }), 'expense');
  assert.equal(budgetMode(trip('t', '2026-12-01', '2026-12-05')), 'expense');
  assert.equal(budgetMode({ ...base, recordType: 'Quotation' }), 'none');
  assert.equal(budgetMode({ ...base, premium: 0 }), 'none');
  const sub = premiumSubscription({ ...base, paymentDueDate: '2026-12-05' }, today, '#000');
  assert.equal(sub.billingCycle, 'Monthly'); assert.equal(sub.firstPaymentDate, '2026-12-05'); assert.equal(sub.category, 'Insurance');
  assert.throws(() => premiumSubscription({ ...base, frequency: 'Quarterly' }, today, '#000'), /monthly or yearly/);
  const expense = premiumExpense(trip('t', '2026-12-01', '2026-12-05'), '2026-11-20', '#000');
  assert.equal(expense.amount, 30); assert.equal(expense.expenseDate, '2026-11-20');
  assert.equal(linkedTo([{ notes: sub.notes }, { notes: expense.notes }, { notes: 'unrelated' }], 'base').length, 1);
  assert.equal(linkedTo([{ notes: expense.notes }], 't').length, 1);
});

test('yearly earned income counts recurring active income and recent one-offs only', () => {
  const income = (over: Partial<Income>): Income => ({ id: 'i', name: 'Pay', amount: 5000, currency: 'SGD', incomeType: 'Active', incomeMode: 'Recurring', incomeCycle: 'Monthly', firstIncomeDate: '2025-01-01', nextIncomeDate: '2026-12-01', category: 'Salary', color: '', status: 'Active', ...over });
  const rows = [income({}), income({ incomeType: 'Passive', amount: 999 }), income({ status: 'Past' }), income({ incomeMode: 'One-time', amount: 8000, incomeDate: '2026-03-01' }), income({ incomeMode: 'One-time', amount: 7000, incomeDate: '2025-03-01' }), income({ currency: 'USD', amount: 100, incomeCycle: 'Yearly' })];
  assert.equal(annualEarnedIncome(rows, today, (a, from) => from === 'USD' ? a * 2 : a), 60000 + 8000 + 200);
});

test('protection gaps compare cover with income benchmarks for one person', () => {
  const life: InsurancePolicy = { ...base, id: 'life', kind: 'Life', coverage: 500000 };
  const ci: InsurancePolicy = { ...base, id: 'ci', kind: 'Critical illness', coverage: 100000, currency: 'USD' };
  const someoneElse: InsurancePolicy = { ...base, id: 'x', kind: 'Life', coverage: 9e6, insuredPerson: 'Sam' };
  const lapsed: InsurancePolicy = { ...base, id: 'old', kind: 'Disability', endDate: '2026-01-31' };
  const rows = protectionGaps([life, ci, base, someoneElse, lapsed], 'alex tan', 60000, (a, from) => from === 'USD' ? a * 1.3 : a, today);
  const by = Object.fromEntries(rows.map(r => [r.kind, r]));
  assert.equal(by.Life.level, 'Low'); assert.equal(by.Life.target, 540000); assert.equal(by.Life.have, 500000);
  assert.equal(by['Critical illness'].level, 'Low'); assert.equal(by['Critical illness'].have, 130000);
  assert.equal(by.Medical.level, 'Covered'); assert.equal(by.Disability.level, 'None');
  assert.equal(protectionGaps([life], 'alex tan', 0, same, today)[0].level, 'Check');
});

test('cover answers are parsed defensively', () => {
  const a = parseCoverAnswer('Sure:\n{"verdict":"Partly covered","answer":"Delay is covered after 6 hours.","limits":["SGD 100 per 6 hours"],"conditions":[1,"Proof from airline"],"evidence":[]}');
  assert.equal(a.verdict, 'Partly covered'); assert.deepEqual(a.conditions, ['Proof from airline']);
  assert.equal(parseCoverAnswer('{"verdict":"Maybe","answer":"Check with insurer."}').verdict, 'Unclear');
  assert.throws(() => parseCoverAnswer('no json here'), /could not be read/);
  assert.throws(() => parseCoverAnswer('{"verdict":"Covered","answer":""}'), /empty/);
});

test('emergency card lists in-force and soon-starting policies and escapes text', () => {
  const soon = trip('soon', '2026-12-03', '2026-12-10', { name: 'Trip <b>China</b>', emergencyPhone: '+65 6788 1122' });
  const later = trip('later', '2027-06-01', '2027-06-05');
  const rows = emergencyPolicies([base, soon, later, { ...base, id: 'q', recordType: 'Quotation' }], today);
  assert.deepEqual(rows.map(p => p.id), ['soon', 'base']);
  const html = emergencyCardHtml(rows, today, '');
  assert.ok(html.includes('Trip &lt;b&gt;China&lt;/b&gt;')); assert.ok(html.includes('href="tel:+6567881122"')); assert.ok(!html.includes('<b>China'));
});
