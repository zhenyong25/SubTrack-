import React, { useEffect, useState } from 'react';
import { Calendar, Check, CircleDollarSign, Loader2, Tag, X } from 'lucide-react';
import { CURRENCIES, Expense, PaymentCard } from '../types';
import { getCurrencySymbol } from '../services/storageService';

interface AddExpenseProps {
  onSave: (expense: Omit<Expense, 'id'>) => void | Promise<void>;
  onCancel: () => void;
  initialData?: Expense;
  initialDate?: string;
  cards: PaymentCard[];
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#16a34a', '#0ea5e9', '#8b5cf6', '#ec4899', '#64748b'];

const DEFAULT_CATEGORIES = ['Food', 'Bills', 'Groceries', 'Rent', 'Transport', 'Dining', 'Shopping', 'Health', 'Insurance', 'Education', 'Subscriptions'];
const EXPENSE_CATEGORIES_KEY = 'subtrack_expense_categories_v1';

const loadStoredCategories = () => {
  try {
    const raw = localStorage.getItem(EXPENSE_CATEGORIES_KEY);
    if (!raw) return DEFAULT_CATEGORIES;
    const parsed = JSON.parse(raw) as string[];
    const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...parsed.filter(Boolean)]));
    return merged.length > 0 ? merged : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
};

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
    setCategories(loadStoredCategories());
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
    const normalized = Array.from(new Set(nextCategories.map(cat => cat.trim()).filter(Boolean)));
    setCategories(normalized);
    localStorage.setItem(EXPENSE_CATEGORIES_KEY, JSON.stringify(normalized));
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
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 flex justify-between items-center border-b border-border">
        <button onClick={onCancel} disabled={isSaving} className="text-secondary hover:text-textMain disabled:opacity-40">
          <X size={24} />
        </button>
        <h2 className="text-lg font-bold text-textMain">{initialData ? 'Edit Expense' : 'New Expense'}</h2>
        <div className="w-6" />
      </div>

      <div className="p-4 space-y-6 max-w-lg mx-auto animate-slide-up">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-[2fr_1fr] gap-4">
            <div>
              <label className="block text-xs font-semibold text-secondary uppercase mb-1">Expense Name</label>
              <input
                required
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Netflix"
                className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-[2fr_1fr] gap-4">
            <div>
              <label className="block text-xs font-semibold text-secondary uppercase mb-1">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-secondary"><CircleDollarSign size={16} /></span>
                <input
                  required
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface border border-border rounded-xl p-3 pl-9 text-textMain focus:border-primary outline-none no-spinner"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-secondary uppercase mb-1">Currency</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none text-sm"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">
              Expense Date
            </label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-secondary"><Calendar size={16} /></span>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl p-3 pl-9 text-textMain focus:border-primary outline-none [color-scheme:dark] dark:[color-scheme:dark] light:[color-scheme:light]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Category</label>
            <div className="relative mb-2">
              <span className="absolute left-3 top-3 text-secondary"><Tag size={16} /></span>
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="e.g. Bills"
                className="w-full bg-surface border border-border rounded-xl p-3 pl-9 text-textMain focus:border-primary outline-none"
              />
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder="Add your own category"
                className="flex-1 bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none text-sm"
              />
              <button
                type="button"
                onClick={addCategory}
                className="bg-primary text-white px-4 rounded-xl text-sm font-bold hover:opacity-90"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <div
                  key={cat}
                  className={`group flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors ${category === cat ? 'bg-primary text-white border-primary' : 'bg-surface text-secondary border-border hover:border-primary/50'}`}
                >
                  <button
                    type="button"
                    onClick={() => setCategory(cat)}
                    className="flex items-center gap-1"
                  >
                    {cat}
                  </button>
                  {!DEFAULT_CATEGORIES.includes(cat) && (
                    <button
                      type="button"
                      onClick={() => deleteCategory(cat)}
                      className="opacity-70 hover:opacity-100"
                      aria-label={`Delete ${cat}`}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-secondary">Tap a category to select it. Custom categories can be added and removed here.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Linked Card</label>
            <select
              value={linkedCardId}
              onChange={e => setLinkedCardId(e.target.value)}
              className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none text-sm"
            >
              <option value="">No card linked</option>
              {cards.map(card => (
                <option key={card.id} value={card.id}>
                  {card.name} · {card.kind} · **** {card.last4Digits}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[10px] text-secondary">Optional. Link this expense to the card used for payment.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Color Tag</label>
            <div className="flex flex-wrap gap-3">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform ${selectedColor === c ? 'scale-110 ring-2 ring-primary shadow-lg' : 'opacity-70'}`}
                  style={{ backgroundColor: c }}
                >
                  {selectedColor === c && <Check size={14} className="text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Optional notes about this expense"
              className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none resize-none"
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
