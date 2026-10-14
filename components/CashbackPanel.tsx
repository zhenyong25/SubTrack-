import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Receipt, Trash2, TriangleAlert } from 'lucide-react';
import { CashbackProgram, Expense, PaymentCard } from '../types';
import {
  addDaysIso,
  CategoryCashback,
  computeCashback,
  formatCycleDate,
  getProgramForCycle,
  getStatementCycle,
  getTodayIso,
  shiftStatementCycle,
} from '../services/cashbackService';
import { getCurrencySymbol } from '../services/storageService';
import CashbackProgramEditor from './CashbackProgramEditor';

interface CashbackPanelProps {
  card: PaymentCard;
  expenses: Expense[];
  programs: CashbackProgram[];
  onSaveProgram: (program: CashbackProgram) => void | Promise<void>;
  onDeleteProgram: (programId: string) => void | Promise<void>;
  onUpdateExpense: (expense: Expense) => Promise<void>;
  onEditCard: () => void;
}

const formatMoney = (value: number, currency: string) =>
  `${getCurrencySymbol(currency)}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatPlain = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

const formatRate = (value: number) => `${Number(value.toFixed(2))}%`;

const CategoryStatus: React.FC<{ result: CategoryCashback; hasTier: boolean; currency: string }> = ({ result, hasTier, currency }) => {
  if (!hasTier) {
    return <span className="text-secondary">Reach the first spend tier to start earning</span>;
  }
  if (!result.eligible) {
    return <span className="text-amber-500">Min spend not met · {formatMoney(result.spendToMin, currency)} to go</span>;
  }
  if (result.capped) {
    return <span className="text-amber-500">Cap reached</span>;
  }
  if (result.spend === 0) {
    return <span className="text-secondary">No spend yet</span>;
  }
  return <span className="text-emerald-500">Earning {formatRate(result.rate)}</span>;
};

const CashbackPanel: React.FC<CashbackPanelProps> = ({
  card,
  expenses,
  programs,
  onSaveProgram,
  onDeleteProgram,
  onUpdateExpense,
  onEditCard,
}) => {
  const [cycle, setCycle] = useState(() => getStatementCycle(getTodayIso(), card.statementDay));
  const [editorState, setEditorState] = useState<{ program: CashbackProgram | null } | null>(null);

  useEffect(() => {
    setCycle(getStatementCycle(getTodayIso(), card.statementDay));
  }, [card.id, card.statementDay]);

  const currentCycle = useMemo(() => getStatementCycle(getTodayIso(), card.statementDay), [card.statementDay]);
  const isCurrentCycle = cycle.start === currentCycle.start;

  const program = useMemo(() => getProgramForCycle(programs, card.id, cycle.end), [programs, card.id, cycle.end]);
  const summary = useMemo(
    () => (program ? computeCashback(program, card, expenses, cycle) : null),
    [program, card, expenses, cycle],
  );

  const sortedPrograms = useMemo(
    () => [...programs].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [programs],
  );

  const handleSaveProgram = async (saved: CashbackProgram) => {
    await onSaveProgram(saved);
    // A newer rule set replaces the open-ended one, so close that one the day before this starts.
    const superseded = programs.filter(
      other => other.id !== saved.id && !other.effectiveTo && other.effectiveFrom < saved.effectiveFrom,
    );
    for (const other of superseded) {
      await onSaveProgram({ ...other, effectiveTo: addDaysIso(saved.effectiveFrom, -1) });
    }
    setEditorState(null);
  };

  const handleDeleteProgram = async (target: CashbackProgram) => {
    if (!window.confirm(`Delete "${target.name}"? Transactions keep their amounts but lose this rule set's category tags.`)) return;
    await onDeleteProgram(target.id);
  };

  const currency = program?.currency ?? 'MYR';
  const tierProgress = summary
    ? summary.nextTier
      ? Math.min(
          100,
          Math.max(
            0,
            ((summary.totalSpend - (summary.tier?.minTotalSpend ?? 0)) /
              (summary.nextTier.minTotalSpend - (summary.tier?.minTotalSpend ?? 0))) *
              100,
          ),
        )
      : 100
    : 0;

  const categoryOptions = program ? [...program.categories].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const sortedTiers = program ? [...program.tiers].sort((a, b) => a.minTotalSpend - b.minTotalSpend) : [];

  return (
    <div className="mb-6 space-y-4">
      <div className="bg-background rounded-xl border border-border p-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-secondary uppercase">Cashback</h4>
            <p className="text-[10px] text-secondary mt-1 truncate">
              {program
                ? `${program.name} · statements ${formatCycleDate(program.effectiveFrom)} ${program.effectiveTo ? `to ${formatCycleDate(program.effectiveTo)}` : 'onward'}`
                : 'Set the criteria this card earns cashback under.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {program && (
              <button
                onClick={() => setEditorState({ program })}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-bold text-textMain hover:border-primary/50 transition-colors"
              >
                <Pencil size={12} /> Edit criteria
              </button>
            )}
            <button
              onClick={() => setEditorState({ program: null })}
              className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90 transition-opacity"
            >
              <Plus size={12} /> {programs.length === 0 ? 'Set up criteria' : 'New rule set'}
            </button>
          </div>
        </div>

        {!card.statementDay && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-500" />
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              No statement day set, so cycles follow the calendar month.{' '}
              <button onClick={onEditCard} className="font-bold underline underline-offset-2">Set statement day</button>
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-1.5 mb-4">
          <button
            onClick={() => setCycle(shiftStatementCycle(cycle, card.statementDay, -1))}
            className="rounded-lg p-2 text-secondary hover:bg-background hover:text-textMain transition-colors"
            aria-label="Previous statement cycle"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-0 text-center">
            <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-textMain">
              <CalendarDays size={12} className="text-secondary" /> {cycle.label}
            </p>
            <p className="text-[10px] text-secondary">
              {isCurrentCycle ? 'Current statement cycle' : (
                <button onClick={() => setCycle(currentCycle)} className="font-semibold text-primary">Back to current cycle</button>
              )}
            </p>
          </div>
          <button
            onClick={() => setCycle(shiftStatementCycle(cycle, card.statementDay, 1))}
            className="rounded-lg p-2 text-secondary hover:bg-background hover:text-textMain transition-colors"
            aria-label="Next statement cycle"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {!program ? (
          <div className="text-center py-6 text-secondary border border-dashed border-border rounded-xl bg-background">
            <Receipt size={18} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">
              {programs.length === 0
                ? 'No cashback criteria yet. Add the minimum spend, monthly caps and tier rates for this card.'
                : 'No rule set covers this statement cycle. Check the effective dates of your rule sets below.'}
            </p>
          </div>
        ) : summary && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div className="col-span-2 sm:col-span-1 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="text-[10px] uppercase font-bold text-secondary">Cashback earned</p>
                <p className="mt-1 text-lg font-bold text-primary">{formatMoney(summary.totalCashback, currency)}</p>
                {summary.totalCap != null && (
                  <p className="text-[10px] text-secondary">of {formatMoney(summary.totalCap, currency)} max</p>
                )}
              </div>
              <div className="rounded-xl border border-border bg-surface p-3">
                <p className="text-[10px] uppercase font-bold text-secondary">Cycle spend</p>
                <p className="mt-1 text-lg font-bold text-textMain">{formatMoney(summary.totalSpend, currency)}</p>
                <p className="text-[10px] text-secondary">{summary.transactions.length} transaction{summary.transactions.length === 1 ? '' : 's'}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3">
                <p className="text-[10px] uppercase font-bold text-secondary">Spend tier</p>
                <p className="mt-1 text-lg font-bold text-textMain">{summary.tier ? `Tier ${summary.tier.tierNo}` : 'None yet'}</p>
                <p className="text-[10px] text-secondary">
                  {summary.nextTier
                    ? `${formatMoney(summary.spendToNextTier, currency)} to Tier ${summary.nextTier.tierNo}`
                    : 'Top tier reached'}
                </p>
              </div>
            </div>

            <div className="mb-5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface border border-border">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${tierProgress}%` }} />
              </div>
            </div>

            <h5 className="text-[10px] uppercase font-bold text-secondary mb-2">Categories</h5>
            <div className="space-y-2 mb-5">
              {summary.categories.map(result => {
                const { category } = result;
                const capBase = category.monthlyCap ?? (category.capGroup ? category.groupMonthlyCap : undefined);
                const barPercent = !result.eligible && category.minSpend > 0
                  ? Math.min(100, (result.spend / category.minSpend) * 100)
                  : capBase
                    ? Math.min(100, (result.cashback / capBase) * 100)
                    : 0;
                return (
                  <div key={category.id} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-textMain truncate">
                          {category.name}
                          {category.isDefault && (
                            <span className="ml-2 rounded-full border border-border bg-background px-1.5 py-0.5 text-[9px] font-bold text-secondary align-middle">DEFAULT</span>
                          )}
                        </p>
                        <p className="text-[10px] text-secondary">
                          Spent {formatMoney(result.spend, currency)}
                          <span className="mx-1 opacity-40">·</span>
                          Min {category.minSpend > 0 ? formatMoney(category.minSpend, currency) : 'none'}
                          <span className="mx-1 opacity-40">·</span>
                          Cap {category.monthlyCap != null ? formatMoney(category.monthlyCap, currency) : 'unlimited'}
                          {category.capGroup && category.groupMonthlyCap != null && (
                            <> (shared {formatMoney(category.groupMonthlyCap, currency)} · {category.capGroup})</>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-textMain">{formatMoney(result.cashback, currency)}</p>
                        <p className="text-[10px] text-secondary">{summary.tier ? formatRate(result.rate) : '–'}</p>
                      </div>
                    </div>
                    {(category.minSpend > 0 || capBase != null) && (
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-background">
                        <div
                          className={`h-full rounded-full transition-all ${!result.eligible ? 'bg-amber-500' : result.capped ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${barPercent}%` }}
                        />
                      </div>
                    )}
                    <p className="mt-1.5 text-[10px] font-semibold">
                      <CategoryStatus result={result} hasTier={Boolean(summary.tier)} currency={currency} />
                    </p>
                  </div>
                );
              })}
            </div>

            <h5 className="text-[10px] uppercase font-bold text-secondary mb-2">Rates by monthly spend</h5>
            <div className="overflow-x-auto rounded-lg border border-border mb-5">
              <table className="w-full min-w-[520px] text-[11px]">
                <thead>
                  <tr className="bg-surface text-secondary">
                    <th className="px-3 py-2 text-left font-bold">Tier</th>
                    <th className="px-3 py-2 text-left font-bold">Monthly spend</th>
                    {categoryOptions.map(category => (
                      <th key={category.id} className="px-3 py-2 text-right font-bold">{category.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedTiers.map(tier => {
                    const active = summary.tier?.id === tier.id;
                    return (
                      <tr key={tier.id} className={`border-t border-border ${active ? 'bg-primary/10 font-bold text-textMain' : 'text-textMain'}`}>
                        <td className="px-3 py-2">{tier.tierNo}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {tier.maxTotalSpend != null
                            ? `${formatPlain(tier.minTotalSpend)} – ${formatPlain(tier.maxTotalSpend)}`
                            : `≥ ${formatPlain(tier.minTotalSpend)}`}
                        </td>
                        {categoryOptions.map(category => (
                          <td key={category.id} className="px-3 py-2 text-right">{formatRate(tier.rates[category.id] ?? 0)}</td>
                        ))}
                      </tr>
                    );
                  })}
                  <tr className="border-t border-border bg-surface text-secondary">
                    <td className="px-3 py-2 font-bold" colSpan={2}>Min spend per category</td>
                    {categoryOptions.map(category => (
                      <td key={category.id} className="px-3 py-2 text-right">{category.minSpend > 0 ? formatPlain(category.minSpend) : '–'}</td>
                    ))}
                  </tr>
                  <tr className="border-t border-border bg-surface text-secondary">
                    <td className="px-3 py-2 font-bold" colSpan={2}>Max monthly cashback</td>
                    {categoryOptions.map(category => (
                      <td key={category.id} className="px-3 py-2 text-right">
                        {category.monthlyCap != null
                          ? formatPlain(category.monthlyCap)
                          : category.capGroup && category.groupMonthlyCap != null
                            ? `${formatPlain(category.groupMonthlyCap)} shared`
                            : 'Unlimited'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <h5 className="text-[10px] uppercase font-bold text-secondary mb-2">
              Transactions this cycle ({summary.transactions.length})
            </h5>
            {summary.transactions.length > 0 ? (
              <div className="space-y-2">
                {summary.transactions.map(tx => (
                  <div key={tx.expense.id} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-textMain truncate">{tx.expense.name}</p>
                        <p className="text-[10px] text-secondary">{formatCycleDate(tx.expense.expenseDate)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-textMain">{formatMoney(tx.expense.amount, tx.expense.currency)}</p>
                        <p className={`text-[10px] font-semibold ${tx.cashback > 0 ? 'text-emerald-500' : 'text-secondary'}`}>
                          {tx.cashback > 0 ? `+${formatMoney(tx.cashback, currency)} cashback` : 'No cashback'}
                        </p>
                      </div>
                    </div>
                    <select
                      aria-label={`Cashback category for ${tx.expense.name}`}
                      value={tx.categoryId ?? ''}
                      onChange={event => {
                        void onUpdateExpense({ ...tx.expense, cashbackCategoryId: event.target.value || undefined });
                      }}
                      className="mt-2 w-full bg-background border border-border rounded-lg px-2 py-1.5 text-[11px] text-textMain focus:border-primary outline-none"
                    >
                      {!tx.categoryId && <option value="">Untagged</option>}
                      {categoryOptions.map(category => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-secondary border border-dashed border-border rounded-xl bg-background">
                <Receipt size={18} className="mx-auto mb-2 opacity-50" />
                <p className="text-xs">No transactions on this card in this cycle. Add an expense and link it to this card.</p>
              </div>
            )}
          </>
        )}
      </div>

      {sortedPrograms.length > 0 && (
        <div className="bg-background rounded-xl border border-border p-4">
          <h4 className="text-xs font-bold text-secondary uppercase mb-3">Rule sets</h4>
          <div className="space-y-2">
            {sortedPrograms.map(item => (
              <div key={item.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${item.id === program?.id ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface'}`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-textMain truncate">{item.name}</p>
                  <p className="text-[10px] text-secondary">
                    Statements {formatCycleDate(item.effectiveFrom)} {item.effectiveTo ? `to ${formatCycleDate(item.effectiveTo)}` : 'onward'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setEditorState({ program: item })}
                    className="rounded-lg p-2 text-secondary hover:bg-background hover:text-textMain transition-colors"
                    aria-label={`Edit ${item.name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => void handleDeleteProgram(item)}
                    className="rounded-lg p-2 text-secondary hover:bg-background hover:text-red-500 transition-colors"
                    aria-label={`Delete ${item.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editorState && (
        <CashbackProgramEditor
          card={card}
          program={editorState.program}
          cycleEnd={cycle.end}
          onSave={handleSaveProgram}
          onClose={() => setEditorState(null)}
        />
      )}
    </div>
  );
};

export default CashbackPanel;
