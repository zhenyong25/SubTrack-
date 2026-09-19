import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, Edit3, EyeOff, GitCompare, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { AccountStatement, Expense, PaymentCard, StatementTransaction, Subscription } from '../types';
import {
  clearStatementTransactions,
  downloadAccountStatement,
  fetchStatementTransactions,
  markStatementTransactionDismissed,
  markStatementTransactionMatched,
  saveParsedStatementTransactions,
} from '../services/appDataService';
import { extractPdfPages, extractStatementTotal, parseStatementTransactions, StatementTotalCheck } from '../services/huggingFaceService';
import { getCurrencySymbol, getExpenseCategories, saveExpenseCategories } from '../services/storageService';

interface StatementReconcilePanelProps {
  statement: AccountStatement;
  card: PaymentCard;
  expenses: Expense[];
  subscriptions: Subscription[];
  baseCurrency: string;
  onAddExpense: (expense: Omit<Expense, 'id'>) => Promise<Expense>;
  onUpdateExpense: (expense: Expense) => Promise<void>;
  onClose: () => void;
}

type DiffRowType = 'matched' | 'missing' | 'extra';

interface DiffRow {
  type: DiffRowType;
  date: string;
  statementTxn: StatementTransaction | null;
  expense: Expense | null;
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
const COLORS = ['#ef4444', '#f97316', '#eab308', '#16a34a', '#0ea5e9', '#8b5cf6', '#ec4899', '#64748b'];
const STOPWORDS = new Set(['the', 'and', 'for', 'com', 'inc', 'ltd', 'pte', 'sg', 'sgd']);

const daysBetween = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

const colorForCategory = (category: string) => {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
};

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

// Diffs the parsed statement lines against recorded expenses for this card, git-style:
// lines that only exist on the statement are "missing" (need to be added), lines that
// only exist as recorded expenses are "extra" (nothing on the statement to match).
const buildDiffRows = (
  statementTxns: StatementTransaction[],
  cardExpenses: Expense[],
  unlinkedExpenses: Expense[],
  subscriptions: Subscription[],
  cardId: string,
): DiffRow[] => {
  const usedExpenseIds = new Set<string>();
  const matches = new Map<string, Expense>();
  const viaUnlinked = new Set<string>();

  statementTxns.forEach(txn => {
    if (!txn.matchedExpenseId) return;
    const expense =
      cardExpenses.find(e => e.id === txn.matchedExpenseId) ?? unlinkedExpenses.find(e => e.id === txn.matchedExpenseId);
    if (expense) {
      matches.set(txn.id, expense);
      usedExpenseIds.add(expense.id);
    }
  });

  // Pass 1: expenses explicitly linked to this card - the highest-confidence match.
  statementTxns.forEach(txn => {
    if (matches.has(txn.id)) return;
    const best = findExpenseMatch(txn, cardExpenses, usedExpenseIds);
    if (best) {
      matches.set(txn.id, best);
      usedExpenseIds.add(best.id);
    }
  });

  // Pass 2: fall back to expenses with no card linked at all, matched purely by date/amount/
  // currency - card-linking is optional on the Add Expense form, so plenty of real expenses
  // never got linked to any card and would otherwise show up as false "not recorded" misses.
  statementTxns.forEach(txn => {
    if (matches.has(txn.id)) return;
    const best = findExpenseMatch(txn, unlinkedExpenses, usedExpenseIds);
    if (best) {
      matches.set(txn.id, best);
      usedExpenseIds.add(best.id);
      viaUnlinked.add(txn.id);
    }
  });

  const rows: DiffRow[] = statementTxns.map(txn => {
    const expense = matches.get(txn.id) ?? null;
    if (expense) {
      return {
        type: 'matched',
        date: txn.transactionDate,
        statementTxn: txn,
        expense,
        subscriptionMatch: null,
        matchedViaUnlinkedExpense: viaUnlinked.has(txn.id),
      };
    }
    return {
      type: 'missing',
      date: txn.transactionDate,
      statementTxn: txn,
      expense: null,
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
  const [addName, setAddName] = useState(row.statementTxn?.description || '');
  const [addCategory, setAddCategory] = useState('Food');
  const [editCategory, setEditCategory] = useState(row.expense?.category || 'Food');
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
        ? 'border-amber-400/50'
        : 'border-sky-400/50';
  const bgClass = isDuplicateRisk
    ? 'bg-purple-50 dark:bg-purple-900/10'
    : row.type === 'matched'
      ? 'bg-surface'
      : row.type === 'missing'
        ? 'bg-amber-50 dark:bg-amber-900/10'
        : 'bg-sky-50 dark:bg-sky-900/10';

  const handleConfirmAdd = async () => {
    setIsSaving(true);
    try {
      await onConfirmAdd(addName.trim() || row.statementTxn!.description, addCategory, colorForCategory(addCategory));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmEdit = async () => {
    setIsSaving(true);
    try {
      await onConfirmEditCategory(editCategory, colorForCategory(editCategory));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`rounded-xl border p-3 ${borderClass} ${bgClass}`}>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase text-secondary font-bold mb-1">Statement</p>
          {row.statementTxn ? (
            <>
              <p className="text-sm font-semibold text-textMain truncate">{row.statementTxn.description}</p>
              <p className="text-xs text-secondary mt-0.5">
                {formatDate(row.statementTxn.transactionDate)} · {row.statementTxn.direction === 'credit' ? '+' : ''}
                {getCurrencySymbol(row.statementTxn.currency)}
                {row.statementTxn.amount.toFixed(2)}
              </p>
            </>
          ) : (
            <p className="text-xs text-secondary italic">Not on statement</p>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase text-secondary font-bold mb-1">Recorded</p>
          {row.expense ? (
            <>
              <p className="text-sm font-semibold text-textMain truncate">{row.expense.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-xs text-secondary">
                  {formatDate(row.expense.expenseDate)} · {getCurrencySymbol(row.expense.currency)}
                  {row.expense.amount.toFixed(2)} · {row.expense.category}
                </p>
                {row.type === 'matched' && !isEditingCategory && (
                  <button
                    type="button"
                    onClick={onStartEditCategory}
                    className="shrink-0 text-secondary hover:text-primary"
                    aria-label="Edit category"
                    title="Edit category"
                  >
                    <Edit3 size={11} />
                  </button>
                )}
              </div>
              {row.matchedViaUnlinkedExpense && (
                <div className="mt-1 flex items-center gap-1.5">
                  <p className="text-[10px] text-secondary italic">Matched by date & amount - not linked to any card yet.</p>
                  <button
                    type="button"
                    onClick={handleLinkToCard}
                    disabled={isLinking}
                    className="shrink-0 text-[10px] font-bold text-primary disabled:opacity-60"
                  >
                    {isLinking ? 'Linking...' : 'Link to card'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-secondary italic">Not recorded</p>
          )}
        </div>
      </div>

      {isDuplicateRisk && (
        <p className="mt-2 text-[11px] text-purple-600 dark:text-purple-300 flex items-start gap-1">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Matches your "{row.subscriptionMatch!.name}" subscription - it's already counted in this card's spend, so adding it again would double-count it.
        </p>
      )}

      {row.type === 'matched' && (
        <div className={isEditingCategory ? 'mt-2 pt-2 border-t border-border' : ''}>
          {isEditingCategory && (
            <div className="space-y-2">
              <InlineCategoryPicker value={editCategory} onChange={setEditCategory} />
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
        <div className="mt-2 pt-2 border-t border-current/10">
          {!isAdding ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onStartAdd}
                className={`text-xs font-bold flex items-center gap-1 ${isDuplicateRisk ? 'text-purple-600 dark:text-purple-300' : 'text-primary'}`}
              >
                <Plus size={12} /> {isDuplicateRisk ? 'Add anyway' : 'Add transaction'}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                disabled={isDismissing}
                className="text-xs font-bold text-secondary hover:text-rose-500 flex items-center gap-1 disabled:opacity-60"
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
              <InlineCategoryPicker value={addCategory} onChange={setAddCategory} />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmAdd}
                  disabled={isSaving || !addName.trim()}
                  className="bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-60"
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
    </div>
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
  onClose,
}) => {
  const [transactions, setTransactions] = useState<StatementTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseTruncated, setParseTruncated] = useState(false);
  const [parseProgress, setParseProgress] = useState<{ chunk: number; totalChunks: number } | null>(null);
  const [totalCheck, setTotalCheck] = useState<StatementTotalCheck | null>(null);
  const [addingRowId, setAddingRowId] = useState<string | null>(null);
  const [editingCategoryExpenseId, setEditingCategoryExpenseId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const cardExpenses = useMemo(() => expenses.filter(e => e.linkedCardId === card.id), [expenses, card.id]);
  const unlinkedExpenses = useMemo(() => expenses.filter(e => !e.linkedCardId), [expenses]);
  const activeTransactions = useMemo(() => transactions.filter(t => !t.dismissed), [transactions]);
  const rows = useMemo(
    () => buildDiffRows(activeTransactions, cardExpenses, unlinkedExpenses, subscriptions, card.id),
    [activeTransactions, cardExpenses, unlinkedExpenses, subscriptions, card.id],
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
    setTotalCheck(null);
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

      // Best-effort: compare the extracted total against the figure the statement itself
      // prints, as an independent accuracy signal. Failure here shouldn't block the scan.
      try {
        const fullText = pages.join('\n\n');
        setTotalCheck(await extractStatementTotal(fullText, baseCurrency));
      } catch (totalError) {
        console.error('Failed to extract statement total for accuracy check', totalError);
      }
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

  // Net of every extracted line, to compare against the figure the statement itself prints
  // (e.g. "Sub Total") - an accuracy signal independent of the transaction-by-transaction
  // extraction, since it requires the model to have found and read a different part of the
  // document than the transaction table.
  const extractedNet = useMemo(() => {
    let debit = 0;
    let credit = 0;
    transactions.forEach(txn => {
      if (txn.direction === 'credit') credit += txn.amount;
      else debit += txn.amount;
    });
    return { debit, credit, net: debit - credit };
  }, [transactions]);

  const totalCheckStatus = useMemo(() => {
    if (!totalCheck || !totalCheck.found) return null;
    const matches = Math.abs(extractedNet.net - totalCheck.amount) <= 0.05;
    return { matches, statedAmount: totalCheck.amount, label: totalCheck.label || 'statement total' };
  }, [totalCheck, extractedNet]);

  const visibleRows = useMemo(() => {
    if (activeFilter === 'all') return rows;
    if (activeFilter === 'missing') return rows.filter(r => r.type === 'missing' && !r.subscriptionMatch);
    if (activeFilter === 'subscription') return rows.filter(r => r.type === 'missing' && r.subscriptionMatch);
    return rows.filter(r => r.type === activeFilter);
  }, [rows, activeFilter]);

  const toggleFilter = (key: FilterKey) => {
    setActiveFilter(prev => (prev === key ? 'all' : key));
  };

  const filterTileClass = (key: FilterKey) =>
    `rounded-xl border p-3 text-center transition-colors ${
      activeFilter === key ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-primary/40'
    } bg-surface`;

  return (
    <div className="fixed inset-0 bg-background z-[60] flex flex-col overflow-hidden animate-slide-up">
      <div
        className="flex items-center justify-between p-4 border-b border-border bg-surface shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        <button onClick={onClose} className="p-2 -ml-2 text-secondary hover:text-textMain" aria-label="Close">
          <X size={24} />
        </button>
        <div className="min-w-0 text-center">
          <h3 className="text-sm font-bold text-textMain truncate flex items-center gap-1.5 justify-center">
            <GitCompare size={16} className="text-primary" />
            Reconcile statement
          </h3>
          <p className="text-[11px] text-secondary truncate">{statement.fileName}</p>
        </div>
        <button
          onClick={() => runParse(transactions.length > 0)}
          disabled={isParsing || isLoading}
          className="p-2 -mr-2 text-secondary hover:text-primary disabled:opacity-40"
          aria-label={transactions.length > 0 ? 'Re-scan statement' : 'Scan statement'}
          title={transactions.length > 0 ? 'Re-scan statement (discards cached results and re-reads the PDF)' : 'Scan statement'}
        >
          {isParsing ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
        </button>
      </div>

      <div className="p-4 overflow-y-auto flex-1 min-h-0 max-w-3xl w-full mx-auto">
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <button type="button" onClick={() => toggleFilter('matched')} className={filterTileClass('matched')}>
                <p className="text-lg font-black text-emerald-500">{summary.matched}</p>
                <p className="text-[10px] uppercase text-secondary font-bold">Recorded</p>
              </button>
              <button type="button" onClick={() => toggleFilter('missing')} className={filterTileClass('missing')}>
                <p className="text-lg font-black text-amber-500">{summary.missing}</p>
                <p className="text-[10px] uppercase text-secondary font-bold">Not recorded</p>
              </button>
              <button type="button" onClick={() => toggleFilter('subscription')} className={filterTileClass('subscription')}>
                <p className="text-lg font-black text-purple-500">{summary.subscription}</p>
                <p className="text-[10px] uppercase text-secondary font-bold">Possible dupe</p>
              </button>
              <button type="button" onClick={() => toggleFilter('extra')} className={filterTileClass('extra')}>
                <p className="text-lg font-black text-sky-500">{summary.extra}</p>
                <p className="text-[10px] uppercase text-secondary font-bold">Not on statement</p>
              </button>
            </div>

            {parseTruncated && (
              <p className="mb-3 text-xs text-amber-500 flex items-center gap-1">
                <AlertCircle size={12} /> Part of this statement had more transactions than fit in one request - results below may be incomplete. Try Re-scan.
              </p>
            )}

            {totalCheckStatus && (
              <p
                className={`mb-3 text-xs flex items-center gap-1 ${
                  totalCheckStatus.matches ? 'text-emerald-500' : 'text-rose-500'
                }`}
              >
                {totalCheckStatus.matches ? <Check size={12} /> : <AlertTriangle size={12} />}
                {totalCheckStatus.matches
                  ? `Matches the statement's own "${totalCheckStatus.label}" of ${getCurrencySymbol(baseCurrency)}${totalCheckStatus.statedAmount.toFixed(2)} - good sign the scan is accurate.`
                  : `Doesn't match the statement's "${totalCheckStatus.label}" of ${getCurrencySymbol(baseCurrency)}${totalCheckStatus.statedAmount.toFixed(2)} (extracted net is ${getCurrencySymbol(baseCurrency)}${extractedNet.net.toFixed(2)}) - some lines may be missing, duplicated, or mis-valued. Worth a manual check, or try Re-scan.`}
              </p>
            )}

            {parseError && (
              <p className="mb-3 text-xs text-rose-500 flex items-center gap-1">
                <AlertCircle size={12} /> {parseError}
              </p>
            )}

            {visibleRows.length === 0 ? (
              <p className="text-center text-xs text-secondary py-10">Nothing in this filter.</p>
            ) : (
              <div className="space-y-2">
                {visibleRows.map(row => {
                  const key = row.type === 'extra' ? `extra-${row.expense!.id}` : row.statementTxn!.id;
                  const isMissing = row.type === 'missing';
                  const isMatched = row.type === 'matched';
                  return (
                    <DiffRowView
                      key={key}
                      row={row}
                      isAdding={isMissing && addingRowId === row.statementTxn!.id}
                      isEditingCategory={isMatched && editingCategoryExpenseId === row.expense!.id}
                      onStartAdd={() => isMissing && setAddingRowId(row.statementTxn!.id)}
                      onCancelAdd={() => setAddingRowId(null)}
                      onConfirmAdd={async (name, category, color) => {
                        if (!isMissing) return;
                        const txn = row.statementTxn!;
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
                      onStartEditCategory={() => isMatched && setEditingCategoryExpenseId(row.expense!.id)}
                      onCancelEditCategory={() => setEditingCategoryExpenseId(null)}
                      onConfirmEditCategory={async (category, color) => {
                        if (!isMatched) return;
                        await onUpdateExpense({ ...row.expense!, category, color });
                        setEditingCategoryExpenseId(null);
                      }}
                      onLinkToCard={async () => {
                        if (!isMatched) return;
                        await onUpdateExpense({ ...row.expense!, linkedCardId: card.id, linkedCardName: card.name });
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
