import type { SavingsGoal, SavingsEntry } from '../types';
import { getSupabaseClient, getSupabaseSession, isSupabaseConfigured } from './appDataService';
import { advanceGoalDate, goalBalance, SAVINGS_STORAGE_KEY, todayDate, validateEntry, validateGoal } from './savingsGoalMath';

export interface SavingsData { goals: SavingsGoal[]; entries: SavingsEntry[] }
const readLocal = (): SavingsData => {
  const raw = localStorage.getItem(SAVINGS_STORAGE_KEY);
  if (!raw) return { goals: [], entries: [] };
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.goals) || !Array.isArray(parsed.entries)) throw new Error('The saved goals could not be read. Please restore your data before making changes.');
  return parsed;
};
const notifySavingsChanged = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('subtrack-savings-changed')); };
const writeLocal = (data: SavingsData) => { localStorage.setItem(SAVINGS_STORAGE_KEY, JSON.stringify(data)); notifySavingsChanged(); };
const cloudContext = async () => {
  const client = getSupabaseClient();
  const session = await getSupabaseSession();
  if (!client || !session?.user.id) throw new Error('Please sign in again to access your goals.');
  return { client, userId: session.user.id };
};
const reportError = (error: { code?: string; message?: string } | null) => {
  if (!error) return;
  if (['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error.code || '')) {
    throw new Error(`Goals database setup is not visible to this app's Supabase API. Check that the SQL completed in the same project used by the app, reload the API schema cache, then retry. Supabase ${error.code}: ${error.message || 'Required table or function unavailable.'}`);
  }
  throw new Error(error.message || 'Could not save your goals. Please try again.');
};
const mapGoal = (row: any): SavingsGoal => ({ id: row.id, name: row.name, kind: row.kind, targetAmount: Number(row.target_amount), openingBalance: Number(row.opening_balance), currency: row.currency, targetDate: row.target_date || undefined, repeatMonths: row.repeat_months, color: row.color, notes: row.notes || undefined, createdAt: row.created_at, updatedAt: row.updated_at });
const mapEntry = (row: any): SavingsEntry => ({ id: row.id, goalId: row.goal_id, direction: row.direction, amount: Number(row.amount), entryDate: row.entry_date, notes: row.notes || undefined, advancedCycle: Boolean(row.advanced_cycle), createdAt: row.created_at });

export async function loadSavingsGoals(): Promise<SavingsData> {
  if (!isSupabaseConfigured()) return readLocal();
  const { client, userId } = await cloudContext();
  const readAll = async (table: string) => {
    const result: any[] = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await client.from(table).select('*').eq('user_id', userId).order('created_at').order('id').range(start, start + 999);
      reportError(error);
      result.push(...(data || []));
      if (!data || data.length < 1000) return result;
    }
  };
  const [goals, entries] = await Promise.all([readAll('savings_goals'), readAll('savings_goal_entries')]);
  return { goals: goals.map(mapGoal), entries: entries.map(mapEntry) };
}

export async function saveSavingsGoal(goal: SavingsGoal, isNew: boolean): Promise<void> {
  if (!isSupabaseConfigured()) {
    const current = readLocal();
    const previous = current.goals.find(item => item.id === goal.id);
    if (!isNew && !previous) throw new Error('This goal is no longer available.');
    if (isNew && previous) throw new Error('This goal already exists. Refresh before trying again.');
    validateGoal(goal, previous);
    writeLocal({ ...current, goals: previous ? current.goals.map(item => item.id === goal.id ? goal : item) : [...current.goals, goal] });
    return;
  }
  validateGoal(goal);
  const { client, userId } = await cloudContext();
  const fields = { name: goal.name.trim(), kind: goal.kind, target_amount: goal.targetAmount, target_date: goal.targetDate || null, repeat_months: goal.repeatMonths, color: goal.color, notes: goal.notes || null };
  const result = isNew
    ? await client.from('savings_goals').insert({ id: goal.id, user_id: userId, ...fields, opening_balance: goal.openingBalance, currency: goal.currency }).select('id').maybeSingle()
    : await client.from('savings_goals').update(fields).eq('id', goal.id).eq('user_id', userId).select('id').maybeSingle();
  reportError(result.error);
  if (!result.data) throw new Error('This goal is no longer available. Refresh and try again.');
  notifySavingsChanged();
}

export async function recordSavingsEntry(goal: SavingsGoal, entry: SavingsEntry, advanceCycle: boolean): Promise<void> {
  if (advanceCycle && (goal.kind !== 'Sinking fund' || entry.direction !== 'Withdrawal')) throw new Error('Only a sinking-fund withdrawal can start a new cycle.');
  if (!isSupabaseConfigured()) {
    const current = readLocal();
    const liveGoal = current.goals.find(item => item.id === goal.id);
    if (!liveGoal) throw new Error('This goal is no longer available.');
    const duplicate = current.entries.find(item => item.id === entry.id);
    if (duplicate) {
      if (duplicate.goalId === entry.goalId && duplicate.amount === entry.amount && duplicate.direction === entry.direction && duplicate.entryDate === entry.entryDate && (duplicate.notes || '') === (entry.notes || '') && Boolean(duplicate.advancedCycle) === advanceCycle) return;
      throw new Error('This movement has already been recorded with different details.');
    }
    validateEntry(liveGoal, current.entries, entry);
    if (advanceCycle && (liveGoal.kind !== 'Sinking fund' || !liveGoal.targetDate || !liveGoal.repeatMonths)) throw new Error('This fund no longer has a recurring schedule.');
    const updatedGoal = { ...liveGoal, updatedAt: new Date().toISOString(), ...(advanceCycle ? { targetDate: advanceGoalDate(liveGoal.targetDate!, liveGoal.repeatMonths) } : {}) };
    writeLocal({ goals: current.goals.map(item => item.id === goal.id ? updatedGoal : item), entries: [...current.entries, { ...entry, advancedCycle: advanceCycle }] });
    return;
  }
  // The RPC repeats balance checks under a row lock and atomically advances the fund cycle.
  validateEntry(goal, [], entry, todayDate(), false);
  const { client } = await cloudContext();
  const { error } = await client.rpc('record_savings_goal_entry', { p_goal_id: goal.id, p_entry_id: entry.id, p_direction: entry.direction, p_amount: entry.amount, p_entry_date: entry.entryDate, p_notes: entry.notes || null, p_advance_cycle: advanceCycle, p_today: todayDate() });
  reportError(error);
  notifySavingsChanged();
}

export async function deleteSavingsEntry(goalId: string, entryId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const current = readLocal();
    const goal = current.goals.find(item => item.id === goalId);
    if (!goal) throw new Error('This goal is no longer available.');
    const entries = current.entries.filter(item => !(item.id === entryId && item.goalId === goalId));
    if (goalBalance(goal, entries) < 0) throw new Error('Removing this contribution would make the saved balance negative. Remove or correct the related withdrawal first.');
    writeLocal({ ...current, entries }); return;
  }
  const { client } = await cloudContext();
  const { error } = await client.rpc('delete_savings_goal_entry', { p_goal_id: goalId, p_entry_id: entryId }); reportError(error); notifySavingsChanged();
}
export async function deleteSavingsGoal(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const current = readLocal(); writeLocal({ goals: current.goals.filter(item => item.id !== id), entries: current.entries.filter(item => item.goalId !== id) }); return;
  }
  const { client, userId } = await cloudContext();
  const { error } = await client.from('savings_goals').delete().eq('id', id).eq('user_id', userId); reportError(error); notifySavingsChanged();
}
