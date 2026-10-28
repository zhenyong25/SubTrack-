import { getSupabaseClient, getSupabaseSession, isSupabaseConfigured } from './appDataService';
import { normalizeTickerSymbol } from './stockQuoteService';

// Which push notifications this account wants, and its price alerts. Both live in Supabase
// (supabase_notifications_schema.sql) because the reminder worker - not this device - sends them.

export interface NotificationPrefs {
  logReminder: boolean;
  bills: boolean;
  debts: boolean;
  earnings: boolean;
  priceAlerts: boolean;
  leadDays: number;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { logReminder: true, bills: true, debts: true, earnings: true, priceAlerts: true, leadDays: 3 };

export interface PriceAlert {
  id: string;
  symbol: string;
  direction: 'above' | 'below';
  target: number;
  label?: string;
  createdAt: string;
  triggeredAt?: string;
  triggeredPrice?: number;
}

export const SETUP_MESSAGE = 'Run supabase_notifications_schema.sql in this app\'s Supabase project to turn these on.';

export class NotificationSetupError extends Error {
  constructor() { super(SETUP_MESSAGE); }
}

const context = async () => {
  const client = getSupabaseClient();
  const session = await getSupabaseSession();
  if (!client || !session?.user.id) throw new Error('Sign in to use notifications.');
  return { client, userId: session.user.id };
};

const check = (error: { code?: string; message?: string } | null) => {
  if (!error) return;
  if (['42P01', 'PGRST205', '42703'].includes(error.code || '')) throw new NotificationSetupError();
  throw new Error(error.message || 'Could not reach the notification settings.');
};

export const notificationsAvailable = () => isSupabaseConfigured();

export const loadNotificationPrefs = async (): Promise<NotificationPrefs> => {
  const { client, userId } = await context();
  const { data, error } = await client.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle();
  check(error);
  if (!data) return DEFAULT_NOTIFICATION_PREFS;
  return {
    logReminder: data.log_reminder,
    bills: data.bills,
    debts: data.debts,
    earnings: data.earnings,
    priceAlerts: data.price_alerts,
    leadDays: data.lead_days,
  };
};

export const saveNotificationPrefs = async (prefs: NotificationPrefs) => {
  const { client, userId } = await context();
  const { error } = await client.from('notification_preferences').upsert({
    user_id: userId,
    log_reminder: prefs.logReminder,
    bills: prefs.bills,
    debts: prefs.debts,
    earnings: prefs.earnings,
    price_alerts: prefs.priceAlerts,
    lead_days: Math.min(14, Math.max(0, Math.round(prefs.leadDays))),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  check(error);
};

const alertFromRow = (row: any): PriceAlert => ({
  id: row.id,
  symbol: row.symbol,
  direction: row.direction,
  target: Number(row.target),
  label: row.label || undefined,
  createdAt: row.created_at,
  triggeredAt: row.triggered_at || undefined,
  triggeredPrice: row.triggered_price == null ? undefined : Number(row.triggered_price),
});

export const loadPriceAlerts = async (symbol?: string): Promise<PriceAlert[]> => {
  const { client, userId } = await context();
  let query = client.from('price_alerts').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(200);
  if (symbol) query = query.eq('symbol', normalizeTickerSymbol(symbol));
  const { data, error } = await query;
  check(error);
  return (data || []).map(alertFromRow);
};

// The direction follows from where the price is now: a target above it fires on the way up.
export const createPriceAlert = async (input: { symbol: string; target: number; currentPrice: number; label?: string }): Promise<PriceAlert> => {
  const symbol = normalizeTickerSymbol(input.symbol);
  if (!symbol) throw new Error('This holding has no ticker symbol.');
  if (!(input.target > 0)) throw new Error('Enter a price above zero.');
  if (Math.abs(input.target - input.currentPrice) < 1e-9) throw new Error('That\'s the current price - pick a price above or below it.');
  const { client, userId } = await context();
  const { data, error } = await client.from('price_alerts').insert({
    user_id: userId,
    symbol,
    direction: input.target > input.currentPrice ? 'above' : 'below',
    target: input.target,
    label: input.label?.trim().slice(0, 80) || null,
  }).select('*').single();
  check(error);
  return alertFromRow(data);
};

export const deletePriceAlert = async (id: string) => {
  const { client, userId } = await context();
  const { error } = await client.from('price_alerts').delete().eq('id', id).eq('user_id', userId);
  check(error);
};

// Shown by this device itself - checks permission and how notifications look, without the server.
export const showTestNotification = async () => {
  if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') throw new Error('Turn notifications on for this device first.');
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('SubTrack', {
    body: 'Notifications are working on this device.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/' },
  });
};
