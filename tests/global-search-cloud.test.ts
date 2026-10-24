import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppData, saveRecordTags, saveSubscriptions, saveExpenses, saveInvestmentTransactions } from '../services/appDataService';
import type { Expense, Subscription, InvestmentTransaction } from '../types';
const entries = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value) } });
let user: string | null = 'user-a';
let error: { code: string; message: string } | null = null;
let present = true;
let updates: Array<{ table: string; payload: unknown; where: Array<[string, string]> }> = [];
let upserts: Array<{ table: string; rows: any[] }> = [];
const storedRows = new Map<string, any[]>();
(globalThis as any).__tagSession = () => user;
(globalThis as any).__tagDatabase = {
  from(table: string) {
    return {
      select() { return this; }, eq() { return this; }, order() { return this; },
      async maybeSingle() { return { data: null, error: null }; },
      async range(from: number, to: number) { return { data: (storedRows.get(table) || []).slice(from, to + 1), error: null }; },
      then(resolve: (value: unknown) => void) { resolve({ data: storedRows.get(table) || [], error: null }); },
      upsert: async (rows: any[]) => { upserts.push({ table, rows }); storedRows.set(table, rows); return { error: null }; },
      update(payload: unknown) {
        const entry = { table, payload, where: [] as Array<[string, string]> }; updates.push(entry);
        const chain = { eq: (column: string, value: string) => { entry.where.push([column, value]); return chain; }, select: () => chain, maybeSingle: async () => ({ data: present ? { id: 'id' } : null, error }) };
        return chain;
      },
    };
  },
};
test('cloud tag updates are authenticated, type-scoped, normalized, and metadata only', async () => {
  for (const [kind, table] of [['expense', 'expenses'], ['subscription', 'subscriptions'], ['transaction', 'investment_transactions']] as const) {
    await saveRecordTags(kind, 'id', ['#Work', 'work']);
    const update = updates.at(-1)!;
    assert.equal(update.table, table);
    assert.deepEqual(update.payload, { tags: ['work'] });
    assert.deepEqual(update.where, [['id', 'id'], ['user_id', 'user-a']]);
  }
});
test('cloud failures do not save locally or report success', async () => {
  error = { code: 'PGRST204', message: "Could not find the 'tags' column" };
  await assert.rejects(saveRecordTags('expense', 'id', ['work']), /supabase_global_search_tags.sql/);
  error = { code: '42501', message: 'Permission denied' };
  await assert.rejects(saveRecordTags('expense', 'id', ['work']), /Permission denied/);
  error = null; present = false;
  await assert.rejects(saveRecordTags('expense', 'id', []), /no longer available/);
  present = true; user = null;
  await assert.rejects(saveRecordTags('expense', 'id', []), /sign in again/);
  user = 'user-a';
  assert.equal(entries.size, 0);
});
test('ordinary saves preserve tags and use consistent bulk payload keys', async () => {
  const expense = { id: 'id', name: 'Lunch', amount: 20, currency: 'SGD', expenseDate: '2026-10-24', category: 'Food', color: '#fff', tags: ['work'] } as Expense;
  const subscription = { id: 'id', name: 'Adobe', price: 30, currency: 'SGD', billingCycle: 'Monthly', firstPaymentDate: '2026-01-01', nextPaymentDate: '2026-11-01', category: 'Software', cardName: 'Cash', color: '#fff', status: 'Active', tags: ['work'] } as Subscription;
  const transaction = { id: 'id', investmentId: 'holding', transactionType: 'Buy', tradeDate: '2026-10-24', units: 2, price: 10, fees: 1, currency: 'SGD', tags: ['long term'] } as InvestmentTransaction;
  await saveExpenses([expense, { ...expense, id: 'other', tags: undefined }]);
  await saveSubscriptions([subscription, { ...subscription, id: 'other', tags: undefined }]);
  await saveInvestmentTransactions([transaction, { ...transaction, id: 'other', tags: undefined }]);
  for (const { rows } of upserts) {
    assert.ok(rows[0].tags.length);
    assert.deepEqual(rows[1].tags, []);
    assert.deepEqual(Object.keys(rows[0]).sort(), Object.keys(rows[1]).sort());
  }
  const reloaded = await loadAppData();
  assert.deepEqual(reloaded.expenses[0].tags, ['work']);
  assert.deepEqual(reloaded.subscriptions[0].tags, ['work']);
  assert.deepEqual(reloaded.investmentTransactions[0].tags, ['long term']);
  upserts = [];
  await saveExpenses([{ ...expense, tags: undefined }]);
  await saveSubscriptions([{ ...subscription, tags: undefined }]);
  await saveInvestmentTransactions([{ ...transaction, tags: undefined }]);
  for (const { rows } of upserts) assert.equal('tags' in rows[0], false, 'Legacy untagged saves must work before migration');
});
