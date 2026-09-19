import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, CircleDollarSign, Loader2, Tag, X } from 'lucide-react';
import { CURRENCIES, Expense, PaymentCard } from '../types';
import { DEFAULT_EXPENSE_CATEGORIES as DEFAULT_CATEGORIES, getCurrencySymbol, getExpenseCategories, saveExpenseCategories } from '../services/storageService';

interface AddExpenseProps {
  onSave: (expense: Omit<Expense, 'id'>) => void | Promise<void>;
  onCancel: () => void;
  initialData?: Expense;
  initialDate?: string;
  cards: PaymentCard[];
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#16a34a', '#0ea5e9', '#8b5cf6', '#ec4899', '#64748b'];
const COLOR_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink', 'Slate'];
const FIELD_CLASS = 'w-full min-w-0 h-12 bg-surface border border-border rounded-xl px-3 text-sm text-textMain placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors';
const LABEL_CLASS = 'mb-2 block text-xs font-semibold text-secondary';

const AddExpense: React.FC<AddExpenseProps> = ({ onSave, onCancel, initialData, initialDate, cards }) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('SGD');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Food');
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [newCategory, setNewCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [linkedCardId, setLinkedCardId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
  }, [initialData, initialDate]);

  const persistCategories = (nextCategories: string[]) => {
    const normalized = saveExpenseCategories(nextCategories);
    setCategories(normalized);
    if (!normalized.includes(category)) {
      setCategory(normalized[0] || 'Food');
    }
  };

  const addCategory = () => {
    const value = newCategory.trim();
    if (!value) return;
    if (categories.some(cat => cat.toLowerCase() === value.toLowerCase())) {
      setNewCategory('');
      return;
    }
    persistCategories([...categories, value]);
    setCategory(value);
    setNewCategory('');
  };

  const deleteCategory = (value: string) => {
    if (DEFAULT_CATEGORIES.includes(value)) return;
    const nextCategories = categories.filter(cat => cat !== value);
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
        linkedCardId: linkedCardId || undefined,
        linkedCardName: linkedCardId ? cards.find(card => card.id === linkedCardId)?.name || undefined : undefined,
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
                onChange={e => setCategory(e.target.value)}
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
                    onClick={() => setCategory(cat)}
                    aria-pressed={category === cat}
                    className="min-w-0 rounded-lg px-3 py-2 text-left break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
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
          </div>

          <fieldset>
            <legend className={LABEL_CLASS}>Color tag</legend>
            <div className="grid grid-cols-8 gap-2">
              {COLORS.map((c, index) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
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
