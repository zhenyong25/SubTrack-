import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ListFilter,
  PieChart as PieChartIcon,
  Plus,
  TrendingUp,
  Wallet,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Cell, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts';
import { CURRENCIES, Income } from '../types';
import { getCurrencySymbol, getIncomeDistribution, getIncomeValueForMonth, getYearlyIncomeData } from '../services/storageService';

interface IncomeTabProps {
  incomes: Income[];
  baseCurrency: string;
  onCurrencyChange: (currency: string) => void;
  onAddIncome: () => void;
  onEditIncome: (income: Income) => void;
  onDeleteIncome: (id: string) => void;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899'];

type ViewMode = 'Daily' | 'Monthly' | 'Yearly';

type YearlyIncomePoint = {
  name: string;
  total: number;
  recurringTotal: number;
  oneTimeTotal: number;
  activeTotal: number;
  passiveTotal: number;
  entries: Array<{
    name: string;
    amount: number;
    kind: 'Active' | 'Passive';
    mode: 'Recurring' | 'One-time';
    category: string;
  }>;
};

const IncomeYearTooltip = ({ active, payload, label, baseCurrency }: {
  active?: boolean;
  payload?: Array<{ payload: YearlyIncomePoint }>;
  label?: string;
  baseCurrency: string;
}) => {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const topEntries = point.entries.slice(0, 4);

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-xl min-w-[220px]">
      <p className="text-xs font-bold text-textMain">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-primary">
        {point.total.toFixed(2)} {baseCurrency}
      </p>
      <div className="mt-2 space-y-1 text-[11px] text-secondary">
        <div className="flex items-center justify-between gap-3">
          <span>Recurring</span>
          <span className="font-semibold text-textMain">{point.recurringTotal.toFixed(2)} {baseCurrency}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>One-time</span>
          <span className="font-semibold text-textMain">{point.oneTimeTotal.toFixed(2)} {baseCurrency}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Active</span>
          <span className="font-semibold text-textMain">{point.activeTotal.toFixed(2)} {baseCurrency}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Passive</span>
          <span className="font-semibold text-textMain">{point.passiveTotal.toFixed(2)} {baseCurrency}</span>
        </div>
      </div>
      {topEntries.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-secondary">Top entries</p>
          <div className="mt-1 space-y-1">
            {topEntries.map(entry => (
              <div key={`${entry.name}-${entry.amount}`} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="truncate text-textMain">{entry.name}</span>
                <span className="font-semibold text-secondary">{entry.amount.toFixed(2)} {baseCurrency}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const IncomeTab: React.FC<IncomeTabProps> = ({ incomes, baseCurrency, onCurrencyChange, onAddIncome, onEditIncome, onDeleteIncome }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('Monthly');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const stats = useMemo(() => {
    const activeIncomes = incomes.filter(income => income.status === 'Active');
    const monthlyTotal = activeIncomes.reduce((sum, income) => sum + getIncomeValueForMonth(income, baseCurrency, currentYear, currentMonth), 0);
    const activeMonthly = activeIncomes
      .filter(income => income.incomeType === 'Active')
      .reduce((sum, income) => sum + getIncomeValueForMonth(income, baseCurrency, currentYear, currentMonth), 0);
    const passiveMonthly = activeIncomes
      .filter(income => income.incomeType === 'Passive')
      .reduce((sum, income) => sum + getIncomeValueForMonth(income, baseCurrency, currentYear, currentMonth), 0);
    const annualActiveTotal = getYearlyIncomeData(activeIncomes.filter(income => income.incomeType === 'Active'), currentYear, baseCurrency)
      .reduce((sum, month) => sum + month.total, 0);
    const activeAverageMonthly = annualActiveTotal / 12;
    const annualPassiveTotal = getYearlyIncomeData(activeIncomes.filter(income => income.incomeType === 'Passive'), currentYear, baseCurrency)
      .reduce((sum, month) => sum + month.total, 0);
    const passiveAverageMonthly = annualPassiveTotal / 12;

    const topIncome = activeIncomes
      .slice()
      .sort((a, b) => getIncomeValueForMonth(b, baseCurrency, currentYear, currentMonth) - getIncomeValueForMonth(a, baseCurrency, currentYear, currentMonth))[0];

    const dailyTotal = monthlyTotal / 30;
    const yearlyTotal = getYearlyIncomeData(activeIncomes, currentYear, baseCurrency).reduce((sum, month) => sum + month.total, 0);

    return {
      monthlyTotal,
      yearlyTotal,
      dailyTotal,
      activeMonthly,
      activeAverageMonthly,
      passiveMonthly,
      passiveAverageMonthly,
      topIncome,
      activeCount: activeIncomes.length,
      passiveCount: activeIncomes.filter(income => income.incomeType === 'Passive').length,
    };
  }, [incomes, baseCurrency, currentYear, currentMonth]);

  const displayTotal = useMemo(() => {
    switch (viewMode) {
      case 'Daily':
        return stats.dailyTotal;
      case 'Monthly':
        return stats.monthlyTotal;
      case 'Yearly':
        return stats.yearlyTotal;
    }
  }, [stats, viewMode]);

  const yearlyData = useMemo(() => getYearlyIncomeData(incomes, selectedYear, baseCurrency) as YearlyIncomePoint[], [incomes, selectedYear, baseCurrency]);
  const categoryData = useMemo(() => getIncomeDistribution(incomes, baseCurrency, currentYear, currentMonth), [incomes, baseCurrency, currentYear, currentMonth]);

  const incomeRows = useMemo(() => {
    return incomes.slice().sort((a, b) => {
      const aDate = new Date(a.incomeMode === 'One-time' ? a.incomeDate || a.firstIncomeDate : a.nextIncomeDate).getTime();
      const bDate = new Date(b.incomeMode === 'One-time' ? b.incomeDate || b.firstIncomeDate : b.nextIncomeDate).getTime();
      return bDate - aDate;
    });
  }, [incomes]);

  return (
    <div className="space-y-6 pb-24 animate-fade-in">
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-xl flex items-center justify-between relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-xs font-medium opacity-80 uppercase tracking-wide mb-1 flex items-center">
            <TrendingUp size={12} className="mr-1" /> Income Snapshot
          </p>
          <h2 className="text-2xl font-bold">{displayTotal.toFixed(2)} {baseCurrency}</h2>
          <p className="text-xs mt-2 opacity-80 font-medium">
            {viewMode} income across active sources
          </p>
        </div>
        <div className="relative z-10 bg-white/10 p-3 rounded-xl backdrop-blur-sm border border-white/10">
          <CircleDollarSign size={28} />
        </div>
        <div className="absolute -right-6 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
      </div>

      <p className="text-xs text-secondary -mt-2">
        Top source: {stats.topIncome ? `${stats.topIncome.name} - ${getIncomeValueForMonth(stats.topIncome, baseCurrency, currentYear, currentMonth).toFixed(2)} ${baseCurrency}/mo` : 'No active income yet'}
      </p>

      <div className="flex justify-between items-center gap-3">
        <div className="bg-surface p-1 rounded-lg border border-border flex space-x-1">
          {(['Daily', 'Monthly', 'Yearly'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${viewMode === mode ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-textMain'}`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex space-x-2">
          <select
            value={baseCurrency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            className="bg-surface text-xs font-bold text-textMain py-1.5 px-3 rounded-lg border border-border outline-none focus:border-primary cursor-pointer"
          >
            {CURRENCIES.map(currency => (
              <option key={currency} value={currency}>
                {getCurrencySymbol(currency)} {currency}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface p-5 rounded-xl shadow-sm border border-border">
          <div className="flex items-center space-x-2 text-secondary mb-3">
            <Wallet size={18} className="text-emerald-500" />
            <span className="text-xs font-bold uppercase tracking-wider">Avg. Active</span>
          </div>
          <p className="text-2xl font-bold text-textMain">{stats.activeAverageMonthly.toFixed(2)}</p>
          <p className="text-[10px] text-secondary mt-1">Annual active income divided by 12</p>
        </div>

        <div className="bg-surface p-5 rounded-xl shadow-sm border border-border">
          <div className="flex items-center space-x-2 text-secondary mb-3">
            <ListFilter size={18} className="text-teal-500" />
            <span className="text-xs font-bold uppercase tracking-wider">Avg. Passive</span>
          </div>
          <p className="text-2xl font-bold text-textMain">{stats.passiveAverageMonthly.toFixed(2)}</p>
          <p className="text-[10px] text-secondary mt-1">Annual passive income divided by 12</p>
        </div>

        <div className="bg-surface p-5 rounded-xl shadow-sm border border-border">
          <div className="flex items-center space-x-2 text-secondary mb-3">
            <BarChart3 size={18} className="text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider">Daily Avg.</span>
          </div>
          <p className="text-2xl font-bold text-textMain">{stats.dailyTotal.toFixed(2)}</p>
          <p className="text-[10px] text-secondary mt-1">Average daily income</p>
        </div>

        <div className="bg-surface p-5 rounded-xl shadow-sm border border-border">
          <div className="flex items-center space-x-2 text-secondary mb-3">
            <PieChartIcon size={18} className="text-indigo-500" />
            <span className="text-xs font-bold uppercase tracking-wider">Sources</span>
          </div>
          <p className="text-2xl font-bold text-textMain">{stats.activeCount}</p>
          <p className="text-[10px] text-secondary mt-1">{stats.passiveCount} passive sources included</p>
        </div>
      </div>

      <div className="bg-surface p-6 rounded-xl shadow-sm border border-border">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Yearly Income Progression</h3>
          <div className="flex items-center space-x-2 bg-background border border-border rounded-lg px-2 py-1">
            <button onClick={() => setSelectedYear(year => year - 1)} className="p-1 hover:text-primary"><ChevronLeft size={16} /></button>
            <span className="text-xs font-bold w-12 text-center">{selectedYear}</span>
            <button onClick={() => setSelectedYear(year => year + 1)} className="p-1 hover:text-primary"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="h-56 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={yearlyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-secondary)', fontSize: 10 }} interval={0} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-secondary)', fontSize: 10 }} width={30} />
              <Tooltip
                cursor={{ fill: 'var(--color-text-main)', opacity: 0.05 }}
                content={<IncomeYearTooltip baseCurrency={baseCurrency} />}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="var(--color-primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-surface p-6 rounded-xl shadow-sm border border-border">
        <h3 className="text-sm font-bold text-textMain uppercase mb-6 tracking-wide">Income by Category</h3>
        <div className="h-64 w-full min-w-0">
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`income-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-main)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ color: 'var(--color-text-main)', fontSize: '12px', fontWeight: 'bold' }}
                  formatter={(value: number) => [`${value.toFixed(2)} ${baseCurrency}`, 'Monthly']}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-secondary opacity-50">
              <p>No income categories yet</p>
            </div>
          )}
        </div>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          {categoryData.map((entry, index) => (
            <div key={entry.name} className="flex items-center space-x-1.5 bg-background px-2 py-1 rounded-md border border-border">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <span className="text-xs font-medium text-secondary">{entry.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface p-4 sm:p-6 rounded-xl shadow-sm border border-border">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center space-x-2 min-w-0">
            <CircleDollarSign className="text-primary" size={18} />
            <h3 className="text-sm font-bold text-textMain uppercase tracking-wide truncate">Income Sources</h3>
          </div>
          <button onClick={onAddIncome} className="bg-primary/10 text-primary p-2 rounded-lg hover:bg-primary hover:text-white transition-colors shrink-0">
            <Plus size={18} />
          </button>
        </div>

        {incomeRows.length === 0 ? (
          <div className="text-center py-8 text-secondary">
            <p className="text-xs">No income sources yet.</p>
            <button onClick={onAddIncome} className="mt-2 text-primary text-xs font-bold hover:underline">Add income source</button>
          </div>
        ) : (
          <div className="space-y-3">
            {incomeRows.map(income => {
              const monthlyValue = getIncomeValueForMonth(income, baseCurrency, today.getFullYear(), today.getMonth());
              const isOneTime = income.incomeMode === 'One-time';
              const entryDate = isOneTime ? (income.incomeDate || income.firstIncomeDate) : income.nextIncomeDate;
              const frequencyLabel = isOneTime ? 'One-time' : (income.incomeCycle ?? 'Monthly');
              const recurringStart = new Date(income.firstIncomeDate || income.nextIncomeDate || income.incomeDate || new Date().toISOString());
              const isFutureRecurringStart = !isOneTime && !Number.isNaN(recurringStart.getTime()) && recurringStart > today;

              return (
                <div key={income.id} className="bg-background rounded-xl border border-border px-3 py-2.5 sm:px-4 sm:py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: income.color || '#0f766e' }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <h4 className="font-bold text-textMain truncate">{income.name}</h4>
                            <span className={`shrink-0 text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded-full border ${income.incomeType === 'Passive' ? 'bg-teal-50 text-teal-600 border-teal-100 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800/50' : 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/50'}`}>
                              {income.incomeType}
                            </span>
                            <span className={`shrink-0 text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded-full border ${isOneTime ? 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50' : 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/50'}`}>
                              {frequencyLabel}
                            </span>
                            {isFutureRecurringStart && (
                              <span className="shrink-0 text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50">
                                Starts later
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[10px] text-secondary truncate">
                            {income.category}
                            {!isOneTime && income.incomeCycle ? ` • ${income.incomeCycle}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm sm:text-[15px] font-bold text-textMain leading-tight">
                        {isOneTime ? `${income.amount.toFixed(2)} ${baseCurrency}` : `${monthlyValue.toFixed(2)} ${baseCurrency}/mo`}
                      </p>
                      <p className="text-[9px] text-secondary">
                        {isOneTime ? `Date: ${new Date(entryDate).toLocaleDateString()}` : `Next: ${new Date(entryDate).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <p className="min-w-0 text-[10px] sm:text-xs text-secondary truncate">
                      {isOneTime ? 'One-time income' : isFutureRecurringStart ? `Recurring • starts ${recurringStart.toLocaleDateString()}` : `Recurring • per ${income.incomeCycle?.toLowerCase() ?? 'month'}`}
                    </p>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => onEditIncome(income)} className="text-primary text-[11px] font-bold flex items-center">
                        <Pencil size={13} className="mr-1" />
                        Edit
                      </button>
                      <button onClick={() => onDeleteIncome(income.id)} className="text-red-500 text-[11px] font-bold flex items-center">
                        <Trash2 size={13} className="mr-1" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default IncomeTab;
