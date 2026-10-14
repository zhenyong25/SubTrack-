
export const BillingCycle = {
  Daily: 'Daily',
  Weekly: 'Weekly',
  Monthly: 'Monthly',
  Yearly: 'Yearly',
  FreeTrial: 'Free Trial'
} as const;

export type BillingCycle = typeof BillingCycle[keyof typeof BillingCycle];

export const IncomeCycle = {
  Daily: 'Daily',
  Weekly: 'Weekly',
  Monthly: 'Monthly',
  Yearly: 'Yearly',
} as const;

export type IncomeCycle = typeof IncomeCycle[keyof typeof IncomeCycle];

export const IncomeKind = {
  Active: 'Active',
  Passive: 'Passive',
} as const;

export type IncomeKind = typeof IncomeKind[keyof typeof IncomeKind];
export type IncomeMode = 'Recurring' | 'One-time';

export type InvestmentKind = 'Crypto' | 'Stocks' | 'Pokemon Cards' | 'Poker (MTT)' | 'Cash' | 'Other';

export interface Expense {
  id: string;
  name: string;
  amount: number;
  currency: string;
  expenseDate: string; // ISO Date string
  category: string;
  color: string;
  notes?: string;
  linkedCardId?: string;
  linkedCardName?: string;
  cashbackCategoryId?: string; // Cashback bucket this counts toward, when linked to a cashback card
}

export interface BudgetPlan {
  month: string; // YYYY-MM
  totalLimit: number;
  categoryLimits: Record<string, number>;
  updatedAt?: string;
}

export type CardType = 'Visa' | 'Mastercard' | 'Amex' | 'Discover' | 'Paypal' | 'ApplePay' | 'GooglePay' | 'Other';

export type PaymentCardKind = 'Credit' | 'Debit' | 'MultiCurrency';

export type CardRewardType = 'Miles' | 'Cashback';

export type CardPointsActivityType =
  | 'Earned'
  | 'Redeemed'
  | 'Expired'
  | 'Adjusted'
  | 'Transferred In'
  | 'Transferred Out';

export interface PaymentCard {
  id: string;
  name: string;
  type: CardType;
  kind: PaymentCardKind;
  last4Digits: string;
  color: string; // Gradient or solid color string
  creditLimit?: number; // Credit cards only
  currentDebt?: number; // Credit cards only
  currentBalance?: number; // Debit / multicurrency cards
  expiryMonth?: number; // 1-12
  expiryYear?: number; // e.g. 2027
  rewardType?: CardRewardType; // Credit cards only; missing means Miles
  statementDay?: number; // 1-31, day of month the statement closes (cashback cycles)
}

export interface CashbackCategory {
  id: string;
  name: string;
  minSpend: number; // Category spend needed in the cycle before it earns anything
  monthlyCap?: number; // Max cashback per cycle; undefined = unlimited
  capGroup?: string; // Categories sharing a name also share groupMonthlyCap
  groupMonthlyCap?: number;
  isDefault?: boolean; // Where untagged transactions on the card land
  sortOrder: number;
}

export interface CashbackTier {
  id: string;
  tierNo: number;
  minTotalSpend: number;
  maxTotalSpend?: number;
  rates: Record<string, number>; // category id -> cashback %
}

export interface CashbackProgram {
  id: string;
  cardId: string;
  name: string;
  currency: string;
  effectiveFrom: string; // ISO date: first statement date this rule set covers
  effectiveTo?: string; // ISO date: last statement date it covers; undefined = current
  notes?: string;
  categories: CashbackCategory[];
  tiers: CashbackTier[];
}

export interface CardPointTransaction {
  id: string;
  cardId: string;
  activityDate: string; // ISO Date string
  pointsDelta: number;
  activityType: CardPointsActivityType;
  source?: string;
  notes?: string;
  externalId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Friend {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface CardBenefit {
  id: string;
  cardName: string;
  issuer?: string;
  category: string;
  title: string;
  description: string;
  earnRateMpd?: number;
  krisflyerTransferRatio?: number;
  sortOrder?: number;
  isHighlighted?: boolean;
}

export interface Subscription {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: BillingCycle;
  firstPaymentDate: string; // ISO Date string
  nextPaymentDate: string; // ISO Date string
  cancellationDate?: string; // ISO Date string, if Past
  category: string;
  cardId?: string; // Link to a PaymentCard
  cardName: string; // Fallback / Display name
  cardType?: CardType;
  color: string;
  logoUrl?: string;
  serviceId?: string;
  notes?: string;
  sharedCount?: number; 
  sharedWith?: string[]; // Names of people sharing (e.g. ['Alice', 'Bob'])
  status: 'Active' | 'Past';
  paymentHistory?: Record<string, Record<string, boolean>>; // Key: "2023-10", Value: { "Alice": true }
}

export interface Income {
  id: string;
  name: string;
  amount: number;
  currency: string;
  incomeType: IncomeKind;
  incomeMode: IncomeMode;
  incomeCycle: IncomeCycle;
  firstIncomeDate: string; // ISO Date string
  nextIncomeDate: string; // ISO Date string
  incomeDate?: string; // ISO Date string for one-time income
  cancellationDate?: string; // ISO Date string, if Past
  category: string;
  color: string;
  notes?: string;
  status: 'Active' | 'Past';
}

export type InvestmentPositionSide = 'Long' | 'Short';

export interface InvestmentHolding {
  id: string;
  name: string;
  kind: InvestmentKind;
  symbol?: string;
  units: number;
  averageCost: number;
  currentPrice: number;
  currency: string;
  color: string;
  notes?: string;
  acquiredDate?: string;
  source?: string;
  isActive: boolean;
  positionSide?: InvestmentPositionSide; // absent = Long, for backward compatibility
  accountId?: string; // the InvestmentAccount (broker / margin account) it's held in; absent = unassigned
  createdAt?: string;
  updatedAt?: string;
}

export type InvestmentAccountType = 'Cash' | 'Margin';

// A brokerage account holdings can be tagged to, e.g. "IBKR Margin" or "Moomoo Cash".
export interface InvestmentAccount {
  id: string;
  name: string;
  broker?: string;
  accountType: InvestmentAccountType;
  currency: string;
  color: string;
  notes?: string;
  isArchived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvestmentValuation {
  id: string;
  investmentId: string;
  valuationDate: string;
  price: number;
  marketValue: number;
  currency: string;
  notes?: string;
  createdAt?: string;
}

export type InvestmentTransactionType = 'Buy' | 'Sell' | 'Dividend' | 'Fee' | 'Transfer In' | 'Transfer Out' | 'Split';

export interface InvestmentTransaction {
  id: string;
  investmentId: string;
  transactionType: InvestmentTransactionType;
  tradeDate: string;
  units: number;
  price: number;
  fees: number;
  currency: string;
  notes?: string;
  source?: string;
  externalId?: string;
  // Profit or loss locked in by this trade, in `currency`: a Sell for a long position, a Buy
  // (cover) for a short, a Dividend, or a short's Fee. Absent for trades that realize nothing.
  realizedPnl?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PokerMttTournament {
  id: string;
  investmentId: string;
  tournamentDate: string;
  tournamentName: string;
  placement?: number;
  entries: number;
  buyInUsd: number;
  cashoutUsd: number;
  bountyUsd: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type PokerMttBankrollEventType = 'Deposit' | 'Withdrawal' | 'Adjustment';

export interface PokerMttBankrollTransaction {
  id: string;
  investmentId: string;
  eventDate: string;
  eventType: PokerMttBankrollEventType;
  amountUsd: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CashAccountType = 'Bank' | 'EWallet' | 'MultiCurrencyCard' | 'Cash' | 'Other';

export interface CashAccount {
  id: string;
  name: string;
  institution: string;
  accountType: CashAccountType;
  country: string;
  currency: string;
  color: string;
  notes?: string;
  isArchived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CashBalanceEntry {
  id: string;
  accountId: string;
  balanceDate: string; // ISO date string
  balance: number;
  notes?: string;
  createdAt?: string;
}

export type RetirementScheme = 'EPF' | 'CPF';

// One member's EPF (Malaysia) or CPF (Singapore) pot. The split across its sub-accounts
// (e.g. EPF Persaraan/Sejahtera/Fleksibel, CPF OA/SA/MA/RA) lives in RetirementBalanceEntry rows.
export interface RetirementFund {
  id: string;
  scheme: RetirementScheme;
  name: string;
  currency: string;
  notes?: string;
  isArchived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// A dated balance for one sub-account. A "snapshot" is all of a fund's entries sharing a balanceDate.
export interface RetirementBalanceEntry {
  id: string;
  fundId: string;
  subAccount: string; // key from the scheme's sub-account list, e.g. 'persaraan' or 'oa'
  balanceDate: string; // ISO date string
  balance: number;
  createdAt?: string;
}

export type AccountStatementKind = 'Cash' | 'Card';

export interface AccountStatement {
  id: string;
  accountKind: AccountStatementKind;
  cashAccountId?: string; // set when accountKind === 'Cash'
  cardId?: string; // set when accountKind === 'Card'
  fileName: string;
  storagePath: string; // path within the 'account-statements' storage bucket
  fileSize?: number;
  statementPeriod?: string; // free-text label, e.g. "August 2026"
  uploadedAt: string;
}

export type StatementTransactionDirection = 'debit' | 'credit';

// A single line item extracted from an uploaded statement PDF, before it has
// been persisted (id/statementId are assigned once saved).
export interface ParsedStatementTransaction {
  transactionDate: string; // ISO date string (YYYY-MM-DD)
  description: string;
  amount: number; // always positive; sign is conveyed via `direction`
  currency: string;
  direction: StatementTransactionDirection;
}

export interface StatementTransaction extends ParsedStatementTransaction {
  id: string;
  statementId: string;
  matchedExpenseId?: string; // set once the user imports this row as an Expense
  dismissed?: boolean; // hidden from "not recorded" - the user decided not to import it
  createdAt?: string;
}

export interface SubscriptionStats {
  totalMonthly: number;
  totalYearly: number;
  upcomingCount: number; 
}

export interface AiSuggestion {
  name: string;
  estimatedPrice: number;
  category: string;
  billingCycle: string;
  currency?: string;
}

export interface UserProfile {
  name: string;
  email?: string;
  photoUrl?: string;
  currency: string;
  isLoggedIn: boolean;
  friends: Friend[];
  notificationDays: number; // Days before due date to notify
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'INR', 'CNY', 'MYR', 'SGD', 'HKD', 'THB', 'IDR', 'VND', 'PHP', 'KRW', 'TWD', 'AED', 'CHF', 'NZD'];

export const DEFAULT_CATEGORIES = ['Entertainment', 'Music', 'Utilities', 'Productivity', 'Social', 'Health', 'Education', 'Shopping', 'Gym', 'Software'];
