import { getSupabaseClient, getSupabaseSession, isSupabaseConfigured } from './appDataService';
import { CITY_PREFIX, cityFromWorld, newerCity, parseCity, type CityState } from './cityGameService';
import { WORLD_PREFIX } from './financeWorldService';

// Where the city is saved: always on this device (instant, works offline), and in Supabase
// (supabase_city_game_schema.sql) when signed in, so the same city opens on every device.
// On load the more recently changed copy wins.

export type CloudStatus = 'synced' | 'saving' | 'local-only' | 'setup-needed' | 'offline';

const isMissingTable = (error: { code?: string } | null) => ['42P01', 'PGRST205'].includes(error?.code || '');

const readLocal = (owner: string) => parseCity(localStorage.getItem(CITY_PREFIX + owner));

export const writeLocal = (owner: string, state: CityState) => {
  localStorage.setItem(CITY_PREFIX + owner, JSON.stringify(state));
};

const cloudContext = async () => {
  if (!isSupabaseConfigured()) return null;
  const client = getSupabaseClient();
  const session = await getSupabaseSession();
  return client && session?.user.id ? { client, userId: session.user.id } : null;
};

export const loadCity = async (owner: string, now: number, today: string): Promise<{ state: CityState; status: CloudStatus }> => {
  const local = readLocal(owner); // throws if the save is damaged - better than overwriting it
  const context = await cloudContext();
  let cloud: CityState | null = null;
  let status: CloudStatus = context ? 'synced' : 'local-only';
  if (context) {
    const { data, error } = await context.client.from('city_saves').select('state').eq('user_id', context.userId).maybeSingle();
    if (isMissingTable(error)) status = 'setup-needed';
    else if (error) status = 'offline';
    else if (data?.state) {
      try { cloud = parseCity(JSON.stringify(data.state)); } catch { status = 'offline'; }
    }
  }
  const state = newerCity(local, cloud) ?? cityFromWorld(localStorage.getItem(WORLD_PREFIX + owner), now, today);
  return { state, status };
};

export const saveCityToCloud = async (state: CityState): Promise<CloudStatus> => {
  const context = await cloudContext();
  if (!context) return 'local-only';
  const { error } = await context.client.from('city_saves').upsert({ user_id: context.userId, state, updated_at: new Date(state.updatedAt).toISOString() }, { onConflict: 'user_id' });
  if (isMissingTable(error)) return 'setup-needed';
  return error ? 'offline' : 'synced';
};
