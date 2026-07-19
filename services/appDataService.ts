import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BillingCycle, CardBenefit, CardPointTransaction, CardPointsActivityType, Expense, Friend, Income, IncomeCycle, InvestmentHolding, InvestmentKind, InvestmentTransaction, InvestmentValuation, PaymentCard, PaymentCardKind, PokerMttBankrollTransaction, PokerMttTournament, Subscription, UserProfile } from '../types';
import { calculateNextPayment } from './storageService';

const PROFILE_STORAGE_KEY = 'subtrack_profile';
const SUBSCRIPTIONS_STORAGE_KEY = 'subtrack_data_v1';
const INCOMES_STORAGE_KEY = 'subtrack_income_v1';
const EXPENSES_STORAGE_KEY = 'subtrack_expenses_v1';
const CARDS_STORAGE_KEY = 'subtrack_cards_v1';
const CARD_POINTS_STORAGE_KEY = 'subtrack_card_points_v1';
const FRIENDS_STORAGE_KEY = 'subtrack_friends_v1';
const INVESTMENTS_STORAGE_KEY = 'subtrack_investments_v1';
const INVESTMENT_TRANSACTIONS_STORAGE_KEY = 'subtrack_investment_transactions_v1';
const POKER_MTT_TOURNAMENTS_STORAGE_KEY = 'subtrack_poker_mtt_tournaments_v1';
const POKER_MTT_BANKROLL_STORAGE_KEY = 'subtrack_poker_mtt_bankroll_v1';

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
  incomes: Income[];
  expenses: Expense[];
  investments: InvestmentHolding[];
  investmentValuations: InvestmentValuation[];
  investmentTransactions: InvestmentTransaction[];
  pokerMttTournaments: PokerMttTournament[];
  pokerMttBankrollTransactions: PokerMttBankrollTransaction[];
  cards: PaymentCard[];
  cardPointTransactions: CardPointTransaction[];
  cardBenefits: CardBenefit[];
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

type IncomeRow = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  income_type: 'Active' | 'Passive';
  income_mode?: 'Recurring' | 'One-time' | null;
  income_cycle: IncomeCycle | null;
  income_date?: string | null;
  first_income_date: string;
  next_income_date: string;
  cancellation_date: string | null;
  category: string;
  color: string;
  notes: string | null;
  status: 'Active' | 'Past';
};

type ExpenseRow = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  expense_date: string | null;
  category: string;
  color: string;
  notes: string | null;
  linked_card_id?: string | null;
  linked_card_name?: string | null;
};

type PaymentCardRow = {
  id: string;
  user_id: string;
  name: string;
  type: PaymentCard['type'];
  last_4_digits: string;
  color: string;
  kind?: PaymentCardKind | null;
  credit_limit?: number | null;
  current_debt?: number | null;
  current_balance?: number | null;
  budget?: number | null;
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

type CardBenefitRow = {
  id: string;
  card_name: string;
  issuer: string | null;
  category: string;
  title: string;
  description: string;
  earn_rate_mpd: number | null;
  krisflyer_transfer_ratio: number | null;
  sort_order: number | null;
  is_highlighted: boolean | null;
};

type CardPointTransactionRow = {
  id: string;
  user_id: string;
  card_id: string;
  activity_date: string;
  points_delta: number;
  activity_type: CardPointsActivityType;
  source: string | null;
  notes: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
};

type InvestmentPortfolioCurrentRow = {
  id: string;
  user_id: string;
  name: string;
  kind: InvestmentKind;
  symbol: string | null;
  units: number;
  average_cost: number;
  current_price: number;
  currency: string;
  color: string;
  notes: string | null;
  acquired_date: string | null;
  source: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  latest_valuation_date: string | null;
};

type InvestmentPortfolioPositionRow = {
  id: string;
  user_id: string;
  name: string;
  kind: InvestmentKind;
  symbol: string | null;
  units: number;
  average_cost: number;
  current_price: number;
  invested_cost: number;
  market_value: number;
  unrealized_pnl: number;
  currency: string;
  color: string;
  notes: string | null;
  acquired_date: string | null;
  source: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_trade_date: string | null;
};

type InvestmentValuationRow = {
  id: string;
  user_id: string;
  investment_id: string;
  valuation_date: string;
  price: number;
  market_value: number;
  currency: string;
  notes: string | null;
  created_at: string;
};

type InvestmentTransactionRow = {
  id: string;
  user_id: string;
  investment_id: string;
  transaction_type: 'Buy' | 'Sell' | 'Dividend' | 'Fee' | 'Transfer In' | 'Transfer Out' | 'Split';
  trade_date: string;
  units: number;
  price: number;
  fees: number;
  currency: string;
  notes: string | null;
  source: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
};

type PokerMttTournamentRow = {
  id: string;
  user_id: string;
  investment_id: string;
  tournament_date: string;
  tournament_name: string;
  placement: number | null;
  entries: number;
  buy_in_usd: number;
  cashout_usd: number;
  bounty_usd: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type PokerMttBankrollTransactionRow = {
  id: string;
  user_id: string;
  investment_id: string;
  event_date: string;
  event_type: 'Deposit' | 'Withdrawal' | 'Adjustment';
  amount_usd: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (!sessionError && sessionData.session?.user?.id) {
    return sessionData.session.user.id;
  }

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

const mapIncomeRow = (row: IncomeRow): Income => ({
  id: row.id,
  name: row.name,
  amount: Number(row.amount),
  currency: row.currency,
  incomeType: row.income_type,
  incomeMode: row.income_mode === 'One-time' ? 'One-time' : 'Recurring',
  incomeCycle: row.income_cycle || 'Monthly',
  firstIncomeDate: toIsoDate(row.first_income_date || row.income_date || row.next_income_date),
  nextIncomeDate: toIsoDate(row.next_income_date || row.income_date || row.first_income_date),
  incomeDate: row.income_date ? toIsoDate(row.income_date) : undefined,
  cancellationDate: row.cancellation_date ? toIsoDate(row.cancellation_date) : undefined,
  category: row.category,
  color: row.color,
  notes: row.notes || undefined,
  status: row.status,
});

const mapIncomeToRow = (income: Income, userId: string): IncomeRow => ({
  id: income.id,
  user_id: userId,
  name: income.name,
  amount: income.amount,
  currency: income.currency,
  income_type: income.incomeType,
  income_mode: income.incomeMode ?? 'Recurring',
  income_cycle: income.incomeMode === 'One-time' ? null : income.incomeCycle,
  income_date: income.incomeMode === 'One-time' ? dateOnly(income.incomeDate || income.firstIncomeDate) : null,
  first_income_date: dateOnly(income.firstIncomeDate),
  next_income_date: dateOnly(income.nextIncomeDate),
  cancellation_date: income.cancellationDate ? dateOnly(income.cancellationDate) : null,
  category: income.category,
  color: income.color,
  notes: income.notes || null,
  status: income.status,
});

const mapExpenseRow = (row: ExpenseRow): Expense => ({
  id: row.id,
  name: row.name,
  amount: Number(row.amount),
  currency: row.currency,
  expenseDate: toIsoDate(row.expense_date || new Date().toISOString()),
  category: row.category,
  color: row.color,
  notes: row.notes || undefined,
  linkedCardId: row.linked_card_id || undefined,
  linkedCardName: row.linked_card_name || undefined,
});

const mapExpenseToRow = (expense: Expense, userId: string): ExpenseRow => ({
  id: expense.id,
  user_id: userId,
  name: expense.name,
  amount: expense.amount,
  currency: expense.currency,
  expense_date: dateOnly(expense.expenseDate),
  category: expense.category,
  color: expense.color,
  notes: expense.notes || null,
  linked_card_id: expense.linkedCardId || null,
  linked_card_name: expense.linkedCardName || null,
});

const mapCardRow = (row: PaymentCardRow): PaymentCard => ({
  id: row.id,
  name: row.name,
  type: row.type,
  kind:
    row.kind ??
    (row.credit_limit != null || row.current_debt != null
      ? 'Credit'
      : 'Debit'),
  last4Digits: row.last_4_digits,
  color: row.color,
  creditLimit: row.credit_limit ?? row.budget ?? undefined,
  currentDebt: row.current_debt ?? undefined,
  currentBalance: row.current_balance ?? (row.budget != null && row.credit_limit == null ? row.budget : undefined),
});

const mapCardToRow = (card: PaymentCard, userId: string): PaymentCardRow => ({
  id: card.id,
  user_id: userId,
  name: card.name,
  type: card.type,
  last_4_digits: card.last4Digits,
  color: card.color,
  kind: card.kind,
  credit_limit: card.kind === 'Credit' ? (card.creditLimit ?? null) : null,
  current_debt: card.kind === 'Credit' ? (card.currentDebt ?? 0) : null,
  current_balance: card.kind !== 'Credit' ? (card.currentBalance ?? 0) : null,
  budget: card.kind === 'Credit' ? (card.creditLimit ?? null) : (card.currentBalance ?? null),
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

const mapCardBenefitRow = (row: CardBenefitRow): CardBenefit => ({
  id: row.id,
  cardName: row.card_name,
  issuer: row.issuer || undefined,
  category: row.category,
  title: row.title,
  description: row.description,
  earnRateMpd: row.earn_rate_mpd == null ? undefined : Number(row.earn_rate_mpd),
  krisflyerTransferRatio: row.krisflyer_transfer_ratio == null ? undefined : Number(row.krisflyer_transfer_ratio),
  sortOrder: row.sort_order ?? undefined,
  isHighlighted: row.is_highlighted ?? undefined,
});

const mapCardPointTransactionRow = (row: CardPointTransactionRow): CardPointTransaction => ({
  id: row.id,
  cardId: row.card_id,
  activityDate: toIsoDate(row.activity_date),
  pointsDelta: Number(row.points_delta),
  activityType: row.activity_type,
  source: row.source || undefined,
  notes: row.notes || undefined,
  externalId: row.external_id || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapInvestmentRow = (row: InvestmentPortfolioPositionRow | InvestmentPortfolioCurrentRow): InvestmentHolding => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  symbol: row.symbol || undefined,
  units: Number(row.units),
  averageCost: Number(row.average_cost),
  currentPrice: Number(row.current_price),
  currency: row.currency,
  color: row.color,
  notes: row.notes || undefined,
  acquiredDate: row.acquired_date || undefined,
  source: row.source || undefined,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapInvestmentToRow = (holding: InvestmentHolding, userId: string) => ({
  id: holding.id,
  user_id: userId,
  name: holding.name,
  kind: holding.kind,
  symbol: holding.symbol || null,
  units: holding.units,
  average_cost: holding.averageCost,
  current_price: holding.currentPrice,
  currency: holding.currency,
  color: holding.color,
  notes: holding.notes || null,
  acquired_date: holding.acquiredDate || null,
  source: holding.source || null,
  is_active: holding.isActive,
});

const mapInvestmentValuationRow = (row: InvestmentValuationRow): InvestmentValuation => ({
  id: row.id,
  investmentId: row.investment_id,
  valuationDate: row.valuation_date,
  price: Number(row.price),
  marketValue: Number(row.market_value),
  currency: row.currency,
  notes: row.notes || undefined,
  createdAt: row.created_at,
});

const mapInvestmentTransactionRow = (row: InvestmentTransactionRow): InvestmentTransaction => ({
  id: row.id,
  investmentId: row.investment_id,
  transactionType: row.transaction_type,
  tradeDate: row.trade_date,
  units: Number(row.units),
  price: Number(row.price),
  fees: Number(row.fees),
  currency: row.currency,
  notes: row.notes || undefined,
  source: row.source || undefined,
  externalId: row.external_id || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPokerMttTournamentRow = (row: PokerMttTournamentRow): PokerMttTournament => ({
  id: row.id,
  investmentId: row.investment_id,
  tournamentDate: row.tournament_date,
  tournamentName: row.tournament_name,
  placement: row.placement ?? undefined,
  entries: Number(row.entries),
  buyInUsd: Number(row.buy_in_usd),
  cashoutUsd: Number(row.cashout_usd),
  bountyUsd: Number(row.bounty_usd),
  notes: row.notes || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPokerMttBankrollTransactionRow = (row: PokerMttBankrollTransactionRow): PokerMttBankrollTransaction => ({
  id: row.id,
  investmentId: row.investment_id,
  eventDate: row.event_date,
  eventType: row.event_type,
  amountUsd: Number(row.amount_usd),
  notes: row.notes || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const loadLocalData = (): LoadedAppData => {
  const profile = readLocalJson<UserProfile>(PROFILE_STORAGE_KEY, createDefaultProfile());
  const normalizedProfile = {
    ...profile,
    currency: normalizeCurrency(profile.currency),
  };
  const subscriptions = readLocalJson<Subscription[]>(SUBSCRIPTIONS_STORAGE_KEY, []);
  const incomes = readLocalJson<Income[]>(INCOMES_STORAGE_KEY, []).map(income => ({
    ...income,
    incomeMode: income.incomeMode ?? 'Recurring',
    incomeDate: income.incomeDate || income.firstIncomeDate,
  }));
  const expenses = readLocalJson<Expense[]>(EXPENSES_STORAGE_KEY, []);
  const investments = readLocalJson<InvestmentHolding[]>(INVESTMENTS_STORAGE_KEY, []);
  const investmentTransactions = readLocalJson<InvestmentTransaction[]>(INVESTMENT_TRANSACTIONS_STORAGE_KEY, []);
  const pokerMttTournaments = readLocalJson<PokerMttTournament[]>(POKER_MTT_TOURNAMENTS_STORAGE_KEY, []);
  const pokerMttBankrollTransactions = readLocalJson<PokerMttBankrollTransaction[]>(POKER_MTT_BANKROLL_STORAGE_KEY, []);
  const cards = readLocalJson<PaymentCard[]>(CARDS_STORAGE_KEY, []);
  const cardPointTransactions = readLocalJson<CardPointTransaction[]>(CARD_POINTS_STORAGE_KEY, []);
  const friends = readLocalJson<Friend[]>(FRIENDS_STORAGE_KEY, normalizedProfile.friends || []);

  return {
    profile: { ...normalizedProfile, friends },
    subscriptions,
    incomes,
    expenses,
    investments,
    investmentValuations: [],
    investmentTransactions,
    pokerMttTournaments,
    pokerMttBankrollTransactions,
    cards,
    cardPointTransactions,
    cardBenefits: [],
    friends,
    userId: null,
  };
};

export const loadAppData = async (): Promise<LoadedAppData> => {
  if (!supabase) return loadLocalData();

  const userId = await getSupabaseUserId();
  if (!userId) return loadLocalData();

  const [profileResult, subsResult, incomesResult, expensesResult, investmentsResult, valuationsResult, transactionsResult, pokerTournamentsResult, pokerBankrollResult, cardsResult, cardPointsResult, benefitsResult, friendsResult] = await Promise.all([
    supabase.from('profiles').select('id, name, photo_url, currency, notification_days').eq('id', userId).maybeSingle(),
    supabase.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('incomes').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('expenses').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('investment_portfolio_positions').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('investment_valuations').select('*').eq('user_id', userId).order('valuation_date', { ascending: true }),
    supabase.from('investment_transactions').select('*').eq('user_id', userId).order('trade_date', { ascending: true }),
    supabase.from('poker_mtt_tournaments').select('*').eq('user_id', userId).order('tournament_date', { ascending: true }),
    supabase.from('poker_mtt_bankroll_transactions').select('*').eq('user_id', userId).order('event_date', { ascending: true }),
    supabase.from('payment_cards').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('card_point_transactions').select('*').eq('user_id', userId).order('activity_date', { ascending: true }),
    supabase.from('card_benefits').select('*').order('sort_order', { ascending: true }),
    supabase.from('friendships').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
  ]);

  const friends = (friendsResult.data as FriendshipRow[] | null | undefined)?.map(mapFriendRow) ?? [];
  const profile = mapProfileRow(profileResult.data as ProfileRow | null, friends, true);
  const subscriptions = (subsResult.data as SubscriptionRow[] | null | undefined)?.map(mapSubscriptionRow) ?? [];
  const incomes = (incomesResult.data as IncomeRow[] | null | undefined)?.map(mapIncomeRow) ?? [];
  const expenses = (expensesResult.data as ExpenseRow[] | null | undefined)?.map(mapExpenseRow) ?? [];
  const investments = (investmentsResult.data as InvestmentPortfolioPositionRow[] | null | undefined)?.map(mapInvestmentRow) ?? [];
  const investmentValuations = (valuationsResult.data as InvestmentValuationRow[] | null | undefined)?.map(mapInvestmentValuationRow) ?? [];
  const investmentTransactions = (transactionsResult.data as InvestmentTransactionRow[] | null | undefined)?.map(mapInvestmentTransactionRow) ?? [];
  const pokerMttTournaments = (pokerTournamentsResult.data as PokerMttTournamentRow[] | null | undefined)?.map(mapPokerMttTournamentRow) ?? [];
  const pokerMttBankrollTransactions = (pokerBankrollResult.data as PokerMttBankrollTransactionRow[] | null | undefined)?.map(mapPokerMttBankrollTransactionRow) ?? [];
  const cards = (cardsResult.data as PaymentCardRow[] | null | undefined)?.map(mapCardRow) ?? [];
  const cardPointTransactions = (cardPointsResult.data as CardPointTransactionRow[] | null | undefined)?.map(mapCardPointTransactionRow) ?? [];
  const cardBenefits = (benefitsResult.data as CardBenefitRow[] | null | undefined)?.map(mapCardBenefitRow) ?? [];
  const cardLookup = new Map(cards.map(card => [card.id, card]));

  const hydratedSubscriptions = subscriptions.map(sub => {
    const linkedCard = sub.cardId ? cardLookup.get(sub.cardId) : undefined;
    return {
      ...sub,
      cardName: linkedCard?.name || sub.cardName || 'Cash',
      cardType: linkedCard?.type ?? sub.cardType,
    };
  });

  return {
    profile,
    subscriptions: hydratedSubscriptions,
    incomes,
    expenses,
    investments,
    investmentValuations,
    investmentTransactions,
    pokerMttTournaments,
    pokerMttBankrollTransactions,
    cards,
    cardPointTransactions,
    cardBenefits,
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

  if (subs.length === 0) return;

  const rows = subs.map(sub => mapSubscriptionToRow(sub, userId));
  await supabase.from('subscriptions').upsert(rows, { onConflict: 'id' });
};

export const saveIncomes = async (incomes: Income[]) => {
  writeLocalJson(INCOMES_STORAGE_KEY, incomes);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (incomes.length === 0) return;

  const rows = incomes.map(income => mapIncomeToRow(income, userId));
  await supabase.from('incomes').upsert(rows, { onConflict: 'id' });
};

export const saveExpenses = async (expenses: Expense[]) => {
  if (!supabase) {
    writeLocalJson(EXPENSES_STORAGE_KEY, expenses);
    return false;
  }

  const userId = await getSupabaseUserId();
  if (!userId) {
    console.warn('Skipping expense save because no Supabase user was found.');
    return false;
  }

  if (expenses.length === 0) return true;

  const rows = expenses.map(expense => mapExpenseToRow(expense, userId));
  const saveResult = await supabase.from('expenses').upsert(rows, { onConflict: 'id' });
  if (saveResult.error) {
    console.error('Failed to save expenses', saveResult.error, rows);
    return false;
  }

  return true;
};

export const saveInvestmentTransactions = async (transactions: InvestmentTransaction[]) => {
  writeLocalJson(INVESTMENT_TRANSACTIONS_STORAGE_KEY, transactions);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (transactions.length === 0) return;

  const rows = transactions.map(transaction => ({
    id: transaction.id,
    user_id: userId,
    investment_id: transaction.investmentId,
    transaction_type: transaction.transactionType,
    trade_date: dateOnly(transaction.tradeDate),
    units: transaction.units,
    price: transaction.price,
    fees: transaction.fees,
    currency: transaction.currency,
    notes: transaction.notes || null,
    source: transaction.source || null,
    external_id: transaction.externalId || null,
  }));

  await supabase.from('investment_transactions').upsert(rows, { onConflict: 'id' });
};

export const savePokerMttTournaments = async (tournaments: PokerMttTournament[]) => {
  writeLocalJson(POKER_MTT_TOURNAMENTS_STORAGE_KEY, tournaments);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (tournaments.length === 0) return;

  const existingResult = await supabase.from('poker_mtt_tournaments').select('id').eq('user_id', userId);
  if (!existingResult.error) {
    const nextIds = new Set(tournaments.map(tournament => tournament.id));
    const existingIds = (existingResult.data ?? []).map(row => row.id);
    const staleIds = existingIds.filter(id => !nextIds.has(id));
    if (staleIds.length > 0) {
      await supabase.from('poker_mtt_tournaments').delete().eq('user_id', userId).in('id', staleIds);
    }
  }

  const rows = tournaments.map(tournament => ({
    id: tournament.id,
    user_id: userId,
    investment_id: tournament.investmentId,
    tournament_date: dateOnly(tournament.tournamentDate),
    tournament_name: tournament.tournamentName,
    placement: tournament.placement ?? null,
    entries: tournament.entries,
    buy_in_usd: tournament.buyInUsd,
    cashout_usd: tournament.cashoutUsd,
    bounty_usd: tournament.bountyUsd,
    notes: tournament.notes || null,
  }));

  await supabase.from('poker_mtt_tournaments').upsert(rows, { onConflict: 'id' });
};

export const savePokerMttBankrollTransactions = async (events: PokerMttBankrollTransaction[]) => {
  writeLocalJson(POKER_MTT_BANKROLL_STORAGE_KEY, events);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (events.length === 0) return;

  const existingResult = await supabase.from('poker_mtt_bankroll_transactions').select('id').eq('user_id', userId);
  if (!existingResult.error) {
    const nextIds = new Set(events.map(event => event.id));
    const existingIds = (existingResult.data ?? []).map(row => row.id);
    const staleIds = existingIds.filter(id => !nextIds.has(id));
    if (staleIds.length > 0) {
      await supabase.from('poker_mtt_bankroll_transactions').delete().eq('user_id', userId).in('id', staleIds);
    }
  }

  const rows = events.map(event => ({
    id: event.id,
    user_id: userId,
    investment_id: event.investmentId,
    event_date: dateOnly(event.eventDate),
    event_type: event.eventType,
    amount_usd: event.amountUsd,
    notes: event.notes || null,
  }));

  await supabase.from('poker_mtt_bankroll_transactions').upsert(rows, { onConflict: 'id' });
};

export const saveInvestments = async (investments: InvestmentHolding[]) => {
  writeLocalJson(INVESTMENTS_STORAGE_KEY, investments);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (investments.length === 0) return;

  const rows = investments.map(holding => mapInvestmentToRow(holding, userId));
  await supabase.from('investments').upsert(rows, { onConflict: 'id' });
};

export const saveCards = async (cards: PaymentCard[]) => {
  writeLocalJson(CARDS_STORAGE_KEY, cards);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (cards.length === 0) return;

  const rows = cards.map(card => mapCardToRow(card, userId));
  await supabase.from('payment_cards').upsert(rows, { onConflict: 'id' });
};

export const saveCardPointTransactions = async (transactions: CardPointTransaction[]) => {
  writeLocalJson(CARD_POINTS_STORAGE_KEY, transactions);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (transactions.length === 0) {
    await supabase.from('card_point_transactions').delete().eq('user_id', userId);
    return;
  }

  const existingResult = await supabase
    .from('card_point_transactions')
    .select('id')
    .eq('user_id', userId);

  if (existingResult.error) {
    console.error('Failed to read existing card point transactions', existingResult.error);
  } else {
    const nextIds = new Set(transactions.map(transaction => transaction.id));
    const existingIds = (existingResult.data ?? []).map(row => row.id);
    const staleIds = existingIds.filter(id => !nextIds.has(id));

    if (staleIds.length > 0) {
      await supabase.from('card_point_transactions').delete().eq('user_id', userId).in('id', staleIds);
    }
  }

  const rows = transactions.map(transaction => ({
    id: transaction.id,
    user_id: userId,
    card_id: transaction.cardId,
    activity_date: dateOnly(transaction.activityDate),
    points_delta: transaction.pointsDelta,
    activity_type: transaction.activityType,
    source: transaction.source || null,
    notes: transaction.notes || null,
    external_id: transaction.externalId || null,
  }));

  await supabase.from('card_point_transactions').upsert(rows, { onConflict: 'id' });
};

export const saveFriends = async (friends: Friend[]) => {
  writeLocalJson(FRIENDS_STORAGE_KEY, friends);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (friends.length === 0) return;

  const rows = friends.map(friend => mapFriendToRow(friend, userId));
  await supabase.from('friendships').upsert(rows, { onConflict: 'id' });
};

export const clearStoredAppData = async () => {
  localStorage.removeItem(PROFILE_STORAGE_KEY);
  localStorage.removeItem(SUBSCRIPTIONS_STORAGE_KEY);
  localStorage.removeItem(INCOMES_STORAGE_KEY);
  localStorage.removeItem(EXPENSES_STORAGE_KEY);
  localStorage.removeItem(CARDS_STORAGE_KEY);
  localStorage.removeItem(CARD_POINTS_STORAGE_KEY);
  localStorage.removeItem(FRIENDS_STORAGE_KEY);
  localStorage.removeItem(INVESTMENTS_STORAGE_KEY);
  localStorage.removeItem(INVESTMENT_TRANSACTIONS_STORAGE_KEY);
  localStorage.removeItem(POKER_MTT_TOURNAMENTS_STORAGE_KEY);
  localStorage.removeItem(POKER_MTT_BANKROLL_STORAGE_KEY);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  await Promise.all([
    supabase.from('subscriptions').delete().eq('user_id', userId),
    supabase.from('incomes').delete().eq('user_id', userId),
    supabase.from('expenses').delete().eq('user_id', userId),
    supabase.from('investment_transactions').delete().eq('user_id', userId),
    supabase.from('poker_mtt_tournaments').delete().eq('user_id', userId),
    supabase.from('poker_mtt_bankroll_transactions').delete().eq('user_id', userId),
    supabase.from('payment_cards').delete().eq('user_id', userId),
    supabase.from('card_point_transactions').delete().eq('user_id', userId),
    supabase.from('friendships').delete().eq('user_id', userId),
    supabase.from('profiles').delete().eq('id', userId),
  ]);
};

export const calculateNextPaymentDate = calculateNextPayment;
