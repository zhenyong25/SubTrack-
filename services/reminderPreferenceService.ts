import { isValidDate } from './savingsGoalMath';

export const REMINDER_STORAGE_PREFIX = 'subtrack_reminder_preferences_v1:';
export interface ReminderAction { action: 'dismiss' | 'snooze'; until?: string; updatedAt: string }
export type ReminderActions = Record<string, ReminderAction>;
export const reminderStorageKey = (scope: string) => { if (!scope) throw new Error('Reminder account is unavailable.'); return `${REMINDER_STORAGE_PREFIX}${encodeURIComponent(scope)}`; };
export function readReminderActions(scope: string): ReminderActions {
  const raw = localStorage.getItem(reminderStorageKey(scope)); if (!raw) return {};
  const data = JSON.parse(raw);
  if (!data || data.version !== 1 || !data.actions || typeof data.actions !== 'object' || Array.isArray(data.actions)) throw new Error('Reminder preferences could not be read. Restore the device preferences to continue.');
  const actions: ReminderActions = Object.create(null);
  for (const [id, action] of Object.entries(data.actions) as [string, ReminderAction][]) {
    if (!action || !['dismiss', 'snooze'].includes(action.action) || !isValidDate(action.updatedAt) || (action.action === 'snooze' && !isValidDate(action.until || ''))) throw new Error('Reminder preferences contain invalid dates or actions. Restore the device preferences to continue.');
    actions[id] = action;
  }
  return actions;
}
export function saveReminderAction(scope: string, id: string, action: ReminderAction | null): ReminderActions {
  if (!id || (action && (!['dismiss', 'snooze'].includes(action.action) || !isValidDate(action.updatedAt) || (action.action === 'snooze' && (!isValidDate(action.until || '') || action.until! <= action.updatedAt))))) throw new Error('Choose a future snooze date.');
  const actions = readReminderActions(scope);
  if (action) actions[id] = action; else delete actions[id];
  const limited = Object.fromEntries(Object.entries(actions).sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt) || Number(b[0] === id) - Number(a[0] === id)).slice(0, 500));
  localStorage.setItem(reminderStorageKey(scope), JSON.stringify({ version: 1, actions: limited }));
  return limited;
}
export function restoreReminderActions(scope: string): ReminderActions { localStorage.removeItem(reminderStorageKey(scope)); return {}; }
export function reminderIsHidden(id: string, actions: ReminderActions, today: string) { const action = actions[id]; return Boolean(action && (action.action === 'dismiss' || (action.until && today < action.until))); }
