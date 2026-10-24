import test from 'node:test';
import assert from 'node:assert/strict';
import { saveRecordTags } from '../services/appDataService';
const entries = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value) } });
test('local tags persist without altering the record or another user record type', async () => {
  for (const [kind, key] of [['expense', 'subtrack_expenses_v1'], ['subscription', 'subtrack_data_v1'], ['transaction', 'subtrack_investment_transactions_v1']] as const) {
    const original = [{ id: 'id', amount: 42, units: 2, price: 120, notes: 'Keep me' }, { id: 'other', tags: ['keep'] }];
    entries.set(key, JSON.stringify(original));
    await saveRecordTags(kind, 'id', [' #Work ', 'work', 'travel']);
    const saved = JSON.parse(entries.get(key)!);
    assert.deepEqual(saved[0], { ...original[0], tags: ['work', 'travel'] });
    assert.deepEqual(saved[1], original[1]);
    await saveRecordTags(kind, 'id', []);
    assert.deepEqual(JSON.parse(entries.get(key)!)[0].tags, []);
  }
});
test('deleted records and storage failures reject rather than claiming success', async () => {
  await assert.rejects(saveRecordTags('expense', 'missing', ['work']), /no longer available/);
  const previous = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('Storage full'); };
  await assert.rejects(saveRecordTags('expense', 'id', ['work']), /Storage full/);
  localStorage.setItem = previous;
});
