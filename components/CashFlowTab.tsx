import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { AccountStatement, AccountStatementKind, CashAccount, CashAccountType, CashBalanceEntry, CURRENCIES } from '../types';
import { convertCurrency, getCurrencySymbol } from '../services/storageService';
import StatementsList from './StatementsList';

interface CashFlowTabProps {
  baseCurrency: string;
  accounts: CashAccount[];
  balanceEntries: CashBalanceEntry[];
  onSaveAccount: (account: CashAccount) => void;
  onDeleteAccount: (accountId: string) => void;
  onSaveBalanceEntry: (entry: CashBalanceEntry) => void;
  onDeleteBalanceEntry: (entryId: string) => void;
  statements: AccountStatement[];
  statementsEnabled: boolean;
  onUploadStatement: (file: File, params: { accountKind: AccountStatementKind; cashAccountId?: string; cardId?: string }) => void | Promise<void>;
  onDownloadStatement: (statement: AccountStatement) => void | Promise<void>;
  onDeleteStatement: (statement: AccountStatement) => void | Promise<void>;
}

const INSTITUTIONS = ['Maybank', 'CIMB', 'OCBC', 'DBS', 'UOB', 'HSBC', 'Standard Chartered', 'Trust Bank', 'GXS Bank', 'YouTrip', 'Revolut', 'Wise', 'Other'];

const ACCOUNT_TYPES: Array<{ type: CashAccountType; label: string }> = [
  { type: 'Bank', label: 'Bank Account' },
  { type: 'EWallet', label: 'E-Wallet' },
  { type: 'MultiCurrencyCard', label: 'Multi-currency Card' },
  { type: 'Cash', label: 'Cash' },
  { type: 'Other', label: 'Other' },
];

const ACCOUNT_COLORS = [
  '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#16a34a', '#10b981',
  '#14b8a6', '#06b6d4', '#0891b2', '#64748b',
];

const SELECT_CLASS = 'w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:border-primary outline-none [color-scheme:light] dark:[color-scheme:dark]';

const ACCOUNT_TYPE_ICON: Record<CashAccountType, React.ComponentType<{ size?: number; className?: string }>> = {
  Bank: Landmark,
  EWallet: Wallet,
  MultiCurrencyCard: Banknote,
  Cash: Wallet,
  Other: Banknote,
};

type RangeMode = 'Daily' | 'Monthly' | 'Yearly';

const BUCKET_COUNTS: Record<RangeMode, number> = { Daily: 30, Monthly: 12, Yearly: 6 };

const formatMonthYear = (date: Date) => date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
const formatDay = (date: Date) => date.toLocaleString('en-US', { day: 'numeric', month: 'short' });

const getWindowEnd = (range: RangeMode, offset: number) => {
  if (range === 'Daily') {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (offset * BUCKET_COUNTS.Daily));
    return date;
  }
  if (range === 'Monthly') {
    return new Date(new Date().getFullYear(), new Date().getMonth() - (offset * 12), 1);
  }
  return new Date(new Date().getFullYear() - (offset * 6), 0, 1);
};

const endOfMonth = (year: number, month: number) => new Date(year, month + 1, 0, 23, 59, 59, 999);
const endOfYear = (year: number) => new Date(year, 11, 31, 23, 59, 59, 999);
const endOfDay = (date: Date) => {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
};

const toDateInputValue = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type AccountFormState = {
  id: string | null;
  name: string;
  institution: string;
  accountType: CashAccountType;
  country: string;
  currency: string;
  color: string;
  notes: string;
};

const createEmptyAccountForm = (): AccountFormState => ({
  id: null,
  name: '',
  institution: INSTITUTIONS[0],
  accountType: 'Bank',
  country: '',
  currency: 'SGD',
  color: ACCOUNT_COLORS[0],
  notes: '',
});

type BalanceFormState = {
  accountId: string;
  balanceDate: string;
  balance: string;
  notes: string;
};

const createEmptyBalanceForm = (accountId: string): BalanceFormState => ({
  accountId,
  balanceDate: toDateInputValue(),
  balance: '',
  notes: '',
});

const formatAmount = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CashFlowTab: React.FC<CashFlowTabProps> = ({
  baseCurrency,
  accounts,
  balanceEntries,
  onSaveAccount,
  onDeleteAccount,
  onSaveBalanceEntry,
  onDeleteBalanceEntry,
  statements,
  statementsEnabled,
  onUploadStatement,
  onDownloadStatement,
  onDeleteStatement,
}) => {
  const [rangeMode, setRangeMode] = useState<RangeMode>('Monthly');
  const [windowOffset, setWindowOffset] = useState(0);
  const [expandedStatementsAccountId, setExpandedStatementsAccountId] = useState<string | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountFormState>(createEmptyAccountForm());
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [balanceForm, setBalanceForm] = useState<BalanceFormState | null>(null);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState(baseCurrency);
  const [accountTypeFilter, setAccountTypeFilter] = useState<CashAccountType | 'All'>('All');

  useEffect(() => {
    setDisplayCurrency(baseCurrency);
  }, [baseCurrency]);

  const activeAccounts = useMemo(() => accounts.filter(account => !account.isArchived), [accounts]);

  const presentAccountTypes = useMemo(
    () => ACCOUNT_TYPES.filter(option => activeAccounts.some(account => account.accountType === option.type)),
    [activeAccounts],
  );

  useEffect(() => {
    if (accountTypeFilter !== 'All' && !presentAccountTypes.some(option => option.type === accountTypeFilter)) {
      setAccountTypeFilter('All');
    }
  }, [accountTypeFilter, presentAccountTypes]);

  const visibleAccounts = useMemo(
    () => (accountTypeFilter === 'All' ? activeAccounts : activeAccounts.filter(account => account.accountType === accountTypeFilter)),
    [activeAccounts, accountTypeFilter],
  );

  const accountsById = useMemo(
    () => new Map(activeAccounts.map(account => [account.id, account])),
    [activeAccounts],
  );

  useEffect(() => {
    if (selectedAccountId && !accountsById.has(selectedAccountId)) {
      setSelectedAccountId(null);
    }
  }, [selectedAccountId, accountsById]);

  const selectedAccount = selectedAccountId ? accountsById.get(selectedAccountId) ?? null : null;

  const toggleSelectedAccount = (accountId: string) => {
    setSelectedAccountId(current => (current === accountId ? null : accountId));
  };

  const balancesByAccount = useMemo(() => {
    const map = new Map<string, CashBalanceEntry[]>();
    balanceEntries.forEach(entry => {
      const list = map.get(entry.accountId) || [];
      list.push(entry);
      map.set(entry.accountId, list);
    });
    map.forEach(list => list.sort((a, b) => new Date(a.balanceDate).getTime() - new Date(b.balanceDate).getTime()));
    return map;
  }, [balanceEntries]);

  const getAccountBalanceAsOf = (accountId: string, asOfDate: Date): number | null => {
    const list = balancesByAccount.get(accountId);
    if (!list || list.length === 0) return null;
    let result: number | null = null;
    for (const entry of list) {
      if (new Date(entry.balanceDate).getTime() <= asOfDate.getTime()) {
        result = entry.balance;
      } else {
        break;
      }
    }
    return result;
  };

  const getNetWorthAsOf = (asOfDate: Date) => activeAccounts.reduce((sum, account) => {
    const balance = getAccountBalanceAsOf(account.id, asOfDate);
    if (balance == null) return sum;
    return sum + convertCurrency(balance, account.currency, displayCurrency);
  }, 0);

  const netWorthNow = useMemo(
    () => getNetWorthAsOf(new Date()),
    [activeAccounts, balancesByAccount, displayCurrency],
  );

  const netWorthOneMonthAgo = useMemo(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return getNetWorthAsOf(date);
  }, [activeAccounts, balancesByAccount, displayCurrency]);

  const netWorthDelta = netWorthNow - netWorthOneMonthAgo;
  const netWorthDeltaPct = netWorthOneMonthAgo !== 0 ? (netWorthDelta / Math.abs(netWorthOneMonthAgo)) * 100 : null;

  const chartAccounts = selectedAccount ? [selectedAccount] : activeAccounts;

  const chartBuckets = useMemo(() => {
    const bucketCount = BUCKET_COUNTS[rangeMode];
    const windowEnd = getWindowEnd(rangeMode, windowOffset);

    return Array.from({ length: bucketCount }, (_, index) => {
      if (rangeMode === 'Daily') {
        const dayOffset = bucketCount - 1 - index;
        const bucketDate = new Date(windowEnd);
        bucketDate.setDate(windowEnd.getDate() - dayOffset);
        return {
          label: formatDay(bucketDate),
          asOfDate: endOfDay(bucketDate),
        };
      }

      if (rangeMode === 'Monthly') {
        const monthOffset = bucketCount - 1 - index;
        const bucketDate = new Date(windowEnd.getFullYear(), windowEnd.getMonth() - monthOffset, 1);
        return {
          label: formatMonthYear(bucketDate),
          asOfDate: endOfMonth(bucketDate.getFullYear(), bucketDate.getMonth()),
        };
      }

      const yearOffset = bucketCount - 1 - index;
      const bucketYear = windowEnd.getFullYear() - yearOffset;
      return {
        label: `${bucketYear}`,
        asOfDate: endOfYear(bucketYear),
      };
    });
  }, [rangeMode, windowOffset]);

  const chartData = useMemo(() => chartBuckets.map(bucket => {
    const row: Record<string, number | string> = { label: bucket.label };
    chartAccounts.forEach(account => {
      const balance = getAccountBalanceAsOf(account.id, bucket.asOfDate);
      const converted = balance == null ? 0 : convertCurrency(balance, account.currency, displayCurrency);
      row[account.id] = parseFloat(converted.toFixed(2));
    });
    return row;
  }), [chartBuckets, chartAccounts, balancesByAccount, displayCurrency]);

  const chartWindowLabel = chartData.length > 0 ? `${chartData[0].label} - ${chartData[chartData.length - 1].label}` : '';

  const earliestEntryTime = useMemo(() => {
    if (balanceEntries.length === 0) return null;
    return balanceEntries.reduce((min, entry) => {
      const time = new Date(entry.balanceDate).getTime();
      return Number.isNaN(time) ? min : Math.min(min, time);
    }, Infinity);
  }, [balanceEntries]);

  const chartWindowStart = useMemo(() => {
    const bucketCount = BUCKET_COUNTS[rangeMode];
    const windowEnd = getWindowEnd(rangeMode, windowOffset);
    if (rangeMode === 'Daily') {
      const start = new Date(windowEnd);
      start.setDate(windowEnd.getDate() - (bucketCount - 1));
      return start;
    }
    if (rangeMode === 'Monthly') {
      return new Date(windowEnd.getFullYear(), windowEnd.getMonth() - (bucketCount - 1), 1);
    }
    return new Date(windowEnd.getFullYear() - (bucketCount - 1), 0, 1);
  }, [rangeMode, windowOffset]);

  const hasOlderWindow = earliestEntryTime != null && earliestEntryTime < chartWindowStart.getTime();

  const renderChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color?: string }>; label?: string }) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((sum, item) => sum + (typeof item.value === 'number' ? item.value : 0), 0);

    return (
      <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-xl min-w-[180px]">
        <p className="text-xs font-bold text-textMain">{label}</p>
        <p className="mt-1 text-sm font-extrabold text-primary">{formatAmount(total)} {displayCurrency}</p>
        {payload.length > 1 && (
          <div className="mt-2 border-t border-border pt-2 space-y-1">
            {payload
              .filter(item => item.value > 0)
              .sort((a, b) => b.value - a.value)
              .map(item => {
                const account = accountsById.get(item.dataKey);
                return (
                  <div key={item.dataKey} className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="flex items-center gap-1.5 truncate text-textMain">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate">{account?.name ?? item.dataKey}</span>
                    </span>
                    <span className="font-semibold text-secondary shrink-0">{formatAmount(item.value)}</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    );
  };

  const openAddAccount = () => {
    setAccountForm(createEmptyAccountForm());
    setIsAccountModalOpen(true);
  };

  const openEditAccount = (account: CashAccount) => {
    setAccountForm({
      id: account.id,
      name: account.name,
      institution: account.institution,
      accountType: account.accountType,
      country: account.country,
      currency: account.currency,
      color: account.color,
      notes: account.notes || '',
    });
    setIsAccountModalOpen(true);
  };

  const saveAccountForm = () => {
    if (!accountForm.name.trim()) return;
    onSaveAccount({
      id: accountForm.id || crypto.randomUUID(),
      name: accountForm.name.trim(),
      institution: accountForm.institution,
      accountType: accountForm.accountType,
      country: accountForm.country.trim(),
      currency: accountForm.currency,
      color: accountForm.color,
      notes: accountForm.notes.trim() || undefined,
      isArchived: false,
    });
    setIsAccountModalOpen(false);
  };

  const openLogBalance = (accountId: string) => {
    setBalanceForm(createEmptyBalanceForm(accountId));
    setIsBalanceModalOpen(true);
  };

  const saveBalanceForm = () => {
    if (!balanceForm) return;
    const parsedBalance = Number(balanceForm.balance);
    if (!Number.isFinite(parsedBalance)) return;
    onSaveBalanceEntry({
      id: crypto.randomUUID(),
      accountId: balanceForm.accountId,
      balanceDate: balanceForm.balanceDate,
      balance: parsedBalance,
      notes: balanceForm.notes.trim() || undefined,
    });
    setIsBalanceModalOpen(false);
    setBalanceForm(null);
  };

  return (
    <div className="space-y-4 pb-4">
      <section className="bg-surface rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Net worth</p>
          <select
            value={displayCurrency}
            onChange={e => setDisplayCurrency(e.target.value)}
            className="bg-background border border-border rounded-lg px-2 py-1 text-[10px] font-bold text-textMain focus:border-primary outline-none [color-scheme:light] dark:[color-scheme:dark]"
            aria-label="Display currency"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="mt-1 flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-extrabold text-textMain">{formatAmount(netWorthNow)}</span>
          <span className="text-sm font-bold text-secondary">{displayCurrency}</span>
        </div>
        {netWorthOneMonthAgo !== 0 && (
          <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${netWorthDelta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {netWorthDelta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {formatAmount(Math.abs(netWorthDelta))} {displayCurrency}
            {netWorthDeltaPct != null && ` (${netWorthDeltaPct >= 0 ? '+' : ''}${netWorthDeltaPct.toFixed(1)}%)`}
            <span className="text-secondary font-normal">vs last month</span>
          </div>
        )}
        <p className="mt-2 text-[10px] text-secondary">
          Across {activeAccounts.length} account{activeAccounts.length === 1 ? '' : 's'}, converted to {displayCurrency} using the latest logged balance for each.
        </p>
      </section>

      <section className="bg-surface rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">
              {selectedAccount ? `${selectedAccount.name} Trend` : 'Portfolio Trend'}
            </h3>
            <p className="text-[10px] text-secondary mt-0.5">{chartWindowLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-background border border-border rounded-full p-1">
              {(['Daily', 'Monthly', 'Yearly'] as RangeMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => {
                    setRangeMode(mode);
                    setWindowOffset(0);
                  }}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold transition-colors ${
                    rangeMode === mode ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setWindowOffset(offset => offset + 1)}
                disabled={!hasOlderWindow}
                className="w-7 h-7 rounded-full border border-border bg-background text-secondary flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:text-textMain"
                aria-label="View older period"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setWindowOffset(offset => Math.max(offset - 1, 0))}
                disabled={windowOffset === 0}
                className="w-7 h-7 rounded-full border border-border bg-background text-secondary flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:text-textMain"
                aria-label="View newer period"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 560, height: 256 }}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-secondary)', fontSize: 10 }} interval={rangeMode === 'Daily' ? Math.ceil(BUCKET_COUNTS.Daily / 10) - 1 : 0} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-secondary)', fontSize: 10 }} width={40} />
              <Tooltip cursor={{ fill: 'var(--color-border)', opacity: 0.3 }} content={renderChartTooltip} />
              {chartAccounts.map((account, index) => (
                <Bar
                  key={account.id}
                  dataKey={account.id}
                  name={account.name}
                  stackId={selectedAccount ? undefined : 'net-worth'}
                  fill={account.color}
                  radius={selectedAccount ? [6, 6, 0, 0] : (index === chartAccounts.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0])}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {activeAccounts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {activeAccounts.map(account => (
              <button
                key={account.id}
                type="button"
                onClick={() => toggleSelectedAccount(account.id)}
                className={`flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors ${
                  selectedAccountId === account.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-secondary hover:text-textMain'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: account.color }} />
                {account.name}
              </button>
            ))}
            {selectedAccountId && (
              <button
                type="button"
                onClick={() => setSelectedAccountId(null)}
                className="text-[10px] font-semibold px-2 py-1 rounded-full border border-dashed border-border text-secondary hover:text-textMain"
              >
                Show all
              </button>
            )}
          </div>
        )}

        {balanceEntries.length === 0 && (
          <p className="mt-2 text-center text-[10px] text-secondary">Log a balance for each account to start seeing your trend.</p>
        )}
      </section>

      <section className="bg-surface rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Accounts</h3>
          <button
            onClick={openAddAccount}
            className="flex items-center gap-1.5 rounded-xl bg-primary/10 text-primary px-3 py-2 text-xs font-bold hover:bg-primary/20"
          >
            <Plus size={14} /> Add account
          </button>
        </div>

        {activeAccounts.length > 0 && presentAccountTypes.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button
              type="button"
              onClick={() => setAccountTypeFilter('All')}
              className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-full border transition-colors ${
                accountTypeFilter === 'All'
                  ? 'bg-primary text-white border-primary'
                  : 'bg-background text-secondary border-border hover:border-primary/50'
              }`}
            >
              All
            </button>
            {presentAccountTypes.map(option => {
              const TypeIcon = ACCOUNT_TYPE_ICON[option.type];
              const isActive = accountTypeFilter === option.type;
              return (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => setAccountTypeFilter(option.type)}
                  className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-full border transition-colors ${
                    isActive
                      ? 'bg-primary text-white border-primary'
                      : 'bg-background text-secondary border-border hover:border-primary/50'
                  }`}
                >
                  <TypeIcon size={12} />
                  {option.label}
                </button>
              );
            })}
          </div>
        )}

        {activeAccounts.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <Landmark size={22} className="mx-auto mb-2 text-secondary opacity-60" />
            <p className="text-xs text-secondary">Add your bank accounts, e-wallets, or multi-currency cards to track your net worth.</p>
          </div>
        ) : visibleAccounts.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <p className="text-xs text-secondary">No accounts match this filter.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleAccounts.map(account => {
              const list = balancesByAccount.get(account.id) || [];
              const latest = list[list.length - 1];
              const AccountIcon = ACCOUNT_TYPE_ICON[account.accountType];
              const isExpanded = expandedAccountId === account.id;
              const isSelected = selectedAccountId === account.id;
              const isStatementsExpanded = expandedStatementsAccountId === account.id;
              const accountStatementsList = statements.filter(statement => statement.accountKind === 'Cash' && statement.cashAccountId === account.id);
              return (
                <div
                  key={account.id}
                  className={`rounded-xl border overflow-hidden transition-colors ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-border bg-background'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSelectedAccount(account.id)}
                    className="w-full p-3 flex items-center gap-3 text-left"
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? 'Hide' : 'Show'} ${account.name} trend on the chart`}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: account.color }}
                    >
                      <AccountIcon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-semibold text-textMain truncate">{account.name}</p>
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-secondary bg-surface border border-border px-1.5 py-0.5 rounded-full">
                          {account.currency}
                        </span>
                      </div>
                      <p className="text-[10px] text-secondary truncate">
                        {account.institution}
                        {account.country ? ` · ${account.country}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {latest ? (
                        <>
                          <p className="text-sm font-bold text-textMain">
                            {getCurrencySymbol(account.currency)}{formatAmount(latest.balance)}
                          </p>
                          {account.currency !== displayCurrency && (
                            <p className="text-[10px] text-secondary">
                              ≈ {formatAmount(convertCurrency(latest.balance, account.currency, displayCurrency))} {displayCurrency}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[10px] text-secondary italic">No balance logged</p>
                      )}
                    </div>
                  </button>
                  <div className="px-3 pb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setExpandedAccountId(isExpanded ? null : account.id)}
                        className="text-[10px] font-bold text-secondary hover:text-textMain"
                      >
                        {isExpanded ? 'Hide history' : `History (${list.length})`}
                      </button>
                      <button
                        onClick={() => setExpandedStatementsAccountId(isStatementsExpanded ? null : account.id)}
                        className="text-[10px] font-bold text-secondary hover:text-textMain"
                      >
                        {isStatementsExpanded ? 'Hide statements' : `Statements (${accountStatementsList.length})`}
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openLogBalance(account.id)}
                        className="text-[10px] font-bold text-primary px-2 py-1 rounded-lg hover:bg-primary/10"
                      >
                        Log balance
                      </button>
                      <button
                        onClick={() => openEditAccount(account)}
                        className="p-1.5 rounded-lg text-secondary hover:bg-surface hover:text-primary"
                        aria-label={`Edit ${account.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${account.name}? This also removes its logged balance history.`)) {
                            onDeleteAccount(account.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-secondary hover:bg-red-500/10 hover:text-red-500"
                        aria-label={`Delete ${account.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border bg-surface px-3 py-2 space-y-1.5 max-h-48 overflow-y-auto">
                      {list.length === 0 ? (
                        <p className="text-[10px] text-secondary text-center py-3">No history yet.</p>
                      ) : (
                        list.slice().reverse().map(entry => (
                          <div key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-secondary">{entry.balanceDate.split('T')[0]}</span>
                            <span className="font-semibold text-textMain">{getCurrencySymbol(account.currency)}{formatAmount(entry.balance)}</span>
                            <button
                              onClick={() => onDeleteBalanceEntry(entry.id)}
                              className="text-secondary hover:text-red-500"
                              aria-label="Delete balance entry"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {isStatementsExpanded && (
                    <div className="border-t border-border bg-background px-3 py-3">
                      <StatementsList
                        statements={accountStatementsList}
                        accountKind="Cash"
                        accountId={account.id}
                        enabled={statementsEnabled}
                        onUpload={onUploadStatement}
                        onDownload={onDownloadStatement}
                        onDelete={onDeleteStatement}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isAccountModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={() => setIsAccountModalOpen(false)}>
          <div
            className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-border my-4 sm:my-8 max-h-[95vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex justify-between items-center bg-background shrink-0">
              <h3 className="text-base font-bold text-textMain">{accountForm.id ? 'Edit Account' : 'Add Account'}</h3>
              <button onClick={() => setIsAccountModalOpen(false)} className="text-secondary hover:text-textMain p-1 -mr-1" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Account name</label>
                <input
                  autoFocus
                  type="text"
                  value={accountForm.name}
                  onChange={e => setAccountForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Maybank Savings"
                  className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:border-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Institution</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {INSTITUTIONS.map(institution => (
                    <button
                      key={institution}
                      type="button"
                      onClick={() => setAccountForm(prev => ({ ...prev, institution }))}
                      className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors ${
                        accountForm.institution === institution
                          ? 'bg-primary text-white border-primary'
                          : 'bg-background text-secondary border-border hover:border-primary/50'
                      }`}
                    >
                      {institution}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Type</label>
                  <select
                    value={accountForm.accountType}
                    onChange={e => setAccountForm(prev => ({ ...prev, accountType: e.target.value as CashAccountType }))}
                    className={SELECT_CLASS}
                  >
                    {ACCOUNT_TYPES.map(option => (
                      <option key={option.type} value={option.type}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Currency</label>
                  <select
                    value={accountForm.currency}
                    onChange={e => setAccountForm(prev => ({ ...prev, currency: e.target.value }))}
                    className={SELECT_CLASS}
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Country</label>
                <input
                  type="text"
                  value={accountForm.country}
                  onChange={e => setAccountForm(prev => ({ ...prev, country: e.target.value }))}
                  placeholder="e.g. Malaysia"
                  className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:border-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Color</label>
                <div className="flex flex-wrap gap-2">
                  {ACCOUNT_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAccountForm(prev => ({ ...prev, color }))}
                      className={`w-7 h-7 rounded-full transition-transform ${accountForm.color === color ? 'scale-110 ring-2 ring-primary' : 'opacity-70'}`}
                      style={{ backgroundColor: color }}
                      aria-label={`Choose color ${color}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Notes</label>
                <input
                  type="text"
                  value={accountForm.notes}
                  onChange={e => setAccountForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional"
                  className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:border-primary outline-none"
                />
              </div>

              {accountForm.id && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Remove this account? This also removes its logged balance history.')) {
                      onDeleteAccount(accountForm.id!);
                      setIsAccountModalOpen(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 text-red-500 text-xs font-bold py-2"
                >
                  <Trash2 size={14} /> Delete account
                </button>
              )}

              <button
                onClick={saveAccountForm}
                disabled={!accountForm.name.trim()}
                className="w-full rounded-xl bg-primary text-white font-bold py-3 text-sm shadow-lg disabled:opacity-40"
              >
                {accountForm.id ? 'Save changes' : 'Add account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isBalanceModalOpen && balanceForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={() => setIsBalanceModalOpen(false)}>
          <div
            className="bg-surface w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-border my-4 sm:my-8 max-h-[95vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex justify-between items-center bg-background shrink-0">
              <h3 className="text-base font-bold text-textMain">Log Balance</h3>
              <button onClick={() => setIsBalanceModalOpen(false)} className="text-secondary hover:text-textMain p-1 -mr-1" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Account</label>
                <select
                  value={balanceForm.accountId}
                  onChange={e => setBalanceForm(prev => (prev ? { ...prev, accountId: e.target.value } : prev))}
                  className={SELECT_CLASS}
                >
                  {activeAccounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Date</label>
                <input
                  type="date"
                  value={balanceForm.balanceDate}
                  onChange={e => setBalanceForm(prev => (prev ? { ...prev, balanceDate: e.target.value } : prev))}
                  className="w-full h-12 min-w-0 bg-background border border-border rounded-xl px-3 text-sm text-textMain focus:border-primary outline-none [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Balance</label>
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  value={balanceForm.balance}
                  onChange={e => setBalanceForm(prev => (prev ? { ...prev, balance: e.target.value } : prev))}
                  placeholder="0.00"
                  className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:border-primary outline-none no-spinner"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Notes</label>
                <input
                  type="text"
                  value={balanceForm.notes}
                  onChange={e => setBalanceForm(prev => (prev ? { ...prev, notes: e.target.value } : prev))}
                  placeholder="Optional"
                  className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:border-primary outline-none"
                />
              </div>

              <button
                onClick={saveBalanceForm}
                disabled={!balanceForm.balance.trim() || Number.isNaN(Number(balanceForm.balance))}
                className="w-full rounded-xl bg-primary text-white font-bold py-3 text-sm shadow-lg disabled:opacity-40"
              >
                Save balance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashFlowTab;
