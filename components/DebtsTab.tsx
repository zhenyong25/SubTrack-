import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, FileText, HandCoins, Pencil, Plus, Trash2, X } from 'lucide-react';
import { CURRENCIES } from '../types';
import type { AccountStatement, Loan, LoanEntryType, LoanInterestMethod, LoanKind, LoanPayment, PaymentCard } from '../types';
import { convertCurrency, getCurrencySymbol } from '../services/storageService';
import { findBank } from '../services/bankLogoService';
import BankLogo from './BankLogo';
import ReceivablesPanel from './ReceivablesPanel';
import { dateKeyToUtc } from '../services/portfolioAnalyticsService';
import {
  dueStatus,
  flatEquivalentRate,
  flatTotalInterest,
  isStatementLoan,
  latestMonthlyDate,
  loanHistory,
  loanInstalment,
  loanStatus,
  projectPayoff,
  standardInstalment,
  DUE_SOON_DAYS,
  isLikelyNewStatement,
  type DueStatus,
  type LoanStatus,
  type Projection,
} from '../services/loanService';

interface DebtsTabProps {
  baseCurrency: string;
  loans: Loan[];
  payments: LoanPayment[];
  onSaveLoan: (loan: Loan) => void;
  onDeleteLoan: (loanId: string) => void;
  onAddPayment: (payment: LoanPayment) => void;
  onDeletePayment: (paymentId: string) => void;
  cards: PaymentCard[];
  cardStatements: AccountStatement[]; // statement files uploaded on the Cards tab
  // Set when arriving from a card's page: open that card's debt, or start one for it.
  focusCardId?: string | null;
  focusLoanId?: string | null;
  onLoanFocusHandled?: () => void;
  onFocusHandled?: () => void;
}

const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

// Overdue, or due within DUE_SOON_DAYS: shown in red and listed in the header notifications.
const isDueSoon = (due: DueStatus, asOf: number) => due.overdue || due.nextDue - asOf <= DUE_SOON_DAYS * 24 * 60 * 60 * 1000;

// Statement-upload prompts dismissed on this device, by statement file id.
const DISMISSED_UPLOADS_KEY = 'subtrack_dismissed_statement_prompts_v1';
const readDismissedUploads = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_UPLOADS_KEY) || '[]') as string[]);
  } catch {
    return new Set();
  }
};
const writeDismissedUploads = (ids: Set<string>) => {
  try {
    localStorage.setItem(DISMISSED_UPLOADS_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable (private mode): the dismissal just won't outlast this visit.
  }
};
const cardLabel = (card: PaymentCard) => `${card.name}${card.last4Digits ? ` ••${card.last4Digits}` : ''}`;

const KINDS: LoanKind[] = ['Mortgage', 'Car', 'Personal', 'Student', 'Credit card', 'Instalment plan', 'Family & friends', 'Other'];
const KIND_DEFAULTS: Record<LoanKind, { color: string; method: LoanInterestMethod }> = {
  Mortgage: { color: '#2563eb', method: 'Reducing' },
  Car: { color: '#f59e0b', method: 'Flat' },
  Personal: { color: '#8b5cf6', method: 'Reducing' },
  Student: { color: '#0ea5e9', method: 'Reducing' },
  'Credit card': { color: '#ef4444', method: 'Reducing' },
  'Instalment plan': { color: '#ec4899', method: 'Flat' },
  'Family & friends': { color: '#10b981', method: 'Reducing' },
  Other: { color: '#64748b', method: 'Reducing' },
};
const COLORS = ['#2563eb', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ef4444', '#ec4899', '#10b981', '#64748b'];

const INPUT_CLASS = 'w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:border-primary outline-none';
const SELECT_CLASS = `${INPUT_CLASS} [color-scheme:light] dark:[color-scheme:dark]`;
const LABEL_CLASS = 'block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1';

const todayKey = () => new Date().toLocaleDateString('en-CA');
const formatMoney = (value: number, currency: string) =>
  `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
// Loan dates are UTC midnights, so they're shown in UTC to keep the calendar day intact.
const formatDate = (timestamp: number, withYear = true) =>
  new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const formatMonthYear = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
const formatDuration = (months: number) => {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} month${rest === 1 ? '' : 's'}`;
  return `${years} yr${years === 1 ? '' : 's'}${rest ? ` ${rest} mo` : ''}`;
};
const daysUntil = (timestamp: number, asOf: number) => Math.round((timestamp - asOf) / (24 * 60 * 60 * 1000));

interface LoanView {
  loan: Loan;
  status: LoanStatus;
  due: DueStatus | null;
  projection: Projection | null;
  instalment?: number;
}

const Stat: React.FC<{ label: string; value: string; note: string; tone?: string }> = ({ label, value, note, tone = 'text-textMain' }) => (
  <div className="rounded-2xl border border-border bg-background p-4">
    <p className="text-xs font-bold uppercase tracking-wider text-secondary">{label}</p>
    <p className={`mt-2 text-base font-extrabold tabular-nums sm:text-xl ${tone}`}>{value}</p>
    <p className="mt-1 text-[11px] text-secondary">{note}</p>
  </div>
);

// ---------------------------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------------------------

interface LoanFormState {
  id?: string;
  name: string;
  lender: string;
  kind: LoanKind;
  currency: string;
  principal: string;
  annualRate: string;
  interestMethod: LoanInterestMethod;
  termMonths: string;
  startDate: string;
  paymentDay: string;
  instalment: string;
  hasOpening: boolean;
  openingBalance: string;
  openingBalanceDate: string;
  cardId: string;
  color: string;
  notes: string;
  isArchived: boolean;
  createdAt?: string;
}

const emptyLoanForm = (currency: string): LoanFormState => ({
  name: '', lender: '', kind: 'Personal', currency, principal: '', annualRate: '', interestMethod: 'Reducing',
  termMonths: '', startDate: todayKey(), paymentDay: '', instalment: '', hasOpening: false,
  openingBalance: '', openingBalanceDate: todayKey(), cardId: '', color: KIND_DEFAULTS.Personal.color, notes: '', isArchived: false,
});

// A new credit card debt for a card from the Cards tab: its name and colour, and the date its
// latest statement closed when the card has a statement day.
// The name follows the card unless it was typed by hand.
const formForCard = (form: LoanFormState, card: PaymentCard | undefined, previous: PaymentCard | undefined): LoanFormState => {
  if (!card) return { ...form, cardId: '' };
  return {
    ...form,
    cardId: card.id,
    name: !form.name.trim() || form.name === previous?.name ? card.name : form.name,
    color: isHexColor(card.color) ? card.color : form.color,
    startDate: !form.id && card.statementDay ? new Date(latestMonthlyDate(card.statementDay, dateKeyToUtc(todayKey()))).toISOString().slice(0, 10) : form.startDate,
  };
};

const loanToForm = (loan: Loan): LoanFormState => ({
  id: loan.id,
  name: loan.name,
  lender: loan.lender || '',
  kind: loan.kind,
  currency: loan.currency,
  principal: String(loan.principal),
  annualRate: String(loan.annualRate),
  interestMethod: loan.interestMethod,
  termMonths: loan.termMonths ? String(loan.termMonths) : '',
  startDate: loan.startDate,
  paymentDay: loan.paymentDay ? String(loan.paymentDay) : '',
  instalment: loan.instalment ? String(loan.instalment) : '',
  hasOpening: loan.openingBalance != null,
  openingBalance: loan.openingBalance != null ? String(loan.openingBalance) : '',
  openingBalanceDate: loan.openingBalanceDate || todayKey(),
  cardId: loan.cardId || '',
  color: loan.color,
  notes: loan.notes || '',
  isArchived: Boolean(loan.isArchived),
  createdAt: loan.createdAt,
});

const optionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value));

// A statement card is just its first statement (principal on startDate) plus a due day; term,
// instalment and opening balance don't apply, since each new statement sets the balance.
const formToLoan = (form: LoanFormState): Loan => {
  const statementCard = isStatementLoan(form);
  return {
    id: form.id || crypto.randomUUID(),
    name: form.name.trim(),
    lender: form.lender.trim() || undefined,
    kind: form.kind,
    currency: form.currency,
    principal: Number(form.principal),
    annualRate: Number(form.annualRate || 0),
    interestMethod: statementCard ? 'Reducing' : form.interestMethod,
    termMonths: statementCard ? undefined : optionalNumber(form.termMonths),
    startDate: form.startDate,
    paymentDay: optionalNumber(form.paymentDay),
    instalment: statementCard ? undefined : optionalNumber(form.instalment),
    openingBalance: !statementCard && form.hasOpening ? optionalNumber(form.openingBalance) : undefined,
    openingBalanceDate: !statementCard && form.hasOpening ? form.openingBalanceDate : undefined,
    cardId: statementCard && form.cardId ? form.cardId : undefined,
    color: form.color,
    notes: form.notes.trim() || undefined,
    isArchived: form.isArchived,
    createdAt: form.createdAt,
  };
};

const loanFormProblem = (form: LoanFormState): string | null => {
  if (!form.name.trim()) return 'Give the loan a name.';
  if (isStatementLoan(form)) {
    if (form.principal.trim() === '' || !(Number(form.principal) >= 0)) return 'Enter the balance on your latest statement.';
    const statementDay = optionalNumber(form.paymentDay);
    if (statementDay !== undefined && !(Number.isInteger(statementDay) && statementDay >= 1 && statementDay <= 31)) return 'The due day is a day of the month, 1-31.';
    if (!form.startDate) return 'Enter the statement date.';
    return null;
  }
  if (!(Number(form.principal) > 0)) return 'Enter the amount borrowed.';
  if (form.annualRate !== '' && !(Number(form.annualRate) >= 0)) return 'The interest rate can\'t be negative.';
  const term = optionalNumber(form.termMonths);
  if (term !== undefined && !(Number.isInteger(term) && term > 0)) return 'The term is a whole number of months.';
  if (form.interestMethod === 'Flat' && !term) return 'Flat-rate loans need a term to work out the interest.';
  const day = optionalNumber(form.paymentDay);
  if (day !== undefined && !(Number.isInteger(day) && day >= 1 && day <= 31)) return 'The due day is a day of the month, 1-31.';
  const instalment = optionalNumber(form.instalment);
  if (instalment !== undefined && !(instalment > 0)) return 'The instalment must be more than zero.';
  if (form.hasOpening && !(Number(form.openingBalance) >= 0 && form.openingBalance.trim() !== '')) return 'Enter what was still owed.';
  if (!form.startDate) return 'Enter when the money was borrowed.';
  return null;
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={onClose}>
    <div
      className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-border my-4 sm:my-8 max-h-[95vh] flex flex-col"
      onClick={event => event.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="p-4 border-b border-border flex justify-between items-center bg-background shrink-0">
        <h3 className="text-base font-bold text-textMain">{title}</h3>
        <button type="button" onClick={onClose} className="text-secondary hover:text-textMain p-1 -mr-1" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">{children}</div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------------------------

const DebtsTab: React.FC<DebtsTabProps> = ({ baseCurrency, loans, payments, onSaveLoan, onDeleteLoan, onAddPayment, onDeletePayment, cards, cardStatements, focusCardId, onFocusHandled, focusLoanId, onLoanFocusHandled }) => {
  const [direction, setDirection] = useState<'owe' | 'collect' | 'all'>('all');
  React.useEffect(() => { if (focusCardId || focusLoanId) setDirection('owe'); }, [focusCardId, focusLoanId]);
  const [loanForm, setLoanForm] = useState<LoanFormState | null>(null);
  const [paymentForm, setPaymentForm] = useState<{ loanId: string; entryType: LoanEntryType; date: string; amount: string; notes: string } | null>(null);
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  const [extraPayment, setExtraPayment] = useState('');
  const [showAllSchedule, setShowAllSchedule] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const asOf = dateKeyToUtc(todayKey());

  const cardsById = useMemo(() => new Map<string, PaymentCard>(cards.map(card => [card.id, card])), [cards]);
  const linkedCard = (loan: Loan) => (loan.cardId ? cardsById.get(loan.cardId) : undefined);
  // The bank behind a loan, from its lender, its linked card, or its own name.
  const loanBank = (loan: Loan) => findBank(loan.lender, linkedCard(loan)?.name, loan.name);
  const creditCards = cards.filter(card => card.kind === 'Credit');

  const [dismissedUploads, setDismissedUploads] = useState<Set<string>>(readDismissedUploads);
  const dismissUpload = (statementId: string) => {
    const next = new Set<string>(dismissedUploads).add(statementId);
    setDismissedUploads(next);
    writeDismissedUploads(next);
  };

  // The newest statement file uploaded for a linked card that looks like a statement after the
  // one being counted down (not that same statement filed a few days later), so the card can
  // prompt for its balance - unless the prompt was dismissed.
  const pendingUpload = (loan: Loan): AccountStatement | undefined => {
    if (!loan.cardId || !isStatementLoan(loan)) return undefined;
    return cardStatements
      .filter(statement => statement.cardId === loan.cardId && !dismissedUploads.has(statement.id) && isLikelyNewStatement(loan, payments, statement.uploadedAt))
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
  };

  // Arriving from a card's page: open its debt if one is linked, otherwise start one for it.
  React.useEffect(() => {
    if (!focusCardId) return;
    const existing = loans.find(loan => loan.cardId === focusCardId);
    if (existing) {
      setExpandedLoanId(existing.id);
      if (existing.isArchived) setShowSettled(true);
    } else {
      const card = cards.find(item => item.id === focusCardId);
      if (card) {
        const base = { ...emptyLoanForm(baseCurrency), kind: 'Credit card' as LoanKind, color: KIND_DEFAULTS['Credit card'].color };
        setLoanForm(formForCard(base, card, undefined));
      }
    }
    onFocusHandled?.();
  }, [focusCardId]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!focusLoanId) return;
    setExpandedLoanId(focusLoanId); setShowSettled(true);
    const frame = requestAnimationFrame(() => { const target = document.getElementById(`debt-${focusLoanId}`); target?.focus({ preventScroll: true }); target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); onLoanFocusHandled?.(); });
    return () => cancelAnimationFrame(frame);
  }, [focusLoanId]);

  const views = useMemo<LoanView[]>(() => loans.map(loan => ({
    loan,
    status: loanStatus(loan, payments),
    due: dueStatus(loan, payments, asOf),
    projection: projectPayoff(loan, payments, asOf),
    instalment: loanInstalment(loan),
  })), [loans, payments, asOf]);

  const active = views.filter(view => !view.status.paidOff && !view.loan.isArchived);
  const settled = views.filter(view => view.status.paidOff || view.loan.isArchived);

  const summary = useMemo(() => {
    const toBase = (amount: number, currency: string) => convertCurrency(amount, currency || baseCurrency, baseCurrency);
    const owed = active.reduce((sum, view) => sum + toBase(view.status.outstanding, view.loan.currency), 0);
    // A statement card's "instalment" is whatever's left of its current statement.
    const monthly = active.reduce((sum, view) => sum + toBase(isStatementLoan(view.loan) ? view.status.outstanding : view.instalment || 0, view.loan.currency), 0);
    const interestPaid = views.reduce((sum, view) => sum + toBase(view.status.interestPaid, view.loan.currency), 0);
    const interestAhead = active.reduce((sum, view) => sum + (view.projection && Number.isFinite(view.projection.interestRemaining) ? toBase(view.projection.interestRemaining, view.loan.currency) : 0), 0);
    // Flat loans count at their reducing-balance equivalent, so the average reflects what they really cost.
    const weighted = active.reduce((acc, view) => {
      const rate = view.loan.interestMethod === 'Flat' ? flatEquivalentRate(view.loan) ?? view.loan.annualRate : view.loan.annualRate;
      const weight = toBase(view.status.principalOutstanding, view.loan.currency);
      return { total: acc.total + rate * weight, weight: acc.weight + weight };
    }, { total: 0, weight: 0 });
    // Cards are cleared statement by statement rather than paid off on a schedule, so the
    // debt-free date only covers instalment loans.
    const termLoans = active.filter(view => !isStatementLoan(view.loan));
    const payoffs = termLoans.map(view => view.projection?.payoffDate);
    const debtFree = termLoans.length === 0 ? null
      : payoffs.some(date => date === undefined || !Number.isFinite(date)) ? undefined
        : Math.max(...(payoffs as number[]));
    const cardCount = active.length - termLoans.length;
    return { owed, monthly, interestPaid, interestAhead, averageRate: weighted.weight > 0 ? weighted.total / weighted.weight : 0, debtFree, cardCount, termLoanCount: termLoans.length };
  }, [active, views, baseCurrency]);

  const upcoming = active
    .filter((view): view is LoanView & { due: DueStatus } => Boolean(view.due))
    .sort((a, b) => a.due.nextDue - b.due.nextDue);

  const openNewLoan = () => setLoanForm(emptyLoanForm(baseCurrency));
  // A statement card's payment defaults to clearing what's left of the statement.
  const openPayment = (view: LoanView) => setPaymentForm({
    loanId: view.loan.id,
    entryType: 'payment',
    date: todayKey(),
    amount: isStatementLoan(view.loan)
      ? (view.status.outstanding > 0 ? view.status.outstanding.toFixed(2) : '')
      : view.instalment ? Math.min(view.instalment, view.status.outstanding).toFixed(2) : '',
    notes: '',
  });
  // A linked card's statement date defaults to when its latest statement closed; an uploaded
  // statement file lends its period as the note.
  const openStatement = (view: LoanView, upload?: AccountStatement) => {
    const statementDay = linkedCard(view.loan)?.statementDay;
    setPaymentForm({
      loanId: view.loan.id,
      entryType: 'statement',
      date: statementDay ? new Date(latestMonthlyDate(statementDay, asOf)).toISOString().slice(0, 10) : todayKey(),
      amount: '',
      notes: upload?.statementPeriod || '',
    });
  };

  const saveLoanForm = () => {
    if (!loanForm || loanFormProblem(loanForm)) return;
    onSaveLoan(formToLoan(loanForm));
    setLoanForm(null);
  };

  // Payments must be positive; a statement can be zero (nothing spent that month).
  const entryAmountValid = (form: NonNullable<typeof paymentForm>) =>
    form.amount.trim() !== '' && (form.entryType === 'statement' ? Number(form.amount) >= 0 : Number(form.amount) > 0);

  const savePayment = () => {
    if (!paymentForm || !entryAmountValid(paymentForm) || !paymentForm.date) return;
    onAddPayment({
      id: crypto.randomUUID(),
      loanId: paymentForm.loanId,
      entryType: paymentForm.entryType,
      paymentDate: paymentForm.date,
      amount: Number(paymentForm.amount),
      notes: paymentForm.notes.trim() || undefined,
      // Orders same-day entries, e.g. a payment logged right after that day's statement.
      createdAt: new Date().toISOString(),
    });
    setPaymentForm(null);
  };

  const deleteLoan = (loan: Loan) => {
    if (confirm(`Delete ${loan.name} and all of its logged payments? This can't be undone.`)) onDeleteLoan(loan.id);
  };

  const toggleDetails = (loanId: string) => {
    setExpandedLoanId(current => (current === loanId ? null : loanId));
    setExtraPayment('');
    setShowAllSchedule(false);
  };

  const rateLabel = (loan: Loan) => {
    if (loan.interestMethod !== 'Flat') return `${loan.annualRate}% a year`;
    const equivalent = flatEquivalentRate(loan);
    return `${loan.annualRate}% flat${equivalent ? ` ≈ ${equivalent.toFixed(2)}% effective` : ''}`;
  };

  const renderLoanCard = (view: LoanView) => {
    const { loan, status, due, projection, instalment } = view;
    const isOpen = expandedLoanId === loan.id;
    const statementCard = isStatementLoan(loan);
    const card = linkedCard(loan);
    const upload = pendingUpload(loan);
    const history = loanHistory(loan, payments);
    const extra = Number(extraPayment) > 0 ? Number(extraPayment) : 0;
    const faster = isOpen && extra > 0 ? projectPayoff(loan, payments, asOf, extra) : null;
    const schedule = projection?.schedule || [];

    return (
      // While any card is expanded, cards keep their own height instead of stretching to the open one.
      <article key={loan.id} id={`debt-${loan.id}`} tabIndex={-1} className={`rounded-2xl border border-border bg-background p-4 focus:outline-none focus:ring-2 focus:ring-primary ${expandedLoanId ? 'self-start' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <BankLogo bank={loanBank(loan)} className="h-8 w-8" fallback={<span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: loan.color }} />} />
            <div className="min-w-0">
              <h4 className="truncate font-bold text-textMain">{loan.name}</h4>
              <p className="mt-0.5 truncate text-[11px] text-secondary">
                {loan.kind}{loan.lender ? ` · ${loan.lender}` : ''}
                {card && <span title="Linked to this card in the Cards tab"> · Linked to {cardLabel(card)}</span>}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-extrabold tabular-nums text-textMain">{formatMoney(status.outstanding, loan.currency)}</p>
            <p className="text-[10px] text-secondary">
              {statementCard
                ? (status.cleared ? 'statement paid in full' : 'left on this statement')
                : status.paidOff ? 'Paid off' : loan.interestMethod === 'Flat' ? 'left to pay, incl. interest' : 'still owed'}
            </p>
          </div>
        </div>

        {upload && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary bg-surface px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] text-textMain">
              <FileText size={13} className="shrink-0 text-primary" />
              New statement uploaded{upload.statementPeriod ? ` (${upload.statementPeriod})` : ''} on {formatDate(dateKeyToUtc(upload.uploadedAt.slice(0, 10)), false)}. Log its balance?
            </p>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => openStatement(view, upload)} className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-white">
                Log statement
              </button>
              <button
                type="button"
                onClick={() => dismissUpload(upload.id)}
                className="rounded-lg p-1 text-secondary hover:text-textMain"
                aria-label="Dismiss"
                title="Not a new statement - don't ask again for this file"
              >
                <X size={14} />
              </button>
            </span>
          </div>
        )}

        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(status.progress * 100)} aria-label={`${loan.name} repaid`}>
            <div className="h-full rounded-full" style={{ width: `${status.progress * 100}%`, backgroundColor: loan.color }} />
          </div>
          <p className="mt-1 flex justify-between text-[10px] text-secondary">
            {statementCard ? (
              <span><strong className="text-textMain">{(status.progress * 100).toFixed(0)}%</strong> of the {formatDate(status.statement?.date ?? dateKeyToUtc(loan.startDate))} statement paid</span>
            ) : (
              <span><strong className="text-textMain">{(status.progress * 100).toFixed(1)}%</strong> of {formatMoney(loan.principal, loan.currency)} repaid</span>
            )}
            {status.interestPaid > 0 && <span>{formatMoney(status.interestPaid, loan.currency)} interest paid</span>}
          </p>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded-xl border border-border bg-surface px-3 py-2">
            <dt className="font-bold uppercase tracking-wide text-secondary">Rate</dt>
            <dd className="mt-1 text-xs font-bold text-textMain">{rateLabel(loan)}</dd>
          </div>
          {statementCard ? (
            <div className="rounded-xl border border-border bg-surface px-3 py-2">
              <dt className="font-bold uppercase tracking-wide text-secondary">Latest statement</dt>
              <dd className="mt-1 text-xs font-bold text-textMain">
                {formatMoney(status.statement?.amount ?? loan.principal, loan.currency)} · {formatDate(status.statement?.date ?? dateKeyToUtc(loan.startDate), false)}
              </dd>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface px-3 py-2">
              <dt className="font-bold uppercase tracking-wide text-secondary">Instalment</dt>
              <dd className="mt-1 text-xs font-bold text-textMain">{instalment ? `${formatMoney(instalment, loan.currency)} / mo` : 'Not set'}</dd>
            </div>
          )}
          <div className="rounded-xl border border-border bg-surface px-3 py-2">
            <dt className="font-bold uppercase tracking-wide text-secondary">Next due</dt>
            <dd className={`mt-1 flex items-center gap-1 text-xs font-bold ${due && isDueSoon(due, asOf) ? 'text-red-500' : 'text-textMain'}`}>
              {due && isDueSoon(due, asOf) && <AlertTriangle size={12} className="shrink-0" />}
              {status.cleared ? (statementCard ? 'Nothing due' : '—') : due ? `${formatDate(due.nextDue)}${due.overdue ? ' (overdue)' : ''}` : 'No due day set'}
            </dd>
          </div>
          {statementCard ? (
            <div className="rounded-xl border border-border bg-surface px-3 py-2">
              <dt className="font-bold uppercase tracking-wide text-secondary">Status</dt>
              <dd className={`mt-1 flex items-center gap-1 text-xs font-bold ${status.cleared ? 'text-emerald-500' : 'text-textMain'}`}>
                {status.cleared ? <><CheckCircle2 size={13} /> Paid in full</> : `${formatMoney(status.outstanding, loan.currency)} to pay`}
              </dd>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface px-3 py-2">
              <dt className="font-bold uppercase tracking-wide text-secondary">Paid off</dt>
              <dd className="mt-1 text-xs font-bold text-textMain">
                {status.paidOff ? 'Done' : !projection ? 'Set an instalment' : !Number.isFinite(projection.months) ? <span className="text-red-500">Never at this rate</span> : `${formatMonthYear(projection.payoffDate)} · ${formatDuration(projection.months)}`}
              </dd>
            </div>
          )}
        </dl>

        {projection && !Number.isFinite(projection.months) && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-red-500">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            The instalment doesn't cover the monthly interest, so the balance keeps growing.
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          {statementCard && (
            <button type="button" onClick={() => openStatement(view)} className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${status.cleared ? 'bg-primary text-white' : 'border border-border text-primary hover:border-primary'}`}>
              <FileText size={12} /> New statement
            </button>
          )}
          {!status.cleared && (
            <button type="button" onClick={() => openPayment(view)} className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-white">
              <Plus size={12} /> Log payment
            </button>
          )}
          <button type="button" onClick={() => toggleDetails(loan.id)} aria-expanded={isOpen} className="flex items-center gap-1 text-xs font-bold text-secondary hover:text-textMain">
            <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} /> {isOpen ? 'Hide details' : 'Details'}
          </button>
          <button type="button" onClick={() => setLoanForm(loanToForm(loan))} className="flex items-center gap-1 text-xs font-bold text-primary">
            <Pencil size={12} /> Edit
          </button>
          <button type="button" onClick={() => deleteLoan(loan)} className="flex items-center gap-1 text-xs font-bold text-rose-500">
            <Trash2 size={12} /> Delete
          </button>
        </div>

        {isOpen && (
          <div className="mt-3 space-y-4 border-t border-border pt-3">
            {!status.paidOff && projection && Number.isFinite(projection.months) && (
              <div>
                <h5 className="text-[10px] font-bold uppercase tracking-wide text-secondary">Still to pay</h5>
                <p className="mt-1 text-xs text-textMain">
                  {formatMoney(projection.totalRemaining, loan.currency)} over {formatDuration(projection.months)}, of which <strong>{formatMoney(projection.interestRemaining, loan.currency)}</strong> is interest.
                </p>
              </div>
            )}

            {!status.paidOff && instalment && (
              <div className="rounded-xl border border-border bg-surface p-3">
                <label htmlFor={`extra-${loan.id}`} className="text-[10px] font-bold uppercase tracking-wide text-secondary">What if I pay extra each month?</label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id={`extra-${loan.id}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={extraPayment}
                    onChange={event => setExtraPayment(event.target.value)}
                    placeholder="e.g. 200"
                    className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-primary"
                  />
                  <span className="text-xs text-secondary">{loan.currency} on top of {formatMoney(instalment, loan.currency)}</span>
                </div>
                {faster && projection && Number.isFinite(faster.months) && Number.isFinite(projection.months) && (
                  <p className="mt-2 text-xs text-textMain">
                    Paid off <strong>{formatMonthYear(faster.payoffDate)}</strong>, {formatDuration(projection.months - faster.months)} sooner
                    {loan.interestMethod === 'Flat'
                      ? '. Flat-rate interest is fixed upfront, so it only saves interest if the lender rebates it for settling early.'
                      : <>, saving <strong className="text-emerald-500">{formatMoney(projection.interestRemaining - faster.interestRemaining, loan.currency)}</strong> in interest.</>}
                  </p>
                )}
                {faster && !Number.isFinite(faster.months) && <p className="mt-2 text-xs text-red-500">Still not enough to cover the interest.</p>}
              </div>
            )}

            <div>
              <h5 className="text-[10px] font-bold uppercase tracking-wide text-secondary">{statementCard ? 'Statements & payments' : 'Payments'} ({history.length})</h5>
              {history.length === 0 ? (
                <p className="mt-1 text-xs text-secondary">
                  {statementCard
                    ? 'Nothing logged yet. Add each month\'s statement with "New statement", then log what you pay.'
                    : `No payments logged ${loan.openingBalance != null && loan.openingBalanceDate ? `since ${formatDate(dateKeyToUtc(loan.openingBalanceDate))}` : 'yet'}.`}
                </p>
              ) : (
                <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                  {history.map(payment => (
                    <li key={payment.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-secondary">{formatDate(dateKeyToUtc(payment.paymentDate))}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-secondary">
                        {payment.entryType === 'statement' && <span className="mr-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-textMain">Statement</span>}
                        {payment.notes}
                      </span>
                      <span className={`font-semibold tabular-nums ${payment.entryType === 'statement' ? 'text-textMain' : 'text-emerald-500'}`}>
                        {payment.entryType === 'statement' ? '' : '−'}{formatMoney(payment.amount, loan.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => { if (confirm(`Delete the ${payment.paymentDate} ${payment.entryType === 'statement' ? 'statement' : 'payment'}?`)) onDeletePayment(payment.id); }}
                        className="shrink-0 text-secondary hover:text-red-500"
                        aria-label={payment.entryType === 'statement' ? 'Delete statement' : 'Delete payment'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {schedule.length > 0 && (
              <div>
                <h5 className="text-[10px] font-bold uppercase tracking-wide text-secondary">Repayment schedule</h5>
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[420px] whitespace-nowrap text-left text-[11px]">
                    <thead className="bg-surface text-[10px] uppercase tracking-wide text-secondary">
                      <tr>
                        <th className="px-2.5 py-1.5 font-bold">Due</th>
                        <th className="px-2.5 py-1.5 text-right font-bold">Payment</th>
                        <th className="px-2.5 py-1.5 text-right font-bold">Interest</th>
                        <th className="px-2.5 py-1.5 text-right font-bold">Principal</th>
                        <th className="px-2.5 py-1.5 text-right font-bold">Left</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(showAllSchedule ? schedule : schedule.slice(0, 12)).map(row => (
                        <tr key={row.date}>
                          <td className="px-2.5 py-1.5 text-textMain">{formatDate(row.date)}</td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums text-textMain">{row.payment.toFixed(2)}</td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums text-secondary">{row.interest.toFixed(2)}</td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums text-secondary">{row.principal.toFixed(2)}</td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums text-textMain">{row.balance.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {schedule.length > 12 && (
                  <button type="button" onClick={() => setShowAllSchedule(value => !value)} className="mt-2 text-xs font-bold text-primary">
                    {showAllSchedule ? 'Show the next 12 only' : `Show all ${schedule.length} payments`}
                  </button>
                )}
                <p className="mt-2 text-[10px] text-secondary">
                  {loan.interestMethod === 'Flat'
                    ? 'Flat rate: every instalment carries the same share of interest.'
                    : 'Estimated with monthly interest; your lender may charge daily, so figures can differ by a little.'}
                </p>
              </div>
            )}
          </div>
        )}
      </article>
    );
  };

  // ---- Loan form helpers --------------------------------------------------------------------
  const formProblem = loanForm ? loanFormProblem(loanForm) : null;
  const suggestedInstalment = loanForm && Number(loanForm.principal) > 0
    ? standardInstalment({
      principal: Number(loanForm.principal),
      annualRate: Number(loanForm.annualRate || 0),
      termMonths: optionalNumber(loanForm.termMonths),
      interestMethod: loanForm.interestMethod,
    })
    : undefined;
  const formFlatEquivalent = loanForm && loanForm.interestMethod === 'Flat' && Number(loanForm.principal) > 0 && optionalNumber(loanForm.termMonths)
    ? flatEquivalentRate({ principal: Number(loanForm.principal), annualRate: Number(loanForm.annualRate || 0), termMonths: optionalNumber(loanForm.termMonths), interestMethod: 'Flat' })
    : undefined;
  const updateForm = (patch: Partial<LoanFormState>) => setLoanForm(current => (current ? { ...current, ...patch } : current));

  const cardForm = Boolean(loanForm && isStatementLoan(loanForm));
  const paymentLoan = paymentForm ? views.find(view => view.loan.id === paymentForm.loanId) : undefined;

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Debt direction" className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">{([{ id: 'all', label: 'All' }, { id: 'owe', label: 'I owe' }, { id: 'collect', label: 'Owed to me' }] as const).map(option => <button key={option.id} type="button" aria-pressed={direction === option.id} onClick={() => setDirection(option.id)} className={`rounded-lg px-4 py-2 text-xs font-bold ${direction === option.id ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}>{option.label}</button>)}</div>
      {direction !== 'collect' && <div className={`desktop-layout debts-layout ${direction === 'owe' ? 'pb-24' : ''} animate-fade-in space-y-6`}>
      <section className="debts-summary bg-surface rounded-2xl border border-border p-4 shadow-sm" aria-labelledby="debts-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Debt overview</p>
            <h3 id="debts-heading" className="mt-1 text-lg font-extrabold text-textMain">Debts &amp; loans</h3>
            <p className="mt-1 text-xs text-secondary">What you owe, what it costs, and when it'll be gone.</p>
          </div>
          <button type="button" onClick={openNewLoan} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white shadow-sm">
            <Plus size={14} /> Add loan
          </button>
        </div>

        {loans.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total owed" value={formatMoney(summary.owed, baseCurrency)} note={`Across ${active.length} active loan${active.length === 1 ? '' : 's'}`} />
            <Stat
              label="Monthly repayments"
              value={formatMoney(summary.monthly, baseCurrency)}
              note={summary.cardCount > 0 ? 'Instalments + unpaid card statements' : 'Sum of instalments'}
            />
            <Stat
              label="Debt-free by"
              value={summary.debtFree === null ? (summary.cardCount > 0 ? 'Cards only' : 'Now') : summary.debtFree === undefined ? '—' : formatMonthYear(summary.debtFree)}
              note={summary.debtFree === null
                ? (summary.cardCount > 0 ? 'Cards are cleared each statement' : 'Nothing left to repay')
                : summary.debtFree === undefined
                  ? 'Needs an instalment that covers interest on every loan'
                  : `At the current instalments${summary.cardCount > 0 ? ', excluding cards' : ''}`}
            />
            <Stat
              label="Interest"
              value={formatMoney(summary.interestAhead, baseCurrency)}
              note={`still to pay · ${formatMoney(summary.interestPaid, baseCurrency)} paid so far · avg ${summary.averageRate.toFixed(2)}%`}
            />
          </div>
        )}
      </section>

      {loans.length === 0 ? (
        <section className="bg-surface rounded-2xl border border-border p-4 shadow-sm">
          <div className="py-10 text-center text-secondary">
            <HandCoins size={26} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-textMain">No debts tracked yet.</p>
            <p className="mx-auto mt-1 max-w-sm text-xs">Add a mortgage, car loan, credit card balance or money you owe someone to see your balance, payment dates and when you'll be debt-free.</p>
            <button type="button" onClick={openNewLoan} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white">
              <Plus size={14} /> Add your first loan
            </button>
          </div>
        </section>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="debts-upcoming bg-surface rounded-2xl border border-border p-4 shadow-sm" aria-labelledby="debts-upcoming-heading">
              <h3 id="debts-upcoming-heading" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-textMain">
                <CalendarClock size={16} className="text-primary" /> Upcoming payments
              </h3>
              <ul className="mt-3 divide-y divide-border">
                {upcoming.map(view => {
                  const days = daysUntil(view.due.nextDue, asOf);
                  const amountDue = isStatementLoan(view.loan)
                    ? view.status.outstanding
                    : view.instalment ? Math.min(view.instalment * Math.max(1, view.due.behind), view.status.outstanding) : undefined;
                  return (
                    <li key={view.loan.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <BankLogo bank={loanBank(view.loan)} className="h-7 w-7" fallback={<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: view.loan.color }} />} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-textMain">{view.loan.name}</span>
                          <span className={`flex items-center gap-1 text-[11px] ${isDueSoon(view.due, asOf) ? 'font-semibold text-red-500' : 'text-secondary'}`}>
                            {isDueSoon(view.due, asOf) && <AlertTriangle size={11} />}
                            {view.due.overdue
                              ? `Overdue since ${formatDate(view.due.nextDue, false)}${view.due.behind > 1 ? ` · ${view.due.behind} payments behind` : ''}`
                              : days === 0 ? 'Due today' : `Due ${formatDate(view.due.nextDue, false)} · in ${days} day${days === 1 ? '' : 's'}`}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-sm font-bold tabular-nums text-textMain">{amountDue !== undefined ? formatMoney(amountDue, view.loan.currency) : '—'}</span>
                        <button type="button" onClick={() => openPayment(view)} className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-primary hover:border-primary">
                          Log
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="debts-loans bg-surface rounded-2xl border border-border p-4 shadow-sm" aria-labelledby="debts-loans-heading">
            <h3 id="debts-loans-heading" className="text-sm font-bold uppercase tracking-wide text-textMain">Active loans</h3>
            {active.length === 0 ? (
              <p className="mt-3 text-sm text-secondary">Everything's paid off. 🎉</p>
            ) : (
              <div className="desktop-collection mt-3 space-y-3">{active.map(renderLoanCard)}</div>
            )}

            {settled.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <button type="button" onClick={() => setShowSettled(value => !value)} aria-expanded={showSettled} className="flex items-center gap-1 text-xs font-bold text-secondary hover:text-textMain">
                  <ChevronDown size={12} className={`transition-transform ${showSettled ? 'rotate-180' : ''}`} />
                  Paid off &amp; archived ({settled.length})
                </button>
                {showSettled && <div className="desktop-collection mt-3 space-y-3">{settled.map(renderLoanCard)}</div>}
              </div>
            )}
          </section>
        </>
      )}

      {loanForm && (
        <Modal title={loanForm.id ? (cardForm ? 'Edit card' : 'Edit loan') : cardForm ? 'Add credit card' : 'Add loan'} onClose={() => setLoanForm(null)}>
          <div>
            <label className={LABEL_CLASS} htmlFor="loan-name">Name</label>
            <input id="loan-name" autoFocus type="text" value={loanForm.name} onChange={event => updateForm({ name: event.target.value })} placeholder="e.g. HDB mortgage" className={INPUT_CLASS} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="loan-kind">Type</label>
              <select
                id="loan-kind"
                value={loanForm.kind}
                onChange={event => {
                  const kind = event.target.value as LoanKind;
                  // New loans pick up the type's usual colour and interest method; edits keep theirs.
                  updateForm(loanForm.id ? { kind } : { kind, color: KIND_DEFAULTS[kind].color, interestMethod: KIND_DEFAULTS[kind].method });
                }}
                className={SELECT_CLASS}
              >
                {KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="loan-lender">Lender</label>
              <input id="loan-lender" type="text" value={loanForm.lender} onChange={event => updateForm({ lender: event.target.value })} placeholder="Optional" className={INPUT_CLASS} />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="loan-principal">{cardForm ? (loanForm.id ? 'Starting statement balance' : 'Latest statement balance') : 'Amount borrowed'}</label>
              <input id="loan-principal" type="number" inputMode="decimal" min="0" value={loanForm.principal} onChange={event => updateForm({ principal: event.target.value })} placeholder="0.00" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="loan-currency">Currency</label>
              <select id="loan-currency" value={loanForm.currency} onChange={event => updateForm({ currency: event.target.value })} className={SELECT_CLASS}>
                {CURRENCIES.map(code => <option key={code} value={code}>{getCurrencySymbol(code)} {code}</option>)}
              </select>
            </div>
          </div>

          {cardForm && (
            <div>
              <label className={LABEL_CLASS} htmlFor="loan-card">Linked card</label>
              <select
                id="loan-card"
                value={loanForm.cardId}
                onChange={event => setLoanForm(formForCard(loanForm, cardsById.get(event.target.value), cardsById.get(loanForm.cardId)))}
                className={SELECT_CLASS}
              >
                <option value="">Not linked</option>
                {creditCards.map(card => {
                  const takenBy = loans.find(loan => loan.cardId === card.id && loan.id !== loanForm.id);
                  return (
                    <option key={card.id} value={card.id} disabled={Boolean(takenBy)}>
                      {cardLabel(card)}{takenBy ? ` (already linked to ${takenBy.name})` : ''}
                    </option>
                  );
                })}
              </select>
              <p className="mt-1 text-[10px] text-secondary">
                {creditCards.length === 0
                  ? 'Add the card in the Cards tab first to link it.'
                  : 'Shows this balance on the card\'s page, and prompts you when you upload its statement there.'}
              </p>
            </div>
          )}

          {cardForm && (
            <p className="rounded-lg bg-background px-3 py-2 text-[11px] text-textMain">
              Add each card once. When a new statement arrives, tap <strong>New statement</strong> on the card and enter its balance - no need to add the card again.
            </p>
          )}

          {!cardForm && (
          <div>
            <span className={LABEL_CLASS}>Interest</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Interest method">
              {(['Reducing', 'Flat'] as LoanInterestMethod[]).map(method => (
                <button
                  key={method}
                  type="button"
                  role="radio"
                  aria-checked={loanForm.interestMethod === method}
                  onClick={() => updateForm({ interestMethod: method })}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${loanForm.interestMethod === method ? 'border-primary bg-background text-primary ring-1 ring-primary' : 'border-border bg-background text-secondary hover:border-secondary'}`}
                >
                  <p className="text-sm font-bold">{method === 'Reducing' ? 'Reducing balance' : 'Flat rate'}</p>
                  <p className="text-[10px] opacity-80">{method === 'Reducing' ? 'Mortgages, personal loans, cards' : 'Most car loans, instalment plans'}</p>
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLASS} htmlFor="loan-rate">Rate (% a year)</label>
                <input id="loan-rate" type="number" inputMode="decimal" min="0" step="0.01" value={loanForm.annualRate} onChange={event => updateForm({ annualRate: event.target.value })} placeholder="0" className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="loan-term">Term (months)</label>
                <input id="loan-term" type="number" inputMode="numeric" min="1" value={loanForm.termMonths} onChange={event => updateForm({ termMonths: event.target.value })} placeholder={loanForm.interestMethod === 'Flat' ? 'Required' : 'Optional'} className={INPUT_CLASS} />
              </div>
            </div>
            {optionalNumber(loanForm.termMonths) && Number(loanForm.termMonths) >= 12 && (
              <p className="mt-1 text-[10px] text-secondary">{formatDuration(Number(loanForm.termMonths))}</p>
            )}
            {formFlatEquivalent !== undefined && (
              <p className="mt-2 rounded-lg bg-background px-3 py-2 text-[11px] text-textMain">
                A {loanForm.annualRate || 0}% flat rate costs about <strong>{formFlatEquivalent.toFixed(2)}%</strong> as a reducing-balance rate, with {formatMoney(flatTotalInterest({ principal: Number(loanForm.principal), annualRate: Number(loanForm.annualRate || 0), termMonths: Number(loanForm.termMonths) }), loanForm.currency)} interest in total.
              </p>
            )}
          </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="loan-start">{cardForm ? 'Statement date' : 'Borrowed on'}</label>
              <input id="loan-start" type="date" value={loanForm.startDate} onChange={event => updateForm({ startDate: event.target.value })} className={`${SELECT_CLASS} h-12 min-w-0`} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="loan-day">Due day of month</label>
              <input id="loan-day" type="number" inputMode="numeric" min="1" max="31" value={loanForm.paymentDay} onChange={event => updateForm({ paymentDay: event.target.value })} placeholder="e.g. 15" className={INPUT_CLASS} />
            </div>
          </div>

          {cardForm && (
            <div>
              <label className={LABEL_CLASS} htmlFor="loan-card-rate">Card interest (% a year)</label>
              <input id="loan-card-rate" type="number" inputMode="decimal" min="0" step="0.01" value={loanForm.annualRate} onChange={event => updateForm({ annualRate: event.target.value })} placeholder="Optional, e.g. 26.9" className={INPUT_CLASS} />
            </div>
          )}

          {!cardForm && (
          <div>
            <label className={LABEL_CLASS} htmlFor="loan-instalment">Monthly instalment</label>
            <input
              id="loan-instalment"
              type="number"
              inputMode="decimal"
              min="0"
              value={loanForm.instalment}
              onChange={event => updateForm({ instalment: event.target.value })}
              placeholder={suggestedInstalment ? `${suggestedInstalment.toFixed(2)} (worked out from the term)` : 'What you pay each month'}
              className={INPUT_CLASS}
            />
            <p className="mt-1 text-[10px] text-secondary">Leave blank to use the amount worked out from the rate and term.</p>
          </div>
          )}

          {!cardForm && (
          <div className="rounded-xl border border-border bg-background p-3">
            <label className="flex items-center gap-2 text-xs font-bold text-textMain">
              <input type="checkbox" checked={loanForm.hasOpening} onChange={event => updateForm({ hasOpening: event.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
              I've already paid some of it off
            </label>
            {loanForm.hasOpening && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS} htmlFor="loan-opening">{loanForm.interestMethod === 'Flat' ? 'Left to pay' : 'Still owed'}</label>
                  <input id="loan-opening" type="number" inputMode="decimal" min="0" value={loanForm.openingBalance} onChange={event => updateForm({ openingBalance: event.target.value })} placeholder="From your statement" className={INPUT_CLASS} />
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="loan-opening-date">As of</label>
                  <input id="loan-opening-date" type="date" value={loanForm.openingBalanceDate} onChange={event => updateForm({ openingBalanceDate: event.target.value })} className={`${SELECT_CLASS} h-12 min-w-0`} />
                </div>
                <p className="col-span-2 text-[10px] text-secondary">
                  Only payments after this date need logging.{loanForm.interestMethod === 'Flat' ? ' For a flat-rate loan, include the interest still to pay.' : ''}
                </p>
              </div>
            )}
          </div>
          )}

          <div>
            <span className={LABEL_CLASS}>Colour</span>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => updateForm({ color })}
                  aria-label={`Colour ${color}`}
                  aria-pressed={loanForm.color === color}
                  className={`h-7 w-7 rounded-full border-2 ${loanForm.color === color ? 'border-textMain' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="loan-notes">Notes</label>
            <input id="loan-notes" type="text" value={loanForm.notes} onChange={event => updateForm({ notes: event.target.value })} placeholder="Optional" className={INPUT_CLASS} />
          </div>

          {loanForm.id && (
            <label className="flex items-center gap-2 text-xs text-secondary">
              <input type="checkbox" checked={loanForm.isArchived} onChange={event => updateForm({ isArchived: event.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
              Archive (hide from totals, e.g. settled or written off)
            </label>
          )}

          {formProblem && (loanForm.name || loanForm.principal) && <p className="text-xs text-red-500">{formProblem}</p>}
          <button type="button" onClick={saveLoanForm} disabled={Boolean(formProblem)} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg disabled:opacity-40">
            {loanForm.id ? 'Save changes' : cardForm ? 'Add card' : 'Add loan'}
          </button>
        </Modal>
      )}

      {paymentForm && paymentLoan && (
        <Modal title={`${paymentForm.entryType === 'statement' ? 'New statement' : 'Log payment'} · ${paymentLoan.loan.name}`} onClose={() => setPaymentForm(null)}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="payment-amount">{paymentForm.entryType === 'statement' ? 'Statement balance' : 'Amount'} ({paymentLoan.loan.currency})</label>
              <input id="payment-amount" autoFocus type="number" inputMode="decimal" min="0" value={paymentForm.amount} onChange={event => setPaymentForm({ ...paymentForm, amount: event.target.value })} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="payment-date">{paymentForm.entryType === 'statement' ? 'Statement date' : 'Paid on'}</label>
              <input id="payment-date" type="date" value={paymentForm.date} onChange={event => setPaymentForm({ ...paymentForm, date: event.target.value })} className={`${SELECT_CLASS} h-12 min-w-0`} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="payment-notes">Notes</label>
            <input id="payment-notes" type="text" value={paymentForm.notes} onChange={event => setPaymentForm({ ...paymentForm, notes: event.target.value })} placeholder={paymentForm.entryType === 'statement' ? 'Optional, e.g. Nov statement' : 'Optional, e.g. extra payment'} className={INPUT_CLASS} />
          </div>
          {paymentForm.entryType === 'statement' && (
            <p className="text-[11px] text-secondary">This becomes what's owed on the card. Payments from this date on count against it; older ones are kept in the history.</p>
          )}
          {paymentForm.entryType === 'payment' && Number(paymentForm.amount) > paymentLoan.status.outstanding + 0.005 && (
            <p className="text-[11px] text-secondary">That's more than the {formatMoney(paymentLoan.status.outstanding, paymentLoan.loan.currency)} still owed, so it will settle the loan.</p>
          )}
          {paymentForm.entryType === 'payment' && !paymentLoan.status.statement && paymentLoan.loan.openingBalanceDate && paymentForm.date && paymentForm.date <= paymentLoan.loan.openingBalanceDate && (
            <p className="text-[11px] text-amber-600 dark:text-amber-300">This is on or before the opening balance date ({paymentLoan.loan.openingBalanceDate}), so it's already counted in that balance and won't change anything.</p>
          )}
          <button type="button" onClick={savePayment} disabled={!entryAmountValid(paymentForm) || !paymentForm.date} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg disabled:opacity-40">
            {paymentForm.entryType === 'statement' ? 'Save statement' : 'Log payment'}
          </button>
        </Modal>
      )}
    </div>}
      {direction !== 'owe' && <ReceivablesPanel baseCurrency={baseCurrency} />}
    </div>
  );
};

export default DebtsTab;
