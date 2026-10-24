import { buildCashForecast, type ForecastInput } from './cashForecastService';
import { moneyInCents } from './savingsGoalMath';

export interface SafeToSpendInput extends ForecastInput {
  buffer: number;
  selectedAccountIds?: string[];
}

/** Reserve the entire window from current cash; future income is never spendable today. */
export function buildSafeToSpend(input: SafeToSpendInput) {
  const bufferCents = moneyInCents(input.buffer);
  if (bufferCents < 0) throw new Error('The cash buffer must be zero or greater.');
  const accounts = input.accounts.filter(account => !account.isArchived && (input.selectedAccountIds === undefined || input.selectedAccountIds.includes(account.id)));
  const forecast = buildCashForecast({ ...input, accounts, incomes: [], openingOverride: undefined, extraMonthly: 0, dailySpending: 0, includeGoals: true });
  const total = (kind: 'Subscription' | 'Expense' | 'Debt' | 'Savings') => forecast.events.filter(event => event.kind === kind).reduce((sum, event) => sum - moneyInCents(event.amount), 0);
  const subscriptions = total('Subscription'); const expenses = total('Expense'); const debt = total('Debt'); const plannedSavings = total('Savings');
  const cash = moneyInCents(forecast.opening); const saved = moneyInCents(forecast.saved);
  const reserved = subscriptions + expenses + debt + plannedSavings + saved + bufferCents;
  const remaining = cash - reserved;
  const hasBalances = forecast.snapshots.some(snapshot => Boolean(snapshot.entry));
  const missingBalances = forecast.snapshots.some(snapshot => !snapshot.entry);
  return {
    cash: cash / 100, subscriptions: subscriptions / 100, expenses: expenses / 100, debt: debt / 100,
    plannedSavings: plannedSavings / 100, saved: saved / 100, buffer: bufferCents / 100, reserved: reserved / 100,
    spendable: Math.max(0, remaining) / 100, shortfall: Math.max(0, -remaining) / 100,
    dailyAllowance: Math.floor(Math.max(0, remaining) / input.days) / 100,
    hasBalances, missingBalances, warnings: forecast.warnings, snapshots: forecast.snapshots,
    commitments: forecast.events,
    provisional: forecast.warnings.length > 0,
  };
}
