import type { CashAccount, CashBalanceEntry, Expense, Income, Loan, LoanPayment, SavingsEntry, SavingsGoal, Subscription } from '../types';
import { addMonthsClamped, dueStatus, isStatementLoan, loanInstalment, loanStatus } from './loanService';
import { goalBalance, goalPlan, isValidDate } from './savingsGoalMath';

const DAY = 86400000;
const stamp = (date: string) => Date.parse(`${date}T00:00:00Z`);
const key = (time: number) => new Date(time).toISOString().slice(0, 10);
const round = (amount: number) => Math.round(amount * 100) / 100;
export interface ForecastEvent { id: string; date: string; name: string; kind: 'Income' | 'Subscription' | 'Expense' | 'Debt' | 'Savings'; amount: number }
export interface ForecastInput {
  today: string; days: 30 | 60 | 90; currency: string;
  accounts: CashAccount[]; balances: CashBalanceEntry[]; incomes: Income[]; subscriptions: Subscription[];
  expenses: Expense[]; loans: Loan[]; payments: LoanPayment[]; goals: SavingsGoal[]; entries: SavingsEntry[];
  convert: (amount: number, from: string, to: string) => number;
  openingOverride?: number; extraMonthly?: number; dailySpending?: number; includeGoals?: boolean;
}

// Expand directly from the original calendar anchor so Jan 31 -> Feb 28 -> Mar 31.
export function forecastDates(anchor: string, cycle: string, after: string, through: string): string[] {
  if (!isValidDate(anchor)) return [];
  const start = stamp(anchor); const end = stamp(through); const lower = stamp(after);
  const dates: string[] = [];
  if (cycle === 'Daily' || cycle === 'Weekly') {
    const step = (cycle === 'Daily' ? 1 : 7) * DAY;
    for (let time = start + Math.max(0, Math.floor((lower - start) / step) + 1) * step; time <= end; time += step) dates.push(key(time));
  } else if (cycle === 'Monthly' || cycle === 'Yearly') {
    const interval = cycle === 'Monthly' ? 1 : 12;
    const a = new Date(start); const b = new Date(lower);
    let index = Math.max(0, Math.floor(((b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth()) / interval));
    for (;; index++) { const time = addMonthsClamped(start, index * interval); if (time > end) break; if (time > lower) dates.push(key(time)); }
  } else if (start > lower && start <= end) dates.push(anchor);
  return dates;
}

export function buildCashForecast(input: ForecastInput) {
  const { today, days, currency, convert } = input;
  if (!isValidDate(today) || ![30, 60, 90].includes(days)) throw new Error('Choose a valid forecast date and range.');
  for (const value of [input.openingOverride, input.extraMonthly, input.dailySpending]) if (value !== undefined && (!Number.isFinite(value) || Math.abs(value) > 1e12)) throw new Error('Enter a valid forecast amount.');
  const through = key(stamp(today) + days * DAY);
  const warnings: string[] = [];
  const snapshots = input.accounts.filter(account => !account.isArchived).map(account => ({ account, entry: input.balances.filter(entry => entry.accountId === account.id && entry.balanceDate <= today).sort((a, b) => b.balanceDate.localeCompare(a.balanceDate) || (b.createdAt || '').localeCompare(a.createdAt || '') || b.id.localeCompare(a.id))[0] }));
  for (const { account, entry } of snapshots) {
    if (!entry) warnings.push(`${account.name}: no recorded balance; excluded from opening cash.`);
    else if (entry.balanceDate < today) warnings.push(`${account.name}: opening balance recorded ${entry.balanceDate}; update it or adjust opening cash.`);
  }
  if (!snapshots.length) warnings.push('No active cash accounts. Add a cash balance or enter opening cash for a scenario.');
  const opening = round(input.openingOverride ?? snapshots.reduce((sum, { account, entry }) => sum + (entry ? convert(entry.balance, account.currency, currency) : 0), 0));
  const events: ForecastEvent[] = [];
  const add = (id: string, date: string, name: string, kind: ForecastEvent['kind'], amount: number, from: string) => { const converted = round(convert(amount, from, currency)); if (converted) events.push({ id: `${id}:${date}`, date, name, kind, amount: converted }); };
  for (const income of input.incomes.filter(item => item.status === 'Active')) {
    const anchor = income.incomeMode === 'One-time' ? income.incomeDate || income.firstIncomeDate : income.nextIncomeDate || income.firstIncomeDate;
    for (const date of forecastDates(anchor, income.incomeMode === 'One-time' ? 'Once' : income.incomeCycle, today, through)) if (date >= income.firstIncomeDate) add(income.id, date, income.name, 'Income', income.amount, income.currency);
  }
  for (const subscription of input.subscriptions.filter(item => item.status === 'Active')) {
    if (subscription.billingCycle === 'Free Trial') { warnings.push(`${subscription.name}: trial renewal price is unknown; excluded.`); continue; }
    for (const date of forecastDates(subscription.nextPaymentDate || subscription.firstPaymentDate, subscription.billingCycle, today, through)) if (date >= subscription.firstPaymentDate) add(subscription.id, date, subscription.name, 'Subscription', -subscription.price, subscription.currency);
  }
  for (const expense of input.expenses) if (expense.expenseDate > today && expense.expenseDate <= through) add(expense.id, expense.expenseDate, expense.name, 'Expense', -expense.amount, expense.currency);
  for (const loan of input.loans.filter(item => !item.isArchived)) {
    const payments = input.payments.filter(item => item.paymentDate <= today);
    const status = loanStatus(loan, payments); if (status.cleared) continue;
    const due = dueStatus(loan, payments, stamp(today)); const instalment = loanInstalment(loan);
    if (!due || (!instalment && !isStatementLoan(loan))) { warnings.push(`${loan.name}: repayment schedule is missing; excluded.`); continue; }
    let remaining = status.outstanding;
    // Opening cash is after today's activity; unpaid dues through today are reserved tomorrow.
    const anchor = key(due.nextDue); const dates = forecastDates(anchor, isStatementLoan(loan) ? 'Once' : 'Monthly', today, through);
    if (due.nextDue <= stamp(today)) {
      let count = 0;
      do { dates.unshift(key(stamp(today) + DAY)); count++; }
      while (!isStatementLoan(loan) && count < 1200 && addMonthsClamped(due.nextDue, count, loan.paymentDay) <= stamp(today));
    }
    for (const date of dates) {
      if (remaining <= 0) break;
      const interest = isStatementLoan(loan) || loan.interestMethod === 'Flat' ? 0 : remaining * loan.annualRate / 1200;
      remaining += interest;
      const amount = Math.min(remaining, isStatementLoan(loan) ? remaining : instalment!);
      add(loan.id, date, `${loan.name}${due.nextDue <= stamp(today) && date === key(stamp(today) + DAY) ? ' · outstanding due' : ''}`, 'Debt', -amount, loan.currency); remaining -= amount;
    }
  }
  const saved = input.includeGoals === false ? 0 : round(input.goals.reduce((sum, goal) => sum + convert(goalBalance(goal, input.entries), goal.currency, currency), 0));
  if (input.includeGoals !== false) for (const goal of input.goals) {
    const plan = goalPlan(goal, input.entries, today); if (!plan.remaining || !plan.monthlyNeeded) continue;
    let remaining = plan.remaining;
    // Reserve at the start of each month, or by the deadline if earlier.
    const firstMonth = key(addMonthsClamped(stamp(today), 1, 1));
    const dates = forecastDates(firstMonth, 'Monthly', today, through).filter(date => !goal.targetDate || date <= goal.targetDate);
    if (goal.targetDate && goal.targetDate <= through && !dates.includes(goal.targetDate)) dates.push(goal.targetDate <= today ? key(stamp(today) + DAY) : goal.targetDate);
    for (const date of [...new Set(dates)].sort()) { const amount = Math.min(remaining, goal.targetDate && date >= goal.targetDate ? remaining : plan.monthlyNeeded); if (amount <= 0) break; add(goal.id, date, goal.name, 'Savings', -amount, goal.currency); remaining = round(remaining - amount); }
  }
  const scenarioDates = forecastDates(key(addMonthsClamped(stamp(today), 1, 1)), 'Monthly', today, through);
  for (const date of scenarioDates) if ((input.extraMonthly || 0) > 0) add('scenario', date, 'Additional monthly savings', 'Savings', -input.extraMonthly!, currency);
  events.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  let cash = opening; let allocated = saved;
  const points = [{ date: today, cash, available: round(cash - allocated), income: 0, outgoing: 0, savings: 0 }];
  for (let day = 1; day <= days; day++) {
    const date = key(stamp(today) + day * DAY); const daily = events.filter(event => event.date === date);
    const income = daily.filter(event => event.kind === 'Income').reduce((sum, event) => sum + event.amount, 0);
    const outgoing = round(-daily.filter(event => event.kind !== 'Income' && event.kind !== 'Savings').reduce((sum, event) => sum + event.amount, 0) + Math.max(0, input.dailySpending || 0));
    const savings = -daily.filter(event => event.kind === 'Savings').reduce((sum, event) => sum + event.amount, 0);
    cash = round(cash + income - outgoing); allocated = round(allocated + savings);
    points.push({ date, cash, available: round(cash - allocated), income: round(income), outgoing, savings: round(savings) });
  }
  const lowest = points.reduce((min, point) => point.available < min.available ? point : min, points[0]);
  return { opening, saved, events, points, lowest, end: points.at(-1)!, warnings, snapshots, firstShortfall: points.find(point => point.available < 0) };
}
