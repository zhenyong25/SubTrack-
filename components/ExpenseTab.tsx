import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ListFilter,
  PieChart as PieChartIcon,
  TrendingDown,
  Wallet,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Cell, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts';
import { BudgetPlan, CURRENCIES, Expense, Subscription } from '../types';
import { convertCurrency, getCurrencySymbol, getExpenseCalendarDays, getMonthlyExpense, getYearlyExpenseData, getYearlyExpenseDataFromExpenses } from '../services/storageService';
import BudgetPanel from './BudgetPanel';

interface ExpenseTabProps {
  expenses: Expense[];
  subscriptions: Subscription[];
  budgetPlans: BudgetPlan[];
  baseCurrency: string;
  onCurrencyChange: (currency: string) => void;
  onAddExpense: (expenseDate?: string) => void;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
  onSaveBudgetPlan: (plan: BudgetPlan) => void;
}

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#16a34a', '#0ea5e9', '#8b5cf6', '#ec4899', '#64748b'];

type ViewMode = 'Daily' | 'Monthly' | 'Yearly';

type YearlyExpensePoint = {
  name: string;
  total: number;
  entries: Array<{
    name: string;
    amount: number;
    category: string;
    source: 'Expense' | 'Subscription';
  }>;
};

const ExpenseYearTooltip = ({ active, payload, label, baseCurrency }: {
  active?: boolean;
  payload?: Array<{ payload: YearlyExpensePoint }>;
  label?: string;
  baseCurrency: string;
}) => {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  const categoryTotals = point.entries.reduce((map, entry) => {
    map.set(entry.category, (map.get(entry.category) || 0) + entry.amount);
    return map;
  }, new Map<string, number>());

  const totalCategories = categoryTotals.size;
  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-xl min-w-[220px]">
      <p className="text-xs font-bold text-textMain">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-primary">
        {point.total.toFixed(2)} {baseCurrency}
      </p>
      {topCategories.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-secondary">Category breakdown</p>
          <div className="mt-1 space-y-1">
            {topCategories.map(([category, amount]) => (
              <div key={category} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="truncate text-textMain">{category}</span>
                <span className="font-semibold text-secondary">{amount.toFixed(2)} {baseCurrency}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {totalCategories > topCategories.length && (
        <p className="mt-2 text-[10px] text-secondary">
          +{Math.max(0, totalCategories - topCategories.length)} more categories
        </p>
      )}
    </div>
  );
};

const ExpenseTab: React.FC<ExpenseTabProps> = ({ expenses, subscriptions, budgetPlans = [], baseCurrency, onCurrencyChange, onAddExpense, onEditExpense, onDeleteExpense, onSaveBudgetPlan }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('Monthly');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const today = new Date();

  useEffect(() => {
    setSelectedDay(null);
  }, [selectedMonth, selectedYear]);

  const syncedSubscriptions = useMemo(
    () => subscriptions.filter(subscription => subscription.status === 'Active' && subscription.billingCycle !== 'Free Trial'),
    [subscriptions]
  );

  const monthExpenses = useMemo(
    () => expenses.filter(expense => {
      const date = new Date(expense.expenseDate);
      return !Number.isNaN(date.getTime()) && date.getFullYear() === selectedYear && date.getMonth() === selectedMonth;
    }),
    [expenses, selectedYear, selectedMonth]
  );

  const calendarDays = useMemo(
    () => getExpenseCalendarDays(expenses, syncedSubscriptions, selectedYear, selectedMonth, baseCurrency),
    [expenses, syncedSubscriptions, selectedYear, selectedMonth, baseCurrency]
  );

  const scheduledSubscriptionEntries = useMemo(
    () => calendarDays.flatMap(day => day.entries).filter(entry => entry.source === 'Subscription'),
    [calendarDays],
  );

  const stats = useMemo(() => {
    const expenseMonthly = monthExpenses.reduce((sum, expense) => sum + getMonthlyExpense(expense, baseCurrency), 0);
    const subscriptionMonthly = scheduledSubscriptionEntries.reduce(
      (sum, entry) => sum + convertCurrency(entry.amount, entry.currency, baseCurrency),
      0,
    );
    const monthlyTotal = expenseMonthly + subscriptionMonthly;
    const yearlyTotal = monthlyTotal * 12;
    const monthDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const dailyAverage = monthlyTotal / monthDays;

    const topExpense = [
      ...monthExpenses.map(expense => ({
        id: expense.id,
        name: expense.name,
        value: getMonthlyExpense(expense, baseCurrency),
        source: 'Expense' as const,
      })),
      ...scheduledSubscriptionEntries.map(entry => ({
        id: entry.id,
        name: entry.name,
        value: convertCurrency(entry.amount, entry.currency, baseCurrency),
        source: 'Subscription' as const,
      })),
    ].sort((a, b) => b.value - a.value)[0];

    return {
      monthlyTotal,
      yearlyTotal,
      dailyAverage,
      topExpense,
      expenseCount: monthExpenses.length,
      subscriptionCount: scheduledSubscriptionEntries.length,
      recurringExpenseMonthly: expenseMonthly,
      subscriptionMonthly,
      expenseMonthly,
    };
  }, [monthExpenses, scheduledSubscriptionEntries, baseCurrency, selectedMonth, selectedYear]);

  const yearlyExpenseData = useMemo(() => {
    const expenseData = getYearlyExpenseDataFromExpenses(expenses, selectedYear, baseCurrency);
    const subscriptionData = getYearlyExpenseData(syncedSubscriptions, selectedYear, baseCurrency);
    return expenseData.map((item, index) => {
      const combinedEntries = [
        ...item.entries,
        ...(subscriptionData[index]?.entries || []),
      ].sort((a, b) => b.amount - a.amount);

      return {
        ...item,
        total: parseFloat((item.total + (subscriptionData[index]?.total || 0)).toFixed(2)),
      entries: combinedEntries,
      };
    }) as YearlyExpensePoint[];
  }, [expenses, syncedSubscriptions, selectedYear, baseCurrency]);

  const yearlyLoggedTotal = useMemo(
    () => yearlyExpenseData.reduce((sum, item) => sum + item.total, 0),
    [yearlyExpenseData]
  );

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    calendarDays.flatMap(day => day.entries).forEach(entry => {
      const value = convertCurrency(entry.amount, entry.currency, baseCurrency);
      map.set(entry.category, (map.get(entry.category) || 0) + value);
    });

    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [calendarDays, baseCurrency]);

  const budgetMonthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const previousBudgetDate = new Date(selectedYear, selectedMonth - 1, 1);
  const previousBudgetMonthKey = `${previousBudgetDate.getFullYear()}-${String(previousBudgetDate.getMonth() + 1).padStart(2, '0')}`;
  const currentBudgetPlan = budgetPlans.find(plan => plan.month === budgetMonthKey);
  const previousBudgetPlan = budgetPlans.find(plan => plan.month === previousBudgetMonthKey);
  const spendingByCategory = useMemo(
    () => Object.fromEntries(categoryData.map(entry => [entry.name, entry.value])),
    [categoryData],
  );
  const availableBudgetCategories = useMemo(
    () => Array.from(new Set([
      ...expenses.map(expense => expense.category),
      ...subscriptions.map(subscription => subscription.category),
      ...Object.keys(currentBudgetPlan?.categoryLimits || {}),
    ])).filter(Boolean).sort(),
    [expenses, subscriptions, currentBudgetPlan],
  );

  const selectedCalendarDayTotal = useMemo(() => {
    const currentDay = selectedYear === today.getFullYear() && selectedMonth === today.getMonth() ? today.getDate() : 1;
    return calendarDays.find(day => day.day === currentDay)?.total ?? 0;
  }, [calendarDays, selectedMonth, selectedYear, today]);

  const displayTotal = useMemo(() => {
    switch (viewMode) {
      case 'Daily':
        return selectedCalendarDayTotal;
      case 'Monthly':
        return stats.monthlyTotal;
      case 'Yearly':
        return yearlyLoggedTotal;
    }
  }, [selectedCalendarDayTotal, stats, viewMode, yearlyLoggedTotal]);

  const viewLabel = viewMode === 'Daily'
    ? (selectedYear === today.getFullYear() && selectedMonth === today.getMonth() ? 'Today' : 'Selected Day')
    : viewMode === 'Monthly'
      ? 'This Month'
      : 'This Year';
  const viewSpendLabel = viewMode === 'Daily' ? 'daily spend' : viewMode === 'Monthly' ? 'monthly spend' : 'yearly spend';
  const expenseBucketLabel = viewMode === 'Daily' ? 'Logged Today' : viewMode === 'Monthly' ? 'Logged This Month' : 'Logged This Year';
  const expenseBucketValue = viewMode === 'Daily'
    ? selectedCalendarDayTotal
    : viewMode === 'Monthly'
      ? stats.expenseMonthly
      : yearlyLoggedTotal;
  const expenseBucketSubtitle = viewMode === 'Daily'
    ? 'Total from the selected calendar day'
    : viewMode === 'Monthly'
      ? 'Total from your one-time expenses'
      : `Total from expenses and synced bills from Jan to Dec ${selectedYear}`;

  const expenseRows = useMemo(() => {
    return calendarDays.flatMap(day => day.entries.map(entry => {
      const expense = entry.source === 'Expense' ? expenses.find(item => item.id === entry.id) : undefined;
      const subscription = entry.source === 'Subscription' ? subscriptions.find(item => item.id === entry.id) : undefined;
      return {
        id: entry.id,
        name: entry.name,
        category: entry.category,
        amount: convertCurrency(entry.amount, entry.currency, baseCurrency),
        source: entry.source,
        nextDate: entry.date,
        color: entry.color,
        originalAmount: entry.amount,
        originalCurrency: entry.currency,
        linkedCardName: expense?.linkedCardName || subscription?.cardName,
      };
    })).sort((a, b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime());
  }, [calendarDays, expenses, subscriptions, baseCurrency]);

  const groupedExpenseRows = useMemo(() => {
    const monthMap = new Map<string, {
      monthKey: string;
      monthLabel: string;
      days: Array<{
        dayKey: string;
        dayLabel: string;
        total: number;
        entries: typeof expenseRows;
      }>;
    }>();

    expenseRows.forEach(row => {
      const date = new Date(row.nextDate);
      if (Number.isNaN(date.getTime())) return;

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const dayKey = `${monthKey}-${String(date.getDate()).padStart(2, '0')}`;
      const monthLabel = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      const dayLabel = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { monthKey, monthLabel, days: [] });
      }

      const monthGroup = monthMap.get(monthKey)!;
      let dayGroup = monthGroup.days.find(day => day.dayKey === dayKey);
      if (!dayGroup) {
        dayGroup = { dayKey, dayLabel, total: 0, entries: [] };
        monthGroup.days.push(dayGroup);
      }

      dayGroup.entries.push(row);
      dayGroup.total += row.amount;
    });

    return Array.from(monthMap.values())
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map(monthGroup => ({
        ...monthGroup,
        days: monthGroup.days
          .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
          .map(day => ({
            ...day,
            entries: day.entries.sort((a, b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime()),
          })),
      }));
  }, [expenseRows]);

  const currentMonthLedger = useMemo(() => {
    const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    return groupedExpenseRows.find(group => group.monthKey === monthKey) ?? null;
  }, [groupedExpenseRows, selectedYear, selectedMonth]);

  const visibleLedgerDays = useMemo(() => {
    if (!currentMonthLedger) return [];
    if (selectedDay == null) return currentMonthLedger.days;
    const selectedDayKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    return currentMonthLedger.days.filter(day => day.dayKey === selectedDayKey);
  }, [currentMonthLedger, selectedDay, selectedMonth, selectedYear]);

  const selectedDateLabel = selectedDay == null
    ? null
    : new Date(selectedYear, selectedMonth, selectedDay).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const selectedExpenseDate = selectedDay == null
    ? undefined
    : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;

  const monthLabel = new Date(selectedYear, selectedMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
  const daysInMonth = calendarDays.length;
  const goToPreviousMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(year => year - 1);
      return;
    }
    setSelectedMonth(selectedMonth - 1);
  };
  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(year => year + 1);
      return;
    }
    setSelectedMonth(selectedMonth + 1);
  };
  const calendarCells = useMemo(() => {
    const cells: Array<{ day: number | null; total?: number; entries?: typeof calendarDays[number]['entries'] }> = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null });
    calendarDays.forEach(day => cells.push({ day: day.day, total: day.total, entries: day.entries }));
    while (cells.length % 7 !== 0) cells.push({ day: null });
    return cells;
  }, [calendarDays, firstDay]);

  return (
    <div className="flex flex-col gap-6 pb-24 animate-fade-in">
      <div className="bg-gradient-to-r from-rose-500 to-orange-500 rounded-2xl p-5 text-white shadow-xl flex items-center justify-between relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-xs font-medium opacity-80 uppercase tracking-wide mb-1 flex items-center">
            <TrendingDown size={12} className="mr-1" /> {viewLabel}
          </p>
          <h2 className="text-2xl font-bold">{displayTotal.toFixed(2)} {baseCurrency}</h2>
          <p className="text-xs mt-2 opacity-80 font-medium">
            {viewLabel} {viewSpendLabel} from your logged expenses and synced subscription payments
          </p>
        </div>
        <div className="relative z-10 bg-white/10 p-3 rounded-xl backdrop-blur-sm border border-white/10">
          <CircleDollarSign size={28} />
        </div>
        <div className="absolute -right-6 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
      </div>

      <p className="text-xs text-secondary -mt-2">
        Top spend: {stats.topExpense ? `${stats.topExpense.name} - ${stats.topExpense.value.toFixed(2)} ${baseCurrency}/mo` : 'No expenses yet'}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-surface p-1 rounded-lg border border-border flex flex-wrap gap-1">
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

        <div className="flex gap-2">
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

      <BudgetPanel
        monthLabel={monthLabel}
        monthKey={budgetMonthKey}
        currency={baseCurrency}
        plan={currentBudgetPlan}
        previousPlan={previousBudgetPlan}
        spendingByCategory={spendingByCategory}
        availableCategories={availableBudgetCategories}
        onSave={onSaveBudgetPlan}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface p-4 rounded-xl shadow-sm border border-border">
          <div className="flex items-center space-x-2 text-secondary mb-2">
            <Wallet size={16} className="text-rose-500" />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">{expenseBucketLabel}</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-textMain">{expenseBucketValue.toFixed(2)}</p>
          <p className="text-[9px] sm:text-[10px] text-secondary mt-1 leading-snug">{expenseBucketSubtitle}</p>
        </div>

        <div className="bg-surface p-4 rounded-xl shadow-sm border border-border">
          <div className="flex items-center space-x-2 text-secondary mb-2">
            <ListFilter size={16} className="text-orange-500" />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Synced Bills</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-textMain">{stats.subscriptionMonthly.toFixed(2)}</p>
          <p className="text-[9px] sm:text-[10px] text-secondary mt-1 leading-snug">From subscriptions and renewal dates</p>
        </div>

        <div className="bg-surface p-4 rounded-xl shadow-sm border border-border">
          <div className="flex items-center space-x-2 text-secondary mb-2">
            <BarChart3 size={16} className="text-primary" />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Daily Avg.</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-textMain">{stats.dailyAverage.toFixed(2)}</p>
            <p className="text-[9px] sm:text-[10px] text-secondary mt-1 leading-snug">Average daily spend</p>
          </div>

        <div className="bg-surface p-4 rounded-xl shadow-sm border border-border">
          <div className="flex items-center space-x-2 text-secondary mb-2">
            <PieChartIcon size={16} className="text-indigo-500" />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Sources</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-textMain">{stats.expenseCount + stats.subscriptionCount}</p>
          <p className="text-[9px] sm:text-[10px] text-secondary mt-1 leading-snug">{stats.expenseCount} expenses, {stats.subscriptionCount} subscriptions</p>
        </div>
      </div>

      <div className="bg-surface p-6 rounded-xl shadow-sm border border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Monthly Calendar</h3>
          <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-2 py-1">
            <button onClick={goToPreviousMonth} className="p-1 hover:text-primary">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold min-w-[130px] text-center">{monthLabel}</span>
            <button onClick={goToNextMonth} className="p-1 hover:text-primary">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold text-secondary mb-2">
          {weekdayLabels.map(day => <div key={day}>{day}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, index) => {
            const isToday =
              cell.day != null &&
              selectedYear === new Date().getFullYear() &&
              selectedMonth === new Date().getMonth() &&
              cell.day === new Date().getDate();
            const hasEntries = Boolean(cell.day && cell.entries && cell.entries.length);
            const isSelected = cell.day != null && cell.day === selectedDay;

            return (
              <div
                key={`${index}-${cell.day ?? 'empty'}`}
                onClick={() => cell.day != null && setSelectedDay(current => current === cell.day ? null : cell.day)}
                onKeyDown={event => {
                  if (cell.day == null || (event.key !== 'Enter' && event.key !== ' ')) return;
                  event.preventDefault();
                  setSelectedDay(current => current === cell.day ? null : cell.day);
                }}
                role={cell.day != null ? 'button' : undefined}
                tabIndex={cell.day != null ? 0 : undefined}
                aria-pressed={cell.day != null ? isSelected : undefined}
                aria-label={cell.day != null ? `Show expenses for ${monthLabel} ${cell.day}` : undefined}
                className={`min-h-20 rounded-xl border p-2 text-left transition-all ${cell.day ? `cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50 ${hasEntries ? 'bg-background border-border shadow-sm' : 'bg-emerald-50/80 border-emerald-200/70 dark:bg-emerald-400/10 dark:border-emerald-400/20'}` : 'bg-transparent border-transparent'} ${isSelected ? 'ring-2 ring-primary border-primary shadow-md' : isToday ? 'ring-2 ring-primary/40' : ''}`}
              >
                {cell.day != null && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${hasEntries ? 'text-textMain' : 'text-emerald-700 dark:text-emerald-300'}`}>{cell.day}</span>
                      {hasEntries && <span className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    {hasEntries && (
                      <div className="mt-2">
                        <p className="text-[10px] font-bold text-textMain">{cell.total?.toFixed(2)}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {cell.entries!.slice(0, 2).map(entry => (
                            <span key={`${entry.id}-${entry.source}`} className="text-[9px] px-1.5 py-0.5 rounded-full text-white truncate max-w-full" style={{ backgroundColor: entry.color }}>
                              {entry.name}
                            </span>
                          ))}
                          {cell.entries!.length > 2 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-border text-secondary">
                              +{cell.entries!.length - 2}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 text-[10px] text-secondary">
          Showing {daysInMonth} days with {calendarDays.reduce((sum, day) => sum + day.entries.length, 0)} scheduled items
        </div>
      </div>

      <div className="order-2 bg-surface p-4 sm:p-6 rounded-xl shadow-sm border border-border">
        <h3 className="text-sm font-bold text-textMain uppercase mb-4 tracking-wide">Monthly Category Split</h3>
        <div className="h-64 w-full min-w-0">
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 560, height: 256 }}>
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
                    <Cell key={`expense-cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
              <p>No expense categories yet</p>
            </div>
          )}
        </div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {categoryData.map((entry, index) => {
            const total = categoryData.reduce((sum, item) => sum + item.value, 0) || 1;
            const percent = ((entry.value / total) * 100).toFixed(0);
            return (
              <div key={entry.name} className="flex items-center justify-between gap-3 bg-background px-3 py-2 rounded-xl border border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-xs font-medium text-secondary truncate">{entry.name}</span>
                </div>
                <span className="text-[10px] font-bold text-textMain whitespace-nowrap">{percent}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="order-1 bg-surface p-4 sm:p-6 rounded-xl shadow-sm border border-border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center space-x-2">
            <CircleDollarSign className="text-primary" size={18} />
            <div>
              <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Expense Ledger</h3>
              <p className="mt-0.5 text-[10px] text-secondary">
                {selectedDateLabel || monthLabel}
                {selectedDay != null && visibleLedgerDays[0] ? ` · ${visibleLedgerDays[0].entries.length} item${visibleLedgerDays[0].entries.length === 1 ? '' : 's'} · ${visibleLedgerDays[0].total.toFixed(2)} ${baseCurrency}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedDay != null && (
              <button onClick={() => onAddExpense(selectedExpenseDate)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-bold text-white shadow-sm shadow-primary/20 hover:bg-blue-600">
                <Plus size={13} /> Add transaction
              </button>
            )}
            {selectedDay != null && (
              <button onClick={() => setSelectedDay(null)} className="rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-[10px] font-bold text-primary hover:bg-primary hover:text-white">
                Show full month
              </button>
            )}
            <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-2 py-1">
              <button onClick={goToPreviousMonth} className="p-1 hover:text-primary">
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-bold min-w-[130px] text-center">{monthLabel}</span>
              <button onClick={goToNextMonth} className="p-1 hover:text-primary">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {visibleLedgerDays.length === 0 ? (
          <div className="text-center py-8 text-secondary">
            <p className="text-xs">{selectedDateLabel ? `No expenses recorded on ${selectedDateLabel}.` : 'No expenses yet for this month.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleLedgerDays.map(dayGroup => (
              <div key={dayGroup.dayKey} className="rounded-2xl border border-border overflow-hidden shadow-sm">
                {selectedDay == null && (
                  <div className="bg-background px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-textMain">{dayGroup.dayLabel}</p>
                      <p className="text-[10px] text-secondary">{dayGroup.entries.length} item{dayGroup.entries.length === 1 ? '' : 's'}</p>
                    </div>
                    <div className="text-xs font-bold text-textMain">
                      {dayGroup.total.toFixed(2)}
                    </div>
                  </div>
                )}
                <div className="divide-y divide-border bg-surface">
                  {dayGroup.entries.map(entry => (
                    <div key={`${entry.source}-${entry.id}-${entry.nextDate}`} className="px-4 py-3 bg-surface">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 flex items-start gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: entry.color }} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-sm font-semibold text-textMain truncate">{entry.name}</p>
                              {entry.source === 'Subscription' && (
                                <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-orange-50 text-orange-600 border border-orange-100 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800/50">
                                  Sub
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-[10px] text-secondary">
                              {entry.category}
                              {entry.originalCurrency !== baseCurrency ? ` · ${entry.originalAmount.toFixed(2)} ${entry.originalCurrency}` : ''}
                              {entry.linkedCardName ? ` · ${entry.linkedCardName}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm font-bold text-textMain whitespace-nowrap">{entry.amount.toFixed(2)}</div>
                      </div>

                      {entry.source === 'Expense' && (
                        <div className="mt-1.5 flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              const expense = expenses.find(item => item.id === entry.id);
                              if (expense) onEditExpense(expense);
                            }}
                            className="p-1.5 rounded-lg text-primary hover:bg-primary/10"
                            aria-label={`Edit ${entry.name}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => onDeleteExpense(entry.id)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10"
                            aria-label={`Delete ${entry.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="order-3 bg-surface p-4 sm:p-6 rounded-xl shadow-sm border border-border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Yearly Expense Progression</h3>
          <div className="flex items-center justify-between gap-2 bg-background border border-border rounded-lg px-2 py-1 w-full sm:w-auto">
            <button onClick={() => setSelectedYear(year => year - 1)} className="p-1 hover:text-primary"><ChevronLeft size={16} /></button>
            <span className="text-xs font-bold w-12 text-center flex-1">{selectedYear}</span>
            <button onClick={() => setSelectedYear(year => year + 1)} className="p-1 hover:text-primary"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="h-56 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 560, height: 224 }}>
            <BarChart data={yearlyExpenseData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-secondary)', fontSize: 10 }} interval={0} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-secondary)', fontSize: 10 }} width={30} />
              <Tooltip
                cursor={{ fill: 'var(--color-text-main)', opacity: 0.05 }}
                content={<ExpenseYearTooltip baseCurrency={baseCurrency} />}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ExpenseTab;
