import { getSupabaseClient, getSupabaseSession, isSupabaseConfigured } from './appDataService';
import { DEFAULT_RULES, type JournalTrade, type TradeRules } from './tradingMath';

// Trading rules and the trade journal. Self-contained like the savings goals: Supabase when
// signed in (supabase_trading_schema.sql), otherwise this device.

const RULES_KEY = 'subtrack_trade_rules_v1';
const JOURNAL_KEY = 'subtrack_trade_journal_v1';

const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeLocal = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

const MISSING_TABLE = ['42P01', 'PGRST205', 'PGRST202'];
const describe = (error: { code?: string; message?: string }) =>
  MISSING_TABLE.includes(error.code || '')
    ? 'Trading tables are not set up yet - run supabase_trading_schema.sql in Supabase. Saved on this device for now.'
    : error.message || 'Could not reach the database.';

const cloud = async () => {
  if (!isSupabaseConfigured()) return null;
  const client = getSupabaseClient();
  const session = await getSupabaseSession();
  return client && session?.user.id ? { client, userId: session.user.id } : null;
};

const withDefaults = (rules: Partial<TradeRules> | null | undefined): TradeRules => ({ ...DEFAULT_RULES, ...(rules || {}) });

type JournalRow = {
  id: string; user_id: string; trade_date: string; symbol: string; setup: string; entry: number; stop: number;
  target: number | null; shares: number; currency?: string | null; exit_price: number | null; exit_date: string | null; fees: number;
  followed_plan: boolean; mistakes: string[] | null; notes: string | null; created_at?: string;
};

const fromRow = (row: JournalRow): JournalTrade => ({
  id: row.id,
  tradeDate: row.trade_date,
  symbol: row.symbol,
  setup: row.setup,
  entry: Number(row.entry),
  stop: Number(row.stop),
  target: row.target == null ? undefined : Number(row.target),
  shares: Number(row.shares),
  currency: row.currency || undefined,
  exitPrice: row.exit_price == null ? undefined : Number(row.exit_price),
  exitDate: row.exit_date || undefined,
  fees: Number(row.fees || 0),
  followedPlan: row.followed_plan,
  mistakes: row.mistakes || [],
  notes: row.notes || undefined,
  createdAt: row.created_at,
});

const toRow = (trade: JournalTrade, userId: string) => ({
  id: trade.id,
  user_id: userId,
  trade_date: trade.tradeDate,
  symbol: trade.symbol,
  setup: trade.setup,
  entry: trade.entry,
  stop: trade.stop,
  target: trade.target ?? null,
  shares: trade.shares,
  currency: trade.currency ?? null,
  exit_price: trade.exitPrice ?? null,
  exit_date: trade.exitDate ?? null,
  fees: trade.fees,
  followed_plan: trade.followedPlan,
  mistakes: trade.mistakes,
  notes: trade.notes ?? null,
});

export interface TradeData { rules: TradeRules; journal: JournalTrade[]; warning?: string }

// Loads from the database when it's available; falls back to this device (with a warning)
// when the tables don't exist yet, so nothing typed is lost.
export async function loadTradeData(): Promise<TradeData> {
  const local: TradeData = { rules: withDefaults(readLocal(RULES_KEY, null)), journal: readLocal<JournalTrade[]>(JOURNAL_KEY, []) };
  const ctx = await cloud();
  if (!ctx) return local;
  const [settings, journal] = await Promise.all([
    ctx.client.from('trade_settings').select('rules').eq('user_id', ctx.userId).maybeSingle(),
    ctx.client.from('trade_journal').select('*').eq('user_id', ctx.userId).order('trade_date').order('created_at'),
  ]);
  const error = settings.error || journal.error;
  if (error) return { ...local, warning: describe(error) };
  const data: TradeData = {
    rules: settings.data ? withDefaults(settings.data.rules as Partial<TradeRules>) : local.rules,
    journal: ((journal.data || []) as JournalRow[]).map(fromRow),
  };
  writeLocal(RULES_KEY, data.rules);
  writeLocal(JOURNAL_KEY, data.journal);
  return data;
}

// Each save writes this device first, then the database; the returned message (if any) says the
// database refused it.
export async function saveTradeRules(rules: TradeRules): Promise<string | null> {
  writeLocal(RULES_KEY, rules);
  const ctx = await cloud();
  if (!ctx) return null;
  const { error } = await ctx.client.from('trade_settings').upsert({ user_id: ctx.userId, rules }, { onConflict: 'user_id' });
  return error ? describe(error) : null;
}

export async function saveJournalTrade(trade: JournalTrade, journal: JournalTrade[]): Promise<string | null> {
  writeLocal(JOURNAL_KEY, journal);
  const ctx = await cloud();
  if (!ctx) return null;
  const { error } = await ctx.client.from('trade_journal').upsert(toRow(trade, ctx.userId), { onConflict: 'id' });
  return error ? describe(error) : null;
}

export async function deleteJournalTrade(id: string, journal: JournalTrade[]): Promise<string | null> {
  writeLocal(JOURNAL_KEY, journal);
  const ctx = await cloud();
  if (!ctx) return null;
  const { error } = await ctx.client.from('trade_journal').delete().eq('id', id).eq('user_id', ctx.userId);
  return error ? describe(error) : null;
}
