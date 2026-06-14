import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BillingCycle, Friend, PaymentCard, Subscription, UserProfile } from '../types';
import { calculateNextPayment } from './storageService';

const PROFILE_STORAGE_KEY = 'subtrack_profile';
const SUBSCRIPTIONS_STORAGE_KEY = 'subtrack_data_v1';
const CARDS_STORAGE_KEY = 'subtrack_cards_v1';
const FRIENDS_STORAGE_KEY = 'subtrack_friends_v1';

const normalizeCurrency = (currency?: string | null) => {
  if (!currency || currency === 'USD') return 'SGD';
  return currency;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
const supabase: SupabaseClient | null = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

export const isSupabaseConfigured = () => Boolean(supabase);
export const getSupabaseClient = () => supabase;

export const getSupabaseSession = async () => {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session ?? null;
};

export const signInWithPassword = async (email: string, password: string) => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase.auth.signInWithPassword({ email, password });
};

export const signUpWithPassword = async (email: string, password: string) => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase.auth.signUp({ email, password });
};

export const signOut = async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
};

export interface LoadedAppData {
  profile: UserProfile;
  subscriptions: Subscription[];
  cards: PaymentCard[];
  friends: Friend[];
  userId: string | null;
}

type ProfileRow = {
  id: string;
  name: string | null;
  photo_url: string | null;
  currency: string | null;
  notification_days: number | null;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  name: string;
  price: number;
  currency: string;
  billing_cycle: BillingCycle;
  first_payment_date: string;
  next_payment_date: string;
  cancellation_date: string | null;
  category: string;
  card_id: string | null;
  color: string;
  logo_url: string | null;
  notes: string | null;
  status: 'Active' | 'Past';
  shared_with: string[] | null;
  payment_history: Record<string, Record<string, boolean>> | null;
};

type PaymentCardRow = {
  id: string;
  user_id: string;
  name: string;
  type: PaymentCard['type'];
  last_4_digits: string;
  color: string;
  budget: number | null;
  created_at?: string;
};

type FriendshipRow = {
  id: string;
  user_id: string;
  friend_name: string;
  friend_email: string;
  friend_avatar: string | null;
  created_at?: string;
};

const readLocalJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeLocalJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const dateOnly = (value: string) => value.split('T')[0];

const toIsoDate = (value: string) => {
  if (!value) return value;
  return value.includes('T') ? value : `${value}T00:00:00.000Z`;
};

export const createDefaultProfile = (): UserProfile => ({
  name: '',
  currency: 'SGD',
  isLoggedIn: false,
  friends: [],
  notificationDays: 3,
});

const getSupabaseUserId = async (): Promise<string | null> => {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
};

const mapProfileRow = (row: ProfileRow | null, friends: Friend[], isLoggedIn: boolean): UserProfile => ({
  name: row?.name || '',
  photoUrl: row?.photo_url || undefined,
  currency: normalizeCurrency(row?.currency),
  isLoggedIn,
  friends,
  notificationDays: row?.notification_days ?? 3,
});

const mapSubscriptionRow = (row: SubscriptionRow): Subscription => ({
  id: row.id,
  name: row.name,
  price: Number(row.price),
  currency: row.currency,
  billingCycle: row.billing_cycle,
  firstPaymentDate: toIsoDate(row.first_payment_date),
  nextPaymentDate: toIsoDate(row.next_payment_date),
  cancellationDate: row.cancellation_date ? toIsoDate(row.cancellation_date) : undefined,
  category: row.category,
  cardId: row.card_id || undefined,
  cardName: row.card_id ? '' : 'Cash',
  cardType: undefined,
  color: row.color,
  logoUrl: row.logo_url || undefined,
  notes: row.notes || undefined,
  sharedCount: row.shared_with?.length ? row.shared_with.length + 1 : 1,
  sharedWith: row.shared_with || [],
  status: row.status,
  paymentHistory: row.payment_history || {},
});

const mapSubscriptionToRow = (sub: Subscription, userId: string): SubscriptionRow => ({
  id: sub.id,
  user_id: userId,
  name: sub.name,
  price: sub.price,
  currency: sub.currency,
  billing_cycle: sub.billingCycle,
  first_payment_date: dateOnly(sub.firstPaymentDate),
  next_payment_date: dateOnly(sub.nextPaymentDate),
  cancellation_date: sub.cancellationDate ? dateOnly(sub.cancellationDate) : null,
  category: sub.category,
  card_id: sub.cardId || null,
  color: sub.color,
  logo_url: sub.logoUrl || null,
  notes: sub.notes || null,
  status: sub.status,
  shared_with: sub.sharedWith || [],
  payment_history: sub.paymentHistory || {},
});

const mapCardRow = (row: PaymentCardRow): PaymentCard => ({
  id: row.id,
  name: row.name,
  type: row.type,
  last4Digits: row.last_4_digits,
  color: row.color,
  budget: row.budget ?? undefined,
});

const mapCardToRow = (card: PaymentCard, userId: string): PaymentCardRow => ({
  id: card.id,
  user_id: userId,
  name: card.name,
  type: card.type,
  last_4_digits: card.last4Digits,
  color: card.color,
  budget: card.budget ?? null,
});

const mapFriendRow = (row: FriendshipRow): Friend => ({
  id: row.id,
  name: row.friend_name,
  email: row.friend_email,
  avatar: row.friend_avatar || undefined,
});

const mapFriendToRow = (friend: Friend, userId: string): FriendshipRow => ({
  id: friend.id,
  user_id: userId,
  friend_name: friend.name,
  friend_email: friend.email,
  friend_avatar: friend.avatar || null,
});

const loadLocalData = (): LoadedAppData => {
  const profile = readLocalJson<UserProfile>(PROFILE_STORAGE_KEY, createDefaultProfile());
  const normalizedProfile = {
    ...profile,
    currency: normalizeCurrency(profile.currency),
  };
  const subscriptions = readLocalJson<Subscription[]>(SUBSCRIPTIONS_STORAGE_KEY, []);
  const cards = readLocalJson<PaymentCard[]>(CARDS_STORAGE_KEY, []);
  const friends = readLocalJson<Friend[]>(FRIENDS_STORAGE_KEY, normalizedProfile.friends || []);

  return {
    profile: { ...normalizedProfile, friends },
    subscriptions,
    cards,
    friends,
    userId: null,
  };
};

export const loadAppData = async (): Promise<LoadedAppData> => {
  if (!supabase) return loadLocalData();

  const userId = await getSupabaseUserId();
  if (!userId) return loadLocalData();

  const [profileResult, subsResult, cardsResult, friendsResult] = await Promise.all([
    supabase.from('profiles').select('id, name, photo_url, currency, notification_days').eq('id', userId).maybeSingle(),
    supabase.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('payment_cards').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('friendships').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
  ]);

  const friends = (friendsResult.data as FriendshipRow[] | null | undefined)?.map(mapFriendRow) ?? [];
  const profile = mapProfileRow(profileResult.data as ProfileRow | null, friends, true);
  const subscriptions = (subsResult.data as SubscriptionRow[] | null | undefined)?.map(mapSubscriptionRow) ?? [];
  const cards = (cardsResult.data as PaymentCardRow[] | null | undefined)?.map(mapCardRow) ?? [];
  const cardLookup = new Map(cards.map(card => [card.id, card]));

  const hydratedSubscriptions = subscriptions.map(sub => {
    const linkedCard = sub.cardId ? cardLookup.get(sub.cardId) : undefined;
    return {
      ...sub,
      cardName: linkedCard?.name || sub.cardName || 'Cash',
      cardType: linkedCard?.type ?? sub.cardType,
    };
  });

  if (!profileResult.data || profileResult.data.currency === 'USD') {
    await supabase
      .from('profiles')
      .upsert({
        id: userId,
        name: profile.name || '',
        photo_url: profile.photoUrl || null,
        currency: profile.currency,
        notification_days: profile.notificationDays,
      });
  }

  return {
    profile,
    subscriptions: hydratedSubscriptions,
    cards,
    friends,
    userId,
  };
};

export const saveProfile = async (profile: UserProfile) => {
  writeLocalJson(PROFILE_STORAGE_KEY, profile);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  await supabase.from('profiles').upsert({
    id: userId,
    name: profile.name,
    photo_url: profile.photoUrl || null,
    currency: profile.currency,
    notification_days: profile.notificationDays,
  });
};

export const saveSubscriptions = async (subs: Subscription[]) => {
  writeLocalJson(SUBSCRIPTIONS_STORAGE_KEY, subs);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  await supabase.from('subscriptions').delete().eq('user_id', userId);
  if (subs.length === 0) return;

  const rows = subs.map(sub => mapSubscriptionToRow(sub, userId));
  await supabase.from('subscriptions').insert(rows);
};

export const saveCards = async (cards: PaymentCard[]) => {
  writeLocalJson(CARDS_STORAGE_KEY, cards);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  await supabase.from('payment_cards').delete().eq('user_id', userId);
  if (cards.length === 0) return;

  const rows = cards.map(card => mapCardToRow(card, userId));
  await supabase.from('payment_cards').insert(rows);
};

export const saveFriends = async (friends: Friend[]) => {
  writeLocalJson(FRIENDS_STORAGE_KEY, friends);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  await supabase.from('friendships').delete().eq('user_id', userId);
  if (friends.length === 0) return;

  const rows = friends.map(friend => mapFriendToRow(friend, userId));
  await supabase.from('friendships').insert(rows);
};

export const clearStoredAppData = async () => {
  localStorage.removeItem(PROFILE_STORAGE_KEY);
  localStorage.removeItem(SUBSCRIPTIONS_STORAGE_KEY);
  localStorage.removeItem(CARDS_STORAGE_KEY);
  localStorage.removeItem(FRIENDS_STORAGE_KEY);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  await Promise.all([
    supabase.from('subscriptions').delete().eq('user_id', userId),
    supabase.from('payment_cards').delete().eq('user_id', userId),
    supabase.from('friendships').delete().eq('user_id', userId),
    supabase.from('profiles').delete().eq('id', userId),
  ]);
};

export const calculateNextPaymentDate = calculateNextPayment;
