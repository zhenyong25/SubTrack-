
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
}

export type CardType = 'Visa' | 'Mastercard' | 'Amex' | 'Discover' | 'Paypal' | 'ApplePay' | 'GooglePay' | 'Other';

export type PaymentCardKind = 'Credit' | 'Debit' | 'MultiCurrency';

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

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'INR', 'CNY', 'MYR', 'SGD'];

export const DEFAULT_CATEGORIES = ['Entertainment', 'Music', 'Utilities', 'Productivity', 'Social', 'Health', 'Education', 'Shopping', 'Gym', 'Software'];
