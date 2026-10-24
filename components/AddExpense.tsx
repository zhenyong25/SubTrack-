import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, CircleDollarSign, Loader2, Tag, X } from 'lucide-react';
import { CashbackProgram, CURRENCIES, Expense, PaymentCard } from '../types';
import { computeCashback, getProgramForCycle, getStatementCycle, isCashbackCard } from '../services/cashbackService';
import {
  DEFAULT_EXPENSE_CATEGORIES as DEFAULT_CATEGORIES,
  deleteExpenseCategoryColor,
  EXPENSE_COLOR_PALETTE,
  getCurrencySymbol,
  getExpenseCategories,
  getExpenseCategoryColor,
  saveExpenseCategories,
  saveExpenseCategoryColor,
} from '../services/storageService';

interface AddExpenseProps {
  onSave: (expense: Omit<Expense, 'id'>) => void | Promise<void>;
  onCancel: () => void;
  initialData?: Expense;
  initialDate?: string;
  cards: PaymentCard[];
  expenses?: Expense[];
  cashbackPrograms?: CashbackProgram[];
}

const COLOR_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink', 'Slate'];
const FIELD_CLASS = 'w-full min-w-0 h-12 bg-surface border border-border rounded-xl px-3 text-sm text-textMain placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors';
const LABEL_CLASS = 'mb-2 block text-xs font-semibold text-secondary';

interface CashbackCategoryHintProps {
  program: CashbackProgram;
  categoryId: string;
  cycleLabel: string;
  before: ReturnType<typeof computeCashback> | null;
  after: ReturnType<typeof computeCashback> | null;
}

const CashbackCategoryHint: React.FC<CashbackCategoryHintProps> = ({ program, categoryId, cycleLabel, before, after }) => {
  const category = program.categories.find(item => item.id === categoryId);
  if (!category || !before) return null;

  const symbol = getCurrencySymbol(program.currency);
  const money = (value: number) => `${symbol}${value.toFixed(2)}`;
  const current = before.categories.find(item => item.category.id === category.id);
  const projected = after?.categories.find(item => item.category.id === category.id);
  const spend = current?.spend ?? 0;

  return (
    <div className="mt-3 space-y-1.5 text-[11px] text-secondary">
      <p>
        <span className="font-semibold text-textMain">Min spend</span> {category.minSpend > 0 ? money(category.minSpend) : 'none'}
        <span className="mx-1.5 opacity-40">·</span>
        <span className="font-semibold text-textMain">Monthly cap</span> {category.monthlyCap != null ? money(category.monthlyCap) : 'unlimited'}
        {category.capGroup && category.groupMonthlyCap != null && (
          <span> (shared {money(category.groupMonthlyCap)} with {category.capGroup})</span>
        )}
      </p>
      <p>
        Spent in this category ({cycleLabel}): <span className="font-semibold text-textMain">{money(spend)}</span>
        {category.minSpend > 0 && (
          spend >= category.minSpend
            ? <span className="text-emerald-500"> · minimum met</span>
            : <span> · {money(category.minSpend - spend)} more to unlock</span>
        )}
      </p>
      {after && (
        <p>
          Card cashback this cycle: <span className="font-semibold text-textMain">{money(before.totalCashback)}</span>
          {' → '}
          <span className="font-semibold text-primary">{money(after.totalCashback)}</span>
          {projected?.capped && <span className="text-amber-500"> · category cap reached</span>}
        </p>
      )}
    </div>
  );
};

const AddExpense: React.FC<AddExpenseProps> = ({ onSave, onCancel, initialData, initialDate, cards, expenses = [], cashbackPrograms = [] }) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('SGD');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Food');
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [newCategory, setNewCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedColor, setSelectedColor] = useState(() => getExpenseCategoryColor('Food'));
  const [linkedCardId, setLinkedCardId] = useState('');
  const [cashbackCategoryId, setCashbackCategoryId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const linkedCard = cards.find(card => card.id === linkedCardId);
  const isCashback = isCashbackCard(linkedCard);
  const cycle = useMemo(
    () => (isCashback && linkedCard ? getStatementCycle(date || new Date().toISOString().split('T')[0], linkedCard.statementDay) : null),
    [isCashback, linkedCard, date],
  );
  const program = useMemo(
    () => (cycle && linkedCard ? getProgramForCycle(cashbackPrograms, linkedCard.id, cycle.end) : undefined),
    [cycle, linkedCard, cashbackPrograms],
  );

  // Keep the tag valid for whichever rule set covers the chosen date.
  useEffect(() => {
    if (!program) return;
    setCashbackCategoryId(current =>
      program.categories.some(category => category.id === current)
        ? current
        : program.categories.find(category => category.isDefault)?.id ?? '');
  }, [program]);

  const cashbackPreview = useMemo(() => {
    if (!program || !linkedCard || !cycle) return null;
    const others = expenses.filter(expense => expense.id !== initialData?.id);
    const before = computeCashback(program, linkedCard, others, cycle);
    const draftAmount = parseFloat(amount);
    if (!(draftAmount > 0)) return { before, after: null };
    const draft: Expense = {
      id: '__draft__',
      name,
      amount: draftAmount,
      currency,
      expenseDate: date,
      category,
      color: selectedColor,
      linkedCardId: linkedCard.id,
      cashbackCategoryId: cashbackCategoryId || undefined,
    };
    return { before, after: computeCashback(program, linkedCard, [...others, draft], cycle) };
  }, [program, linkedCard, cycle, expenses, initialData?.id, amount, name, currency, date, category, selectedColor, cashbackCategoryId]);

  useEffect(() => {
    setCategories(getExpenseCategories());
    if (!initialData) {
      if (initialDate) setDate(initialDate);
      return;
    }

    setName(initialData.name);
    setAmount(initialData.amount.toString());
    setCurrency(initialData.currency);
    setDate(initialData.expenseDate.split('T')[0]);
    setCategory(initialData.category);
    setNotes(initialData.notes || '');
    setSelectedColor(initialData.color);
    setLinkedCardId(initialData.linkedCardId || '');
    setCashbackCategoryId(initialData.cashbackCategoryId || '');
  }, [initialData, initialDate]);

  const persistCategories = (nextCategories: string[]) => {
    const normalized = saveExpenseCategories(nextCategories);
    setCategories(normalized);
    if (!normalized.includes(category)) {
      const nextCategory = normalized[0] || 'Food';
      setCategory(nextCategory);
      setSelectedColor(getExpenseCategoryColor(nextCategory));
    }
  };

  const selectCategory = (value: string) => {
    setCategory(value);
    setSelectedColor(getExpenseCategoryColor(value));
  };

  const updateCategoryInput = (value: string) => {
    setCategory(value);
    const existingCategory = categories.find(cat => cat.toLowerCase() === value.trim().toLowerCase());
    if (existingCategory) setSelectedColor(getExpenseCategoryColor(existingCategory));
  };

  const selectCategoryColor = (color: string) => {
    setSelectedColor(color);
    saveExpenseCategoryColor(category, color);
  };

  const addCategory = () => {
    const value = newCategory.trim();
    if (!value) return;
    if (categories.some(cat => cat.toLowerCase() === value.toLowerCase())) {
      setNewCategory('');
      return;
    }
    persistCategories([...categories, value]);
    selectCategory(value);
    setNewCategory('');
  };

  const deleteCategory = (value: string) => {
    if (DEFAULT_CATEGORIES.includes(value)) return;
    const nextCategories = categories.filter(cat => cat !== value);
    deleteExpenseCategoryColor(value);
    persistCategories(nextCategories);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    try {
      await onSave({
        name,
        amount: parseFloat(amount) || 0,
        currency,
        expenseDate: date,
        category,
        color: selectedColor,
        notes: notes.trim() || undefined,
        tags: initialData?.tags,
        linkedCardId: linkedCardId || undefined,
        linkedCardName: linkedCardId ? cards.find(card => card.id === linkedCardId)?.name || undefined : undefined,
        cashbackCategoryId: isCashback && program && cashbackCategoryId ? cashbackCategoryId : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-background min-h-screen pb-20 transition-colors duration-300">
      <div
        className="sticky top-0 bg-background/95 backdrop-blur z-10 px-4 pb-4 flex justify-between items-center border-b border-border"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        <button onClick={onCancel} disabled={isSaving} aria-label="Close expense form" className="rounded-lg p-2 text-secondary hover:bg-surface hover:text-textMain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40">
          <X size={24} />
        </button>
        <h2 className="text-lg font-bold text-textMain">{initialData ? 'Edit Expense' : 'New Expense'}</h2>
        <div className="w-10" />
      </div>

      <div className="px-4 py-6 sm:py-8 max-w-lg mx-auto animate-slide-up">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
              <label htmlFor="expense-name" className={LABEL_CLASS}>Expense name</label>
              <input
                id="expense-name"
                required
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Lunch, groceries, Netflix"
                className={FIELD_CLASS}
              />
          </div>

          <div className="grid grid-cols-[2fr_1fr] gap-4">
            <div className="min-w-0">
              <label htmlFor="expense-amount" className={LABEL_CLASS}>Amount</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary"><CircleDollarSign size={16} /></span>
                <input
                  id="expense-amount"
                  required
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={`${FIELD_CLASS} pl-9 no-spinner`}
                />
              </div>
            </div>
            <div className="min-w-0">
              <label htmlFor="expense-currency" className={LABEL_CLASS}>Currency</label>
              <div className="relative">
                <select
                  id="expense-currency"
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className={`${FIELD_CLASS} appearance-none pr-9 cursor-pointer`}
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>)}
                </select>
                <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary" />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="expense-date" className={LABEL_CLASS}>
              Expense date
            </label>
            <input
              id="expense-date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={`${FIELD_CLASS} [color-scheme:light] dark:[color-scheme:dark]`}
            />
          </div>

          <div className="border-t border-border pt-6">
            <label htmlFor="expense-category" className={LABEL_CLASS}>Category</label>
            <div className="relative mb-3">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary"><Tag size={16} /></span>
              <input
                id="expense-category"
                type="text"
                value={category}
                onChange={e => updateCategoryInput(e.target.value)}
                placeholder="e.g. Bills"
                className={`${FIELD_CLASS} pl-9`}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <div
                  key={cat}
                  className={`flex max-w-full items-center rounded-lg border text-xs transition-colors ${category === cat ? 'bg-primary/10 text-primary border-primary/40' : 'bg-surface text-secondary border-border hover:border-primary/50'}`}
                >
                  <button
                    type="button"
                    onClick={() => selectCategory(cat)}
                    aria-pressed={category === cat}
                    className="min-w-0 rounded-lg px-3 py-2 text-left break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="mr-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full align-middle" style={{ backgroundColor: getExpenseCategoryColor(cat) }} />
                    {cat}
                  </button>
                  {!DEFAULT_CATEGORIES.includes(cat) && (
                    <button
                      type="button"
                      onClick={() => deleteCategory(cat)}
                      className="mr-1 shrink-0 rounded-md p-1.5 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Delete ${cat}`}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                aria-label="New custom category"
                type="text"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder="Create a custom category"
                className={`${FIELD_CLASS} flex-1`}
              />
              <button
                type="button"
                onClick={addCategory}
                disabled={!newCategory.trim()}
                className="shrink-0 bg-primary/10 text-primary px-4 rounded-xl text-sm font-semibold transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <label htmlFor="expense-card" className={LABEL_CLASS}>Linked card <span className="font-normal opacity-70">· Optional</span></label>
            <select
              id="expense-card"
              value={linkedCardId}
              onChange={e => setLinkedCardId(e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">No card linked</option>
              {cards.map(card => (
                <option key={card.id} value={card.id}>
                  {card.name} · {card.kind} · **** {card.last4Digits}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11px] text-secondary">Choose the card used for this payment.</p>

            {isCashback && (
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <label htmlFor="expense-cashback-category" className={LABEL_CLASS}>Cashback category</label>
                {program && cycle ? (
                  <>
                    <div className="relative">
                      <select
                        id="expense-cashback-category"
                        value={cashbackCategoryId}
                        onChange={e => setCashbackCategoryId(e.target.value)}
                        className={`${FIELD_CLASS} appearance-none pr-9 cursor-pointer`}
                      >
                        {program.categories
                          .slice()
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                          .map(item => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                      </select>
                      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary" />
                    </div>
                    <CashbackCategoryHint
                      program={program}
                      categoryId={cashbackCategoryId}
                      cycleLabel={cycle.label}
                      before={cashbackPreview?.before ?? null}
                      after={cashbackPreview?.after ?? null}
                    />
                  </>
                ) : (
                  <p className="text-xs text-secondary">
                    No cashback criteria cover the statement cycle for this date. Open the card and add a rule set, then tag this expense.
                  </p>
                )}
              </div>
            )}
          </div>

          <fieldset>
            <legend className={LABEL_CLASS}>Category color</legend>
            <div className="grid grid-cols-8 gap-2">
              {EXPENSE_COLOR_PALETTE.map((c, index) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => selectCategoryColor(c)}
                  aria-label={COLOR_NAMES[index]}
                  aria-pressed={selectedColor === c}
                  title={COLOR_NAMES[index]}
                  className={`h-11 w-full min-w-0 rounded-xl flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${selectedColor === c ? 'ring-2 ring-textMain ring-offset-2 ring-offset-background shadow-sm' : 'hover:-translate-y-0.5'}`}
                  style={{ backgroundColor: c }}
                >
                  {selectedColor === c && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/30"><Check size={14} strokeWidth={3} className="text-white" /></span>}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-secondary">
              Saved as the default for <span className="font-semibold text-textMain">{category.trim() || 'this category'}</span>. Selecting this category next time will apply the color automatically.
            </p>
          </fieldset>

          <div>
            <label htmlFor="expense-notes" className={LABEL_CLASS}>Notes <span className="font-normal opacity-70">· Optional</span></label>
            <textarea
              id="expense-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add a little context…"
              className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors resize-y min-h-24"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-primary hover:opacity-90 text-white font-bold py-4 rounded-xl shadow-lg transition-all mt-6 flex items-center justify-center disabled:opacity-70"
          >
            {isSaving ? (
              <>
                <Loader2 size={18} className="mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              initialData ? 'Update Expense' : 'Save Expense'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddExpense;
