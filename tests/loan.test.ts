import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsClamped,
  dueStatus,
  isLikelyNewStatement,
  latestMonthlyDate,
  loanDues,
  flatEquivalentRate,
  loanInstalment,
  loanStatus,
  projectPayoff,
  standardInstalment,
} from '../services/loanService';
import { dateKeyToUtc as d, utcToDateKey } from '../services/portfolioAnalyticsService';
import { findBank } from '../services/bankLogoService';
import type { Loan, LoanPayment } from '../types';

const near = (actual: number, expected: number, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

const loan = (overrides: Partial<Loan> = {}): Loan => ({
  id: 'l', name: 'Loan', kind: 'Personal', currency: 'SGD', principal: 12000, annualRate: 6,
  interestMethod: 'Reducing', startDate: '2026-01-01', color: '#000', ...overrides,
});

let nextId = 0;
const pay = (paymentDate: string, amount: number, loanId = 'l'): LoanPayment => ({ id: `p${nextId++}`, loanId, paymentDate, amount });

test('reducing instalment matches the standard mortgage formula', () => {
  near(standardInstalment(loan({ principal: 100000, annualRate: 3, termMonths: 360 }))!, 421.6, 0.01);
  near(standardInstalment(loan({ termMonths: 12 }))!, 1032.8, 0.01);
});

test('a zero-rate loan splits evenly; no term means no instalment', () => {
  assert.equal(standardInstalment(loan({ annualRate: 0, termMonths: 12 })), 1000);
  assert.equal(standardInstalment(loan()), undefined);
  assert.equal(loanInstalment(loan({ instalment: 250 })), 250);
});

test('flat rate: fixed interest and the much higher equivalent rate', () => {
  const car = loan({ principal: 100000, annualRate: 2.5, termMonths: 84, interestMethod: 'Flat' });
  near(standardInstalment(car)!, 117500 / 84, 1e-9);
  const equivalent = flatEquivalentRate(car)!;
  assert.ok(equivalent > 4.6 && equivalent < 4.8, `equivalent rate ${equivalent}`);
});

test('reducing balance: daily interest is settled first by each payment', () => {
  const status = loanStatus(loan({ principal: 1200, annualRate: 12 }), [pay('2026-01-31', 100)]);
  near(status.interestPaid, 1200 * 0.12 * 30 / 365, 1e-9);
  near(status.outstanding, 1200 + 1200 * 0.12 * 30 / 365 - 100, 1e-9);
});

test('reducing balance: a payment smaller than the interest grows the balance', () => {
  const status = loanStatus(loan({ principal: 10000, annualRate: 24 }), [pay('2026-12-31', 100)]);
  assert.ok(status.outstanding > 10000);
  assert.equal(status.progress, 0);
});

test('flat: payments reduce what is payable, interest share stays fixed', () => {
  const car = loan({ principal: 10000, annualRate: 5, termMonths: 24, interestMethod: 'Flat' });
  // 1,000 interest, 11,000 payable, 1/11 of every payment is interest.
  const status = loanStatus(car, [pay('2026-02-01', 2200)]);
  near(status.outstanding, 8800, 1e-9);
  near(status.interestPaid, 200, 1e-9);
  near(status.principalOutstanding, 8000, 1e-9);
  near(status.progress, 0.2, 1e-9);
});

test('opening balance: payments on or before its date are already reflected', () => {
  const tracked = loan({ principal: 500000, annualRate: 0, openingBalance: 300000, openingBalanceDate: '2026-06-01' });
  const status = loanStatus(tracked, [pay('2026-05-01', 2000), pay('2026-06-01', 2000), pay('2026-07-01', 2000)]);
  assert.equal(status.outstanding, 298000);
  assert.equal(status.totalPaid, 2000);
  near(status.progress, 202000 / 500000, 1e-9);
});

test('overpaying settles the loan', () => {
  const status = loanStatus(loan({ principal: 100, annualRate: 0 }), [pay('2026-02-01', 150)]);
  assert.equal(status.paidOff, true);
  assert.equal(status.outstanding, 0);
});

test('due dates clamp to short months', () => {
  assert.equal(utcToDateKey(addMonthsClamped(d('2026-01-31'), 1)), '2026-02-28');
  assert.equal(utcToDateKey(addMonthsClamped(d('2026-01-15'), 1, 31)), '2026-02-28');
  assert.equal(utcToDateKey(addMonthsClamped(d('2026-01-15'), 2, 31)), '2026-03-31');
});

test('due status: each payment covers one due date; unmatched past dates are overdue', () => {
  const monthly = loan({ startDate: '2026-01-10', paymentDay: 15, termMonths: 12 });
  assert.deepEqual(dueStatus(monthly, [], d('2026-01-12')), { nextDue: d('2026-01-15'), overdue: false, behind: 0 });
  assert.deepEqual(dueStatus(monthly, [pay('2026-01-14', 1032.8)], d('2026-02-01')), { nextDue: d('2026-02-15'), overdue: false, behind: 0 });
  assert.deepEqual(dueStatus(monthly, [pay('2026-01-14', 1032.8)], d('2026-03-01')), { nextDue: d('2026-02-15'), overdue: true, behind: 1 });
  // Due 15 Feb, 15 Mar and 15 Apr have all passed with only January paid.
  assert.equal(dueStatus(monthly, [pay('2026-01-14', 1032.8)], d('2026-04-20'))!.behind, 3);
  // Started after this month's due day, so the first due date is next month.
  assert.equal(utcToDateKey(dueStatus(loan({ startDate: '2026-01-20', paymentDay: 15 }), [], d('2026-01-21'))!.nextDue), '2026-02-15');
});

test('projection: a fresh loan at its standard instalment ends on its last due date', () => {
  // Drawn on 1 Jan with payments due on the 1st: the first is 1 Feb, the twelfth 1 Jan next year.
  const fresh = loan({ termMonths: 12, paymentDay: 1 });
  const projection = projectPayoff(fresh, [], d('2026-01-01'))!;
  assert.equal(projection.months, 12);
  assert.equal(utcToDateKey(projection.payoffDate), '2027-01-01');
  near(projection.interestRemaining, 1032.8 * 12 - 12000, 0.1);
  near(projection.schedule.at(-1)!.balance, 0, 1e-6);
});

test('projection: extra payments finish sooner and cost less interest', () => {
  const mortgage = loan({ principal: 300000, annualRate: 4, termMonths: 300, paymentDay: 1 });
  const base = projectPayoff(mortgage, [], d('2026-01-01'))!;
  const faster = projectPayoff(mortgage, [], d('2026-01-01'), 500)!;
  assert.equal(base.months, 300);
  assert.ok(faster.months < base.months);
  assert.ok(faster.interestRemaining < base.interestRemaining);
});

test('projection: flat loans finish sooner with extra but interest is unchanged', () => {
  const car = loan({ principal: 10000, annualRate: 5, termMonths: 24, interestMethod: 'Flat', paymentDay: 5 });
  const base = projectPayoff(car, [], d('2026-01-01'))!;
  const faster = projectPayoff(car, [], d('2026-01-01'), 200)!;
  assert.equal(base.months, 24);
  near(base.interestRemaining, 1000, 1e-6);
  assert.ok(faster.months < 24);
  near(faster.interestRemaining, 1000, 1e-6);
});

const statement = (paymentDate: string, amount: number, loanId = 'l'): LoanPayment =>
  ({ id: `s${nextId++}`, loanId, paymentDate, amount, entryType: 'statement' });

test('statement card: each statement resets the balance, payments count it down', () => {
  const card = loan({ kind: 'Credit card', principal: 2165.1, annualRate: 26.9, startDate: '2026-10-15', paymentDay: 10 });
  // First statement is the balance it was added with.
  assert.equal(loanStatus(card, []).outstanding, 2165.1);
  const entries = [pay('2026-11-05', 2165.1), statement('2026-11-15', 980.4), pay('2026-11-15', 300)];
  const status = loanStatus(card, entries);
  // Only the payment on/after the November statement counts against it; no interest is added.
  near(status.outstanding, 680.4, 1e-9);
  near(status.progress, 300 / 980.4, 1e-9);
  assert.equal(status.statement!.amount, 980.4);
  assert.equal(status.paidOff, false);
});

test('statement card: clearing the statement stays open and owes nothing', () => {
  const card = loan({ kind: 'Credit card', principal: 500, startDate: '2026-10-15', paymentDay: 10 });
  const status = loanStatus(card, [pay('2026-11-01', 500)]);
  assert.equal(status.cleared, true);
  assert.equal(status.paidOff, false);
  assert.equal(dueStatus(card, [pay('2026-11-01', 500)], d('2026-11-20')), null);
});

test('statement card: due on the first due day after the statement', () => {
  const card = loan({ kind: 'Credit card', principal: 500, startDate: '2026-10-15', paymentDay: 10 });
  assert.deepEqual(dueStatus(card, [], d('2026-10-20')), { nextDue: d('2026-11-10'), overdue: false, behind: 0 });
  assert.deepEqual(dueStatus(card, [], d('2026-11-12')), { nextDue: d('2026-11-10'), overdue: true, behind: 1 });
  // A new statement moves the due date to the next cycle.
  assert.equal(utcToDateKey(dueStatus(card, [statement('2026-11-15', 200)], d('2026-11-20'))!.nextDue), '2026-12-10');
});

test('latest statement close date', () => {
  assert.equal(utcToDateKey(latestMonthlyDate(15, d('2026-10-24'))), '2026-10-15');
  assert.equal(utcToDateKey(latestMonthlyDate(28, d('2026-10-24'))), '2026-09-28');
  assert.equal(utcToDateKey(latestMonthlyDate(24, d('2026-10-24'))), '2026-10-24');
  assert.equal(utcToDateKey(latestMonthlyDate(31, d('2026-03-05'))), '2026-02-28');
});

test('a statement also re-anchors an instalment loan', () => {
  const mortgage = loan({ principal: 400000, annualRate: 0, termMonths: 300, paymentDay: 1 });
  const status = loanStatus(mortgage, [pay('2026-02-01', 2000), statement('2026-06-30', 350000), pay('2026-07-01', 2000)]);
  assert.equal(status.outstanding, 348000);
  near(status.progress, 52000 / 400000, 1e-9);
});

test('projection: a payment below the monthly interest never pays off', () => {
  const card = loan({ kind: 'Credit card', principal: 5000, annualRate: 26.9, instalment: 100 });
  assert.equal(projectPayoff(card, [], d('2026-01-01'))!.months, Infinity);
});

test('reminders: only dues within a week or overdue, soonest first', () => {
  const card = loan({ id: 'card', kind: 'Credit card', principal: 2977.1, startDate: '2026-10-12', paymentDay: 2 });
  const later = loan({ id: 'later', kind: 'Credit card', principal: 2165.1, startDate: '2026-10-15', paymentDay: 10 });
  const late = loan({ id: 'late', annualRate: 0, instalment: 500, startDate: '2026-07-01', paymentDay: 5 });
  const archived = loan({ id: 'gone', kind: 'Credit card', principal: 50, startDate: '2026-10-12', paymentDay: 2, isArchived: true });
  const dues = loanDues([later, card, late, archived], [pay('2026-08-05', 500, 'late')], d('2026-10-27'));
  assert.deepEqual(dues.map(due => [due.loan.id, due.days, due.overdue, due.amount]), [
    // Due 5 Aug, 5 Sep and 5 Oct all unpaid: overdue since 5 Aug, three instalments behind.
    ['late', -83, true, 1500],
    ['card', 6, false, 2977.1],
  ]);
});

test('a statement uploaded a few days after the one being tracked is not a new one', () => {
  const card = loan({ kind: 'Credit card', principal: 2165.1, startDate: '2026-10-15', paymentDay: 10 });
  assert.equal(isLikelyNewStatement(card, [], '2026-10-17T09:00:00Z'), false);
  assert.equal(isLikelyNewStatement(card, [], '2026-11-16T09:00:00Z'), true);
  // Logging November's statement moves the starting point, so its own upload stops counting.
  assert.equal(isLikelyNewStatement(card, [statement('2026-11-15', 900)], '2026-11-16T09:00:00Z'), false);
});

test('bank logos: matched on whole words, lender first', () => {
  assert.equal(findBank(undefined, 'Citibank Premier Miles')?.name, 'Citibank');
  assert.equal(findBank('', 'UOB PRIVI Miles')?.domain, 'uob.com.sg');
  assert.equal(findBank('POSB', 'Everyday card')?.name, 'DBS');
  assert.equal(findBank('OCBC', 'DBS Altitude')?.name, 'OCBC');
  assert.equal(findBank(undefined, 'Owed to Mum'), undefined);
  // "citizen" isn't Citi, "subscription" isn't anything.
  assert.equal(findBank('Citizen loan', 'subscription plan'), undefined);
});
