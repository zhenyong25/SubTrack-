import { getSupabaseClient } from './appDataService';

// Your own Pokémon card records beyond the tracker: card shows and events you add, cards sent
// for grading or repair, and sellers you've flagged. Saved on this device and, once
// supabase_pokemon_extras_schema.sql is run, synced to your account (same approach as the tracker).

export const SUBMISSION_SERVICES = ['Grading', 'Pressing', 'Cleaning', 'Repair', 'Other'] as const;
export const SUBMISSION_STATUSES = ['Preparing', 'Sent', 'Received by provider', 'In progress', 'Shipped back', 'Returned'] as const;
export const SELLER_PLATFORMS = ['Carousell', 'Facebook', 'Telegram', 'Instagram', 'WhatsApp', 'In person', 'Other'] as const;
export const EVENT_KINDS = ['Card show', 'Tournament', 'Meetup', 'Other'] as const;

export type SubmissionService = typeof SUBMISSION_SERVICES[number];
export type SubmissionStatus = typeof SUBMISSION_STATUSES[number];

export interface CardSubmission {
  id: string;
  card: string;
  service: SubmissionService;
  provider: string;
  sentDate: string; // YYYY-MM-DD, '' when not sent yet
  expectedDate: string;
  returnedDate: string;
  status: SubmissionStatus;
  cost: number | null;
  currency: string;
  tracking: string;
  result: string; // e.g. "PSA 9", "Pressed - crease gone"
  notes: string;
}

export interface FlaggedSeller {
  id: string;
  name: string;
  platform: string;
  handle: string; // username or profile link
  contact: string; // phone or other contact
  reason: string;
  date: string;
  amountLost: number | null;
  currency: string;
  evidenceUrl: string;
  reportRef: string; // police report or platform case number
}

export interface CustomEvent {
  id: string;
  kind: typeof EVENT_KINDS[number];
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "10:00-18:00"
  place: string;
  url: string;
  notes: string;
}

export interface PokemonExtras {
  submissions: CardSubmission[];
  sellers: FlaggedSeller[];
  events: CustomEvent[];
}

export const EMPTY_EXTRAS: PokemonExtras = { submissions: [], sellers: [], events: [] };

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);
export const normaliseExtras = (value: unknown): PokemonExtras => {
  const data = value && typeof value === 'object' ? value as Partial<PokemonExtras> : {};
  return { submissions: asArray(data.submissions), sellers: asArray(data.sellers), events: asArray(data.events) };
};

export async function openPokemonExtrasStore() {
  const client = getSupabaseClient();
  const session = client ? await client.auth.getSession() : null;
  if (session?.error) throw session.error;
  const userId = session?.data.session?.user.id;
  const key = `subtrack_pokemon_extras_v1:${userId || 'guest'}`;
  const pendingKey = `${key}:pending`;
  let data = EMPTY_EXTRAS;
  const stored = localStorage.getItem(key);
  if (stored) {
    try { data = normaliseExtras(JSON.parse(stored)); }
    catch { throw new Error('Your saved Pokémon records could not be read. They have been left untouched.'); }
  }
  let notice = 'Saved on this device.';
  let cloudAvailable = false;
  if (client && userId) {
    const { data: row, error } = await client.from('pokemon_card_extras').select('data').eq('user_id', userId).maybeSingle();
    if (!error) {
      cloudAvailable = true;
      if (localStorage.getItem(pendingKey)) notice = 'This device has changes waiting to sync. They\'ll sync on your next save.';
      else { if (row?.data) data = normaliseExtras(row.data); notice = 'Synced to your account.'; }
    } else {
      notice = 'Saved on this device. Account sync needs supabase_pokemon_extras_schema.sql.';
    }
  }
  return {
    data, notice,
    async save(next: PokemonExtras) {
      // Never let a stale session write another user's records.
      if (client) {
        const current = await client.auth.getSession();
        if (current.error || current.data.session?.user.id !== userId) throw new Error('Your session changed. Reload before saving.');
      }
      localStorage.setItem(key, JSON.stringify(next));
      if (userId) localStorage.setItem(pendingKey, 'true');
      if (client && userId && cloudAvailable) {
        try {
          const { error } = await client.from('pokemon_card_extras').upsert({ user_id: userId, data: next, updated_at: new Date().toISOString() });
          if (error) return 'Saved on this device; account sync failed.';
        } catch {
          return 'Saved on this device; account sync failed.';
        }
        localStorage.removeItem(pendingKey);
        return 'Synced to your account.';
      }
      return notice;
    },
  };
}

// --- Grading & repair -----------------------------------------------------------------------

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const submissionSummary = (submissions: CardSubmission[]) => {
  const active = submissions.filter(item => item.status !== 'Returned');
  const spent = new Map<string, number>();
  submissions.forEach(item => { if (item.cost) spent.set(item.currency, (spent.get(item.currency) || 0) + item.cost); });
  const turnarounds = submissions.filter(item => item.status === 'Returned' && item.sentDate && item.returnedDate).map(item => daysBetween(item.sentDate, item.returnedDate)).filter(days => days >= 0);
  return {
    active: active.length,
    returned: submissions.length - active.length,
    spent: [...spent].map(([currency, amount]) => ({ currency, amount })),
    averageDays: turnarounds.length ? Math.round(turnarounds.reduce((sum, days) => sum + days, 0) / turnarounds.length) : null,
  };
};

// Days a submission has been out, or how far past its expected date it is.
export const submissionTiming = (item: CardSubmission, today: string) => {
  if (item.status === 'Returned' || !item.sentDate) return null;
  const out = daysBetween(item.sentDate, today);
  const overdue = item.expectedDate && item.expectedDate < today ? daysBetween(item.expectedDate, today) : 0;
  return { out, overdue };
};

export const nextStatus = (status: SubmissionStatus): SubmissionStatus | null => {
  const index = SUBMISSION_STATUSES.indexOf(status);
  return index >= 0 && index < SUBMISSION_STATUSES.length - 1 ? SUBMISSION_STATUSES[index + 1] : null;
};

// --- Scam watch -----------------------------------------------------------------------------

const comparable = (value: string) => value.toLowerCase().replace(/^@/, '').replace(/^https?:\/\/(www\.)?/, '').replace(/[\s\-+()]/g, '');

// Your flagged sellers matching a name, handle, profile link or phone number.
export const matchSellers = (sellers: FlaggedSeller[], query: string): FlaggedSeller[] => {
  const needle = comparable(query.trim());
  if (needle.length < 3) return [];
  return sellers.filter(seller => [seller.name, seller.handle, seller.contact].some(field => field && comparable(field).includes(needle)));
};
