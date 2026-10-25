import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Receivable, ReceivableEntry } from '../types';
import { receivableBalance, validateReceivable, validateReceivableEntry } from '../services/receivableMath';
const r: Receivable = { id: 'r1', borrower: 'Alex', description: 'Travel', currency: 'SGD', principal: 500, agreedInterest: 25, lentDate: '2026-10-01', dueDate: '2026-10-20', repaymentPlan: 'One-off' };
const entry = (fields: Partial<ReceivableEntry> = {}): ReceivableEntry => ({ id: 'e1', receivableId: 'r1', kind: 'Repayment', entryDate: '2026-10-10', principal: 100, interest: 5, ...fields });
test('partial payments preserve separate principal and interest and month collections', () => {
  assert.deepEqual(receivableBalance(r, [entry()], '2026-10-25'), { principal: 400, interest: 20, outstanding: 420, collected: 105, writtenOff: 0, thisMonth: 105 });
});
test('write-offs reduce collectible money without counting as receipts or income', () => {
  const entries = [entry(), entry({ id: 'e2', kind: 'Write-off', principal: 400, interest: 20, notes: 'Uncollectible' })];
  const balance = receivableBalance(r, entries, '2026-10-25');
  assert.equal(balance.outstanding, 0); assert.equal(balance.collected, 105); assert.equal(balance.writtenOff, 420);
  assert.equal(balance.thisMonth, 105);
});
test('future entries and other borrowers do not affect today’s balance', () => {
  assert.equal(receivableBalance(r, [entry({ entryDate: '2026-10-26' }), entry({ receivableId: 'r2' })], '2026-10-25').outstanding, 525);
});
test('rejects overpayments, negative or imprecise amounts, invalid dates and missing write-off reasons', () => {
  for (const e of [entry({ principal: 501 }), entry({ interest: 26 }), entry({ principal: -1 }), entry({ principal: 1.001 }), entry({ entryDate: '2026-02-30' }), entry({ entryDate: '2026-09-30' }), entry({ entryDate: '2026-10-26' }), entry({ kind: 'Write-off', notes: '' }), entry({ principal: 0, interest: 0 })]) assert.throws(() => validateReceivableEntry(e, r, [], '2026-10-25'));
  assert.doesNotThrow(() => validateReceivableEntry(entry(), r, [], '2026-10-25'));
});
test('edits cannot reduce totals below history or change its currency/date', () => {
  assert.throws(() => validateReceivable({ ...r, principal: 99 }, [entry()], '2026-10-25', r));
  assert.throws(() => validateReceivable({ ...r, currency: 'MYR' }, [entry()], '2026-10-25', r));
  assert.throws(() => validateReceivable({ ...r, lentDate: '2026-10-02' }, [entry()], '2026-10-25', r));
  assert.doesNotThrow(() => validateReceivable({ ...r, borrower: 'Alex Tan' }, [entry()], '2026-10-25', r));
});
test('instalments and fixed interest validate independently; removing history restores balance', () => {
  assert.throws(() => validateReceivable({ ...r, repaymentPlan: 'Instalments' }, [], '2026-10-25'));
  assert.doesNotThrow(() => validateReceivable({ ...r, repaymentPlan: 'Instalments', instalment: 50, agreedInterest: 0 }, [], '2026-10-25'));
  assert.equal(receivableBalance(r, [], '2026-10-25').outstanding, 525);
});
test('cent arithmetic does not leave tiny balances on full repayment', () => {
  const small = { ...r, principal: .3, agreedInterest: 0 };
  assert.equal(receivableBalance(small, [entry({ principal: .1, interest: 0 }), entry({ id: 'e2', principal: .2, interest: 0 })], '2026-10-25').outstanding, 0);
});
