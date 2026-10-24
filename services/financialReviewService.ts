import type { CashAccount, CashBalanceEntry, Expense, Income, InvestmentHolding, InvestmentValuation, Loan, LoanPayment, PaymentCard, RetirementBalanceEntry, RetirementFund, Subscription } from '../types';
import { forecastDates } from './cashForecastService';
import { loanStatus } from './loanService';
import { isValidDate } from './savingsGoalMath';

const DAY = 86400000;
const day = (value: string) => value.slice(0, 10);
const key = (time: number) => new Date(time).toISOString().slice(0, 10);
const stamp = (date: string) => Date.parse(`${date}T00:00:00Z`);
const cents = (amount: number) => Math.round(amount * 100);
export interface ReviewInput {
  today: string; month: string; currency: string; cardCurrency: string;
  accounts: CashAccount[]; balances: CashBalanceEntry[]; incomes: Income[]; subscriptions: Subscription[]; expenses: Expense[];
  holdings: InvestmentHolding[]; valuations: InvestmentValuation[]; funds: RetirementFund[]; retirement: RetirementBalanceEntry[];
  loans: Loan[]; payments: LoanPayment[]; cards: PaymentCard[];
  convert: (amount: number, from: string, to: string) => number;
}
export interface ReviewPeriod { start: string; end: string; partial: boolean }
export interface ReviewBalance { id: string; name: string; kind: 'Cash' | 'Investment' | 'Retirement' | 'Debt'; amount: number | null; recordedDate?: string }

export function reviewPeriod(month: string, today: string): ReviewPeriod {
  if (!/^\d{4}-\d{2}$/.test(month) || month < '1900-01' || !isValidDate(`${month}-01`) || !isValidDate(today) || month > today.slice(0, 7)) throw new Error('Choose this month or an earlier month.');
  const [year, number] = month.split('-').map(Number);
  return { start: `${month}-01`, end: month === today.slice(0, 7) ? today : key(Date.UTC(year, number, 0)), partial: month === today.slice(0, 7) };
}
export function comparisonPeriod(period: ReviewPeriod): ReviewPeriod {
  const start = new Date(stamp(period.start));
  const previousStart = key(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const previousLast = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0)).getUTCDate();
  const count = period.partial ? Math.min(Number(period.end.slice(8, 10)), previousLast) : previousLast;
  return { start: previousStart, end: `${previousStart.slice(0, 7)}-${String(count).padStart(2, '0')}`, partial: period.partial };
}

function periodTotals(input: ReviewInput, period: ReviewPeriod) {
  const categories = new Map<string, number>(); let recurringIncome = 0; let loggedIncome = 0; let expenses = 0; let subscriptions = 0;
  const warnings = new Set<string>();
  const converted = (amount: number, currency: string) => cents(input.convert(amount, currency, input.currency));
  const within = (date: string) => day(date) >= period.start && day(date) <= period.end;
  const addCategory = (name: string, amount: number) => categories.set(name.trim() || 'Other', (categories.get(name.trim() || 'Other') || 0) + amount);
  const occurrences = (first: string, cycle: string, cancellation?: string) => forecastDates(day(first), cycle, key(stamp(period.start) - DAY), cancellation && day(cancellation) < period.end ? day(cancellation) : period.end);
  for (const income of input.incomes) {
    if (income.incomeMode === 'One-time') { if (within(income.incomeDate || income.firstIncomeDate)) loggedIncome += converted(income.amount, income.currency); continue; }
    if (income.status === 'Past' && !income.cancellationDate) { warnings.add(`${income.name}: historical recurring income excluded because its end date is missing.`); continue; }
    recurringIncome += converted(income.amount, income.currency) * occurrences(income.firstIncomeDate, income.incomeCycle, income.cancellationDate).length;
  }
  for (const expense of input.expenses) if (within(expense.expenseDate)) { const amount = converted(expense.amount, expense.currency); expenses += amount; addCategory(expense.category, amount); }
  for (const sub of input.subscriptions) {
    if (sub.status === 'Past' && !sub.cancellationDate) { warnings.add(`${sub.name}: historical subscription spending excluded because its end date is missing.`); continue; }
    if (sub.billingCycle === 'Free Trial') { warnings.add(`${sub.name}: free-trial renewal charges are not included.`); continue; }
    const amount = converted(sub.price, sub.currency) * occurrences(sub.firstPaymentDate, sub.billingCycle, sub.cancellationDate).length;
    subscriptions += amount; if (amount) addCategory(sub.category, amount);
  }
  const income = recurringIncome + loggedIncome; const spending = expenses + subscriptions; const surplus = income - spending;
  const loanIds = new Set(input.loans.filter(loan => !loan.isArchived).map(loan => loan.id));
  const debtPaid = input.payments.filter(payment => loanIds.has(payment.loanId) && payment.entryType !== 'statement' && within(payment.paymentDate)).reduce((sum, payment) => {
    const loan = input.loans.find(loan => loan.id === payment.loanId)!; return sum + converted(payment.amount, loan.currency);
  }, 0);
  return { income: income / 100, recurringIncome: recurringIncome / 100, loggedIncome: loggedIncome / 100, spending: spending / 100, expenses: expenses / 100, subscriptions: subscriptions / 100, surplus: surplus / 100, savingsRate: income > 0 ? surplus / income * 100 : null, debtPaid: debtPaid / 100, categories, warnings: [...warnings] };
}

const latest = <T extends { id: string; createdAt?: string }>(rows: T[], date: (row: T) => string, asOf: string): T | undefined => rows.filter(row => day(date(row)) <= asOf).sort((a, b) => day(date(b)).localeCompare(day(date(a))) || (b.createdAt || '').localeCompare(a.createdAt || '') || b.id.localeCompare(a.id))[0];
export function reviewBalances(input: ReviewInput, asOf: string) {
  const rows: ReviewBalance[] = [];
  const convert = (amount: number, currency: string) => cents(input.convert(amount, currency, input.currency)) / 100;
  for (const account of input.accounts.filter(account => !account.isArchived)) {
    const entry = latest(input.balances.filter(entry => entry.accountId === account.id), entry => entry.balanceDate, asOf);
    rows.push({ id: `cash:${account.id}`, name: account.name, kind: 'Cash', amount: entry ? convert(entry.balance, account.currency) : null, recordedDate: entry && day(entry.balanceDate) });
  }
  for (const holding of input.holdings.filter(holding => holding.isActive && holding.kind !== 'Poker (MTT)')) {
    const entry = latest(input.valuations.filter(entry => entry.investmentId === holding.id), entry => entry.valuationDate, asOf);
    rows.push({ id: `investment:${holding.id}`, name: holding.name, kind: 'Investment', amount: entry ? convert(entry.marketValue, entry.currency) : null, recordedDate: entry && day(entry.valuationDate) });
  }
  for (const fund of input.funds.filter(fund => !fund.isArchived)) {
    const entries = input.retirement.filter(entry => entry.fundId === fund.id);
    const subAccounts = [...new Set(entries.map(entry => entry.subAccount))];
    if (!subAccounts.length) rows.push({ id: `retirement:${fund.id}`, name: fund.name, kind: 'Retirement', amount: null });
    for (const subAccount of subAccounts) {
      const entry = latest(entries.filter(entry => entry.subAccount === subAccount), entry => entry.balanceDate, asOf);
      rows.push({ id: `retirement:${fund.id}:${subAccount}`, name: `${fund.name} · ${subAccount}`, kind: 'Retirement', amount: entry ? convert(entry.balance, fund.currency) : null, recordedDate: entry && day(entry.balanceDate) });
    }
  }
  for (const loan of input.loans.filter(loan => !loan.isArchived)) {
    const entries = input.payments.filter(entry => entry.loanId === loan.id && day(entry.paymentDate) <= asOf);
    const statements = entries.filter(entry => entry.entryType === 'statement');
    const started = day(loan.startDate) <= asOf;
    const unavailable = started && loan.openingBalance != null && Boolean(loan.openingBalanceDate && day(loan.openingBalanceDate) > asOf) && !statements.length;
    const value = !started ? 0 : unavailable ? null : loanStatus(loan, entries).outstanding;
    rows.push({ id: `loan:${loan.id}`, name: loan.name, kind: 'Debt', amount: value === null ? null : convert(value, loan.currency), recordedDate: started && !unavailable ? latest(entries, entry => entry.paymentDate, asOf)?.paymentDate.slice(0, 10) || loan.openingBalanceDate?.slice(0, 10) || day(loan.startDate) : undefined });
  }
  const linked = new Set(input.loans.filter(loan => !loan.isArchived).map(loan => loan.cardId).filter(Boolean));
  for (const card of input.cards.filter(card => card.kind === 'Credit' && !linked.has(card.id))) {
    // Card balances have no date history; use them only for today's endpoint.
    const known = asOf === input.today && card.currentDebt != null;
    rows.push({ id: `card:${card.id}`, name: `${card.name} (no debt history)`, kind: 'Debt', amount: known ? convert(card.currentDebt!, input.cardCurrency) : null, recordedDate: known ? input.today : undefined });
  }
  const sum = (kind: 'assets' | 'debt') => rows.filter(row => (kind === 'debt') === (row.kind === 'Debt')).reduce((total, row) => total + (row.amount === null ? 0 : cents(row.amount)), 0) / 100;
  const assets = sum('assets'); const debt = sum('debt');
  return { rows, assets, debt, netWorth: (cents(assets) - cents(debt)) / 100, complete: rows.length > 0 && rows.every(row => row.amount !== null), debtComplete: rows.filter(row => row.kind === 'Debt').every(row => row.amount !== null), hasAssets: rows.some(row => row.kind !== 'Debt' && row.amount !== null), missing: rows.filter(row => row.amount === null), stale: rows.filter(row => row.recordedDate && row.recordedDate < asOf && row.kind !== 'Debt') };
}

export function buildFinancialReview(input: ReviewInput) {
  const period = reviewPeriod(input.month, input.today); const previousPeriod = comparisonPeriod(period);
  const current = periodTotals(input, period); const previous = periodTotals(input, previousPeriod);
  const before = reviewBalances(input, key(stamp(period.start) - DAY)); const end = reviewBalances(input, period.end);
  const categoryNames = new Set([...current.categories.keys(), ...previous.categories.keys()]);
  const categories = [...categoryNames].map(name => ({ name, current: (current.categories.get(name) || 0) / 100, previous: (previous.categories.get(name) || 0) / 100, delta: ((current.categories.get(name) || 0) - (previous.categories.get(name) || 0)) / 100 })).sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));
  const start = new Date(stamp(period.start));
  const trend = Array.from({ length: 6 }, (_, index) => {
    const month = key(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 5 + index, 1)).slice(0, 7);
    return month;
  }).filter(month => month >= '1900-01').map(month => {
    const window = reviewPeriod(month, input.today); const totals = periodTotals(input, window); const balance = reviewBalances(input, window.end);
    return { month, income: totals.income, spending: totals.spending, netWorth: balance.complete ? balance.netWorth : null, partial: window.partial };
  });
  return { period, previousPeriod, current, previous, categories, before, end, trend,
    spendingChange: (cents(current.spending) - cents(previous.spending)) / 100,
    spendingChangePercent: previous.spending > 0 ? (current.spending - previous.spending) / previous.spending * 100 : null,
    netWorthChange: before.complete && end.complete ? (cents(end.netWorth) - cents(before.netWorth)) / 100 : null,
    debtReduction: before.debtComplete && end.debtComplete ? (cents(before.debt) - cents(end.debt)) / 100 : null,
    warnings: [...new Set([...current.warnings, ...previous.warnings])],
  };
}
