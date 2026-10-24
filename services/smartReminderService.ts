import type { Loan, LoanPayment, SavingsEntry, SavingsGoal, Subscription } from '../types';
import { forecastDates } from './cashForecastService';
import { loanDues } from './loanService';
import { goalPlan, isValidDate } from './savingsGoalMath';

export type ReminderKind = 'bill' | 'trial' | 'debt' | 'goal';
export interface SmartReminder { id: string; kind: ReminderKind; sourceId: string; name: string; dueDate: string; days: number; amount?: number; currency?: string; detail: string }
export interface ReminderInput { today: string; days: number; subscriptions: Subscription[]; loans: Loan[]; payments: LoanPayment[]; goals: SavingsGoal[]; entries: SavingsEntry[] }
export const reminderDate = (value: string | undefined) => value?.slice(0, 10) || '';
export function reminderDayOffset(date: string, days: number) { if (!isValidDate(date) || !Number.isInteger(days)) throw new Error('Choose a valid reminder date.'); return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
export function buildSmartReminders(input: ReminderInput) {
  if (!isValidDate(input.today)) throw new Error('Choose a valid reminder date.');
  const window = Number.isInteger(input.days) ? Math.min(30, Math.max(0, input.days)) : 3;
  const through = reminderDayOffset(input.today, window); const warnings: string[] = []; const reminders: SmartReminder[] = [];
  const add = (kind: ReminderKind, sourceId: string, name: string, date: string, detail: string, amount?: number, currency?: string) => {
    if (!isValidDate(date)) { warnings.push(`${name}: reminder date is missing or invalid.`); return; }
    const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${input.today}T00:00:00Z`)) / 86400000);
    if (days > window) return;
    reminders.push({ id: `${kind}:${sourceId}:${date}`, kind, sourceId, name, dueDate: date, days, amount, currency, detail });
  };
  for (const sub of input.subscriptions.filter(sub => sub.status === 'Active')) {
    const first = reminderDate(sub.firstPaymentDate); const next = reminderDate(sub.nextPaymentDate);
    if (sub.billingCycle === 'Free Trial') { add('trial', sub.id, sub.name, isValidDate(first) ? first : next, 'Review the trial before renewal or update its status.', sub.price > 0 ? sub.price : undefined, sub.currency); continue; }
    if (!(sub.price > 0)) continue;
    const anchor = isValidDate(first) ? first : next;
    if (!isValidDate(anchor)) { warnings.push(`${sub.name}: reminder date is missing or invalid.`); continue; }
    const dates = forecastDates(anchor, sub.billingCycle, reminderDayOffset(input.today, -1), sub.cancellationDate && reminderDate(sub.cancellationDate) < through ? reminderDate(sub.cancellationDate) : through);
    if (dates[0]) add('bill', sub.id, sub.name, dates[0], 'Scheduled renewal; payment is not verified.', sub.price, sub.currency);
  }
  // Future statements or payments are not evidence that a debt is settled today.
  const payments = input.payments.filter(payment => isValidDate(reminderDate(payment.paymentDate)) && reminderDate(payment.paymentDate) <= input.today);
  for (const loan of input.loans.filter(loan => !loan.isArchived)) {
    try {
      if (!isValidDate(reminderDate(loan.startDate))) throw new Error('Invalid start date');
      for (const due of loanDues([loan], payments, Date.parse(`${input.today}T00:00:00Z`), window)) {
        if (due.amount !== undefined && !Number.isFinite(due.amount)) throw new Error('Invalid balance');
        add('debt', due.loan.id, due.loan.name, new Date(due.nextDue).toISOString().slice(0, 10), 'Based on recorded statements and payments.', due.amount, due.loan.currency);
      }
    } catch { warnings.push(`${loan.name}: debt history could not be read.`); }
  }
  for (const goal of input.goals) {
    if (!goal.targetDate) continue;
    if (!isValidDate(goal.targetDate)) { warnings.push(`${goal.name}: target date is invalid.`); continue; }
    try { const plan = goalPlan(goal, input.entries, input.today); if (!plan.funded) add('goal', goal.id, goal.name, goal.targetDate, goal.kind === 'Sinking fund' ? 'Sinking fund still needs funding.' : 'Savings target still needs funding.', plan.remaining, goal.currency); }
    catch { warnings.push(`${goal.name}: its saved balance could not be read.`); }
  }
  const priority: Record<ReminderKind, number> = { trial: 0, debt: 1, goal: 2, bill: 3 };
  return { reminders: [...new Map(reminders.map(reminder => [reminder.id, reminder])).values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || priority[a.kind] - priority[b.kind] || a.name.localeCompare(b.name)), warnings };
}
