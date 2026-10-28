import webpush from 'web-push';
import type { Loan, LoanPayment, Subscription } from '../../types';
import { buildSmartReminders } from '../../services/smartReminderService';
import { fetchDay, type EarningsEvent } from '../../server/earningsCalendar';
import {
  DEFAULT_PREFS, alertHit, alertMessage, digest, dueItems, earningsItems, sgtDate, usDate,
  type NoticeItem, type NotificationPrefs, type PriceAlert, type PushMessage,
} from './notifications';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Matches wrangler.toml's [triggers]: price alerts every 15 minutes; everything else every 8 hours.
const PRICE_ALERT_CRON = '*/15 * * * *';
const MAX_ALERT_SYMBOLS = 30; // stays well inside the Worker's subrequest limit

// Asia/Singapore is a fixed UTC+8 offset with no daylight saving.
const SGT_OFFSET_MINUTES = 8 * 60;

function getSingaporeDayRangeUtc(now: Date) {
  const sgtNow = new Date(now.getTime() + SGT_OFFSET_MINUTES * 60 * 1000);
  const startSgt = Date.UTC(sgtNow.getUTCFullYear(), sgtNow.getUTCMonth(), sgtNow.getUTCDate(), 0, 0, 0);
  const endSgt = startSgt + 24 * 60 * 60 * 1000;
  return {
    startUtc: new Date(startSgt - SGT_OFFSET_MINUTES * 60 * 1000),
    endUtc: new Date(endSgt - SGT_OFFSET_MINUTES * 60 * 1000),
  };
}

async function supabaseFetch(env: Env, path: string, init?: RequestInit) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase request to ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.status === 204 || res.status === 201 ? null : res.json();
}

const inList = (values: string[]) => `in.(${values.map(value => `"${value}"`).join(',')})`;

async function hasTransactionToday(env: Env, userId: string, startUtc: Date, endUtc: Date) {
  const startIso = startUtc.toISOString();
  const endIso = endUtc.toISOString();
  const filter = `user_id=eq.${userId}&created_at=gte.${startIso}&created_at=lt.${endIso}&limit=1&select=id`;

  const [expenses, incomes] = await Promise.all([
    supabaseFetch(env, `expenses?${filter}`) as Promise<unknown[]>,
    supabaseFetch(env, `incomes?${filter}`) as Promise<unknown[]>,
  ]);

  return expenses.length > 0 || incomes.length > 0;
}

async function deleteSubscription(env: Env, id: string) {
  await supabaseFetch(env, `push_subscriptions?id=eq.${id}`, { method: 'DELETE' });
}

async function loadSubscriptionsByUser(env: Env) {
  const rows = (await supabaseFetch(env, 'push_subscriptions?select=id,user_id,endpoint,p256dh,auth')) as PushSubscriptionRow[];
  const byUser = new Map<string, PushSubscriptionRow[]>();
  rows.forEach(row => byUser.set(row.user_id, [...(byUser.get(row.user_id) || []), row]));
  return byUser;
}

// Before supabase_notifications_schema.sql is run there's no preferences table - everyone gets
// the defaults, which is the old behaviour.
async function loadPrefs(env: Env, userIds: string[]) {
  const prefs = new Map<string, NotificationPrefs>(userIds.map(id => [id, DEFAULT_PREFS]));
  if (userIds.length === 0) return prefs;
  try {
    const rows = (await supabaseFetch(env, `notification_preferences?select=*&user_id=${inList(userIds)}`)) as Array<NotificationPrefs & { user_id: string }>;
    rows.forEach(row => prefs.set(row.user_id, { ...DEFAULT_PREFS, ...row }));
  } catch (err) {
    console.warn('Notification preferences unavailable, using defaults', err);
  }
  return prefs;
}

async function loadSentKeys(env: Env, userId: string) {
  try {
    const since = new Date(Date.now() - 120 * 86400000).toISOString();
    const rows = (await supabaseFetch(env, `notification_log?select=key&user_id=eq.${userId}&sent_at=gte.${since}`)) as Array<{ key: string }>;
    return new Set(rows.map(row => row.key));
  } catch {
    return null; // no log table yet: don't send what can't be deduplicated
  }
}

async function logSent(env: Env, userId: string, items: NoticeItem[]) {
  await supabaseFetch(env, 'notification_log', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(items.map(item => ({ user_id: userId, key: item.key }))),
  });
}

// Sends to every device the user enabled notifications on; returns whether any received it.
async function sendToUser(env: Env, subscriptions: PushSubscriptionRow[], message: PushMessage) {
  let delivered = false;
  await Promise.all(subscriptions.map(async sub => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message));
      delivered = true;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) await deleteSubscription(env, sub.id);
      else console.error('Push failed for subscription', sub.id, err);
    }
  }));
  return delivered;
}

// ---------------------------------------------------------------------------------------------

async function runDailyReminderCheck(env: Env, byUser: Map<string, PushSubscriptionRow[]>, prefs: Map<string, NotificationPrefs>) {
  const { startUtc, endUtc } = getSingaporeDayRangeUtc(new Date());
  await Promise.all([...byUser.entries()].map(async ([userId, subscriptions]) => {
    if (!prefs.get(userId)?.log_reminder) return;
    if (await hasTransactionToday(env, userId, startUtc, endUtc)) return;
    await sendToUser(env, subscriptions, { title: 'SubTrack', body: "You haven't logged any expenses or income today.", url: '/' });
  }));
}

const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

async function loadReminders(env: Env, userId: string, today: string, leadDays: number) {
  const [subs, loans, payments] = await Promise.all([
    supabaseFetch(env, `subscriptions?select=id,name,price,currency,billing_cycle,first_payment_date,next_payment_date,cancellation_date,status&user_id=eq.${userId}`) as Promise<any[]>,
    supabaseFetch(env, `loans?select=*&user_id=eq.${userId}`).catch(() => []) as Promise<any[]>,
    supabaseFetch(env, `loan_payments?select=*&user_id=eq.${userId}`).catch(() => []) as Promise<any[]>,
  ]);
  const subscriptions = subs.map(row => ({
    id: row.id, name: row.name, price: Number(row.price), currency: row.currency, billingCycle: row.billing_cycle,
    firstPaymentDate: day(row.first_payment_date), nextPaymentDate: day(row.next_payment_date),
    cancellationDate: row.cancellation_date ? day(row.cancellation_date) : undefined, status: row.status,
  }) as Subscription);
  const loanList = loans.map(row => ({
    id: row.id, name: row.name, kind: row.kind, currency: row.currency, principal: Number(row.principal), annualRate: Number(row.annual_rate),
    interestMethod: row.interest_method, termMonths: row.term_months ?? undefined, startDate: day(row.start_date),
    instalment: row.instalment == null ? undefined : Number(row.instalment), paymentDay: row.payment_day ?? undefined,
    openingBalance: row.opening_balance == null ? undefined : Number(row.opening_balance),
    openingBalanceDate: row.opening_balance_date ? day(row.opening_balance_date) : undefined, isArchived: row.is_archived ?? false,
  }) as Loan);
  const paymentList = payments.map(row => ({
    id: row.id, loanId: row.loan_id, entryType: row.entry_type === 'statement' ? 'statement' : 'payment', paymentDate: day(row.payment_date), amount: Number(row.amount),
  }) as LoanPayment);
  return buildSmartReminders({ today, days: leadDays, subscriptions, loans: loanList, payments: paymentList, goals: [], entries: [] }).reminders;
}

// 08:00 Singapore time: one "coming up" notification per user - bills, trials, debt payments
// and earnings for stocks they hold.
async function runDailyDigest(env: Env, byUser: Map<string, PushSubscriptionRow[]>, prefs: Map<string, NotificationPrefs>) {
  const now = new Date();
  const today = sgtDate(now);
  const usToday = usDate(now);
  let earnings: Promise<EarningsEvent[]> | null = null;
  const upcomingEarnings = () => {
    earnings ??= Promise.all([0, 1, 2].map(offset => fetchDay(new Date(Date.parse(`${usToday}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)).catch(() => [])))
      .then(days => days.flat());
    return earnings;
  };

  for (const [userId, subscriptions] of byUser) {
    const pref = prefs.get(userId) || DEFAULT_PREFS;
    if (!pref.bills && !pref.debts && !pref.earnings) continue;
    try {
      const sent = await loadSentKeys(env, userId);
      if (!sent) continue;
      const items: NoticeItem[] = [];
      if (pref.bills || pref.debts) items.push(...dueItems(await loadReminders(env, userId, today, pref.lead_days), pref, sent));
      if (pref.earnings) {
        const positions = (await supabaseFetch(env, `investment_portfolio_positions?select=symbol,kind,units,is_active&user_id=eq.${userId}`).catch(() => [])) as Array<{ symbol: string | null; kind: string; units: number; is_active: boolean }>;
        const held = new Set(positions.filter(row => row.kind === 'Stocks' && row.symbol && Number(row.units) > 0 && row.is_active !== false).map(row => row.symbol!.toUpperCase()));
        if (held.size > 0) items.push(...earningsItems(held, await upcomingEarnings(), usToday, sent));
      }
      const message = digest(items, { one: 'Coming up', many: 'things coming up' }, '/');
      if (message && await sendToUser(env, subscriptions, message)) await logSent(env, userId, items);
    } catch (err) {
      console.error('Daily digest failed for user', userId, err);
    }
  }
}

async function fetchPrice(symbol: string) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Safari/537.36' },
  });
  if (!response.ok) throw new Error(`Quote for ${symbol} failed (${response.status})`);
  const data = await response.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; currency?: string } }> } };
  const meta = data?.chart?.result?.[0]?.meta;
  if (typeof meta?.regularMarketPrice !== 'number') throw new Error(`No price for ${symbol}`);
  return { price: meta.regularMarketPrice, currency: meta.currency || null };
}

// Every 15 minutes: one-shot price alerts, marked triggered once a device received them.
async function runPriceAlerts(env: Env, byUser: Map<string, PushSubscriptionRow[]>, prefs: Map<string, NotificationPrefs>) {
  const userIds = [...byUser.keys()].filter(id => prefs.get(id)?.price_alerts);
  if (userIds.length === 0) return;
  let alerts: PriceAlert[];
  try {
    alerts = (await supabaseFetch(env, `price_alerts?select=id,user_id,symbol,direction,target,label&triggered_at=is.null&user_id=${inList(userIds)}`)) as PriceAlert[];
  } catch {
    return; // table not created yet
  }
  const symbols = [...new Set(alerts.map(alert => alert.symbol))].slice(0, MAX_ALERT_SYMBOLS);
  const quotes = new Map<string, { price: number; currency: string | null }>();
  await Promise.all(symbols.map(symbol => fetchPrice(symbol).then(quote => quotes.set(symbol, quote)).catch(() => undefined)));

  for (const alert of alerts) {
    const quote = quotes.get(alert.symbol);
    if (!quote || !alertHit(alert, quote.price)) continue;
    if (!await sendToUser(env, byUser.get(alert.user_id) || [], alertMessage(alert, quote.price, quote.currency))) continue;
    await supabaseFetch(env, `price_alerts?id=eq.${alert.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ triggered_at: new Date().toISOString(), triggered_price: quote.price }),
    });
  }
}

async function run(env: Env, cron: string, scheduledTime: number) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const byUser = await loadSubscriptionsByUser(env);
  if (byUser.size === 0) return;
  const prefs = await loadPrefs(env, [...byUser.keys()]);

  if (cron === PRICE_ALERT_CRON) {
    await runPriceAlerts(env, byUser, prefs);
    return;
  }
  await runDailyReminderCheck(env, byUser, prefs);
  if (new Date(scheduledTime).getUTCHours() === 0) await runDailyDigest(env, byUser, prefs); // 08:00 Singapore time
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env, controller.cron, controller.scheduledTime));
  },
};
