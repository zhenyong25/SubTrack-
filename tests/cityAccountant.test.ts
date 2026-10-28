import test from 'node:test';
import assert from 'node:assert/strict';
import { accountantFingerprint, parseAccountantReport, runAccountantReview } from '../services/cityAccountantService';
import { newCity, parseCity } from '../services/cityGameService';
import type { Expense } from '../types';

const today = '2026-10-28';
const row = (id: string, values: Partial<Expense> = {}): Expense => ({ id, name: 'Coffee', expenseDate: today, category: 'Food', amount: 5, currency: 'MYR', color: '#123456', ...values });
const options = { yieldControl: async () => undefined };
test('reviews seven calendar days, compares the previous seven and keeps currencies separate', async () => {
  const report = await runAccountantReview([
    row('a', { expenseDate: '2026-10-22', amount: 20 }), row('b', { amount: 30 }), row('c', { expenseDate: '2026-10-21', amount: 25 }),
    row('usd', { currency: 'USD', amount: 10 }), row('future', { expenseDate: '2026-10-29', amount: 1000 }), row('old', { expenseDate: '2026-10-14', amount: 1000 }),
  ], today, options);
  assert.equal(report.start, '2026-10-22');
  assert.equal(report.reviewed, 3);
  assert.deepEqual(report.currencies.map(item => [item.currency, item.current, item.previous, item.changePct]), [['MYR', 50, 25, 100], ['USD', 10, 0, null]]);
});
test('finds possible duplicates without treating different dates, currencies or amounts as duplicates', async () => {
  const report = await runAccountantReview([row('a'), row('b', { name: '  coffee ' }), row('c', { amount: 10 }), row('d', { currency: 'USD' }), row('e', { expenseDate: '2026-10-27' })], today, options);
  const duplicates = report.findings.filter(item => item.kind === 'duplicate');
  assert.equal(duplicates.length, 1);
  assert.deepEqual(duplicates[0].expenseIds, ['a', 'b']);
});
test('flags Other or missing categories and preserves original entries', async () => {
  const rows = [row('a', { category: 'Other' }), row('b', { category: '' }), row('c')];
  const before = JSON.stringify(rows);
  const progress: number[] = [];
  const report = await runAccountantReview(rows, today, { ...options, onProgress: value => progress.push(value.step) });
  assert.deepEqual(report.findings.find(item => item.kind === 'category')?.expenseIds, ['a', 'b']);
  assert.deepEqual(progress, [0, 1, 2, 3]);
  assert.equal(JSON.stringify(rows), before);
});
test('empty records yield an honest empty report; invalid amounts and repeated IDs are skipped', async () => {
  assert.equal((await runAccountantReview([], today, options)).reviewed, 0);
  const report = await runAccountantReview([row('a'), row('a'), row('b', { amount: NaN }), row('c', { amount: -5 })], today, options);
  assert.equal(report.reviewed, 1);
  assert.equal(report.skipped, 3);
  assert.equal(report.currencies[0].current, 5);
});
test('fingerprints are stable across ordering and change when relevant input changes', () => {
  assert.equal(accountantFingerprint([row('a'), row('b')], today), accountantFingerprint([row('b'), row('a')], today));
  assert.notEqual(accountantFingerprint([row('a')], today), accountantFingerprint([row('a', { amount: 99 })], today));
  assert.notEqual(accountantFingerprint([], today), accountantFingerprint([], '2026-10-29'));
});
test('completed reports survive city persistence; old city saves remain compatible', async () => {
  const city = newCity(Date.now(), today);
  assert.equal(parseCity(JSON.stringify(city))?.accountantReport, undefined);
  const report = await runAccountantReview([row('a')], today, options);
  assert.deepEqual(parseCity(JSON.stringify({ ...city, accountantReport: report }))?.accountantReport, report);
  assert.equal(parseAccountantReport({ ...report, currencies: [{ current: NaN }] }), undefined);
  assert.equal(parseCity(JSON.stringify({ ...city, accountantReport: { version: 999 } }))?.accountantReport, undefined);
});
test('cancelled jobs never complete and invalid dates are refused', async () => {
  const controller = new AbortController();
  await assert.rejects(() => runAccountantReview([row('a')], today, { ...options, signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' });
  await assert.rejects(() => runAccountantReview([], '2026-02-30', options), /valid review date/);
});
