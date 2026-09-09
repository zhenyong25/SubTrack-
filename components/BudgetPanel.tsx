import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, Pencil, PiggyBank, Plus, Search, Trash2, X } from 'lucide-react';
import { BudgetPlan } from '../types';

interface BudgetPanelProps {
  monthLabel: string;
  monthKey: string;
  currency: string;
  plan?: BudgetPlan;
  previousPlan?: BudgetPlan;
  spendingByCategory: Record<string, number>;
  availableCategories: string[];
  onSave: (plan: BudgetPlan) => void;
}

const BudgetPanel: React.FC<BudgetPanelProps> = ({
  monthLabel,
  monthKey,
  currency,
  plan,
  previousPlan,
  spendingByCategory,
  availableCategories,
  onSave,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [totalLimit, setTotalLimit] = useState('');
  const [categoryLimits, setCategoryLimits] = useState<Record<string, number>>({});
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');

  useEffect(() => {
    setTotalLimit(plan?.totalLimit ? String(plan.totalLimit) : '');
    setCategoryLimits(plan?.categoryLimits || {});
    setIsCategoryPickerOpen(false);
    setCategorySearch('');
    setIsEditing(false);
  }, [monthKey, plan]);

  const spent = useMemo(
    () => (Object.values(spendingByCategory) as number[]).reduce((sum, value) => sum + value, 0),
    [spendingByCategory],
  );
  const limit = plan?.totalLimit || 0;
  const remaining = limit - spent;
  const progress = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
  const isOver = limit > 0 && spent > limit;
  const unusedCategories = availableCategories.filter(category => !(category in categoryLimits));
  const filteredCategories = unusedCategories.filter(category =>
    category.toLowerCase().includes(categorySearch.trim().toLowerCase()),
  );
  const categoryAllocationTotal = (Object.values(categoryLimits) as number[]).reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
  const hasIncompleteCategory = (Object.values(categoryLimits) as number[]).some(value => !Number.isFinite(value) || value <= 0);
  const parsedTotalLimit = Number(totalLimit) || 0;

  const beginWith = (source?: BudgetPlan) => {
    setTotalLimit(source?.totalLimit ? String(source.totalLimit) : '');
    setCategoryLimits(source?.categoryLimits || {});
    setIsEditing(true);
  };

  const save = () => {
    const parsedLimit = Number(totalLimit);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) return;
    onSave({
      month: monthKey,
      totalLimit: parsedLimit,
      categoryLimits: Object.fromEntries(
        (Object.entries(categoryLimits) as Array<[string, number]>).filter(([, value]) => Number.isFinite(value) && value > 0),
      ),
      updatedAt: new Date().toISOString(),
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <section className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Budget plan</p>
            <h3 className="mt-1 text-base font-bold text-textMain">Plan {monthLabel}</h3>
          </div>
          <button onClick={() => setIsEditing(false)} className="p-2 rounded-lg text-secondary hover:bg-background hover:text-textMain" aria-label="Cancel editing budget">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <label className="block">
            <span className="text-xs font-semibold text-secondary">Total monthly limit</span>
            <div className="mt-2 flex items-center rounded-xl border border-border bg-background focus-within:border-primary">
              <span className="pl-3 text-xs font-bold text-secondary">{currency}</span>
              <input
                autoFocus
                type="number"
                min="0"
                step="10"
                value={totalLimit}
                onChange={event => setTotalLimit(event.target.value)}
                className="w-full bg-transparent px-3 py-3 text-lg font-bold text-textMain outline-none"
                placeholder="2,000"
              />
            </div>
          </label>

          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <p className="text-xs font-semibold text-secondary">Category limits</p>
                <p className="text-[10px] text-secondary/80">Add as many category budgets as you need</p>
              </div>
              {Object.keys(categoryLimits).length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                  {Object.keys(categoryLimits).length} categor{Object.keys(categoryLimits).length === 1 ? 'y' : 'ies'}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {Object.entries(categoryLimits).map(([category, value]) => (
                <div key={category} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-textMain">{category}</span>
                  <div className="flex items-center rounded-lg border border-border bg-background">
                    <span className="pl-2 text-[10px] text-secondary">{currency}</span>
                    <input
                      type="number"
                      min="0"
                      value={value || ''}
                      onChange={event => setCategoryLimits(current => ({ ...current, [category]: Number(event.target.value) }))}
                      className="w-24 bg-transparent px-2 py-2 text-right text-xs font-bold text-textMain outline-none"
                    />
                  </div>
                  <button
                    onClick={() => setCategoryLimits(current => Object.fromEntries(Object.entries(current).filter(([name]) => name !== category)))}
                    className="p-2 text-secondary hover:text-red-500"
                    aria-label={`Remove ${category} limit`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            {Object.keys(categoryLimits).length > 0 && (
              <div className="mt-3 rounded-xl bg-background px-3 py-2.5">
                <div className="flex items-center justify-between gap-3 text-[10px]">
                  <span className="text-secondary">Allocated to categories</span>
                  <span className={`font-bold ${parsedTotalLimit > 0 && categoryAllocationTotal > parsedTotalLimit ? 'text-red-500' : 'text-textMain'}`}>
                    {categoryAllocationTotal.toFixed(2)} / {parsedTotalLimit.toFixed(2)} {currency}
                  </span>
                </div>
                {hasIncompleteCategory && (
                  <p className="mt-1.5 text-[10px] font-medium text-amber-500">Enter an amount for every added category before saving.</p>
                )}
              </div>
            )}

            {unusedCategories.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-xl border border-border bg-background">
                <button
                  onClick={() => {
                    setIsCategoryPickerOpen(open => !open);
                    setCategorySearch('');
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-surface"
                  aria-expanded={isCategoryPickerOpen}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-textMain">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Plus size={14} /></span>
                    Add categories
                  </span>
                  <ChevronDown size={16} className={`text-secondary transition-transform ${isCategoryPickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {isCategoryPickerOpen && (
                  <div className="border-t border-border p-3">
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 focus-within:border-primary">
                      <Search size={14} className="shrink-0 text-secondary" />
                      <input
                        autoFocus
                        value={categorySearch}
                        onChange={event => setCategorySearch(event.target.value)}
                        placeholder="Search categories"
                        className="w-full bg-transparent py-2.5 text-xs text-textMain outline-none placeholder:text-secondary/70"
                      />
                      {categorySearch && (
                        <button onClick={() => setCategorySearch('')} className="text-secondary hover:text-textMain" aria-label="Clear category search"><X size={14} /></button>
                      )}
                    </div>

                    <div className="mt-3 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {filteredCategories.map(category => (
                        <button
                          key={category}
                          onClick={() => {
                            setCategoryLimits(current => ({ ...current, [category]: 0 }));
                            setCategorySearch('');
                          }}
                          className="truncate rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-xs font-medium text-textMain transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                          title={category}
                        >
                          {category}
                        </button>
                      ))}
                    </div>

                    {filteredCategories.length === 0 && (
                      <p className="py-5 text-center text-xs text-secondary">{unusedCategories.length === 0 ? 'All categories have been added' : 'No matching categories'}</p>
                    )}

                    <button
                      onClick={() => {
                        setIsCategoryPickerOpen(false);
                        setCategorySearch('');
                      }}
                      className="mt-3 w-full rounded-lg border border-border bg-surface py-2 text-xs font-bold text-textMain hover:border-primary/40 hover:text-primary"
                    >
                      Done adding categories
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={save}
            disabled={!Number(totalLimit) || Number(totalLimit) <= 0 || hasIncompleteCategory}
            className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 disabled:opacity-40"
          >
            <Check size={16} className="inline mr-2" /> Save budget
          </button>
        </div>
      </section>
    );
  }

  if (!plan) {
    return (
      <section className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-5 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><PiggyBank size={22} /></div>
          <div>
            <h3 className="text-sm font-bold text-textMain">Plan your {monthLabel} budget</h3>
            <p className="mt-1 text-xs text-secondary">Set a total and optional category guardrails.</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {previousPlan && (
            <button onClick={() => beginWith(previousPlan)} className="p-2.5 rounded-xl border border-border bg-surface text-secondary hover:text-primary" title="Copy previous month">
              <Copy size={17} />
            </button>
          )}
          <button onClick={() => beginWith()} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white">Set budget</button>
        </div>
      </section>
    );
  }

  const categories = (Object.entries(plan.categoryLimits) as Array<[string, number]>).sort((a, b) => b[1] - a[1]);

  return (
    <section className="bg-surface rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-2.5 ${isOver ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}><PiggyBank size={22} /></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">{monthLabel} budget</p>
            <p className={`mt-1 text-xl font-extrabold ${isOver ? 'text-red-500' : 'text-textMain'}`}>
              {Math.abs(remaining).toFixed(2)} <span className="text-xs font-bold">{currency}</span>
            </p>
            <p className="text-[10px] text-secondary">{isOver ? 'over budget' : 'left to spend'}</p>
          </div>
        </div>
        <button onClick={() => beginWith(plan)} className="p-2 rounded-lg text-secondary hover:bg-background hover:text-primary" aria-label="Edit budget"><Pencil size={16} /></button>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex justify-between text-[11px] font-semibold">
          <span className="text-textMain">{spent.toFixed(2)} spent</span>
          <span className="text-secondary">of {limit.toFixed(2)}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-background">
          <div className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : progress >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {categories.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {categories.map(([category, categoryLimit]) => {
            const categorySpent = spendingByCategory[category] || 0;
            const ratio = categoryLimit > 0 ? categorySpent / categoryLimit : 0;
            return (
              <div key={category} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate font-semibold text-textMain">{category}</span>
                  <span className={ratio > 1 ? 'font-bold text-red-500' : 'text-secondary'}>{categorySpent.toFixed(0)} / {categoryLimit.toFixed(0)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                  <div className={`h-full rounded-full ${ratio > 1 ? 'bg-red-500' : ratio >= .8 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default BudgetPanel;
