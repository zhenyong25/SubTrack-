import type { Loan, LoanPayment } from '../types';
import { dateKeyToUtc } from './portfolioAnalyticsService';

const DAY_MS = 24 * 60 * 60 * 1000;
// Below this, a balance is rounding noise rather than money still owed.
const SETTLED = 0.005;

const monthlyRate = (annualRate: number) => annualRate / 100 / 12;

// The same calendar day `months` later, pulled back to the month's last day when it's shorter
// (a loan due on the 31st is due on 28/29 Feb).
export const addMonthsClamped = (timestamp: number, months: number, day?: number): number => {
  const date = new Date(timestamp);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day ?? date.getUTCDate(), lastDay));
};

// The latest date on or before `asOf` that falls on `day` of its month (clamped for short
// months) - e.g. when a card's most recent statement closed.
export const latestMonthlyDate = (day: number, asOf: number): number => {
  const thisMonth = addMonthsClamped(asOf, 0, day);
  return thisMonth <= asOf ? thisMonth : addMonthsClamped(asOf, -1, day);
};

// ---------------------------------------------------------------------------------------------
// Instalments and rates
// ---------------------------------------------------------------------------------------------

// The fixed monthly payment that clears the loan over its term. Undefined without a term.
export const standardInstalment = (loan: Pick<Loan, 'principal' | 'annualRate' | 'termMonths' | 'interestMethod'>): number | undefined => {
  const n = loan.termMonths;
  if (!n || n <= 0 || !(loan.principal > 0)) return undefined;
  if (loan.interestMethod === 'Flat') return (loan.principal + flatTotalInterest(loan)) / n;
  const r = monthlyRate(loan.annualRate);
  if (r === 0) return loan.principal / n;
  return (loan.principal * r) / (1 - Math.pow(1 + r, -n));
};

export const loanInstalment = (loan: Loan): number | undefined =>
  loan.instalment && loan.instalment > 0 ? loan.instalment : standardInstalment(loan);

export const flatTotalInterest = (loan: Pick<Loan, 'principal' | 'annualRate' | 'termMonths'>) =>
  loan.principal * (loan.annualRate / 100) * ((loan.termMonths || 0) / 12);

// What a Flat loan's payments would cost as a reducing-balance rate - the number that's actually
// comparable to a mortgage or personal loan rate. Solved by bisection on the monthly rate that
// makes the instalments' present value equal the amount borrowed.
export const flatEquivalentRate = (loan: Pick<Loan, 'principal' | 'annualRate' | 'termMonths' | 'interestMethod'>): number | undefined => {
  const n = loan.termMonths;
  const payment = standardInstalment({ ...loan, interestMethod: 'Flat' });
  if (!n || !payment || loan.annualRate <= 0) return undefined;
  const presentValue = (r: number) => (r === 0 ? payment * n : (payment * (1 - Math.pow(1 + r, -n))) / r);
  let low = 0;
  let high = 1;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (presentValue(mid) > loan.principal) low = mid;
    else high = mid;
  }
  return ((low + high) / 2) * 12 * 100;
};

// ---------------------------------------------------------------------------------------------
// Where the loan stands
// ---------------------------------------------------------------------------------------------

// Credit cards are tracked statement by statement: each month's statement balance is what's
// owed, payments count it down, and the card stays open after it's cleared.
export const isStatementLoan = (loan: Pick<Loan, 'kind'>) => loan.kind === 'Credit card';

const isStatementEntry = (entry: LoanPayment) => entry.entryType === 'statement';
const byEntryDate = (a: LoanPayment, b: LoanPayment) =>
  dateKeyToUtc(a.paymentDate) - dateKeyToUtc(b.paymentDate) || (a.createdAt || '').localeCompare(b.createdAt || '');

export const latestStatement = (loan: Loan, entries: LoanPayment[]): LoanPayment | undefined =>
  entries.filter(entry => entry.loanId === loan.id && isStatementEntry(entry)).sort(byEntryDate).at(-1);

// Tracking starts at the latest statement, else the opening balance, else the full loan on its
// start date. An opening balance is "after any payment that day", so only later payments count;
// a statement is issued before you pay it, so payments on its date count against it.
const startingPoint = (loan: Loan, entries: LoanPayment[]) => {
  const statement = latestStatement(loan, entries);
  if (statement) return { date: dateKeyToUtc(statement.paymentDate), balance: statement.amount, inclusive: true, statement };
  const hasOpening = loan.openingBalance != null && Boolean(loan.openingBalanceDate);
  const total = loan.interestMethod === 'Flat' ? loan.principal + flatTotalInterest(loan) : loan.principal;
  return {
    date: dateKeyToUtc(hasOpening ? loan.openingBalanceDate! : loan.startDate),
    balance: hasOpening ? loan.openingBalance! : total,
    inclusive: false,
    statement: undefined,
  };
};

// The payments that count against the current starting point, oldest first.
export const paymentsForLoan = (loan: Loan, entries: LoanPayment[]) => {
  const start = startingPoint(loan, entries);
  return entries
    .filter(entry => {
      if (entry.loanId !== loan.id || isStatementEntry(entry)) return false;
      const date = dateKeyToUtc(entry.paymentDate);
      return start.inclusive ? date >= start.date : date > start.date;
    })
    .sort(byEntryDate);
};

// Every payment and statement on the loan, newest first, for its history list.
export const loanHistory = (loan: Loan, entries: LoanPayment[]) =>
  entries.filter(entry => entry.loanId === loan.id).sort(byEntryDate).reverse();

export interface LoanStatus {
  // Reducing: principal still owed after the last payment (interest accrued since then is not
  // included). Flat: everything still payable, interest included.
  outstanding: number;
  principalOutstanding: number;
  totalPaid: number; // logged payments since tracking started
  interestPaid: number;
  progress: number; // 0..1 share of the original principal repaid (statement cards: of the statement)
  paidOff: boolean; // finished for good; never true for a statement card, which stays open
  cleared: boolean; // nothing owed right now
  statement?: { date: number; amount: number }; // the statement this balance counts down from
}

export const loanStatus = (loan: Loan, payments: LoanPayment[]): LoanStatus => {
  const start = startingPoint(loan, payments);
  const statementCard = isStatementLoan(loan);
  const relevant = paymentsForLoan(loan, payments);
  const totalPaid = relevant.reduce((sum, payment) => sum + payment.amount, 0);
  let outstanding: number;
  let principalOutstanding: number;
  let interestPaid = 0;

  if (loan.interestMethod === 'Flat') {
    // Each payment carries the same interest share the whole loan does.
    const totalPayable = loan.principal + flatTotalInterest(loan);
    const interestShare = totalPayable > 0 ? flatTotalInterest(loan) / totalPayable : 0;
    outstanding = Math.max(0, start.balance - totalPaid);
    principalOutstanding = outstanding * (1 - interestShare);
    interestPaid = Math.min(totalPaid, start.balance) * interestShare;
  } else {
    // Daily interest on what's owed (actual/365), settled first by each payment; a payment too
    // small to cover it leaves the rest added to the balance, as lenders do.
    let balance = start.balance;
    let last = start.date;
    // A card charges its interest on the next statement, which is logged as the new balance.
    const yearlyRate = statementCard ? 0 : loan.annualRate / 100;
    relevant.forEach(payment => {
      const date = dateKeyToUtc(payment.paymentDate);
      const interest = balance * yearlyRate * ((date - last) / DAY_MS) / 365;
      interestPaid += Math.min(payment.amount, interest);
      balance = Math.max(0, balance + interest - payment.amount);
      last = date;
    });
    outstanding = balance;
    principalOutstanding = balance;
  }

  const base = statementCard ? start.balance : loan.principal;
  const progress = base > 0 ? Math.min(1, Math.max(0, (base - principalOutstanding) / base)) : statementCard ? 1 : 0;
  const cleared = outstanding <= SETTLED;
  return {
    outstanding,
    principalOutstanding,
    totalPaid,
    interestPaid,
    progress,
    paidOff: cleared && !statementCard,
    cleared,
    statement: start.statement ? { date: start.date, amount: start.balance } : undefined,
  };
};

// ---------------------------------------------------------------------------------------------
// Due dates
// ---------------------------------------------------------------------------------------------

export interface DueStatus {
  nextDue: number;
  overdue: boolean;
  behind: number; // due dates up to `asOf` with no payment to match them
}

// Due dates run monthly on `paymentDay` from the first one after tracking starts. The Nth
// payment logged covers the Nth due date, so paying early moves the next due date along, and a
// due date with no payment to match it is overdue.
// A statement card instead owes its statement balance by the first due day after the statement.
export const dueStatus = (loan: Loan, payments: LoanPayment[], asOf: number): DueStatus | null => {
  if (!loan.paymentDay || loanStatus(loan, payments).cleared) return null;
  const start = startingPoint(loan, payments).date;
  let firstDue = addMonthsClamped(start, 0, loan.paymentDay);
  if (firstDue <= start) firstDue = addMonthsClamped(start, 1, loan.paymentDay);
  if (isStatementLoan(loan)) return { nextDue: firstDue, overdue: firstDue < asOf, behind: firstDue < asOf ? 1 : 0 };
  const paidCount = paymentsForLoan(loan, payments).length;
  const nextDue = addMonthsClamped(firstDue, paidCount, loan.paymentDay);
  let behind = 0;
  while (behind < MAX_MONTHS && addMonthsClamped(nextDue, behind, loan.paymentDay) < asOf) behind += 1;
  return { nextDue, overdue: behind > 0, behind };
};

// ---------------------------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------------------------

export interface ScheduleRow {
  date: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number; // after this payment, in the same terms as LoanStatus.outstanding
}

export interface Projection {
  months: number;
  payoffDate: number;
  interestRemaining: number;
  totalRemaining: number;
  schedule: ScheduleRow[];
}

const MAX_MONTHS = 1200;

// The remaining payments at the instalment (plus `extraMonthly`), starting from the next due
// date (or a month from `asOf` when the loan has no due day). Null when there's no instalment to
// project with; `months: Infinity` when the payment doesn't even cover the interest.
export const projectPayoff = (loan: Loan, payments: LoanPayment[], asOf: number, extraMonthly = 0): Projection | null => {
  const instalment = loanInstalment(loan);
  if (!instalment) return null;
  const status = loanStatus(loan, payments);
  const due = dueStatus(loan, payments, asOf);
  const firstDate = due ? due.nextDue : addMonthsClamped(asOf, 1);
  const pay = instalment + Math.max(0, extraMonthly);
  const schedule: ScheduleRow[] = [];
  if (status.cleared) return { months: 0, payoffDate: asOf, interestRemaining: 0, totalRemaining: 0, schedule };

  if (loan.interestMethod === 'Flat') {
    // Flat interest is fixed upfront: paying more finishes sooner but doesn't cut the interest
    // (unless the lender rebates it on early settlement).
    const totalPayable = loan.principal + flatTotalInterest(loan);
    const interestShare = totalPayable > 0 ? flatTotalInterest(loan) / totalPayable : 0;
    let remaining = status.outstanding;
    while (remaining > SETTLED && schedule.length < MAX_MONTHS) {
      const payment = Math.min(pay, remaining);
      remaining -= payment;
      schedule.push({
        date: addMonthsClamped(firstDate, schedule.length, loan.paymentDay),
        payment,
        interest: payment * interestShare,
        principal: payment * (1 - interestShare),
        balance: remaining,
      });
    }
  } else {
    const r = monthlyRate(loan.annualRate);
    let balance = status.outstanding;
    if (balance * r >= pay) {
      return { months: Infinity, payoffDate: Infinity, interestRemaining: Infinity, totalRemaining: Infinity, schedule };
    }
    while (balance > SETTLED && schedule.length < MAX_MONTHS) {
      const interest = balance * r;
      const payment = Math.min(pay, balance + interest);
      balance = balance + interest - payment;
      schedule.push({
        date: addMonthsClamped(firstDate, schedule.length, loan.paymentDay),
        payment,
        interest,
        principal: payment - interest,
        balance: Math.max(0, balance),
      });
    }
  }

  return {
    months: schedule.length,
    payoffDate: schedule.length ? schedule[schedule.length - 1].date : asOf,
    interestRemaining: schedule.reduce((sum, row) => sum + row.interest, 0),
    totalRemaining: schedule.reduce((sum, row) => sum + row.payment, 0),
    schedule,
  };
};

// ---------------------------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------------------------

// How close a due date has to be before it's flagged and shows up in notifications.
export const DUE_SOON_DAYS = 7;

export interface LoanDue {
  loan: Loan;
  nextDue: number;
  days: number; // until the due date; negative once it's passed
  overdue: boolean;
  amount?: number; // what to pay: the statement left (cards) or the instalments due
}

// Active loans with a payment due within `withinDays` of `asOf`, or overdue, soonest first.
export const loanDues = (loans: Loan[], payments: LoanPayment[], asOf: number, withinDays = DUE_SOON_DAYS): LoanDue[] =>
  loans
    .filter(loan => !loan.isArchived)
    .flatMap(loan => {
      const due = dueStatus(loan, payments, asOf);
      if (!due) return [];
      const days = Math.round((due.nextDue - asOf) / DAY_MS);
      if (!due.overdue && days > withinDays) return [];
      const status = loanStatus(loan, payments);
      const instalment = loanInstalment(loan);
      const amount = isStatementLoan(loan)
        ? status.outstanding
        : instalment ? Math.min(instalment * Math.max(1, due.behind), status.outstanding) : undefined;
      return [{ loan, nextDue: due.nextDue, days, overdue: due.overdue, amount }];
    })
    .sort((a, b) => a.nextDue - b.nextDue);

// A statement file uploaded at least this long after the balance a card is counting down from
// is probably the next month's statement; anything sooner is the same one being filed away.
export const NEW_STATEMENT_GAP_DAYS = 20;

export const isLikelyNewStatement = (loan: Loan, payments: LoanPayment[], uploadedAt: string) =>
  dateKeyToUtc(uploadedAt.slice(0, 10)) - startingPoint(loan, payments).date >= NEW_STATEMENT_GAP_DAYS * DAY_MS;
