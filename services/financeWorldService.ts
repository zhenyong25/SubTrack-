import type { Expense, SavingsEntry } from '../types';

export const WORLD_PREFIX = 'subtrack_world_v1:';
export const QUEST_REWARDS = { record: { xp: 40, coins: 20 }, save: { xp: 50, coins: 25 }, review: { xp: 60, coins: 30 } } as const;
export type QuestId = keyof typeof QUEST_REWARDS;
export const DECORATIONS = [
  { id: 'garden', name: 'Wildflower garden', cost: 20, description: 'A little colour beside your campsite.' },
  { id: 'sailboat', name: 'Sunset sailboat', cost: 40, description: 'A quiet companion in the lagoon.' },
  { id: 'stars', name: 'Firefly lights', cost: 60, description: 'A soft glow around your island.' },
] as const;
export interface WorldState { receipts: { week: string; quest: QuestId }[]; decorations: string[]; visited?: string[]; avatarColor?: string }
export const emptyWorld = (): WorldState => ({ receipts: [], decorations: [] });
const dateValid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
export function worldWeek(today: string) {
  if (!dateValid(today)) throw new Error('Invalid world date.');
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
export function parseWorld(raw: string | null): WorldState {
  if (!raw) return emptyWorld();
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.receipts) || !Array.isArray(data.decorations) || data.receipts.some((r: any) => !r || typeof r.week !== 'string' || !dateValid(r.week) || worldWeek(r.week) !== r.week || !Object.hasOwn(QUEST_REWARDS, r.quest)) || data.decorations.some((id: unknown) => !DECORATIONS.some(d => d.id === id))) throw new Error('Saved world progress could not be read. Your data has not been overwritten.');
  const profile = {
    ...(Array.isArray(data.visited) ? { visited: [...new Set(data.visited.filter((id: unknown) => ['grove', 'lodge', 'tower'].includes(id as string)))] as string[] } : {}),
    ...(typeof data.avatarColor === 'string' && /^#[0-9a-f]{6}$/i.test(data.avatarColor) ? { avatarColor: data.avatarColor } : {}),
  };
  return { receipts: [...new Map(data.receipts.map((r: any) => [`${r.week}:${r.quest}`, { week: r.week, quest: r.quest }])).values()] as WorldState['receipts'], decorations: [...new Set(data.decorations)] as string[], ...profile };
}
export function worldStats(state: WorldState) {
  const xp = state.receipts.reduce((sum, receipt) => sum + QUEST_REWARDS[receipt.quest].xp, 0);
  const earned = state.receipts.reduce((sum, receipt) => sum + QUEST_REWARDS[receipt.quest].coins, 0);
  const coins = earned - DECORATIONS.filter(item => state.decorations.includes(item.id)).reduce((sum, item) => sum + item.cost, 0);
  return { xp, coins, level: Math.floor(xp / 100) + 1, progress: xp % 100 };
}
export function weeklyWorldActivity(expenses: Expense[], entries: SavingsEntry[], today: string) {
  const week = worldWeek(today);
  const days = new Set(expenses.filter(e => dateValid(e.expenseDate) && e.expenseDate >= week && e.expenseDate <= today).map(e => e.expenseDate)).size;
  const saved = entries.some(e => e.direction === 'Contribution' && Number.isFinite(e.amount) && e.amount > 0 && dateValid(e.entryDate) && e.entryDate >= week && e.entryDate <= today);
  return { week, days, saved };
}
export function claimWorldQuest(state: WorldState, quest: QuestId, today: string, eligible: boolean): WorldState {
  const week = worldWeek(today);
  if (!eligible || state.receipts.some(receipt => receipt.week === week && receipt.quest === quest)) return state;
  return { ...state, receipts: [...state.receipts, { week, quest }] };
}
export function buyWorldDecoration(state: WorldState, id: string): WorldState {
  const item = DECORATIONS.find(d => d.id === id);
  if (!item || state.decorations.includes(id) || worldStats(state).coins < item.cost) return state;
  return { ...state, decorations: [...state.decorations, id] };
}
