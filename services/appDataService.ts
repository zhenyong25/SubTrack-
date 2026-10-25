import { SAVINGS_STORAGE_KEY } from './savingsGoalMath';
import { REMINDER_STORAGE_PREFIX } from './reminderPreferenceService';
import { normalizeTags, type SearchKind } from './globalSearchService';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AccountStatement, AccountStatementKind, BillingCycle, BudgetPlan, CardBenefit, CardPointTransaction, CardPointsActivityType, CardRewardType, CashbackCategory, CashbackProgram, CashbackTier, CashAccount, CashAccountType, CashBalanceEntry, Expense, Friend, Income, IncomeCycle, InvestmentAccount, InvestmentAccountType, InvestmentHolding, InvestmentKind, InvestmentTransaction, InvestmentValuation, ParsedStatementTransaction, PaymentCard, PaymentCardKind, CryptoChain, CryptoExchange, CryptoSource, PokerCashSession, PokerMttBankrollTransaction, PokerMttTournament, RetirementBalanceEntry, RetirementFund, RetirementScheme, Loan, LoanEntryType, LoanInterestMethod, LoanKind, LoanPayment, StatementTransaction, StatementTransactionDirection, Subscription, UserProfile } from '../types';
import { calculateNextPayment } from './storageService';

const PROFILE_STORAGE_KEY = 'subtrack_profile';
const SUBSCRIPTIONS_STORAGE_KEY = 'subtrack_data_v1';
const INCOMES_STORAGE_KEY = 'subtrack_income_v1';
const EXPENSES_STORAGE_KEY = 'subtrack_expenses_v1';
const BUDGETS_STORAGE_KEY = 'subtrack_budgets_v1';
const CARDS_STORAGE_KEY = 'subtrack_cards_v1';
const CARD_POINTS_STORAGE_KEY = 'subtrack_card_points_v1';
const CASHBACK_PROGRAMS_STORAGE_KEY = 'subtrack_cashback_programs_v1';
const FRIENDS_STORAGE_KEY = 'subtrack_friends_v1';
const INVESTMENTS_STORAGE_KEY = 'subtrack_investments_v1';
const INVESTMENT_TRANSACTIONS_STORAGE_KEY = 'subtrack_investment_transactions_v1';
const INVESTMENT_ACCOUNTS_STORAGE_KEY = 'subtrack_investment_accounts_v1';
const POKER_MTT_TOURNAMENTS_STORAGE_KEY = 'subtrack_poker_mtt_tournaments_v1';
const POKER_MTT_BANKROLL_STORAGE_KEY = 'subtrack_poker_mtt_bankroll_v1';
const POKER_CASH_SESSIONS_STORAGE_KEY = 'subtrack_poker_cash_sessions_v1';
const CRYPTO_SOURCES_STORAGE_KEY = 'subtrack_crypto_sources_v1';
const CASH_ACCOUNTS_STORAGE_KEY = 'subtrack_cash_accounts_v1';
const CASH_BALANCE_ENTRIES_STORAGE_KEY = 'subtrack_cash_balance_entries_v1';
const INVESTMENT_VALUATIONS_STORAGE_KEY = 'subtrack_investment_valuations_v1';
const RETIREMENT_FUNDS_STORAGE_KEY = 'subtrack_retirement_funds_v1';
const RETIREMENT_ENTRIES_STORAGE_KEY = 'subtrack_retirement_entries_v1';
const LOANS_STORAGE_KEY = 'subtrack_loans_v1';
const LOAN_PAYMENTS_STORAGE_KEY = 'subtrack_loan_payments_v1';

const normalizeCurrency = (currency?: string | null) => {
  if (!currency || currency === 'USD') return 'SGD';
  return currency;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

const STATEMENTS_BUCKET = 'account-statements';

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
  return supabase.auth.signUp({
    email,
    password,
    // Confirmation emails are usually opened on another device (e.g. a phone), where a
    // localhost link can't be reached - so prefer the deployed URL when one is configured.
    options: { emailRedirectTo: (import.meta.env.VITE_APP_URL as string | undefined) || window.location.origin },
  });
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
  budgetPlans: BudgetPlan[];
  investments: InvestmentHolding[];
  investmentValuations: InvestmentValuation[];
  investmentTransactions: InvestmentTransaction[];
  investmentAccounts: InvestmentAccount[];
  loans: Loan[];
  loanPayments: LoanPayment[];
  pokerMttTournaments: PokerMttTournament[];
  pokerMttBankrollTransactions: PokerMttBankrollTransaction[];
  pokerCashSessions: PokerCashSession[];
  cryptoSources: CryptoSource[];
  cashAccounts: CashAccount[];
  cashBalanceEntries: CashBalanceEntry[];
  retirementFunds: RetirementFund[];
  retirementEntries: RetirementBalanceEntry[];
  cards: PaymentCard[];
  cardPointTransactions: CardPointTransaction[];
  cardBenefits: CardBenefit[];
  cashbackPrograms: CashbackProgram[];
  accountStatements: AccountStatement[];
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
  tags?: string[] | null;
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
  service_id?: string | null;
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
  tags?: string[] | null;
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
  cashback_category_id?: string | null;
};

type BudgetPlanRow = {
  user_id: string;
  month: string;
  total_limit: number;
  category_limits: Record<string, number> | null;
  updated_at?: string;
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
  expiry_month?: number | null;
  expiry_year?: number | null;
  reward_type?: CardRewardType | null;
  statement_day?: number | null;
  created_at?: string;
};

type CashbackProgramRow = {
  id: string;
  user_id: string;
  card_id: string;
  name: string;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
};

type CashbackCategoryRow = {
  id: string;
  user_id: string;
  program_id: string;
  name: string;
  min_spend: number;
  monthly_cap: number | null;
  cap_group: string | null;
  group_monthly_cap: number | null;
  is_default: boolean;
  sort_order: number;
};

type CashbackTierRow = {
  id: string;
  user_id: string;
  program_id: string;
  tier_no: number;
  min_total_spend: number;
  max_total_spend: number | null;
};

type CashbackTierRateRow = {
  tier_id: string;
  category_id: string;
  user_id: string;
  rate_pct: number;
};

type AccountStatementRow = {
  id: string;
  user_id: string;
  account_kind: AccountStatementKind;
  cash_account_id: string | null;
  card_id: string | null;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  statement_period: string | null;
  uploaded_at: string;
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
  position_side?: 'Long' | 'Short' | null;
  account_id?: string | null;
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
  position_side?: 'Long' | 'Short' | null;
  account_id?: string | null;
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
  tags?: string[] | null;
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
  realized_pnl?: number | null;
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
  is_bounty?: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CryptoSourceRow = {
  id: string;
  user_id: string;
  kind: 'wallet' | 'exchange';
  label: string;
  address: string | null;
  chains: string[] | null;
  exchange: string | null;
  custom_tokens: { chain: string; contract: string }[] | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

type PokerCashSessionRow = {
  id: string;
  user_id: string;
  investment_id: string;
  session_date: string;
  game: string | null;
  venue: string | null;
  buy_in_usd: number;
  cash_out_usd: number;
  duration_hours: number | null;
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
  currency?: string | null;
  amount?: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CashAccountRow = {
  id: string;
  user_id: string;
  name: string;
  account_number?: string | null;
  institution: string;
  account_type: CashAccountType;
  country: string;
  currency: string;
  color: string;
  notes: string | null;
  is_archived: boolean | null;
  created_at?: string;
  updated_at?: string;
};

type InvestmentAccountRow = {
  id: string;
  user_id: string;
  name: string;
  broker: string | null;
  account_type: InvestmentAccountType;
  currency: string;
  color: string;
  notes: string | null;
  is_archived: boolean | null;
  created_at?: string;
  updated_at?: string;
};

type RetirementFundRow = {
  id: string;
  user_id: string;
  scheme: RetirementScheme;
  name: string;
  currency: string;
  notes: string | null;
  is_archived: boolean | null;
  created_at?: string;
  updated_at?: string;
};

type RetirementBalanceEntryRow = {
  id: string;
  user_id: string;
  fund_id: string;
  sub_account: string;
  balance_date: string;
  balance: number;
  created_at?: string;
};

type CashBalanceEntryRow = {
  id: string;
  user_id: string;
  account_id: string;
  balance_date: string;
  balance: number;
  notes: string | null;
  created_at?: string;
};

type LoanRow = {
  id: string;
  user_id: string;
  name: string;
  lender: string | null;
  kind: LoanKind;
  currency: string;
  principal: number;
  annual_rate: number;
  interest_method: LoanInterestMethod;
  term_months: number | null;
  start_date: string;
  instalment: number | null;
  payment_day: number | null;
  opening_balance: number | null;
  opening_balance_date: string | null;
  card_id?: string | null; // absent until the updated supabase_loans_schema.sql is run
  color: string;
  notes: string | null;
  is_archived: boolean | null;
  created_at?: string;
  updated_at?: string;
};

type LoanPaymentRow = {
  id: string;
  user_id: string;
  loan_id: string;
  entry_type?: LoanEntryType | null; // absent until the updated supabase_loans_schema.sql is run
  payment_date: string;
  amount: number;
  notes: string | null;
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

const mapLoanRow = (row: LoanRow): Loan => ({
  id: row.id,
  name: row.name,
  lender: row.lender || undefined,
  kind: row.kind,
  currency: row.currency,
  principal: Number(row.principal),
  annualRate: Number(row.annual_rate),
  interestMethod: row.interest_method,
  termMonths: row.term_months ?? undefined,
  startDate: dateOnly(row.start_date),
  instalment: row.instalment == null ? undefined : Number(row.instalment),
  paymentDay: row.payment_day ?? undefined,
  openingBalance: row.opening_balance == null ? undefined : Number(row.opening_balance),
  openingBalanceDate: row.opening_balance_date ? dateOnly(row.opening_balance_date) : undefined,
  cardId: row.card_id || undefined,
  color: row.color,
  notes: row.notes || undefined,
  isArchived: row.is_archived ?? false,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapLoanToRow = (loan: Loan, userId: string) => ({
  id: loan.id,
  user_id: userId,
  name: loan.name,
  lender: loan.lender || null,
  kind: loan.kind,
  currency: loan.currency,
  principal: loan.principal,
  annual_rate: loan.annualRate,
  interest_method: loan.interestMethod,
  term_months: loan.termMonths ?? null,
  start_date: dateOnly(loan.startDate),
  instalment: loan.instalment ?? null,
  payment_day: loan.paymentDay ?? null,
  opening_balance: loan.openingBalance ?? null,
  opening_balance_date: loan.openingBalanceDate ? dateOnly(loan.openingBalanceDate) : null,
  card_id: loan.cardId || null,
  color: loan.color,
  notes: loan.notes || null,
  is_archived: loan.isArchived ?? false,
});

const mapLoanPaymentRow = (row: LoanPaymentRow): LoanPayment => ({
  id: row.id,
  loanId: row.loan_id,
  entryType: row.entry_type === 'statement' ? 'statement' : 'payment',
  paymentDate: dateOnly(row.payment_date),
  amount: Number(row.amount),
  notes: row.notes || undefined,
  createdAt: row.created_at,
});

const mapLoanPaymentToRow = (payment: LoanPayment, userId: string) => ({
  id: payment.id,
  user_id: userId,
  loan_id: payment.loanId,
  entry_type: payment.entryType ?? 'payment',
  payment_date: dateOnly(payment.paymentDate),
  amount: payment.amount,
  notes: payment.notes || null,
});

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
  tags: row.tags == null ? undefined : normalizeTags(row.tags),
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
  serviceId: row.service_id || (row.logo_url?.startsWith('catalog:') ? row.logo_url.slice(8) : undefined),
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
  logo_url: sub.logoUrl || (sub.serviceId ? `catalog:${sub.serviceId}` : null),
  service_id: sub.serviceId || null,
  notes: sub.notes || null,
  ...(sub.tags === undefined ? {} : { tags: normalizeTags(sub.tags) }),
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
  tags: row.tags == null ? undefined : normalizeTags(row.tags),
  name: row.name,
  amount: Number(row.amount),
  currency: row.currency,
  expenseDate: toIsoDate(row.expense_date || new Date().toISOString()),
  category: row.category,
  color: row.color,
  notes: row.notes || undefined,
  linkedCardId: row.linked_card_id || undefined,
  linkedCardName: row.linked_card_name || undefined,
  cashbackCategoryId: row.cashback_category_id || undefined,
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
  ...(expense.tags === undefined ? {} : { tags: normalizeTags(expense.tags) }),
  linked_card_id: expense.linkedCardId || null,
  linked_card_name: expense.linkedCardName || null,
  cashback_category_id: expense.linkedCardId ? expense.cashbackCategoryId || null : null,
});

const mapBudgetPlanRow = (row: BudgetPlanRow): BudgetPlan => ({
  month: row.month.slice(0, 7),
  totalLimit: Number(row.total_limit),
  categoryLimits: row.category_limits || {},
  updatedAt: row.updated_at,
});

const mapBudgetPlanToRow = (plan: BudgetPlan, userId: string): BudgetPlanRow => ({
  user_id: userId,
  month: `${plan.month}-01`,
  total_limit: plan.totalLimit,
  category_limits: plan.categoryLimits,
  updated_at: new Date().toISOString(),
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
  expiryMonth: row.expiry_month ?? undefined,
  expiryYear: row.expiry_year ?? undefined,
  rewardType: row.reward_type ?? undefined,
  statementDay: row.statement_day ?? undefined,
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
  expiry_month: card.expiryMonth ?? null,
  expiry_year: card.expiryYear ?? null,
  reward_type: card.kind === 'Credit' ? card.rewardType ?? 'Miles' : 'Miles',
  statement_day: card.kind === 'Credit' ? card.statementDay ?? null : null,
});

const isMissingColumnError = (error: { code?: string; message?: string } | null, column: string) =>
  Boolean(error && ['PGRST204', '42703'].includes(error.code ?? '') && error.message?.includes(column));

const mapCashbackProgramRows = (
  programRows: CashbackProgramRow[],
  categoryRows: CashbackCategoryRow[],
  tierRows: CashbackTierRow[],
  rateRows: CashbackTierRateRow[],
): CashbackProgram[] =>
  programRows.map(program => {
    const categories: CashbackCategory[] = categoryRows
      .filter(row => row.program_id === program.id)
      .map(row => ({
        id: row.id,
        name: row.name,
        minSpend: Number(row.min_spend),
        monthlyCap: row.monthly_cap == null ? undefined : Number(row.monthly_cap),
        capGroup: row.cap_group || undefined,
        groupMonthlyCap: row.group_monthly_cap == null ? undefined : Number(row.group_monthly_cap),
        isDefault: row.is_default || undefined,
        sortOrder: row.sort_order,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const tiers: CashbackTier[] = tierRows
      .filter(row => row.program_id === program.id)
      .map(row => ({
        id: row.id,
        tierNo: row.tier_no,
        minTotalSpend: Number(row.min_total_spend),
        maxTotalSpend: row.max_total_spend == null ? undefined : Number(row.max_total_spend),
        rates: Object.fromEntries(
          rateRows.filter(rate => rate.tier_id === row.id).map(rate => [rate.category_id, Number(rate.rate_pct)]),
        ),
      }))
      .sort((a, b) => a.tierNo - b.tierNo);

    return {
      id: program.id,
      cardId: program.card_id,
      name: program.name,
      currency: program.currency,
      effectiveFrom: toIsoDate(program.effective_from).slice(0, 10),
      effectiveTo: program.effective_to ? toIsoDate(program.effective_to).slice(0, 10) : undefined,
      notes: program.notes || undefined,
      categories,
      tiers,
    };
  });

const mapAccountStatementRow = (row: AccountStatementRow): AccountStatement => ({
  id: row.id,
  accountKind: row.account_kind,
  cashAccountId: row.cash_account_id ?? undefined,
  cardId: row.card_id ?? undefined,
  fileName: row.file_name,
  storagePath: row.storage_path,
  fileSize: row.file_size ?? undefined,
  statementPeriod: row.statement_period ?? undefined,
  uploadedAt: row.uploaded_at,
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
  positionSide: row.position_side === 'Short' ? 'Short' : 'Long',
  accountId: row.account_id || undefined,
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
  position_side: holding.positionSide === 'Short' ? 'Short' : 'Long',
  account_id: holding.accountId || null,
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

const mapInvestmentValuationToRow = (valuation: InvestmentValuation, userId: string) => ({
  id: valuation.id,
  user_id: userId,
  investment_id: valuation.investmentId,
  valuation_date: dateOnly(valuation.valuationDate),
  price: valuation.price,
  market_value: valuation.marketValue,
  currency: valuation.currency,
  notes: valuation.notes || null,
});

const mapInvestmentTransactionRow = (row: InvestmentTransactionRow): InvestmentTransaction => ({
  id: row.id,
  tags: row.tags == null ? undefined : normalizeTags(row.tags),
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
  realizedPnl: row.realized_pnl == null ? undefined : Number(row.realized_pnl),
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
  isBounty: row.is_bounty ?? undefined,
  notes: row.notes || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPokerCashSessionRow = (row: PokerCashSessionRow): PokerCashSession => ({
  id: row.id,
  investmentId: row.investment_id,
  sessionDate: dateOnly(row.session_date),
  game: row.game || undefined,
  venue: row.venue || undefined,
  buyInUsd: Number(row.buy_in_usd),
  cashOutUsd: Number(row.cash_out_usd),
  durationHours: row.duration_hours == null ? undefined : Number(row.duration_hours),
  notes: row.notes || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPokerCashSessionToRow = (session: PokerCashSession, userId: string) => ({
  id: session.id,
  user_id: userId,
  investment_id: session.investmentId,
  session_date: dateOnly(session.sessionDate),
  game: session.game || null,
  venue: session.venue || null,
  buy_in_usd: session.buyInUsd,
  cash_out_usd: session.cashOutUsd,
  duration_hours: session.durationHours ?? null,
  notes: session.notes || null,
});

const mapCryptoSourceRow = (row: CryptoSourceRow): CryptoSource => ({
  id: row.id,
  kind: row.kind,
  label: row.label,
  address: row.address || undefined,
  chains: (row.chains || undefined) as CryptoChain[] | undefined,
  exchange: (row.exchange || undefined) as CryptoExchange | undefined,
  customTokens: (row.custom_tokens || undefined) as CryptoSource['customTokens'],
  color: row.color || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Only what identifies the source - exchange API keys are never part of this row.
const mapCryptoSourceToRow = (source: CryptoSource, userId: string) => ({
  id: source.id,
  user_id: userId,
  kind: source.kind,
  label: source.label,
  address: source.address || null,
  chains: source.chains || null,
  exchange: source.exchange || null,
  custom_tokens: source.customTokens || null,
  color: source.color || null,
});

const mapPokerMttBankrollTransactionRow = (row: PokerMttBankrollTransactionRow): PokerMttBankrollTransaction => ({
  id: row.id,
  investmentId: row.investment_id,
  eventDate: row.event_date,
  eventType: row.event_type,
  amountUsd: Number(row.amount_usd),
  currency: row.currency && row.currency !== 'USD' ? row.currency : undefined,
  amount: row.currency && row.currency !== 'USD' && row.amount != null ? Number(row.amount) : undefined,
  notes: row.notes || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapCashAccountRow = (row: CashAccountRow): CashAccount => ({
  id: row.id,
  name: row.name,
  accountNumber: row.account_number || undefined,
  institution: row.institution,
  accountType: row.account_type,
  country: row.country,
  currency: row.currency,
  color: row.color,
  notes: row.notes || undefined,
  isArchived: row.is_archived ?? false,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapCashAccountToRow = (account: CashAccount, userId: string) => ({
  id: account.id,
  user_id: userId,
  name: account.name,
  account_number: account.accountNumber?.trim() || null,
  institution: account.institution,
  account_type: account.accountType,
  country: account.country,
  currency: account.currency,
  color: account.color,
  notes: account.notes || null,
  is_archived: account.isArchived ?? false,
});

const mapCashBalanceEntryRow = (row: CashBalanceEntryRow): CashBalanceEntry => ({
  id: row.id,
  accountId: row.account_id,
  balanceDate: toIsoDate(row.balance_date),
  balance: Number(row.balance),
  notes: row.notes || undefined,
  createdAt: row.created_at,
});

const mapCashBalanceEntryToRow = (entry: CashBalanceEntry, userId: string) => ({
  id: entry.id,
  user_id: userId,
  account_id: entry.accountId,
  balance_date: dateOnly(entry.balanceDate),
  balance: entry.balance,
  notes: entry.notes || null,
});

const mapInvestmentAccountRow = (row: InvestmentAccountRow): InvestmentAccount => ({
  id: row.id,
  name: row.name,
  broker: row.broker || undefined,
  accountType: row.account_type === 'Cash' ? 'Cash' : 'Margin',
  currency: row.currency,
  color: row.color,
  notes: row.notes || undefined,
  isArchived: row.is_archived ?? false,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapInvestmentAccountToRow = (account: InvestmentAccount, userId: string) => ({
  id: account.id,
  user_id: userId,
  name: account.name,
  broker: account.broker || null,
  account_type: account.accountType,
  currency: account.currency,
  color: account.color,
  notes: account.notes || null,
  is_archived: account.isArchived ?? false,
});

const mapRetirementFundRow = (row: RetirementFundRow): RetirementFund => ({
  id: row.id,
  scheme: row.scheme,
  name: row.name,
  currency: row.currency,
  notes: row.notes || undefined,
  isArchived: row.is_archived ?? false,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapRetirementFundToRow = (fund: RetirementFund, userId: string) => ({
  id: fund.id,
  user_id: userId,
  scheme: fund.scheme,
  name: fund.name,
  currency: fund.currency,
  notes: fund.notes || null,
  is_archived: fund.isArchived ?? false,
});

const mapRetirementEntryRow = (row: RetirementBalanceEntryRow): RetirementBalanceEntry => ({
  id: row.id,
  fundId: row.fund_id,
  subAccount: row.sub_account,
  balanceDate: toIsoDate(row.balance_date),
  balance: Number(row.balance),
  createdAt: row.created_at,
});

const mapRetirementEntryToRow = (entry: RetirementBalanceEntry, userId: string) => ({
  id: entry.id,
  user_id: userId,
  fund_id: entry.fundId,
  sub_account: entry.subAccount,
  balance_date: dateOnly(entry.balanceDate),
  balance: entry.balance,
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
  const budgetPlans = readLocalJson<BudgetPlan[]>(BUDGETS_STORAGE_KEY, []);
  const investments = readLocalJson<InvestmentHolding[]>(INVESTMENTS_STORAGE_KEY, []);
  const investmentTransactions = readLocalJson<InvestmentTransaction[]>(INVESTMENT_TRANSACTIONS_STORAGE_KEY, []);
  const pokerMttTournaments = readLocalJson<PokerMttTournament[]>(POKER_MTT_TOURNAMENTS_STORAGE_KEY, []);
  const pokerMttBankrollTransactions = readLocalJson<PokerMttBankrollTransaction[]>(POKER_MTT_BANKROLL_STORAGE_KEY, []);
  const pokerCashSessions = readLocalJson<PokerCashSession[]>(POKER_CASH_SESSIONS_STORAGE_KEY, []);
  const cryptoSources = readLocalJson<CryptoSource[]>(CRYPTO_SOURCES_STORAGE_KEY, []);
  const cashAccounts = readLocalJson<CashAccount[]>(CASH_ACCOUNTS_STORAGE_KEY, []);
  const cashBalanceEntries = readLocalJson<CashBalanceEntry[]>(CASH_BALANCE_ENTRIES_STORAGE_KEY, []);
  const retirementFunds = readLocalJson<RetirementFund[]>(RETIREMENT_FUNDS_STORAGE_KEY, []);
  const retirementEntries = readLocalJson<RetirementBalanceEntry[]>(RETIREMENT_ENTRIES_STORAGE_KEY, []);
  const cards = readLocalJson<PaymentCard[]>(CARDS_STORAGE_KEY, []);
  const cardPointTransactions = readLocalJson<CardPointTransaction[]>(CARD_POINTS_STORAGE_KEY, []);
  const cashbackPrograms = readLocalJson<CashbackProgram[]>(CASHBACK_PROGRAMS_STORAGE_KEY, []);
  const friends = readLocalJson<Friend[]>(FRIENDS_STORAGE_KEY, normalizedProfile.friends || []);

  return {
    profile: { ...normalizedProfile, friends },
    subscriptions,
    incomes,
    expenses,
    budgetPlans,
    investments,
    investmentValuations: readLocalJson<InvestmentValuation[]>(INVESTMENT_VALUATIONS_STORAGE_KEY, []),
    investmentTransactions,
    investmentAccounts: readLocalJson<InvestmentAccount[]>(INVESTMENT_ACCOUNTS_STORAGE_KEY, []),
    loans: readLocalJson<Loan[]>(LOANS_STORAGE_KEY, []),
    loanPayments: readLocalJson<LoanPayment[]>(LOAN_PAYMENTS_STORAGE_KEY, []),
    pokerMttTournaments,
    pokerMttBankrollTransactions,
    pokerCashSessions,
    cryptoSources,
    cashAccounts,
    cashBalanceEntries,
    retirementFunds,
    retirementEntries,
    cards,
    cardPointTransactions,
    cardBenefits: [],
    cashbackPrograms,
    accountStatements: [],
    friends,
    userId: null,
  };
};

// Supabase's API returns at most 1,000 rows per request (the project's "max rows" setting), and
// silently drops the rest. Tables that keep growing - expenses, transactions, balance logs - would
// then lose their NEWEST rows after a reload (they're ordered oldest-first), so read them in pages.
const SUPABASE_PAGE_SIZE = 1000;

const selectAllRows = async (table: string, userId: string, orderColumn: string, ascending = true) => {
  const rows: any[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase!
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order(orderColumn, { ascending })
      .order('id', { ascending: true }) // stable tie-break so pages never skip or repeat rows
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < SUPABASE_PAGE_SIZE) return { data: rows, error: null };
  }
};

export const loadAppData = async (): Promise<LoadedAppData> => {
  if (!supabase) return loadLocalData();

  const userId = await getSupabaseUserId();
  if (!userId) return loadLocalData();

  const [profileResult, subsResult, incomesResult, expensesResult, budgetsResult, investmentsResult, valuationsResult, transactionsResult, pokerTournamentsResult, pokerBankrollResult, cashAccountsResult, cashBalanceEntriesResult, retirementFundsResult, retirementEntriesResult, cardsResult, cardPointsResult, benefitsResult, accountStatementsResult, friendsResult, cashbackProgramsResult, cashbackCategoriesResult, cashbackTiersResult, cashbackRatesResult, investmentAccountsResult] = await Promise.all([
    supabase.from('profiles').select('id, name, photo_url, currency, notification_days').eq('id', userId).maybeSingle(),
    selectAllRows('subscriptions', userId, 'created_at', true),
    selectAllRows('incomes', userId, 'created_at', true),
    selectAllRows('expenses', userId, 'created_at', true),
    supabase.from('budget_plans').select('*').eq('user_id', userId).order('month', { ascending: true }),
    supabase.from('investment_portfolio_positions').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    selectAllRows('investment_valuations', userId, 'valuation_date', true),
    selectAllRows('investment_transactions', userId, 'trade_date', true),
    supabase.from('poker_mtt_tournaments').select('*').eq('user_id', userId).order('tournament_date', { ascending: true }),
    supabase.from('poker_mtt_bankroll_transactions').select('*').eq('user_id', userId).order('event_date', { ascending: true }),
    supabase.from('cash_accounts').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    selectAllRows('cash_balance_entries', userId, 'balance_date', true),
    supabase.from('retirement_funds').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    selectAllRows('retirement_balance_entries', userId, 'balance_date', true),
    supabase.from('payment_cards').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    selectAllRows('card_point_transactions', userId, 'activity_date', true),
    supabase.from('card_benefits').select('*').order('sort_order', { ascending: true }),
    supabase.from('account_statements').select('*').eq('user_id', userId).order('uploaded_at', { ascending: false }),
    supabase.from('friendships').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('cashback_programs').select('*').eq('user_id', userId).order('effective_from', { ascending: true }),
    supabase.from('cashback_categories').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
    supabase.from('cashback_tiers').select('*').eq('user_id', userId).order('tier_no', { ascending: true }),
    supabase.from('cashback_tier_rates').select('*').eq('user_id', userId),
    supabase.from('investment_accounts').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
  ]);

  const friends = (friendsResult.data as FriendshipRow[] | null | undefined)?.map(mapFriendRow) ?? [];
  const profile = mapProfileRow(profileResult.data as ProfileRow | null, friends, true);
  const subscriptions = (subsResult.data as SubscriptionRow[] | null | undefined)?.map(mapSubscriptionRow) ?? [];
  const incomes = (incomesResult.data as IncomeRow[] | null | undefined)?.map(mapIncomeRow) ?? [];
  const expenses = (expensesResult.data as ExpenseRow[] | null | undefined)?.map(mapExpenseRow) ?? [];
  const remoteBudgetPlans = (budgetsResult.data as BudgetPlanRow[] | null | undefined)?.map(mapBudgetPlanRow) ?? [];
  const budgetPlans = remoteBudgetPlans.length > 0
    ? remoteBudgetPlans
    : readLocalJson<BudgetPlan[]>(BUDGETS_STORAGE_KEY, []);
  const investments = (investmentsResult.data as InvestmentPortfolioPositionRow[] | null | undefined)?.map(mapInvestmentRow) ?? [];
  const investmentValuations = (valuationsResult.data as InvestmentValuationRow[] | null | undefined)?.map(mapInvestmentValuationRow) ?? [];
  const investmentTransactions = (transactionsResult.data as InvestmentTransactionRow[] | null | undefined)?.map(mapInvestmentTransactionRow) ?? [];
  // Same fallback as the retirement tables below: if supabase_investment_accounts_schema.sql
  // hasn't been run, keep the accounts saved on this device instead of wiping them.
  const investmentAccounts = investmentAccountsResult.error
    ? readLocalJson<InvestmentAccount[]>(INVESTMENT_ACCOUNTS_STORAGE_KEY, [])
    : (investmentAccountsResult.data as InvestmentAccountRow[] | null | undefined)?.map(mapInvestmentAccountRow) ?? [];
  const pokerMttTournaments = (pokerTournamentsResult.data as PokerMttTournamentRow[] | null | undefined)?.map(mapPokerMttTournamentRow) ?? [];
  const pokerMttBankrollTransactions = (pokerBankrollResult.data as PokerMttBankrollTransactionRow[] | null | undefined)?.map(mapPokerMttBankrollTransactionRow) ?? [];
  // Cash sessions have their own table (supabase_poker_schema.sql); until it exists, keep the
  // sessions saved on this device rather than showing none.
  const pokerCashResult = await selectAllRows('poker_cash_sessions', userId, 'session_date', true);
  const pokerCashSessions = pokerCashResult.error
    ? readLocalJson<PokerCashSession[]>(POKER_CASH_SESSIONS_STORAGE_KEY, [])
    : (pokerCashResult.data as PokerCashSessionRow[] | null | undefined)?.map(mapPokerCashSessionRow) ?? [];
  // Crypto wallets/exchanges have their own table (supabase_crypto_schema.sql); until it exists,
  // keep the ones saved on this device.
  const cryptoResult = await selectAllRows('crypto_sources', userId, 'created_at', true);
  const cryptoSources = cryptoResult.error
    ? readLocalJson<CryptoSource[]>(CRYPTO_SOURCES_STORAGE_KEY, [])
    : (cryptoResult.data as CryptoSourceRow[] | null | undefined)?.map(mapCryptoSourceRow) ?? [];
  const cashAccounts = (cashAccountsResult.data as CashAccountRow[] | null | undefined)?.map(mapCashAccountRow) ?? [];
  const cashBalanceEntries = (cashBalanceEntriesResult.data as CashBalanceEntryRow[] | null | undefined)?.map(mapCashBalanceEntryRow) ?? [];
  // If the retirement tables don't exist yet (SQL not run) the queries error - keep whatever was
  // saved locally instead of showing an empty list that would then overwrite it.
  const retirementTablesMissing = Boolean(retirementFundsResult.error || retirementEntriesResult.error);
  const retirementFunds = retirementTablesMissing
    ? readLocalJson<RetirementFund[]>(RETIREMENT_FUNDS_STORAGE_KEY, [])
    : (retirementFundsResult.data as RetirementFundRow[] | null | undefined)?.map(mapRetirementFundRow) ?? [];
  const retirementEntries = retirementTablesMissing
    ? readLocalJson<RetirementBalanceEntry[]>(RETIREMENT_ENTRIES_STORAGE_KEY, [])
    : (retirementEntriesResult.data as RetirementBalanceEntryRow[] | null | undefined)?.map(mapRetirementEntryRow) ?? [];
  const cards = (cardsResult.data as PaymentCardRow[] | null | undefined)?.map(mapCardRow) ?? [];
  const cardPointTransactions = (cardPointsResult.data as CardPointTransactionRow[] | null | undefined)?.map(mapCardPointTransactionRow) ?? [];
  const cardBenefits = (benefitsResult.data as CardBenefitRow[] | null | undefined)?.map(mapCardBenefitRow) ?? [];
  const accountStatements = (accountStatementsResult.data as AccountStatementRow[] | null | undefined)?.map(mapAccountStatementRow) ?? [];
  // Missing tables (SQL not run yet) come back as errors with no data, which just means "no rule sets".
  // Fetched apart from the big batch above so the loan tables stay optional: until
  // supabase_loans_schema.sql is run they error, and the copy saved on this device is used instead.
  const [loansResult, loanPaymentsResult] = await Promise.all([
    supabase.from('loans').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    selectAllRows('loan_payments', userId, 'payment_date', true),
  ]);
  const loanTablesMissing = Boolean(loansResult.error || loanPaymentsResult.error);
  const loans = loanTablesMissing
    ? readLocalJson<Loan[]>(LOANS_STORAGE_KEY, [])
    : (loansResult.data as LoanRow[] | null | undefined)?.map(mapLoanRow) ?? [];
  const loanPayments = loanTablesMissing
    ? readLocalJson<LoanPayment[]>(LOAN_PAYMENTS_STORAGE_KEY, [])
    : (loanPaymentsResult.data as LoanPaymentRow[] | null | undefined)?.map(mapLoanPaymentRow) ?? [];
  const cashbackPrograms = mapCashbackProgramRows(
    (cashbackProgramsResult.data as CashbackProgramRow[] | null | undefined) ?? [],
    (cashbackCategoriesResult.data as CashbackCategoryRow[] | null | undefined) ?? [],
    (cashbackTiersResult.data as CashbackTierRow[] | null | undefined) ?? [],
    (cashbackRatesResult.data as CashbackTierRateRow[] | null | undefined) ?? [],
  );
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
    budgetPlans,
    investments,
    investmentValuations,
    investmentTransactions,
    investmentAccounts,
    loans,
    loanPayments,
    pokerMttTournaments,
    pokerMttBankrollTransactions,
    pokerCashSessions,
    cryptoSources,
    cashAccounts,
    cashBalanceEntries,
    retirementFunds,
    retirementEntries,
    cards,
    cardPointTransactions,
    cardBenefits,
    cashbackPrograms,
    accountStatements,
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

  const includeTags = subs.some(sub => sub.tags !== undefined);
  const rows = subs.map(sub => ({ ...mapSubscriptionToRow(sub, userId), ...(includeTags ? { tags: normalizeTags(sub.tags) } : {}) }));
  const { error } = await supabase.from('subscriptions').upsert(rows, { onConflict: 'id' });
  if (error && ['PGRST204', '42703'].includes(error.code) && error.message.includes('service_id')) {
    // Older databases retain the stable catalog reference in their existing logo column.
    await supabase.from('subscriptions').upsert(rows.map(({ service_id, ...row }) => row), { onConflict: 'id' });
  }
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

let lastSaveError: string | null = null;
// The database's reason for the most recent failed save, so toasts can show it instead of a bare "failed".
export const getLastSaveError = () => lastSaveError;

const EXPENSE_UPSERT_CHUNK = 200;

// `expenses` is the full list (kept in localStorage when there's no Supabase). `changed` is what
// actually needs writing remotely - only the rows that were added or edited. Re-sending every
// expense on every save made each save slower and riskier as the list grew, and one bad row
// anywhere in it would make every later save fail.
export const saveExpenses = async (expenses: Expense[], changed: Expense[] = expenses) => {
  lastSaveError = null;
  if (!supabase) {
    writeLocalJson(EXPENSES_STORAGE_KEY, expenses);
    return false;
  }

  const userId = await getSupabaseUserId();
  if (!userId) {
    console.warn('Skipping expense save because no Supabase user was found.');
    lastSaveError = 'not signed in - please sign in again';
    return false;
  }

  if (changed.length === 0) return true;

  for (let from = 0; from < changed.length; from += EXPENSE_UPSERT_CHUNK) {
    const chunk = changed.slice(from, from + EXPENSE_UPSERT_CHUNK);
    const includeTags = chunk.some(expense => expense.tags !== undefined);
    const rows = chunk.map(expense => ({ ...mapExpenseToRow(expense, userId), ...(includeTags ? { tags: normalizeTags(expense.tags) } : {}) }));
    let saveResult = await supabase.from('expenses').upsert(rows, { onConflict: 'id' });
    if (isMissingColumnError(saveResult.error, 'cashback_category_id')) {
      // supabase_cashback_schema.sql hasn't been run yet; keep saving everything else.
      saveResult = await supabase
        .from('expenses')
        .upsert(rows.map(({ cashback_category_id, ...row }) => row), { onConflict: 'id' });
    }
    if (saveResult.error) {
      console.error('Failed to save expenses', saveResult.error, rows);
      lastSaveError = saveResult.error.message;
      return false;
    }
  }

  return true;
};

// saveExpenses only ever upserts, so a deleted expense has to be removed remotely explicitly -
// otherwise it comes back on the next load.
export const deleteExpenseRecord = async (expenseId: string, remaining: Expense[]) => {
  lastSaveError = null;
  if (!supabase) {
    writeLocalJson(EXPENSES_STORAGE_KEY, remaining);
    return true;
  }

  const userId = await getSupabaseUserId();
  if (!userId) {
    lastSaveError = 'not signed in - please sign in again';
    return false;
  }

  const { error } = await supabase.from('expenses').delete().eq('user_id', userId).eq('id', expenseId);
  if (error) {
    console.error('Failed to delete expense', error);
    lastSaveError = error.message;
    return false;
  }
  return true;
};

export const saveBudgetPlans = async (plans: BudgetPlan[]) => {
  writeLocalJson(BUDGETS_STORAGE_KEY, plans);

  if (!supabase) return true;
  const userId = await getSupabaseUserId();
  if (!userId) {
    console.warn('Budget plans were saved locally, but no Supabase user was found.');
    return false;
  }
  if (plans.length === 0) return true;

  const rows = plans.map(plan => mapBudgetPlanToRow(plan, userId));
  const { error } = await supabase.from('budget_plans').upsert(rows, { onConflict: 'user_id,month' });
  if (error) {
    console.warn('Budget plans were saved locally but could not be synced.', error.message);
    return false;
  }
  return true;
};

export const deleteInvestmentTransaction = async (transactionId: string) => {
  if (supabase) {
    const userId = await getSupabaseUserId();
    if (!userId) throw new Error('Please sign in again to delete this entry.');

    const { data, error } = await supabase.from('investment_transactions')
      .delete().eq('user_id', userId).eq('id', transactionId).select('id');
    if (error) throw new Error('Could not delete this entry. Please try again.');
    if (!data?.some(row => row.id === transactionId)) {
      throw new Error('The entry could not be deleted. Refresh and try again.');
    }
  }

  const transactions = readLocalJson<InvestmentTransaction[]>(INVESTMENT_TRANSACTIONS_STORAGE_KEY, []);
  writeLocalJson(INVESTMENT_TRANSACTIONS_STORAGE_KEY, transactions.filter(transaction => transaction.id !== transactionId));
};

export const saveInvestmentTransactions = async (transactions: InvestmentTransaction[]): Promise<string | null> => {
  writeLocalJson(INVESTMENT_TRANSACTIONS_STORAGE_KEY, transactions);

  if (!supabase) return null;
  const userId = await getSupabaseUserId();
  if (!userId) return null;

  if (transactions.length === 0) return null;

  const includeTags = transactions.some(transaction => transaction.tags !== undefined);
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
    ...(includeTags ? { tags: normalizeTags(transaction.tags) } : {}),
    source: transaction.source || null,
    external_id: transaction.externalId || null,
    realized_pnl: transaction.realizedPnl ?? null,
  }));

  let { error } = await supabase.from('investment_transactions').upsert(rows, { onConflict: 'id' });
  if (isMissingColumnError(error, 'realized_pnl')) {
    // supabase_investment_realized_pnl.sql hasn't been run yet: save the trades without their
    // realized P&L rather than losing them, and say so.
    ({ error } = await supabase
      .from('investment_transactions')
      .upsert(rows.map(({ realized_pnl, ...row }) => row), { onConflict: 'id' }));
    if (!error) return 'realized profit/loss was not stored - run supabase_investment_realized_pnl.sql in Supabase';
  }
  if (error) console.error('Saving investment transactions failed', error);
  return error ? error.message : null;
};

export const savePokerMttTournaments = async (tournaments: PokerMttTournament[]): Promise<string | null> => {
  writeLocalJson(POKER_MTT_TOURNAMENTS_STORAGE_KEY, tournaments);

  if (!supabase) return null;
  const userId = await getSupabaseUserId();
  if (!userId) return null;
  if (tournaments.length === 0) return null;

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
    is_bounty: tournament.isBounty ?? false,
    notes: tournament.notes || null,
  }));

  let { error } = await supabase.from('poker_mtt_tournaments').upsert(rows, { onConflict: 'id' });
  if (error && isMissingColumnError(error, 'is_bounty')) {
    // Older schema: keep the results, drop only the bounty-event flag.
    ({ error } = await supabase.from('poker_mtt_tournaments').upsert(rows.map(({ is_bounty: _skip, ...row }) => row), { onConflict: 'id' }));
    if (!error) return 'saved, but the bounty-event flag needs the database update - run supabase_poker_schema.sql in Supabase';
  }
  if (error) console.error('Saving poker tournaments failed', error);
  return error ? error.message : null;
};

export const deletePokerMttTournament = async (tournamentId: string, remaining: PokerMttTournament[]): Promise<string | null> => {
  writeLocalJson(POKER_MTT_TOURNAMENTS_STORAGE_KEY, remaining);
  if (!supabase) return null;
  const userId = await getSupabaseUserId();
  if (!userId) return null;
  const { error } = await supabase.from('poker_mtt_tournaments').delete().eq('id', tournamentId).eq('user_id', userId);
  return error ? error.message : null;
};

export const deletePokerMttBankrollTransaction = async (eventId: string) => {
  if (supabase) {
    const userId = await getSupabaseUserId();
    if (!userId) throw new Error('Please sign in again to delete this bankroll entry.');

    const { data, error } = await supabase.from('poker_mtt_bankroll_transactions')
      .delete().eq('user_id', userId).eq('id', eventId).select('id');
    if (error) throw new Error('Could not delete this bankroll entry. Please try again.');
    if (!data?.some(row => row.id === eventId)) {
      throw new Error('The bankroll entry could not be deleted. Refresh and try again.');
    }
  }

  const events = readLocalJson<PokerMttBankrollTransaction[]>(POKER_MTT_BANKROLL_STORAGE_KEY, []);
  writeLocalJson(POKER_MTT_BANKROLL_STORAGE_KEY, events.filter(event => event.id !== eventId));
};

export const savePokerMttBankrollTransactions = async (events: PokerMttBankrollTransaction[]): Promise<string | null> => {
  writeLocalJson(POKER_MTT_BANKROLL_STORAGE_KEY, events);

  if (!supabase) return null;
  const userId = await getSupabaseUserId();
  if (!userId) return null;
  if (events.length === 0) return null;

  const rows = events.map(event => ({
    id: event.id,
    user_id: userId,
    investment_id: event.investmentId,
    event_date: dateOnly(event.eventDate),
    event_type: event.eventType,
    amount_usd: event.amountUsd,
    currency: event.currency || 'USD',
    amount: event.amount ?? event.amountUsd,
    notes: event.notes || null,
  }));

  let { error } = await supabase.from('poker_mtt_bankroll_transactions').upsert(rows, { onConflict: 'id' });
  if (error && (isMissingColumnError(error, 'currency') || isMissingColumnError(error, 'amount'))) {
    // Older schema: the USD amounts (all the maths needs) still save; only the original currency is lost.
    ({ error } = await supabase.from('poker_mtt_bankroll_transactions').upsert(rows.map(({ currency: _c, amount: _a, ...row }) => row), { onConflict: 'id' }));
    if (!error) return 'saved in USD, but the deposit currency needs the database update - run supabase_poker_schema.sql in Supabase';
  }
  if (error) console.error('Saving poker bankroll failed', error);
  return error ? error.message : null;
};

// Cash-game sessions, in their own table (supabase_poker_schema.sql).
export const savePokerCashSessions = async (sessions: PokerCashSession[]): Promise<string | null> => {
  writeLocalJson(POKER_CASH_SESSIONS_STORAGE_KEY, sessions);
  if (!supabase) return null;
  const userId = await getSupabaseUserId();
  if (!userId) return null;
  if (sessions.length === 0) return null;
  const { error } = await supabase.from('poker_cash_sessions').upsert(sessions.map(session => mapPokerCashSessionToRow(session, userId)), { onConflict: 'id' });
  if (error) console.error('Saving poker cash sessions failed', error);
  if (error && ['42P01', 'PGRST205'].includes(error.code || '')) return 'saved on this device - cash games need the database update: run supabase_poker_schema.sql in Supabase';
  return error ? error.message : null;
};

export const deletePokerCashSession = async (sessionId: string, remaining: PokerCashSession[]): Promise<string | null> => {
  writeLocalJson(POKER_CASH_SESSIONS_STORAGE_KEY, remaining);
  if (!supabase) return null;
  const userId = await getSupabaseUserId();
  if (!userId) return null;
  const { error } = await supabase.from('poker_cash_sessions').delete().eq('id', sessionId).eq('user_id', userId);
  return error ? error.message : null;
};

const CRYPTO_TABLE_MISSING = 'saved on this device - syncing wallets needs the database update: run supabase_crypto_schema.sql in Supabase';

export const saveCryptoSources = async (sources: CryptoSource[]): Promise<string | null> => {
  writeLocalJson(CRYPTO_SOURCES_STORAGE_KEY, sources);
  if (!supabase) return null;
  const userId = await getSupabaseUserId();
  if (!userId) return null;
  if (sources.length === 0) return null;
  const { error } = await supabase.from('crypto_sources').upsert(sources.map(source => mapCryptoSourceToRow(source, userId)), { onConflict: 'id' });
  if (error) console.error('Saving crypto sources failed', error);
  if (error && ['42P01', 'PGRST205'].includes(error.code || '')) return CRYPTO_TABLE_MISSING;
  return error ? error.message : null;
};

export const deleteCryptoSource = async (sourceId: string, remaining: CryptoSource[]): Promise<string | null> => {
  writeLocalJson(CRYPTO_SOURCES_STORAGE_KEY, remaining);
  if (!supabase) return null;
  const userId = await getSupabaseUserId();
  if (!userId) return null;
  const { error } = await supabase.from('crypto_sources').delete().eq('id', sourceId).eq('user_id', userId);
  if (error && ['42P01', 'PGRST205'].includes(error.code || '')) return null; // nothing synced to delete
  return error ? error.message : null;
};

// Returns the database's error message when the remote write fails (the data is still kept
// locally), or null on success / when there's no remote to write to - so callers can tell the
// user instead of the failure being silent.
export const saveInvestments = async (investments: InvestmentHolding[]): Promise<string | null> => {
  writeLocalJson(INVESTMENTS_STORAGE_KEY, investments);

  if (!supabase) return null;
  const userId = await getSupabaseUserId();
  if (!userId) return null;

  if (investments.length === 0) return null;

  const rows = investments.map(holding => mapInvestmentToRow(holding, userId));
  let { error } = await supabase.from('investments').upsert(rows, { onConflict: 'id' });
  if (isMissingColumnError(error, 'account_id')) {
    // supabase_investment_accounts_schema.sql hasn't been run yet: save the holdings without
    // their account tag rather than failing the whole save, and say so.
    ({ error } = await supabase
      .from('investments')
      .upsert(rows.map(({ account_id, ...row }) => row), { onConflict: 'id' }));
    if (!error && rows.some(row => row.account_id)) {
      return 'account tags were not stored - run supabase_investment_accounts_schema.sql in Supabase';
    }
  }
  if (error) console.error('Saving investments failed', error);
  return error ? error.message : null;
};

// Same replace-the-list approach as saveRetirementFunds. Deleting an account in Supabase sets
// its holdings' account_id to null (`on delete set null`), so they stay in the portfolio.
export const saveInvestmentAccounts = async (accounts: InvestmentAccount[]): Promise<string | null> => {
  writeLocalJson(INVESTMENT_ACCOUNTS_STORAGE_KEY, accounts);

  if (!supabase) return null;
  const userId = await getSupabaseUserId();
  if (!userId) return null;

  const existingResult = await supabase.from('investment_accounts').select('id').eq('user_id', userId);
  if (existingResult.error) {
    return 'accounts are only saved on this device - run supabase_investment_accounts_schema.sql in Supabase';
  }
  const nextIds = new Set(accounts.map(account => account.id));
  const staleIds = (existingResult.data ?? []).map(row => row.id).filter(id => !nextIds.has(id));
  if (staleIds.length > 0) {
    const { error } = await supabase.from('investment_accounts').delete().eq('user_id', userId).in('id', staleIds);
    if (error) return error.message;
  }

  if (accounts.length === 0) return null;
  const rows = accounts.map(account => mapInvestmentAccountToRow(account, userId));
  const { error } = await supabase.from('investment_accounts').upsert(rows, { onConflict: 'id' });
  if (error) console.error('Saving investment accounts failed', error);
  return error ? error.message : null;
};

// saveInvestments only upserts, so deleting a holding needs its own call - otherwise the
// removed row stays in Supabase and reappears on the next load. investment_transactions and
// investment_valuations reference investments with `on delete cascade`, so their rows are
// cleaned up server-side automatically; callers should also drop them from local state.
export const deleteInvestmentHolding = async (holdingId: string) => {
  if (supabase) {
    const userId = await getSupabaseUserId();
    if (!userId) throw new Error('Please sign in again to delete this holding.');

    const { data, error } = await supabase.from('investments')
      .delete().eq('user_id', userId).eq('id', holdingId).select('id');
    if (error) throw new Error('Could not delete this holding. Please try again.');
    if (!data?.some(row => row.id === holdingId)) {
      throw new Error('The holding could not be deleted. Refresh and try again.');
    }
  }

  const investments = readLocalJson<InvestmentHolding[]>(INVESTMENTS_STORAGE_KEY, []);
  writeLocalJson(INVESTMENTS_STORAGE_KEY, investments.filter(holding => holding.id !== holdingId));
};

export const saveCashAccounts = async (accounts: CashAccount[]) => {
  writeLocalJson(CASH_ACCOUNTS_STORAGE_KEY, accounts);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (accounts.length === 0) {
    await supabase.from('cash_accounts').delete().eq('user_id', userId);
    return;
  }

  const existingResult = await supabase.from('cash_accounts').select('id').eq('user_id', userId);
  if (!existingResult.error) {
    const nextIds = new Set(accounts.map(account => account.id));
    const existingIds = (existingResult.data ?? []).map(row => row.id);
    const staleIds = existingIds.filter(id => !nextIds.has(id));
    if (staleIds.length > 0) {
      await supabase.from('cash_accounts').delete().eq('user_id', userId).in('id', staleIds);
    }
  }

  const rows = accounts.map(account => mapCashAccountToRow(account, userId));
  await supabase.from('cash_accounts').upsert(rows, { onConflict: 'id' });
};

export const saveCashBalanceEntries = async (entries: CashBalanceEntry[]) => {
  writeLocalJson(CASH_BALANCE_ENTRIES_STORAGE_KEY, entries);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (entries.length === 0) {
    await supabase.from('cash_balance_entries').delete().eq('user_id', userId);
    return;
  }

  const existingResult = await supabase.from('cash_balance_entries').select('id').eq('user_id', userId);
  if (!existingResult.error) {
    const nextIds = new Set(entries.map(entry => entry.id));
    const existingIds = (existingResult.data ?? []).map(row => row.id);
    const staleIds = existingIds.filter(id => !nextIds.has(id));
    if (staleIds.length > 0) {
      await supabase.from('cash_balance_entries').delete().eq('user_id', userId).in('id', staleIds);
    }
  }

  const rows = entries.map(entry => mapCashBalanceEntryToRow(entry, userId));
  await supabase.from('cash_balance_entries').upsert(rows, { onConflict: 'id' });
};

export const saveInvestmentValuations = async (valuations: InvestmentValuation[]): Promise<string | null> => {
  writeLocalJson(INVESTMENT_VALUATIONS_STORAGE_KEY, valuations);

  if (!supabase) return null;
  const userId = await getSupabaseUserId();
  if (!userId) return null;

  if (valuations.length === 0) {
    await supabase.from('investment_valuations').delete().eq('user_id', userId);
    return null;
  }

  const existingResult = await supabase.from('investment_valuations').select('id').eq('user_id', userId);
  if (!existingResult.error) {
    const nextIds = new Set(valuations.map(valuation => valuation.id));
    const staleIds = (existingResult.data ?? []).map(row => row.id).filter(id => !nextIds.has(id));
    if (staleIds.length > 0) {
      await supabase.from('investment_valuations').delete().eq('user_id', userId).in('id', staleIds);
    }
  }

  const rows = valuations.map(valuation => mapInvestmentValuationToRow(valuation, userId));
  const { error } = await supabase.from('investment_valuations').upsert(rows, { onConflict: 'id' });
  if (error) console.error('Saving investment valuations failed', error);
  return error ? error.message : null;
};

// Same replace-the-list approach as saveRetirementFunds. Deleting a loan in Supabase also deletes
// its payments (on delete cascade). Returns the database's error message, if it refused the save.
const replaceUserRows = async <T,>(table: string, items: T[], toRow: (item: T, userId: string) => { id: string }): Promise<string | null> => {
  if (!supabase) return null;
  const userId = await getSupabaseUserId();
  if (!userId) return null;

  const existingResult = await supabase.from(table).select('id').eq('user_id', userId);
  if (existingResult.error) return existingResult.error.message;
  const rows = items.map(item => toRow(item, userId));
  const nextIds = new Set(rows.map(row => row.id));
  const staleIds = (existingResult.data ?? []).map(row => row.id).filter(id => !nextIds.has(id));
  if (staleIds.length > 0) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId).in('id', staleIds);
    if (error) return error.message;
  }
  if (rows.length === 0) return null;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) console.error(`Saving ${table} failed`, error);
  return error ? error.message : null;
};

export const saveLoans = async (loans: Loan[]) => {
  writeLocalJson(LOANS_STORAGE_KEY, loans);
  const failure = await replaceUserRows('loans', loans, mapLoanToRow);
  return failure?.includes('card_id')
    ? 'linking cards needs the database update - run supabase_loans_schema.sql again in Supabase'
    : failure;
};

export const saveLoanPayments = async (payments: LoanPayment[]) => {
  writeLocalJson(LOAN_PAYMENTS_STORAGE_KEY, payments);
  const failure = await replaceUserRows('loan_payments', payments, mapLoanPaymentToRow);
  return failure?.includes('entry_type')
    ? 'card statements need the database update - run supabase_loans_schema.sql again in Supabase'
    : failure;
};

export const saveRetirementFunds = async (funds: RetirementFund[]) => {
  writeLocalJson(RETIREMENT_FUNDS_STORAGE_KEY, funds);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (funds.length === 0) {
    await supabase.from('retirement_funds').delete().eq('user_id', userId);
    return;
  }

  const existingResult = await supabase.from('retirement_funds').select('id').eq('user_id', userId);
  if (!existingResult.error) {
    const nextIds = new Set(funds.map(fund => fund.id));
    const staleIds = (existingResult.data ?? []).map(row => row.id).filter(id => !nextIds.has(id));
    if (staleIds.length > 0) {
      await supabase.from('retirement_funds').delete().eq('user_id', userId).in('id', staleIds);
    }
  }

  const rows = funds.map(fund => mapRetirementFundToRow(fund, userId));
  await supabase.from('retirement_funds').upsert(rows, { onConflict: 'id' });
};

export const saveRetirementEntries = async (entries: RetirementBalanceEntry[]) => {
  writeLocalJson(RETIREMENT_ENTRIES_STORAGE_KEY, entries);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (entries.length === 0) {
    await supabase.from('retirement_balance_entries').delete().eq('user_id', userId);
    return;
  }

  const existingResult = await supabase.from('retirement_balance_entries').select('id').eq('user_id', userId);
  if (!existingResult.error) {
    const nextIds = new Set(entries.map(entry => entry.id));
    const staleIds = (existingResult.data ?? []).map(row => row.id).filter(id => !nextIds.has(id));
    if (staleIds.length > 0) {
      await supabase.from('retirement_balance_entries').delete().eq('user_id', userId).in('id', staleIds);
    }
  }

  const rows = entries.map(entry => mapRetirementEntryToRow(entry, userId));
  await supabase.from('retirement_balance_entries').upsert(rows, { onConflict: 'id' });
};

export const saveCards = async (cards: PaymentCard[]) => {
  writeLocalJson(CARDS_STORAGE_KEY, cards);

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  if (cards.length === 0) return;

  const rows = cards.map(card => mapCardToRow(card, userId));
  const { error } = await supabase.from('payment_cards').upsert(rows, { onConflict: 'id' });
  if (isMissingColumnError(error, 'reward_type') || isMissingColumnError(error, 'statement_day')) {
    // supabase_cashback_schema.sql hasn't been run yet; keep saving everything else.
    await supabase
      .from('payment_cards')
      .upsert(rows.map(({ reward_type, statement_day, ...row }) => row), { onConflict: 'id' });
  }
};

export const deletePaymentCard = async (cardId: string): Promise<void> => {
  if (supabase) {
    const userId = await getSupabaseUserId();
    if (!userId) throw new Error('Please sign in again to delete this card.');

    // Statement rows cascade with the card, but their files live in object storage and
    // need to be removed separately after the database deletion succeeds.
    const statementResult = await supabase
      .from('account_statements')
      .select('storage_path')
      .eq('user_id', userId)
      .eq('card_id', cardId);
    const statementPaths = statementResult.error
      ? []
      : (statementResult.data ?? []).map(row => row.storage_path).filter(Boolean);

    const { data, error } = await supabase
      .from('payment_cards')
      .delete()
      .eq('user_id', userId)
      .eq('id', cardId)
      .select('id');

    if (error) throw new Error('Could not delete this card. Please try again.');
    if (!data?.some(row => row.id === cardId)) {
      throw new Error('The card could not be deleted. Refresh and try again.');
    }

    if (statementPaths.length > 0) {
      const { error: storageError } = await supabase.storage.from(STATEMENTS_BUCKET).remove(statementPaths);
      if (storageError) console.warn('The card was deleted, but some statement files could not be removed.', storageError);
    }
  }

  const storedCards = readLocalJson<PaymentCard[]>(CARDS_STORAGE_KEY, []);
  writeLocalJson(CARDS_STORAGE_KEY, storedCards.filter(card => card.id !== cardId));
};

export const saveCashbackProgram = async (program: CashbackProgram): Promise<boolean> => {
  const stored = readLocalJson<CashbackProgram[]>(CASHBACK_PROGRAMS_STORAGE_KEY, []);
  writeLocalJson(
    CASHBACK_PROGRAMS_STORAGE_KEY,
    stored.some(item => item.id === program.id)
      ? stored.map(item => (item.id === program.id ? program : item))
      : [...stored, program],
  );

  if (!supabase) return true;
  const userId = await getSupabaseUserId();
  if (!userId) return false;

  const fail = (step: string, error: unknown) => {
    console.error(`Failed to save cashback program (${step})`, error);
    return false;
  };

  const programResult = await supabase.from('cashback_programs').upsert({
    id: program.id,
    user_id: userId,
    card_id: program.cardId,
    name: program.name,
    currency: program.currency,
    effective_from: dateOnly(program.effectiveFrom),
    effective_to: program.effectiveTo ? dateOnly(program.effectiveTo) : null,
    notes: program.notes || null,
  }, { onConflict: 'id' });
  if (programResult.error) return fail('program', programResult.error);

  // Drop categories/tiers the user removed. Their rates cascade, and expenses tagged with a
  // removed category fall back to the default category (cashback_category_id set null).
  const [existingCategories, existingTiers] = await Promise.all([
    supabase.from('cashback_categories').select('id').eq('program_id', program.id),
    supabase.from('cashback_tiers').select('id').eq('program_id', program.id),
  ]);
  const keepCategoryIds = new Set(program.categories.map(category => category.id));
  const keepTierIds = new Set(program.tiers.map(tier => tier.id));
  const staleCategoryIds = ((existingCategories.data ?? []) as { id: string }[]).map(row => row.id).filter(id => !keepCategoryIds.has(id));
  const staleTierIds = ((existingTiers.data ?? []) as { id: string }[]).map(row => row.id).filter(id => !keepTierIds.has(id));
  if (staleCategoryIds.length > 0) await supabase.from('cashback_categories').delete().in('id', staleCategoryIds);
  if (staleTierIds.length > 0) await supabase.from('cashback_tiers').delete().in('id', staleTierIds);

  if (program.categories.length > 0) {
    const categoriesResult = await supabase.from('cashback_categories').upsert(
      program.categories.map(category => ({
        id: category.id,
        user_id: userId,
        program_id: program.id,
        name: category.name,
        min_spend: category.minSpend,
        monthly_cap: category.monthlyCap ?? null,
        cap_group: category.capGroup || null,
        group_monthly_cap: category.capGroup ? category.groupMonthlyCap ?? null : null,
        is_default: Boolean(category.isDefault),
        sort_order: category.sortOrder,
      })),
      { onConflict: 'id' },
    );
    if (categoriesResult.error) return fail('categories', categoriesResult.error);
  }

  if (program.tiers.length > 0) {
    const tiersResult = await supabase.from('cashback_tiers').upsert(
      program.tiers.map(tier => ({
        id: tier.id,
        user_id: userId,
        program_id: program.id,
        tier_no: tier.tierNo,
        min_total_spend: tier.minTotalSpend,
        max_total_spend: tier.maxTotalSpend ?? null,
      })),
      { onConflict: 'id' },
    );
    if (tiersResult.error) return fail('tiers', tiersResult.error);

    const rateRows = program.tiers.flatMap(tier =>
      program.categories.map(category => ({
        tier_id: tier.id,
        category_id: category.id,
        user_id: userId,
        rate_pct: tier.rates[category.id] ?? 0,
      })),
    );
    const ratesResult = await supabase.from('cashback_tier_rates').upsert(rateRows, { onConflict: 'tier_id,category_id' });
    if (ratesResult.error) return fail('rates', ratesResult.error);
  }

  return true;
};

export const deleteCashbackProgram = async (programId: string): Promise<boolean> => {
  writeLocalJson(
    CASHBACK_PROGRAMS_STORAGE_KEY,
    readLocalJson<CashbackProgram[]>(CASHBACK_PROGRAMS_STORAGE_KEY, []).filter(item => item.id !== programId),
  );

  if (!supabase) return true;
  const userId = await getSupabaseUserId();
  if (!userId) return false;

  const { error } = await supabase.from('cashback_programs').delete().eq('id', programId).eq('user_id', userId);
  if (error) {
    console.error('Failed to delete cashback program', error);
    return false;
  }
  return true;
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

const sanitizeStatementFileName = (fileName: string) =>
  fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

export interface UploadAccountStatementParams {
  accountKind: AccountStatementKind;
  cashAccountId?: string;
  cardId?: string;
  statementPeriod?: string;
}

export const uploadAccountStatement = async (
  file: File,
  params: UploadAccountStatementParams,
): Promise<AccountStatement> => {
  if (!supabase) throw new Error('Supabase is not configured');
  const userId = await getSupabaseUserId();
  if (!userId) throw new Error('You must be signed in to upload statements');

  const accountId = params.accountKind === 'Cash' ? params.cashAccountId : params.cardId;
  if (!accountId) throw new Error('Missing account for this statement');

  const storagePath = `${userId}/${params.accountKind.toLowerCase()}/${accountId}/${crypto.randomUUID()}_${sanitizeStatementFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(STATEMENTS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || 'application/pdf' });
  if (uploadError) throw uploadError;

  const row: Omit<AccountStatementRow, 'id' | 'uploaded_at'> = {
    user_id: userId,
    account_kind: params.accountKind,
    cash_account_id: params.accountKind === 'Cash' ? accountId : null,
    card_id: params.accountKind === 'Card' ? accountId : null,
    file_name: file.name,
    storage_path: storagePath,
    file_size: file.size,
    statement_period: params.statementPeriod || null,
  };

  const { data, error: insertError } = await supabase
    .from('account_statements')
    .insert(row)
    .select('*')
    .single();

  if (insertError) {
    await supabase.storage.from(STATEMENTS_BUCKET).remove([storagePath]);
    throw insertError;
  }

  return mapAccountStatementRow(data as AccountStatementRow);
};

export const downloadAccountStatement = async (statement: AccountStatement): Promise<Blob> => {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.storage.from(STATEMENTS_BUCKET).download(statement.storagePath);
  if (error || !data) throw error || new Error('Failed to download statement');
  return data;
};

export const deleteAccountStatement = async (statement: AccountStatement): Promise<void> => {
  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  await supabase.storage.from(STATEMENTS_BUCKET).remove([statement.storagePath]);
  await supabase.from('account_statements').delete().eq('id', statement.id).eq('user_id', userId);
};

type StatementTransactionRow = {
  id: string;
  user_id: string;
  statement_id: string;
  transaction_date: string;
  description: string;
  amount: number;
  currency: string;
  direction: StatementTransactionDirection;
  matched_expense_id: string | null;
  dismissed?: boolean | null;
  created_at?: string;
};

const mapStatementTransactionRow = (row: StatementTransactionRow): StatementTransaction => ({
  id: row.id,
  statementId: row.statement_id,
  transactionDate: dateOnly(row.transaction_date),
  description: row.description,
  amount: Number(row.amount),
  currency: row.currency,
  direction: row.direction,
  matchedExpenseId: row.matched_expense_id ?? undefined,
  dismissed: row.dismissed ?? false,
  createdAt: row.created_at,
});

export const fetchStatementTransactions = async (statementId: string): Promise<StatementTransaction[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('account_statement_transactions')
    .select('*')
    .eq('statement_id', statementId)
    .order('transaction_date', { ascending: true });

  if (error) {
    console.error('Failed to fetch statement transactions', error);
    return [];
  }

  return (data as StatementTransactionRow[] | null | undefined)?.map(mapStatementTransactionRow) ?? [];
};

export const saveParsedStatementTransactions = async (
  statementId: string,
  parsed: ParsedStatementTransaction[],
): Promise<StatementTransaction[]> => {
  if (!supabase) throw new Error('Supabase is not configured');
  const userId = await getSupabaseUserId();
  if (!userId) throw new Error('You must be signed in to save parsed transactions');

  if (parsed.length === 0) return [];

  const rows = parsed.map(row => ({
    user_id: userId,
    statement_id: statementId,
    transaction_date: row.transactionDate,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    direction: row.direction,
  }));

  const { data, error } = await supabase.from('account_statement_transactions').insert(rows).select('*');
  if (error) throw error;

  return (data as StatementTransactionRow[] | null | undefined)?.map(mapStatementTransactionRow) ?? [];
};

export const clearStatementTransactions = async (statementId: string): Promise<void> => {
  if (!supabase) return;
  await supabase.from('account_statement_transactions').delete().eq('statement_id', statementId);
};

export const markStatementTransactionMatched = async (
  statementTransactionId: string,
  matchedExpenseId: string | null,
): Promise<void> => {
  if (!supabase) return;
  await supabase
    .from('account_statement_transactions')
    .update({ matched_expense_id: matchedExpenseId })
    .eq('id', statementTransactionId);
};

export const markStatementTransactionDismissed = async (
  statementTransactionId: string,
  dismissed: boolean,
): Promise<void> => {
  if (!supabase) return;
  await supabase
    .from('account_statement_transactions')
    .update({ dismissed })
    .eq('id', statementTransactionId);
};

export const clearStoredAppData = async () => {
  const reminderKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => Boolean(key?.startsWith(REMINDER_STORAGE_PREFIX)));
  reminderKeys.forEach(key => localStorage.removeItem(key));
  localStorage.removeItem(SAVINGS_STORAGE_KEY);
  localStorage.removeItem(PROFILE_STORAGE_KEY);
  localStorage.removeItem(SUBSCRIPTIONS_STORAGE_KEY);
  localStorage.removeItem(INCOMES_STORAGE_KEY);
  localStorage.removeItem(EXPENSES_STORAGE_KEY);
  localStorage.removeItem(BUDGETS_STORAGE_KEY);
  localStorage.removeItem(CARDS_STORAGE_KEY);
  localStorage.removeItem(CARD_POINTS_STORAGE_KEY);
  localStorage.removeItem(CASHBACK_PROGRAMS_STORAGE_KEY);
  localStorage.removeItem(FRIENDS_STORAGE_KEY);
  localStorage.removeItem(INVESTMENTS_STORAGE_KEY);
  localStorage.removeItem(INVESTMENT_TRANSACTIONS_STORAGE_KEY);
  localStorage.removeItem(INVESTMENT_ACCOUNTS_STORAGE_KEY);
  localStorage.removeItem(POKER_MTT_TOURNAMENTS_STORAGE_KEY);
  localStorage.removeItem(POKER_MTT_BANKROLL_STORAGE_KEY);
  localStorage.removeItem(POKER_CASH_SESSIONS_STORAGE_KEY);
  localStorage.removeItem(CRYPTO_SOURCES_STORAGE_KEY);
  localStorage.removeItem(CASH_ACCOUNTS_STORAGE_KEY);
  localStorage.removeItem(CASH_BALANCE_ENTRIES_STORAGE_KEY);
  localStorage.removeItem(INVESTMENT_VALUATIONS_STORAGE_KEY);
  localStorage.removeItem(RETIREMENT_FUNDS_STORAGE_KEY);
  localStorage.removeItem(RETIREMENT_ENTRIES_STORAGE_KEY);
  localStorage.removeItem(LOANS_STORAGE_KEY);
  localStorage.removeItem(LOAN_PAYMENTS_STORAGE_KEY);
  localStorage.removeItem('subtrack_receivables_v1');

  if (!supabase) return;
  const userId = await getSupabaseUserId();
  if (!userId) return;

  const statementsResult = await supabase.from('account_statements').select('storage_path').eq('user_id', userId);
  const statementPaths = (statementsResult.data as { storage_path: string }[] | null | undefined)?.map(row => row.storage_path) ?? [];
  if (statementPaths.length > 0) {
    await supabase.storage.from(STATEMENTS_BUCKET).remove(statementPaths);
  }

  await Promise.all([
    supabase.from('savings_goals').delete().eq('user_id', userId),
    supabase.from('subscriptions').delete().eq('user_id', userId),
    supabase.from('incomes').delete().eq('user_id', userId),
    supabase.from('expenses').delete().eq('user_id', userId),
    supabase.from('budget_plans').delete().eq('user_id', userId),
    supabase.from('investment_transactions').delete().eq('user_id', userId),
    supabase.from('poker_mtt_tournaments').delete().eq('user_id', userId),
    supabase.from('poker_mtt_bankroll_transactions').delete().eq('user_id', userId),
    supabase.from('poker_cash_sessions').delete().eq('user_id', userId),
    supabase.from('crypto_sources').delete().eq('user_id', userId),
    supabase.from('cash_accounts').delete().eq('user_id', userId),
    supabase.from('cash_balance_entries').delete().eq('user_id', userId),
    supabase.from('retirement_funds').delete().eq('user_id', userId),
    supabase.from('loans').delete().eq('user_id', userId),
    supabase.from('receivables').delete().eq('user_id', userId),
    supabase.from('investment_accounts').delete().eq('user_id', userId),
    supabase.from('payment_cards').delete().eq('user_id', userId),
    supabase.from('card_point_transactions').delete().eq('user_id', userId),
    supabase.from('cashback_programs').delete().eq('user_id', userId),
    supabase.from('account_statements').delete().eq('user_id', userId),
    supabase.from('friendships').delete().eq('user_id', userId),
    supabase.from('profiles').delete().eq('id', userId),
  ]);
};

export const calculateNextPaymentDate = calculateNextPayment;

// Only update tag metadata: editing search labels must never replay a trade or change amounts.
export const saveRecordTags = async (kind: SearchKind, id: string, values: string[]): Promise<void> => {
  const tags = normalizeTags(values);
  const target = {
    expense: { table: 'expenses', key: EXPENSES_STORAGE_KEY },
    subscription: { table: 'subscriptions', key: SUBSCRIPTIONS_STORAGE_KEY },
    transaction: { table: 'investment_transactions', key: INVESTMENT_TRANSACTIONS_STORAGE_KEY },
  }[kind];
  if (supabase) {
    const userId = await getSupabaseUserId();
    if (!userId) throw new Error('Please sign in again to save tags.');
    const { data, error } = await supabase.from(target.table).update({ tags }).eq('id', id).eq('user_id', userId).select('id').maybeSingle();
    if (error) {
      if (isMissingColumnError(error, 'tags')) throw new Error('Tag syncing needs the database update. Run supabase_global_search_tags.sql in Supabase, then try again.');
      throw new Error(error.message || 'Could not save tags. Please try again.');
    }
    if (!data) throw new Error('This record is no longer available. Refresh and try again.');
    return;
  }
  const records = readLocalJson<Array<{ id: string; tags?: string[] }>>(target.key, []);
  if (!records.some(record => record.id === id)) throw new Error('This record is no longer available.');
  // Deliberately let storage errors reach the editor so it never reports an unsaved change as saved.
  localStorage.setItem(target.key, JSON.stringify(records.map(record => record.id === id ? { ...record, tags } : record)));
};
