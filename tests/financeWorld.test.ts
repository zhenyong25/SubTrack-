import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyWorldDecoration, claimWorldQuest, emptyWorld, parseWorld, weeklyWorldActivity, worldStats, worldWeek } from '../services/financeWorldService';

test('weeks start on Monday across month and year boundaries', () => {
  assert.equal(worldWeek('2026-10-25'), '2026-10-19');
  assert.equal(worldWeek('2026-10-26'), '2026-10-26');
  assert.equal(worldWeek('2027-01-01'), '2026-12-28');
  assert.throws(() => worldWeek('2026-02-30'));
});
test('recording counts distinct dates, excludes future records and noncontributions', () => {
  const expenses = ['2026-10-19', '2026-10-19', '2026-10-22', '2026-10-26', 'bad'].map(expenseDate => ({ expenseDate })) as any;
  const entries = [{ direction: 'Withdrawal', amount: 20, entryDate: '2026-10-23' }, { direction: 'Contribution', amount: 0, entryDate: '2026-10-23' }, { direction: 'Contribution', amount: 20, entryDate: '2026-10-26' }] as any;
  assert.deepEqual(weeklyWorldActivity(expenses, entries, '2026-10-25'), { week: '2026-10-19', days: 2, saved: false });
});
test('quest rewards cannot be claimed twice and unearned rewards do not change progress', () => {
  const start = emptyWorld();
  assert.equal(claimWorldQuest(start, 'record', '2026-10-25', false), start);
  const claimed = claimWorldQuest(start, 'record', '2026-10-25', true);
  assert.equal(claimWorldQuest(claimed, 'record', '2026-10-25', true), claimed);
  assert.equal(worldStats(claimed).xp, 40);
  const nextWeek = claimWorldQuest(claimed, 'record', '2026-10-26', true);
  assert.equal(worldStats(nextWeek).xp, 80);
  assert.equal(start.receipts.length, 0);
});
test('cosmetics require coins, are charged once and survive reloading', () => {
  assert.deepEqual(buyWorldDecoration(emptyWorld(), 'sailboat'), emptyWorld());
  const earned = claimWorldQuest(emptyWorld(), 'record', '2026-10-25', true);
  const bought = buyWorldDecoration(earned, 'garden');
  assert.equal(worldStats(bought).coins, 0);
  assert.equal(buyWorldDecoration(bought, 'garden'), bought);
  assert.deepEqual(parseWorld(JSON.stringify(bought)), bought);
  assert.equal(worldStats(earned).coins, 20);
});
test('three quests level up the island, and duplicate stored receipts do not inflate rewards', () => {
  let state = emptyWorld();
  for (const quest of ['record', 'save', 'review'] as const) state = claimWorldQuest(state, quest, '2026-10-25', true);
  assert.deepEqual(worldStats(state), { xp: 150, coins: 75, level: 2, progress: 50 });
  const restored = parseWorld(JSON.stringify({ ...state, receipts: [...state.receipts, state.receipts[0]] }));
  assert.equal(worldStats(restored).xp, 150);
  assert.throws(() => parseWorld('{bad'));
  assert.throws(() => parseWorld(JSON.stringify({ receipts: [{ week: '2026-10-20', quest: 'save' }], decorations: [] })));
});
test('exploration stamps and outfit survive reloads without changing financial rewards', () => {
  const state = parseWorld(JSON.stringify({ ...emptyWorld(), visited: ['grove', 'grove', 'lodge', 'tower', 'fake'], avatarColor: '#e898b4' }));
  assert.deepEqual(state.visited, ['grove', 'lodge', 'tower']);
  assert.equal(state.avatarColor, '#e898b4');
  assert.equal(worldStats(state).coins, 0);
  assert.equal(worldStats(state).xp, 0);
  assert.equal(parseWorld(JSON.stringify({ ...emptyWorld(), avatarColor: 'javascript:bad' })).avatarColor, undefined);
  assert.deepEqual(parseWorld(JSON.stringify(emptyWorld())), emptyWorld());
});
