import test from 'node:test';
import assert from 'node:assert/strict';
import type { SavingsGoal, SavingsEntry } from '../types';
import { deleteSavingsEntry, deleteSavingsGoal, loadSavingsGoals, recordSavingsEntry, saveSavingsGoal } from '../services/savingsGoalService';
import { goalBalance, SAVINGS_STORAGE_KEY, todayDate } from '../services/savingsGoalMath';
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) } });
(globalThis as any).__goalCloud = false;
const goal: SavingsGoal = { id: 'g', name: 'Annual insurance', kind: 'Sinking fund', targetAmount: 1200, openingBalance: 100, currency: 'SGD', targetDate: todayDate(), repeatMonths: 12, color: '#8b5cf6', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const entry: SavingsEntry = { id: 'e', goalId: 'g', direction: 'Contribution', amount: 100, entryDate: todayDate(), createdAt: new Date().toISOString() };
test('local goals and movements survive reloads, edits preserve history, and retries do not duplicate money', async () => {
  store.clear(); await saveSavingsGoal(goal, true); await recordSavingsEntry(goal, entry, false); await recordSavingsEntry(goal, entry, false);
  let data = await loadSavingsGoals(); assert.equal(data.entries.length, 1); assert.equal(goalBalance(data.goals[0], data.entries), 200);
  await saveSavingsGoal({ ...goal, name: 'Insurance renewal' }, false);
  data = await loadSavingsGoals(); assert.equal(data.goals[0].name, 'Insurance renewal'); assert.equal(data.entries.length, 1);
  await assert.rejects(recordSavingsEntry(goal, { ...entry, amount: 50 }, false), /different details/);
});
test('withdrawal and cycle advancement are one local write and retain unspent money', async () => {
  const withdrawal: SavingsEntry = { ...entry, id: 'w', direction: 'Withdrawal', amount: 150 };
  await recordSavingsEntry(goal, withdrawal, true); await recordSavingsEntry(goal, withdrawal, true);
  const data = await loadSavingsGoals(); assert.equal(goalBalance(data.goals[0], data.entries), 50); assert.equal(data.entries.length, 2); assert.ok(data.goals[0].targetDate! > todayDate());
  await assert.rejects(recordSavingsEntry(goal, withdrawal, false), /different details/);
  await assert.rejects(recordSavingsEntry(goal, { ...withdrawal, id: 'too-much', amount: 51 }, false), /more than/);
});
test('deleting history cannot create a negative balance; deleting a goal removes its entries', async () => {
  await assert.rejects(deleteSavingsEntry('g', 'e'), /negative/);
  await deleteSavingsEntry('g', 'w'); await deleteSavingsEntry('g', 'e');
  const data = await loadSavingsGoals(); assert.equal(goalBalance(data.goals[0], data.entries), 100);
  await deleteSavingsGoal('g'); assert.deepEqual(await loadSavingsGoals(), { goals: [], entries: [] });
});
test('storage failures leave the entire prior goal and ledger intact', async () => {
  await saveSavingsGoal(goal, true); const before = store.get(SAVINGS_STORAGE_KEY); const previous = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('Storage full'); };
  await assert.rejects(recordSavingsEntry(goal, entry, false), /Storage full/);
  assert.equal(store.get(SAVINGS_STORAGE_KEY), before); localStorage.setItem = previous;
  await assert.rejects(saveSavingsGoal({ ...goal, currency: 'USD' }, false), /cannot change/);
});
test('cloud mode never falls back to device data when the account or database is unavailable', async () => {
  (globalThis as any).__goalCloud = true; (globalThis as any).__goalUser = null;
  await assert.rejects(loadSavingsGoals(), /sign in again/);
  (globalThis as any).__goalUser = 'user-a';
  (globalThis as any).__goalClient = { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, range: async () => ({ data: null, error: { code: '42P01', message: 'Missing table' } }) }) };
  await assert.rejects(loadSavingsGoals(), /database setup/);
  (globalThis as any).__goalClient = { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, range: async () => ({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.savings_goals' in the schema cache" } }) }) };
  await assert.rejects(loadSavingsGoals(), error => error instanceof Error && error.message.includes('same project') && error.message.includes('PGRST205') && error.message.includes('public.savings_goals'));
});
test('cloud ledger mutations use authenticated atomic RPCs, never direct inserts', async () => {
  const calls: Array<{ name: string; payload: any }> = [];
  (globalThis as any).__goalClient = { rpc: async (name: string, payload: any) => { calls.push({ name, payload }); return { error: null }; } };
  await recordSavingsEntry(goal, entry, false); await deleteSavingsEntry(goal.id, entry.id);
  assert.equal(calls[0].name, 'record_savings_goal_entry'); assert.equal(calls[0].payload.p_entry_id, entry.id); assert.equal(calls[0].payload.p_goal_id, goal.id); assert.equal(calls[0].payload.p_today, todayDate());
  assert.equal(calls[1].name, 'delete_savings_goal_entry');
  (globalThis as any).__goalClient.rpc = async () => ({ error: { message: 'Insufficient funds' } });
  await assert.rejects(recordSavingsEntry(goal, entry, false), /Insufficient funds/);
});
test('goal-change events fire after successful writes, never after storage failures or duplicate retries', async () => {
  (globalThis as any).__goalCloud=false;store.clear();let events=0;
  (globalThis as any).window={dispatchEvent(event:Event){assert.equal(event.type,'subtrack-savings-changed');events++;}};
  const previous=localStorage.setItem;
  try{
    await saveSavingsGoal(goal,true);await recordSavingsEntry(goal,entry,false);await recordSavingsEntry(goal,entry,false);assert.equal(events,2);
    localStorage.setItem=()=>{throw new Error('Storage full');};await assert.rejects(recordSavingsEntry(goal,{...entry,id:'failed'},false),/Storage full/);assert.equal(events,2);
    localStorage.setItem=previous;await deleteSavingsEntry(goal.id,entry.id);await deleteSavingsGoal(goal.id);assert.equal(events,4);
  }finally{localStorage.setItem=previous;delete (globalThis as any).window;}
});
