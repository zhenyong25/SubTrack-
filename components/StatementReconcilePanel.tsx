import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  EyeOff,
  FileQuestion,
  GitCompare,
  ListFilter,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  WalletCards,
  X,
} from 'lucide-react';
import { AccountStatement, Expense, Income, IncomeCycle, IncomeKind, PaymentCard, StatementTransaction, Subscription } from '../types';
import {
  clearStatementTransactions,
  downloadAccountStatement,
  fetchStatementTransactions,
  markStatementTransactionDismissed,
  markStatementTransactionMatched,
  saveParsedStatementTransactions,
} from '../services/appDataService';
import { extractPdfPages, parseStatementTransactions } from '../services/huggingFaceService';
import { getCurrencySymbol, getExpenseCategories, getExpenseCategoryColor, saveExpenseCategories } from '../services/storageService';

interface StatementReconcilePanelProps {
  statement: AccountStatement;
  card: PaymentCard;
  expenses: Expense[];
  subscriptions: Subscription[];
  baseCurrency: string;
  onAddExpense: (expense: Omit<Expense, 'id'>) => Promise<Expense>;
  onUpdateExpense: (expense: Expense) => Promise<void>;
  incomes: Income[];
  onAddIncome: (income: Omit<Income, 'id'>) => Promise<Income>;
  onUpdateIncome: (income: Income) => Promise<void>;
  onClose: () => void;
}

type DiffRowType = 'matched' | 'missing' | 'extra';

interface DiffRow {
  type: DiffRowType;
  date: string;
  statementTxn: StatementTransaction | null;
  expense: Expense | null;
  // Set instead of `expense` when a credit-direction statement line (money coming in) is
  // matched or added - a credit is a cash flow transfer in, not a spend, so it belongs in
  // the Income ledger rather than being recorded as an Expense.
  income: Income | null;
  subscriptionMatch: Subscription | null;
  // Matched an expense that isn't linked to this card (date + amount + currency only) -
  // still a real find, just worth calling out since the link itself might be wrong or missing.
  matchedViaUnlinkedExpense: boolean;
}

type FilterKey = 'all' | 'matched' | 'missing' | 'subscription' | 'extra';

const MATCH_WINDOW_DAYS = 3;
const MATCH_AMOUNT_EPSILON = 0.01;
// Subscription "price" is a tracked value that can drift from what's actually billed
// (price rises, taxes, rounding) while still clearly being that subscription - a flat
// cent-level tolerance is too strict here, so allow a small relative margin instead.
const SUBSCRIPTION_AMOUNT_TOLERANCE_RATIO = 0.08;
const STOPWORDS = new Set(['the', 'and', 'for', 'com', 'inc', 'ltd', 'pte', 'sg', 'sgd']);

const daysBetween = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

const significantWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));

// Supabase's PostgrestError (and some other thrown values) carry a real `.message`
// without necessarily being `instanceof Error`, so checking that alone can hide the
// actual cause behind a generic fallback string. Surface whatever message is available.
const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

// A statement line that matches an active subscription's currency/price and shares a
// significant word with its name (e.g. "Netflix" in both "Netflix Standard" and "Netflix.com
// Los Gatos") is very likely already tracked there - recording it again as an Expense would
// double-count it in card spend, since getCardMonthlySpend sums both expenses and subscriptions.
// A subscription explicitly linked to a *different* card is excluded, but one with no card
// set at all is still eligible - many subscriptions are never linked to a card in the first place.
const findSubscriptionMatch = (
  txn: StatementTransaction,
  subscriptions: Subscription[],
  cardId: string,
): Subscription | null => {
  const descWords = new Set(significantWords(txn.description));
  return (
    subscriptions.find(sub => {
      if (sub.status !== 'Active') return false;
      if (sub.cardId && sub.cardId !== cardId) return false;
      if (sub.currency !== txn.currency) return false;
      const tolerance = Math.max(MATCH_AMOUNT_EPSILON, sub.price * SUBSCRIPTION_AMOUNT_TOLERANCE_RATIO);
      if (Math.abs(sub.price - txn.amount) > tolerance) return false;
      return significantWords(sub.name).some(word => descWords.has(word));
    }) ?? null
  );
};

const findExpenseMatch = (txn: StatementTransaction, pool: Expense[], usedExpenseIds: Set<string>): Expense | null => {
  let best: Expense | null = null;
  let bestDelta = Infinity;
  pool.forEach(expense => {
    if (usedExpenseIds.has(expense.id)) return;
    if (expense.currency !== txn.currency) return;
    if (Math.abs(expense.amount - txn.amount) > MATCH_AMOUNT_EPSILON) return;
    const delta = daysBetween(expense.expenseDate, txn.transactionDate);
    if (delta <= MATCH_WINDOW_DAYS && delta < bestDelta) {
      best = expense;
      bestDelta = delta;
    }
  });
  return best;
};

const incomeEffectiveDate = (income: Income) =>
  income.incomeMode === 'One-time' ? income.incomeDate || income.firstIncomeDate : income.nextIncomeDate;

// Income has no card-link concept at all, so unlike expenses there's no "linked to this
// card" pass - every credit is matched purely by date/amount/currency against the whole
// Income ledger, the same heuristic-only fallback the unlinked-expense pass below uses.
const findIncomeMatch = (txn: StatementTransaction, pool: Income[], usedIncomeIds: Set<string>): Income | null => {
  let best: Income | null = null;
  let bestDelta = Infinity;
  pool.forEach(income => {
    if (usedIncomeIds.has(income.id)) return;
    if (income.currency !== txn.currency) return;
    if (Math.abs(income.amount - txn.amount) > MATCH_AMOUNT_EPSILON) return;
    const delta = daysBetween(incomeEffectiveDate(income), txn.transactionDate);
    if (delta <= MATCH_WINDOW_DAYS && delta < bestDelta) {
      best = income;
      bestDelta = delta;
    }
  });
  return best;
};

// Diffs the parsed statement lines against recorded expenses/income for this card, git-style:
// lines that only exist on the statement are "missing" (need to be added), lines that only
// exist as recorded expenses are "extra" (nothing on the statement to match). A credit-direction
// line (money coming in) is diffed against Income instead of Expense - it's a cash flow transfer
// in, not a spend, and forcing it into the Expense ledger double-counts it as spend elsewhere.
const buildDiffRows = (
  statementTxns: StatementTransaction[],
  cardExpenses: Expense[],
  unlinkedExpenses: Expense[],
  incomes: Income[],
  subscriptions: Subscription[],
  cardId: string,
): DiffRow[] => {
  const usedExpenseIds = new Set<string>();
  const usedIncomeIds = new Set<string>();
  const expenseMatches = new Map<string, Expense>();
  const incomeMatches = new Map<string, Income>();
  const viaUnlinked = new Set<string>();

  const debitTxns = statementTxns.filter(t => t.direction !== 'credit');
  const creditTxns = statementTxns.filter(t => t.direction === 'credit');

  debitTxns.forEach(txn => {
    if (!txn.matchedExpenseId) return;
    const expense =
      cardExpenses.find(e => e.id === txn.matchedExpenseId) ?? unlinkedExpenses.find(e => e.id === txn.matchedExpenseId);
    if (expense) {
      expenseMatches.set(txn.id, expense);
      usedExpenseIds.add(expense.id);
    }
  });

  // Pass 1: expenses explicitly linked to this card - the highest-confidence match.
  debitTxns.forEach(txn => {
    if (expenseMatches.has(txn.id)) return;
    const best = findExpenseMatch(txn, cardExpenses, usedExpenseIds);
    if (best) {
      expenseMatches.set(txn.id, best);
      usedExpenseIds.add(best.id);
    }
  });

  // Pass 2: fall back to expenses with no card linked at all, matched purely by date/amount/
  // currency - card-linking is optional on the Add Expense form, so plenty of real expenses
  // never got linked to any card and would otherwise show up as false "not recorded" misses.
  debitTxns.forEach(txn => {
    if (expenseMatches.has(txn.id)) return;
    const best = findExpenseMatch(txn, unlinkedExpenses, usedExpenseIds);
    if (best) {
      expenseMatches.set(txn.id, best);
      usedExpenseIds.add(best.id);
      viaUnlinked.add(txn.id);
    }
  });

  creditTxns.forEach(txn => {
    const best = findIncomeMatch(txn, incomes, usedIncomeIds);
    if (best) {
      incomeMatches.set(txn.id, best);
      usedIncomeIds.add(best.id);
    }
  });

  const rows: DiffRow[] = statementTxns.map(txn => {
    if (txn.direction === 'credit') {
      const income = incomeMatches.get(txn.id) ?? null;
      return {
        type: income ? 'matched' : 'missing',
        date: txn.transactionDate,
        statementTxn: txn,
        expense: null,
        income,
        subscriptionMatch: null,
        matchedViaUnlinkedExpense: false,
      };
    }
    const expense = expenseMatches.get(txn.id) ?? null;
    if (expense) {
      return {
        type: 'matched',
        date: txn.transactionDate,
        statementTxn: txn,
        expense,
        income: null,
        subscriptionMatch: null,
        matchedViaUnlinkedExpense: viaUnlinked.has(txn.id),
      };
    }
    return {
      type: 'missing',
      date: txn.transactionDate,
      statementTxn: txn,
      expense: null,
      income: null,
      subscriptionMatch: findSubscriptionMatch(txn, subscriptions, cardId),
      matchedViaUnlinkedExpense: false,
    };
  });

  if (statementTxns.length > 0) {
    const dates = statementTxns.map(t => new Date(t.transactionDate).getTime());
    const rangeStart = Math.min(...dates) - MATCH_WINDOW_DAYS * 86400000;
    const rangeEnd = Math.max(...dates) + MATCH_WINDOW_DAYS * 86400000;
    [...cardExpenses, ...unlinkedExpenses].forEach(expense => {
      if (usedExpenseIds.has(expense.id)) return;
      const time = new Date(expense.expenseDate).getTime();
      if (Number.isNaN(time) || time < rangeStart || time > rangeEnd) return;
      rows.push({
        type: 'extra',
        date: expense.expenseDate,
        statementTxn: null,
        expense,
        income: null,
        subscriptionMatch: null,
        matchedViaUnlinkedExpense: false,
      });
    });
  }

  return rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

interface InlineCategoryPickerProps {
  value: string;
  onChange: (category: string) => void;
}

const InlineCategoryPicker: React.FC<InlineCategoryPickerProps> = ({ value, onChange }) => {
  const [categories, setCategories] = useState<string[]>(() => getExpenseCategories());
  const [customValue, setCustomValue] = useState('');

  const addCustomCategory = () => {
    const trimmed = customValue.trim();
    if (!trimmed) return;
    const next = saveExpenseCategories([...categories, trimmed]);
    setCategories(next);
    onChange(trimmed);
    setCustomValue('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            aria-pressed={value === cat}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
              value === cat
                ? 'bg-primary/10 text-primary border-primary/40'
                : 'bg-surface text-secondary border-border hover:border-primary/50'
            }`}
          >
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: getExpenseCategoryColor(cat) }} />
            {cat}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={customValue}
          onChange={e => setCustomValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustomCategory();
            }
          }}
          placeholder="Create a custom category"
          className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-textMain"
        />
        <button
          type="button"
          onClick={addCustomCategory}
          disabled={!customValue.trim()}
          className="shrink-0 bg-primary/10 text-primary text-[11px] font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
};

// Income has no persisted custom-category list the way expenses do (AddIncome.tsx uses the
// same plain fixed list) - "Transfer" is added here specifically for a credit that's just
// money moving in from someone else rather than a real income source.
const INCOME_CATEGORIES = ['Transfer', 'Salary', 'Refund', 'Freelance', 'Investments', 'Dividends', 'Bonus', 'Interest'];

interface InlineIncomeCategoryPickerProps {
  value: string;
  onChange: (category: string) => void;
}

const InlineIncomeCategoryPicker: React.FC<InlineIncomeCategoryPickerProps> = ({ value, onChange }) => (
  <div className="space-y-2">
    <div className="flex flex-wrap gap-1.5">
      {INCOME_CATEGORIES.map(cat => (
        <button
          key={cat}
          type="button"
          onClick={() => onChange(cat)}
          aria-pressed={value === cat}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
            value === cat
              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-400/50 dark:text-emerald-300'
              : 'bg-surface text-secondary border-border hover:border-emerald-400/50'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Or type a custom category"
      className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-textMain"
    />
  </div>
);

interface DiffRowViewProps {
  row: DiffRow;
  isAdding: boolean;
  isEditingCategory: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onConfirmAdd: (name: string, category: string, color: string) => Promise<void>;
  onStartEditCategory: () => void;
  onCancelEditCategory: () => void;
  onConfirmEditCategory: (category: string, color: string) => Promise<void>;
  onLinkToCard: () => Promise<void>;
  onDismiss: () => Promise<void>;
}

const DiffRowView: React.FC<DiffRowViewProps> = ({
  row,
  isAdding,
  isEditingCategory,
  onStartAdd,
  onCancelAdd,
  onConfirmAdd,
  onStartEditCategory,
  onCancelEditCategory,
  onConfirmEditCategory,
  onLinkToCard,
  onDismiss,
}) => {
  const isCredit = row.statementTxn?.direction === 'credit';
  const matchedRecordId = row.expense?.id ?? row.income?.id ?? null;
  const matchedRecord = row.expense
    ? { name: row.expense.name, date: row.expense.expenseDate, currency: row.expense.currency, amount: row.expense.amount, category: row.expense.category }
    : row.income
      ? { name: row.income.name, date: incomeEffectiveDate(row.income), currency: row.income.currency, amount: row.income.amount, category: row.income.category }
      : null;
  const [addName, setAddName] = useState(row.statementTxn?.description || '');
  const [addCategory, setAddCategory] = useState(isCredit ? 'Transfer' : 'Food');
  const [editCategory, setEditCategory] = useState(row.expense?.category ?? row.income?.category ?? 'Food');
  const [isSaving, setIsSaving] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const isDuplicateRisk = row.type === 'missing' && !!row.subscriptionMatch;

  const handleLinkToCard = async () => {
    setIsLinking(true);
    try {
      await onLinkToCard();
    } finally {
      setIsLinking(false);
    }
  };

  const handleDismiss = async () => {
    setIsDismissing(true);
    try {
      await onDismiss();
    } finally {
      setIsDismissing(false);
    }
  };

  const borderClass = isDuplicateRisk
    ? 'border-purple-400/50'
    : row.type === 'matched'
      ? 'border-border'
      : row.type === 'missing'
        ? (isCredit ? 'border-emerald-400/50' : 'border-amber-400/50')
        : 'border-sky-400/50';
  const bgClass = isDuplicateRisk
    ? 'bg-purple-50/70 dark:bg-purple-950/20'
    : row.type === 'matched'
      ? 'bg-surface'
      : row.type === 'missing'
        ? (isCredit ? 'bg-emerald-50/70 dark:bg-emerald-950/20' : 'bg-amber-50/70 dark:bg-amber-950/20')
        : 'bg-sky-50/70 dark:bg-sky-950/20';

  const status = isDuplicateRisk
    ? {
        label: 'Possible duplicate',
        detail: 'Already tracked as a subscription',
        icon: Copy,
        iconClass: 'text-purple-600 dark:text-purple-300',
        badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-400/10 dark:text-purple-300',
      }
    : row.type === 'matched'
      ? {
          label: 'Matched',
          detail: row.income ? 'Statement and income record agree' : 'Statement and record agree',
          icon: CheckCircle2,
          iconClass: 'text-emerald-600 dark:text-emerald-400',
          badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
        }
      : row.type === 'missing'
        ? isCredit
          ? {
              label: 'Income to record',
              detail: 'Credit found on statement only',
              icon: AlertCircle,
              iconClass: 'text-emerald-600 dark:text-emerald-400',
              badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
            }
          : {
              label: 'Needs recording',
              detail: 'Found on statement only',
              icon: AlertCircle,
              iconClass: 'text-amber-600 dark:text-amber-400',
              badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
            }
        : {
            label: 'Recorded only',
            detail: 'Found in SubTrack only',
            icon: FileQuestion,
            iconClass: 'text-sky-600 dark:text-sky-400',
            badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300',
          };
  const StatusIcon = status.icon;

  const handleConfirmAdd = async () => {
    setIsSaving(true);
    try {
      await onConfirmAdd(addName.trim() || row.statementTxn!.description, addCategory, getExpenseCategoryColor(addCategory));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmEdit = async () => {
    setIsSaving(true);
    try {
      await onConfirmEditCategory(editCategory, getExpenseCategoryColor(editCategory));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className={`overflow-hidden rounded-2xl border shadow-sm ${borderClass} ${bgClass}`}>
      <div className="flex items-center justify-between gap-3 border-b border-current/10 px-3.5 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/70 ${status.iconClass}`}>
            <StatusIcon size={15} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-textMain">{status.label}</p>
            <p className="truncate text-[10px] text-secondary">{status.detail}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${status.badgeClass}`}>
          {formatDate(row.date)}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] gap-1 px-3.5 py-3.5 sm:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] sm:gap-2 sm:px-4">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-secondary"><ReceiptText size={12} /> Statement</p>
          {row.statementTxn ? (
            <>
              <p className="truncate text-sm font-bold text-textMain" title={row.statementTxn.description}>{row.statementTxn.description}</p>
              <p className="mt-1.5 text-[11px] text-secondary">
                {formatDate(row.statementTxn.transactionDate)} · {row.statementTxn.direction === 'credit' ? '+' : ''}
                {getCurrencySymbol(row.statementTxn.currency)}
                {row.statementTxn.amount.toFixed(2)}
              </p>
            </>
          ) : (
            <div className="flex min-h-10 items-center gap-2 rounded-lg border border-dashed border-current/20 px-2.5 text-xs text-secondary">
              <FileQuestion size={14} className="shrink-0 opacity-70" /> No matching line
            </div>
          )}
        </div>
        <div className="flex items-center justify-center text-secondary/60" aria-hidden="true">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current/20 bg-background/70"><ArrowRight size={12} /></span>
        </div>
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-secondary"><WalletCards size={12} /> {row.income ? 'Income' : 'SubTrack'}</p>
          {matchedRecord ? (
            <>
              <p className="truncate text-sm font-bold text-textMain" title={matchedRecord.name}>{matchedRecord.name}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <p className="text-[11px] text-secondary">
                  {formatDate(matchedRecord.date)} · {row.income ? '+' : ''}{getCurrencySymbol(matchedRecord.currency)}
                  {matchedRecord.amount.toFixed(2)} · {matchedRecord.category}
                </p>
                {row.type === 'matched' && !isEditingCategory && (
                  <button
                    type="button"
                    onClick={onStartEditCategory}
                    className="shrink-0 rounded p-0.5 text-secondary transition-colors hover:bg-primary/10 hover:text-primary"
                    aria-label="Edit category"
                    title="Edit category"
                  >
                    <Edit3 size={11} />
                  </button>
                )}
              </div>
              {row.matchedViaUnlinkedExpense && (
                <div className="mt-2 rounded-lg bg-background/60 p-2 text-[10px] text-secondary">
                  <span>Matched by date and amount, but not linked to a card. </span>
                  <button
                    type="button"
                    onClick={handleLinkToCard}
                    disabled={isLinking}
                    className="font-bold text-primary disabled:opacity-60"
                  >
                    {isLinking ? 'Linking...' : 'Link now'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex min-h-10 items-center gap-2 rounded-lg border border-dashed border-current/20 px-2.5 text-xs text-secondary">
              <AlertCircle size={14} className="shrink-0 opacity-70" /> Not recorded yet
            </div>
          )}
        </div>
      </div>

      {isDuplicateRisk && (
        <div className="mx-3.5 mb-3 flex items-start gap-2 rounded-xl bg-purple-100/70 p-2.5 text-[11px] text-purple-700 dark:bg-purple-400/10 dark:text-purple-300 sm:mx-4">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p><span className="font-bold">Check before adding.</span> This looks like your “{row.subscriptionMatch!.name}” subscription and may already be included in card spend.</p>
        </div>
      )}

      {row.type === 'matched' && (
        <div className={isEditingCategory ? 'border-t border-current/10 px-3.5 py-3 sm:px-4' : ''}>
          {isEditingCategory && (
            <div className="space-y-2">
              {row.income ? (
                <InlineIncomeCategoryPicker value={editCategory} onChange={setEditCategory} />
              ) : (
                <InlineCategoryPicker value={editCategory} onChange={setEditCategory} />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmEdit}
                  disabled={isSaving}
                  className="bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-60"
                >
                  {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Save category
                </button>
                <button type="button" onClick={onCancelEditCategory} disabled={isSaving} className="text-secondary text-xs px-1">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {row.type === 'missing' && (
        <div className="border-t border-current/10 px-3.5 py-3 sm:px-4">
          {!isAdding ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onStartAdd}
                className={`flex items-center gap-1.5 rounded-lg bg-background/80 px-3 py-2 text-xs font-bold shadow-sm transition-transform active:scale-[0.98] ${isDuplicateRisk ? 'text-purple-600 dark:text-purple-300' : isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'}`}
              >
                <Plus size={12} /> {isDuplicateRisk ? 'Add anyway' : isCredit ? 'Add income' : 'Add transaction'}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                disabled={isDismissing}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-secondary transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-60"
                title="Hide this line - it won't count as missing anymore"
              >
                {isDismissing ? <Loader2 size={12} className="animate-spin" /> : <EyeOff size={12} />}
                Dismiss
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="Transaction name"
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-textMain"
              />
              {isCredit ? (
                <InlineIncomeCategoryPicker value={addCategory} onChange={setAddCategory} />
              ) : (
                <InlineCategoryPicker value={addCategory} onChange={setAddCategory} />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmAdd}
                  disabled={isSaving || !addName.trim()}
                  className={`text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-60 ${isCredit ? 'bg-emerald-500' : 'bg-primary'}`}
                >
                  {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Confirm
                </button>
                <button type="button" onClick={onCancelAdd} disabled={isSaving} className="text-secondary text-xs px-1">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
};

const StatementReconcilePanel: React.FC<StatementReconcilePanelProps> = ({
  statement,
  card,
  expenses,
  subscriptions,
  baseCurrency,
  onAddExpense,
  onUpdateExpense,
  incomes,
  onAddIncome,
  onUpdateIncome,
  onClose,
}) => {
  const [transactions, setTransactions] = useState<StatementTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseTruncated, setParseTruncated] = useState(false);
  const [parseProgress, setParseProgress] = useState<{ chunk: number; totalChunks: number } | null>(null);
  const [addingRowId, setAddingRowId] = useState<string | null>(null);
  const [editingCategoryRecordId, setEditingCategoryRecordId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const cardExpenses = useMemo(() => expenses.filter(e => e.linkedCardId === card.id), [expenses, card.id]);
  const unlinkedExpenses = useMemo(() => expenses.filter(e => !e.linkedCardId), [expenses]);
  const activeTransactions = useMemo(() => transactions.filter(t => !t.dismissed), [transactions]);
  const rows = useMemo(
    () => buildDiffRows(activeTransactions, cardExpenses, unlinkedExpenses, incomes, subscriptions, card.id),
    [activeTransactions, cardExpenses, unlinkedExpenses, incomes, subscriptions, card.id],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchStatementTransactions(statement.id).then(cached => {
      if (!cancelled) {
        setTransactions(cached);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [statement.id]);

  const runParse = async (forceRescan: boolean) => {
    setParseError(null);
    setParseTruncated(false);
    setParseProgress(null);
    setIsParsing(true);
    try {
      if (forceRescan) {
        await clearStatementTransactions(statement.id);
      }
      const blob = await downloadAccountStatement(statement);
      const pages = await extractPdfPages(blob);
      const { transactions: parsed, truncated } = await parseStatementTransactions(pages, baseCurrency, progress =>
        setParseProgress(progress),
      );
      const saved = await saveParsedStatementTransactions(statement.id, parsed);
      setTransactions(saved);
      setParseTruncated(truncated);
    } catch (error) {
      console.error('Failed to parse statement', error);
      setParseError(getErrorMessage(error, 'Failed to parse this statement.'));
    } finally {
      setIsParsing(false);
      setParseProgress(null);
    }
  };

  const summary = useMemo(() => {
    const missing = rows.filter(r => r.type === 'missing' && !r.subscriptionMatch).length;
    const subscription = rows.filter(r => r.type === 'missing' && r.subscriptionMatch).length;
    const matched = rows.filter(r => r.type === 'matched').length;
    const extra = rows.filter(r => r.type === 'extra').length;
    return { missing, subscription, matched, extra };
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (activeFilter === 'all') return rows;
    if (activeFilter === 'missing') return rows.filter(r => r.type === 'missing' && !r.subscriptionMatch);
    if (activeFilter === 'subscription') return rows.filter(r => r.type === 'missing' && r.subscriptionMatch);
    return rows.filter(r => r.type === activeFilter);
  }, [rows, activeFilter]);

  const activeFilterLabel: Record<FilterKey, string> = {
    all: 'All transactions',
    matched: 'Matched',
    missing: 'Needs recording',
    subscription: 'Possible duplicates',
    extra: 'Recorded only',
  };

  const toggleFilter = (key: FilterKey) => {
    setActiveFilter(prev => (prev === key ? 'all' : key));
  };

  const filterTileClass = (key: FilterKey) =>
    `group relative overflow-hidden rounded-2xl border bg-surface p-3 text-left shadow-sm transition-all active:scale-[0.98] ${
      activeFilter === key ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:-translate-y-0.5 hover:border-primary/40'
    }`;

  return (
    <div className="fixed inset-0 bg-background z-[60] flex flex-col overflow-hidden animate-slide-up">
      <div
        className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 pb-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        <button onClick={onClose} className="-ml-2 rounded-xl p-2 text-secondary transition-colors hover:bg-background hover:text-textMain" aria-label="Close">
          <X size={22} />
        </button>
        <div className="min-w-0 text-center">
          <h3 className="flex items-center justify-center gap-1.5 truncate text-sm font-bold text-textMain">
            <GitCompare size={16} className="text-primary" />
            Statement reconciliation
          </h3>
          <p className="max-w-[55vw] truncate text-[11px] text-secondary">{card.name} · {statement.fileName}</p>
        </div>
        <button
          onClick={() => runParse(transactions.length > 0)}
          disabled={isParsing || isLoading}
          className="-mr-2 inline-flex items-center gap-1.5 rounded-xl p-2 text-secondary transition-colors hover:bg-background hover:text-primary disabled:opacity-40"
          aria-label={transactions.length > 0 ? 'Re-scan statement' : 'Scan statement'}
          title={transactions.length > 0 ? 'Re-scan statement (discards cached results and re-reads the PDF)' : 'Scan statement'}
        >
          {isParsing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          <span className="hidden text-xs font-bold sm:inline">{transactions.length > 0 ? 'Re-scan' : 'Scan'}</span>
        </button>
      </div>

      <div className="mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto p-4 sm:p-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-secondary">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading...
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl bg-surface">
            <GitCompare size={28} className="mx-auto mb-3 text-secondary opacity-60" />
            <p className="text-sm font-semibold text-textMain mb-1">Not scanned yet</p>
            <p className="text-xs text-secondary mb-4 px-6">
              Scan this PDF to pull out every transaction line, then compare it against what you've already recorded for {card.name}.
            </p>
            <button
              type="button"
              onClick={() => runParse(false)}
              disabled={isParsing}
              className="bg-primary text-white font-bold px-4 py-2 rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-60"
            >
              {isParsing ? <Loader2 size={16} className="animate-spin" /> : <GitCompare size={16} />}
              {isParsing
                ? parseProgress
                  ? `Scanning... (${parseProgress.chunk}/${parseProgress.totalChunks})`
                  : 'Scanning...'
                : 'Scan statement'}
            </button>
            {parseError && (
              <p className="mt-3 text-xs text-rose-500 px-6 flex items-center justify-center gap-1">
                <AlertCircle size={12} /> {parseError}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-textMain">Review transactions</p>
                <p className="text-[11px] text-secondary">Select a status to narrow the list.</p>
              </div>
              {activeFilter !== 'all' && (
                <button type="button" onClick={() => setActiveFilter('all')} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/10">
                  Clear filter
                </button>
              )}
            </div>
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button type="button" onClick={() => toggleFilter('matched')} aria-pressed={activeFilter === 'matched'} className={filterTileClass('matched')}>
                <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><CheckCircle2 size={17} /></span>
                <p className="text-xl font-black leading-none text-textMain">{summary.matched}</p>
                <p className="mt-1 text-[11px] font-bold text-secondary">Matched</p>
              </button>
              <button type="button" onClick={() => toggleFilter('missing')} aria-pressed={activeFilter === 'missing'} className={filterTileClass('missing')}>
                <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"><AlertCircle size={17} /></span>
                <p className="text-xl font-black leading-none text-textMain">{summary.missing}</p>
                <p className="mt-1 text-[11px] font-bold text-secondary">Needs recording</p>
              </button>
              <button type="button" onClick={() => toggleFilter('subscription')} aria-pressed={activeFilter === 'subscription'} className={filterTileClass('subscription')}>
                <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500"><Copy size={17} /></span>
                <p className="text-xl font-black leading-none text-textMain">{summary.subscription}</p>
                <p className="mt-1 text-[11px] font-bold text-secondary">Possible duplicate</p>
              </button>
              <button type="button" onClick={() => toggleFilter('extra')} aria-pressed={activeFilter === 'extra'} className={filterTileClass('extra')}>
                <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500"><FileQuestion size={17} /></span>
                <p className="text-xl font-black leading-none text-textMain">{summary.extra}</p>
                <p className="mt-1 text-[11px] font-bold text-secondary">Recorded only</p>
              </button>
            </div>

            {parseTruncated && (
              <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-600 dark:text-amber-300">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /> Part of this statement had more transactions than fit in one request - results below may be incomplete. Try Re-scan.
              </p>
            )}

            {parseError && (
              <p className="mb-3 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-600 dark:text-rose-300">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /> {parseError}
              </p>
            )}

            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-textMain">
                <ListFilter size={14} className="text-secondary" />
                {activeFilterLabel[activeFilter]}
              </div>
              <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-bold text-secondary">
                {visibleRows.length} {visibleRows.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {visibleRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
                <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-500" />
                <p className="text-sm font-bold text-textMain">Nothing to review here</p>
                <p className="mt-1 text-xs text-secondary">Choose another status to keep reconciling.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleRows.map(row => {
                  const key = row.type === 'extra' ? `extra-${row.expense!.id}` : row.statementTxn!.id;
                  const isMissing = row.type === 'missing';
                  const isMatched = row.type === 'matched';
                  const matchedRecordId = row.expense?.id ?? row.income?.id ?? null;
                  return (
                    <DiffRowView
                      key={key}
                      row={row}
                      isAdding={isMissing && addingRowId === row.statementTxn!.id}
                      isEditingCategory={isMatched && matchedRecordId !== null && editingCategoryRecordId === matchedRecordId}
                      onStartAdd={() => isMissing && setAddingRowId(row.statementTxn!.id)}
                      onCancelAdd={() => setAddingRowId(null)}
                      onConfirmAdd={async (name, category, color) => {
                        if (!isMissing) return;
                        const txn = row.statementTxn!;
                        if (txn.direction === 'credit') {
                          // No FK column links a statement row to an Income (only to
                          // expenses), so there's nothing to persist here beyond the Income
                          // itself - the row flips to "matched" once the heuristic in
                          // buildDiffRows finds it by date/amount/currency on next render.
                          await onAddIncome({
                            name,
                            amount: txn.amount,
                            currency: txn.currency,
                            incomeType: IncomeKind.Active,
                            incomeMode: 'One-time',
                            incomeCycle: IncomeCycle.Monthly,
                            firstIncomeDate: txn.transactionDate,
                            nextIncomeDate: txn.transactionDate,
                            incomeDate: txn.transactionDate,
                            category,
                            color,
                            notes: `Imported from ${statement.fileName}`,
                            status: 'Active',
                          });
                          setAddingRowId(null);
                          return;
                        }
                        const created = await onAddExpense({
                          name,
                          amount: txn.amount,
                          currency: txn.currency,
                          expenseDate: txn.transactionDate,
                          category,
                          color,
                          linkedCardId: card.id,
                          linkedCardName: card.name,
                          notes: `Imported from ${statement.fileName}`,
                        });
                        await markStatementTransactionMatched(txn.id, created.id);
                        setTransactions(prev => prev.map(t => (t.id === txn.id ? { ...t, matchedExpenseId: created.id } : t)));
                        setAddingRowId(null);
                      }}
                      onStartEditCategory={() => isMatched && matchedRecordId !== null && setEditingCategoryRecordId(matchedRecordId)}
                      onCancelEditCategory={() => setEditingCategoryRecordId(null)}
                      onConfirmEditCategory={async (category, color) => {
                        if (!isMatched) return;
                        if (row.income) {
                          await onUpdateIncome({ ...row.income, category, color });
                        } else {
                          await onUpdateExpense({ ...row.expense!, category, color });
                        }
                        setEditingCategoryRecordId(null);
                      }}
                      onLinkToCard={async () => {
                        if (!isMatched || !row.expense) return;
                        await onUpdateExpense({ ...row.expense, linkedCardId: card.id, linkedCardName: card.name });
                      }}
                      onDismiss={async () => {
                        if (!isMissing) return;
                        const txn = row.statementTxn!;
                        await markStatementTransactionDismissed(txn.id, true);
                        setTransactions(prev => prev.map(t => (t.id === txn.id ? { ...t, dismissed: true } : t)));
                        setAddingRowId(prev => (prev === txn.id ? null : prev));
                      }}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StatementReconcilePanel;
