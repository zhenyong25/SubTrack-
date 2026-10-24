import type { SavingsGoal, SavingsEntry } from '../types';
import { CURRENCIES } from '../types';

export const SAVINGS_STORAGE_KEY = 'subtrack_savings_v1';
export const GOAL_COLORS = ['#8b5cf6', '#2563eb', '#10b981', '#f59e0b', '#06b6d4', '#ec4899'];
export const todayDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
export const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export function moneyInCents(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > 1e12 || Math.abs(value * 100 - Math.round(value * 100)) > 0.001) throw new Error('Enter an amount with no more than two decimal places.');
  return Math.round(value * 100);
}
export const goalBalance = (goal: SavingsGoal, entries: SavingsEntry[]) => (
  moneyInCents(goal.openingBalance) + entries.filter(entry => entry.goalId === goal.id).reduce((sum, entry) => sum + (entry.direction === 'Contribution' ? 1 : -1) * moneyInCents(entry.amount), 0)
) / 100;

export function goalPlan(goal: SavingsGoal, entries: SavingsEntry[], today = todayDate()) {
  const balance = goalBalance(goal, entries);
  const remaining = Math.max(0, Math.round((goal.targetAmount - balance) * 100) / 100);
  const funded = remaining === 0;
  const overdue = !funded && Boolean(goal.targetDate && goal.targetDate < today);
  let months = 0;
  if (goal.targetDate) {
    const [year, month, day] = goal.targetDate.split('-').map(Number);
    const [currentYear, currentMonth, currentDay] = today.split('-').map(Number);
    months = Math.max(1, (year - currentYear) * 12 + month - currentMonth + Number(day > currentDay));
  }
  return { balance, remaining, funded, overdue, months, monthlyNeeded: months ? Math.ceil(moneyInCents(remaining) / months) / 100 : null, progress: Math.min(100, Math.max(0, balance / goal.targetAmount * 100)) };
}

export function advanceGoalDate(date: string, months: number, today = todayDate()): string {
  if (!isValidDate(date) || ![1, 3, 6, 12].includes(months)) throw new Error('Choose a valid recurring fund schedule.');
  const [year, month, day] = date.split('-').map(Number);
  const endOfMonth = day === new Date(Date.UTC(year, month, 0)).getUTCDate();
  let current = new Date(Date.UTC(year, month - 1, day));
  do {
    const next = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(endOfMonth ? lastDay : Math.min(day, lastDay));
    current = next;
  } while (current.toISOString().slice(0, 10) <= today);
  return current.toISOString().slice(0, 10);
}

export function validateGoal(goal: SavingsGoal, previous?: SavingsGoal) {
  if (!goal.name.trim() || goal.name.trim().length > 80) throw new Error('Enter a goal name of up to 80 characters.');
  if (!['Savings', 'Sinking fund'].includes(goal.kind)) throw new Error('Choose a goal type.');
  if (moneyInCents(goal.targetAmount) <= 0) throw new Error('Your target must be greater than zero.');
  if (moneyInCents(goal.openingBalance) < 0) throw new Error('Your starting balance cannot be negative.');
  if (!CURRENCIES.includes(goal.currency)) throw new Error('Choose a supported currency.');
  if (goal.targetDate && !isValidDate(goal.targetDate)) throw new Error('Choose a valid target date.');
  if (goal.kind === 'Sinking fund' && (!goal.targetDate || ![1, 3, 6, 12].includes(goal.repeatMonths))) throw new Error('Sinking funds need a due date and a recurring schedule.');
  if (goal.kind === 'Savings' && goal.repeatMonths !== 0) throw new Error('One-off savings goals do not repeat.');
  if (previous && (previous.currency !== goal.currency || previous.openingBalance !== goal.openingBalance)) throw new Error('Currency and starting balance cannot change after creation. Use contributions or withdrawals to adjust the balance.');
  if ((goal.notes?.length || 0) > 1000) throw new Error('Keep notes within 1,000 characters.');
}
export function validateEntry(goal: SavingsGoal, entries: SavingsEntry[], entry: SavingsEntry, today = todayDate(), checkBalance = true) {
  if (entry.goalId !== goal.id) throw new Error('This entry belongs to a different goal.');
  if (!['Contribution', 'Withdrawal'].includes(entry.direction)) throw new Error('Choose a valid contribution or withdrawal.');
  if (moneyInCents(entry.amount) <= 0) throw new Error('Enter an amount greater than zero.');
  if (!isValidDate(entry.entryDate) || entry.entryDate > today) throw new Error('Choose today or an earlier date for a recorded movement.');
  if ((entry.notes?.length || 0) > 1000) throw new Error('Keep notes within 1,000 characters.');
  if (checkBalance && entry.direction === 'Contribution' && goalBalance(goal, entries) + entry.amount > 1e12) throw new Error('This contribution would exceed the supported goal balance.');
  if (checkBalance && entry.direction === 'Withdrawal' && moneyInCents(entry.amount) > moneyInCents(goalBalance(goal, entries))) throw new Error('You cannot use more than the amount saved in this goal.');
}
