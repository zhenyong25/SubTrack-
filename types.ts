
export const BillingCycle = {
  Daily: 'Daily',
  Weekly: 'Weekly',
  Monthly: 'Monthly',
  Yearly: 'Yearly',
  FreeTrial: 'Free Trial'
} as const;

export type BillingCycle = typeof BillingCycle[keyof typeof BillingCycle];

export type CardType = 'Visa' | 'Mastercard' | 'Amex' | 'Discover' | 'Paypal' | 'ApplePay' | 'GooglePay' | 'Other';

export interface PaymentCard {
  id: string;
  name: string;
  type: CardType;
  last4Digits: string;
  color: string; // Gradient or solid color string
  budget?: number; // Monthly budget limit
}

export interface Friend {
  id: string;
  name: string;
  email: string;
  avatar?: string;
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
