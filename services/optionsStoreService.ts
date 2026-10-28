import { getSupabaseClient, getSupabaseSession } from './appDataService';
import { validateOption, type OptionTrade } from './optionsMath';

async function context() {
  const client = getSupabaseClient();
  const session = client ? await getSupabaseSession() : null;
  const userId = session?.user.id;
  return { client: userId ? client : null, userId, key: `subtrack_options_v1_${userId || 'guest'}` };
}
export async function loadOptions(): Promise<{ trades: OptionTrade[]; warning?: string }> {
  const { client, userId, key } = await context();
  const local = () => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value.filter(item => !validateOption(item)) as OptionTrade[] : []; } catch { return []; } };
  if (!client) return { trades: local(), warning: 'Saved on this device. Sign in for cloud storage.' };
  const { data, error } = await client.from('option_trades').select('id, details').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) return { trades: local(), warning: 'Cloud options storage unavailable. Apply supabase_options_schema.sql if needed. Showing this device’s saved trades.' };
  const trades = (data || []).map(row => ({ ...row.details, id: row.id }) as OptionTrade).filter(item => !validateOption(item));
  localStorage.setItem(key, JSON.stringify(trades));
  return { trades };
}
export async function persistOption(trade: OptionTrade, remove = false): Promise<string | null> {
  const invalid = validateOption(trade);
  if (invalid) throw new Error(invalid);
  const { client, userId, key } = await context();
  let cached: OptionTrade[] = [];
  try { const parsed = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(parsed)) cached = parsed; } catch { /* Start a clean cache. */ }
  const next = cached.filter(item => item.id !== trade.id);
  if (!remove) next.unshift(trade);
  if (client) {
    const result = remove
      ? await client.from('option_trades').delete().eq('id', trade.id).eq('user_id', userId)
      : await client.from('option_trades').upsert({ id: trade.id, user_id: userId, details: trade }, { onConflict: 'id' });
    if (result.error) {
      if (remove) throw new Error('Could not delete the cloud trade. Please retry.');
      throw new Error('Cloud save failed. Apply supabase_options_schema.sql if needed, then retry. Your draft is still in the form.');
    }
  }
  localStorage.setItem(key, JSON.stringify(next));
  return client ? null : 'Saved on this device. Sign in for cloud storage.';
}
