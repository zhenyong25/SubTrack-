import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchRecords, normalizeTags, searchRecords, type SearchFilters } from '../services/globalSearchService';
import type { SearchData } from '../services/globalSearchService';
const data: SearchData = {
  expenses: [{ id: 'same-id', name: 'Café lunch', amount: 1000, currency: 'SGD', expenseDate: '2026-10-01', category: 'Dining', color: '#fff', notes: 'Client meeting', linkedCardId: 'card', tags: ['Work', 'tax'] }],
  subscriptions: [{ id: 'same-id', name: 'Adobe', price: 50, currency: 'USD', billingCycle: 'Monthly', firstPaymentDate: '2025-01-01', nextPaymentDate: '2026-11-01', category: 'Software', color: '#fff', cardName: 'Cash', status: 'Active', tags: ['work', 'creative suite'] }, { id: 'old', name: 'Netflix', price: 12, currency: 'SGD', billingCycle: 'Monthly', firstPaymentDate: '2024-01-01', nextPaymentDate: '2026-11-01', cancellationDate: '2026-09-30', category: 'Entertainment', color: '#fff', cardName: 'Cash', status: 'Past' }],
  transactions: [{ id: 'trade', investmentId: 'holding', transactionType: 'Buy', tradeDate: '2026-10-02', units: 2, price: 150, fees: 5, currency: 'USD', tags: ['long term'] }],
  holdings: [{ id: 'holding', name: 'Apple', symbol: 'AAPL', kind: 'Stocks', accountId: 'broker', units: 2, averageCost: 150, currentPrice: 160, currency: 'USD', color: '#fff', isActive: true }],
  accounts: [{ id: 'broker', name: 'Moomoo SG', broker: 'FUTU', accountType: 'Cash', currency: 'USD', color: '#fff' }],
  cards: [{ id: 'card', name: 'DBS Altitude', type: 'Visa', kind: 'Credit', last4Digits: '1234', color: '#fff' }],
};
const records = buildSearchRecords(data);
const defaults: SearchFilters = { query: '', kind: 'all', tags: [], from: '', to: '', currency: '', sort: 'relevance' };
const search = (filters: Partial<SearchFilters>) => searchRecords(records, { ...defaults, ...filters });
test('tags normalize, deduplicate, cap length/count, and tolerate legacy data', () => {
  assert.deepEqual(normalizeTags([' #Work ', 'work', '', null, 10, 'creative   suite']), ['work', 'creative suite']);
  assert.deepEqual(normalizeTags(undefined), []);
  assert.equal(normalizeTags(Array.from({ length: 15 }, (_, i) => String(i))).length, 10);
  assert.equal(normalizeTags(['a'.repeat(40)])[0].length, 32);
});
test('IDs are scoped by record type, all types indexed, cancelled subscriptions retained', () => {
  assert.equal(new Set(records.map(item => item.key)).size, 4);
  assert.equal(search({ query: 'Netflix' }).results[0].date, '2026-09-30');
});
test('names are accent/case insensitive; notes, cards, broker and ticker are searchable', () => {
  for (const query of ['CAFE', 'client meeting', 'DBS Altitude', '1,000.00']) assert.equal(search({ query }).results[0].kind, 'expense');
  for (const query of ['AAPL', 'Moomoo', 'FUTU', 'Apple buy']) assert.equal(search({ query }).results[0].kind, 'transaction');
});
test('tag queries match exact tags, support phrases, combine with words and AND filters', () => {
  assert.equal(search({ query: '#work' }).results.length, 2);
  assert.equal(search({ query: '#wor' }).results.length, 0);
  assert.equal(search({ query: '#"creative suite" adobe' }).results[0].id, 'same-id');
  assert.equal(search({ tags: ['work', 'tax'] }).results.length, 1);
  assert.equal(search({ query: 'adobe', tags: ['tax'] }).results.length, 0);
});
test('date boundaries inclusive, currencies and record types filter independently', () => {
  assert.equal(search({ from: '2026-10-01', to: '2026-10-02' }).results.length, 2);
  assert.equal(search({ from: '2026-11-02', to: '2026-10-01' }).results.length, 0);
  const filtered = search({ currency: 'USD', kind: 'subscription' });
  assert.equal(filtered.results.length, 1);
  assert.equal(filtered.counts.all, 2);
  assert.equal(filtered.counts.transaction, 1);
});
test('trade value excludes fees and special transaction types use appropriate amounts', () => {
  assert.equal(records.find(item => item.kind === 'transaction')!.amount, 300);
  for (const [transactionType, expected] of [['Dividend', 150], ['Fee', 5], ['Split', null]] as const) {
    const changed = buildSearchRecords({ ...data, transactions: [{ ...data.transactions[0], transactionType }] });
    assert.equal(changed.find(item => item.kind === 'transaction')!.amount, expected);
  }
});
test('sort and empty states are deterministic', () => {
  assert.equal(search({ sort: 'newest' }).results[0].title, 'Adobe');
  assert.equal(search({ sort: 'oldest' }).results[0].title, 'Netflix');
  assert.deepEqual(search({ query: 'nonexistent' }).results, []);
  assert.equal(searchRecords([], defaults).counts.all, 0);
});
