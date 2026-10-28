// What to notify about - pure decisions, so they can be tested without Supabase or push.
// index.ts loads the data, calls these, sends the pushes and logs the keys.

import type { SmartReminder } from '../../services/smartReminderService';
import type { EarningsEvent } from '../../server/earningsCalendar';

export interface NotificationPrefs {
  log_reminder: boolean;
  bills: boolean;
  debts: boolean;
  earnings: boolean;
  price_alerts: boolean;
  lead_days: number;
}

// No preferences row means everything on - what the daily reminder did before preferences existed.
export const DEFAULT_PREFS: NotificationPrefs = { log_reminder: true, bills: true, debts: true, earnings: true, price_alerts: true, lead_days: 3 };

export interface NoticeItem {
  key: string; // logged once sent, so the same thing is never sent twice
  line: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

const when = (days: number) => (days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);
const amountText = (amount?: number, currency?: string) =>
  amount !== undefined && Number.isFinite(amount) ? ` · ${currency ? `${currency} ` : ''}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';

// Bills, trials and debt payments from the same Smart reminders logic the app shows. Each one is
// sent when it first comes within the lead time, and again on the day it's due.
export const dueItems = (reminders: SmartReminder[], prefs: NotificationPrefs, sent: Set<string>): NoticeItem[] =>
  reminders.flatMap(reminder => {
    const wanted = reminder.kind === 'debt' ? prefs.debts : reminder.kind === 'bill' || reminder.kind === 'trial' ? prefs.bills : false;
    if (!wanted || reminder.days < 0 || reminder.days > prefs.lead_days) return [];
    const key = reminder.days === 0 ? `${reminder.id}:today` : reminder.id;
    if (sent.has(key)) return [];
    const what = reminder.kind === 'trial' ? `${reminder.name} trial ends` : reminder.kind === 'debt' ? `${reminder.name} payment due` : `${reminder.name} renews`;
    return [{ key, line: `${what} ${when(reminder.days)}${amountText(reminder.amount, reminder.currency)}` }];
  });

const DAY_MS = 86400000;
const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const TIME_TEXT = { bmo: 'before the US open', amc: 'after the US close', unknown: 'time not announced' } as const;

// Stocks you hold that report within the next two (US) days - once per report.
export const earningsItems = (held: Set<string>, events: EarningsEvent[], usToday: string, sent: Set<string>): NoticeItem[] =>
  events.flatMap(event => {
    const days = dayDiff(usToday, event.date);
    const key = `earnings:${event.symbol}:${event.date}`;
    if (!held.has(event.symbol) || days < 0 || days > 2 || sent.has(key)) return [];
    const date = new Date(`${event.date}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
    const estimate = event.epsEstimate !== null ? ` · EPS est. ${event.epsEstimate.toFixed(2)}` : '';
    return [{ key, line: `${event.symbol} reports ${date}, ${TIME_TEXT[event.time]}${estimate}` }];
  });

// One notification per run, however many items: the first few lines, then a count.
export const digest = (items: NoticeItem[], noun: { one: string; many: string }, url: string, maxLines = 4): PushMessage | null => {
  if (items.length === 0) return null;
  const lines = items.slice(0, maxLines).map(item => item.line);
  if (items.length > maxLines) lines.push(`+${items.length - maxLines} more`);
  return { title: items.length === 1 ? noun.one : `${items.length} ${noun.many}`, body: lines.join('\n'), url };
};

export interface PriceAlert {
  id: string;
  user_id: string;
  symbol: string;
  direction: 'above' | 'below';
  target: number;
  label: string | null;
}

export const alertHit = (alert: Pick<PriceAlert, 'direction' | 'target'>, price: number) =>
  Number.isFinite(price) && price > 0 && (alert.direction === 'above' ? price >= Number(alert.target) : price <= Number(alert.target));

export const alertMessage = (alert: PriceAlert, price: number, currency: string | null): PushMessage => ({
  title: `${alert.symbol} ${alert.direction === 'above' ? 'rose to' : 'fell to'} ${price.toFixed(2)}${currency ? ` ${currency}` : ''}`,
  body: `${alert.label || `Your alert at ${Number(alert.target).toFixed(2)}`} was reached.`,
  url: '/',
});

// "Today" where the user is: the app and this worker treat days in Singapore time (UTC+8, no DST).
export const sgtDate = (now: Date) => new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export const usDate = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
