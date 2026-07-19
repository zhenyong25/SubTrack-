import React, { useEffect, useState } from 'react';
import { Check, CircleDollarSign, Calendar, Tag, X } from 'lucide-react';
import { CURRENCIES, Income, IncomeCycle, IncomeKind, IncomeMode } from '../types';
import { getCurrencySymbol } from '../services/storageService';

interface AddIncomeProps {
  onSave: (income: Omit<Income, 'id'>) => void;
  onCancel: () => void;
  initialData?: Income;
}

const COLORS = ['#0f766e', '#16a34a', '#2563eb', '#7c3aed', '#ea580c', '#dc2626', '#0891b2', '#9333ea'];

const DEFAULT_CATEGORIES = ['Salary', 'Freelance', 'Investments', 'Dividends', 'Bonus', 'Rent', 'Business', 'Side Hustle', 'Interest'];

const AddIncome: React.FC<AddIncomeProps> = ({ onSave, onCancel, initialData }) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('SGD');
  const [incomeType, setIncomeType] = useState<IncomeKind>(IncomeKind.Active);
  const [incomeMode, setIncomeMode] = useState<IncomeMode>('Recurring');
  const [incomeCycle, setIncomeCycle] = useState<IncomeCycle>(IncomeCycle.Monthly);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Salary');
  const [notes, setNotes] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[1]);
  const [status, setStatus] = useState<'Active' | 'Past'>('Active');

  useEffect(() => {
    if (!initialData) return;

    setName(initialData.name);
    setAmount(initialData.amount.toString());
    setCurrency(initialData.currency);
    setIncomeType(initialData.incomeType);
    setIncomeMode(initialData.incomeMode ?? 'Recurring');
    setIncomeCycle(initialData.incomeCycle);
    setDate((initialData.incomeDate || initialData.firstIncomeDate).split('T')[0]);
    setCategory(initialData.category);
    setNotes(initialData.notes || '');
    setSelectedColor(initialData.color);
    setStatus(initialData.status);
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onSave({
      name,
      amount: parseFloat(amount) || 0,
      currency,
      incomeType,
      incomeMode,
      incomeCycle: incomeMode === 'Recurring' ? incomeCycle : IncomeCycle.Monthly,
      firstIncomeDate: date,
      nextIncomeDate: date,
      incomeDate: date,
      category,
      color: selectedColor,
      notes: notes.trim() || undefined,
      status,
    });
  };

  return (
    <div className="bg-background min-h-screen pb-20 transition-colors duration-300">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 flex justify-between items-center border-b border-border">
        <button onClick={onCancel} className="text-secondary hover:text-textMain">
          <X size={24} />
        </button>
        <h2 className="text-lg font-bold text-textMain">{initialData ? 'Edit Income' : 'New Income'}</h2>
        <div className="w-6" />
      </div>

      <div className="p-4 space-y-6 max-w-lg mx-auto animate-slide-up">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-[2fr_1fr] gap-4">
            <div>
              <label className="block text-xs font-semibold text-secondary uppercase mb-1">Income Name</label>
              <input
                required
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Salary"
                className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-secondary uppercase mb-1">Type</label>
              <select
                value={incomeType}
                onChange={e => setIncomeType(e.target.value as IncomeKind)}
                className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none"
              >
                <option value={IncomeKind.Active}>Active</option>
                <option value={IncomeKind.Passive}>Passive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Income Mode</label>
            <div className="bg-background border border-border rounded-xl p-1 flex gap-1">
              {(['Recurring', 'One-time'] as IncomeMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setIncomeMode(mode)}
                  className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${incomeMode === mode ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-secondary">
              Use recurring for salary or business income. Use one-time for dividends, interest, or a single payout.
            </p>
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
              {incomeMode === 'One-time' ? 'Income Date' : status === 'Past' ? 'Ended On' : 'Start Date'}
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

          {incomeMode === 'Recurring' && (
            <div>
              <label className="block text-xs font-semibold text-secondary uppercase mb-1">Income Cycle</label>
              <select
                value={incomeCycle}
                onChange={e => setIncomeCycle(e.target.value as IncomeCycle)}
                className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none appearance-none"
              >
                {Object.values(IncomeCycle).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Category</label>
            <div className="relative mb-2">
              <span className="absolute left-3 top-3 text-secondary"><Tag size={16} /></span>
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="e.g. Salary"
                className="w-full bg-surface border border-border rounded-xl p-3 pl-9 text-textMain focus:border-primary outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${category === cat ? 'bg-primary text-white border-primary' : 'bg-surface text-secondary border-border hover:border-primary/50'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-2">Color Tag</label>
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
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as 'Active' | 'Past')}
              className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none"
            >
              <option value="Active">Active</option>
              <option value="Past">Past</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Optional notes about this income source"
              className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-primary hover:opacity-90 text-white font-bold py-4 rounded-xl shadow-lg transition-all mt-6"
          >
            {initialData ? 'Update Income' : 'Save Income'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddIncome;
