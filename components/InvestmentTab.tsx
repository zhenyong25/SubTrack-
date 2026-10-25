import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  Coins,
  Eye,
  EyeOff,
  LineChart as LineChartIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Settings2,
  Spade,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { CURRENCIES } from '../types';
import type { InvestmentAccount, InvestmentAccountType, InvestmentHolding, InvestmentKind, InvestmentPositionSide, InvestmentTransaction, InvestmentTransactionType, InvestmentValuation } from '../types';
import { fetchStockIntradayHistory, type StockIntradayHistory, fetchStockQuote, isHongKongSymbol, normalizeTickerSymbol } from '../services/stockQuoteService';
import { convertCurrency, getCurrencySymbol } from '../services/storageService';
import { applyInvestmentTransaction, colorForInvestmentKind, compareValuations, getPositionMetrics, transactionTypeLabel, type PositionMetrics } from '../services/investmentService';
import InvestmentLogo from './InvestmentLogo';
import BrokerageLogo from './BrokerageLogo';
import { recordedHoldingValueAt } from '../services/portfolioHistoryService';
import TickerDetail from './TickerDetail';
import PortfolioInsights, { type InsightPosition } from './PortfolioInsights';
import PokerPanel, { type PokerPanelProps } from './PokerPanel';
import { bankrollStats } from '../services/pokerService';

type RangeMode = '1D' | '7D' | '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | '10Y' | 'MAX';
// Poker is its own dashboard (bankroll, tournaments, cash games) rather than a holdings list.
type InvestmentCategory = 'All' | InvestmentKind | 'Poker';
const isHoldingKind = (category: InvestmentCategory): category is Exclude<InvestmentKind, 'Poker (MTT)'> => category !== 'All' && category !== 'Poker';

interface InvestmentTabProps {
  baseCurrency: string;
  investments: InvestmentHolding[];
  accounts: InvestmentAccount[];
  onSaveAccount: (account: InvestmentAccount) => void;
  onDeleteAccount: (accountId: string) => void;
  valuations: InvestmentValuation[];
  transactions: InvestmentTransaction[];
  onAddTransaction: (transaction: Omit<InvestmentTransaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteTransaction: (transactionId: string) => Promise<void>;
  onCreateHolding: (holding: InvestmentHolding) => void;
  onUpdateHolding: (holding: InvestmentHolding, silent?: boolean) => void;
  onDeleteHolding: (holdingId: string) => void;
  onSaveValuation: (valuation: InvestmentValuation) => void;
  onDeleteValuation: (valuationId: string) => void;
  poker: PokerPanelProps;
}

// Cash and Other are hidden for now (not removed from the underlying InvestmentKind type,
// so any existing holding of that kind still displays fine under "All" - just not selectable
// as a filter tab or an option when adding a new holding).
const CATEGORIES: InvestmentCategory[] = ['All', 'Crypto', 'Stocks', 'Pokemon Cards', 'Poker'];
// Kinds a Yahoo Finance ticker lookup makes sense for, and where going Long vs Short is a
// meaningful distinction (Pokemon Cards aren't traded either way).
const QUOTABLE_KINDS: InvestmentKind[] = ['Stocks', 'Crypto'];
const RANGES: RangeMode[] = ['1D', '7D', '1M', '3M', '6M', '1Y', '2Y', '5Y', '10Y', 'MAX'];
const TRANSACTION_TYPES: InvestmentTransactionType[] = ['Buy', 'Sell', 'Dividend', 'Fee', 'Transfer In', 'Transfer Out', 'Split'];
type EntryMode = 'holding' | 'transaction';
// Which account's holdings are shown: every holding, the ones not tagged to any account, or one account's id.
type AccountFilter = 'all' | 'unassigned' | string;
const ACCOUNT_TYPES: InvestmentAccountType[] = ['Margin', 'Cash'];
const ACCOUNT_COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#ef4444', '#3b82f6', '#64748b'];

const rangeConfig: Record<RangeMode, { points: number; label: string }> = {
  '1D': { points: 1, label: 'Last 24 hours' },
  '7D': { points: 7, label: 'Last 7 days' },
  '1M': { points: 30, label: 'Last 1 month' },
  '3M': { points: 90, label: 'Last 3 months' },
  '6M': { points: 180, label: 'Last 6 months' },
  '1Y': { points: 365, label: 'Last 1 year' },
  '2Y': { points: 365 * 2, label: 'Last 2 years' },
  '5Y': { points: 365 * 5, label: 'Last 5 years' },
  '10Y': { points: 365 * 10, label: 'Last 10 years' },
  MAX: { points: 365 * 5, label: 'All time' },
};

const formatMoney = (value: number, currency: string) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;

const toneFor = (value: number) => (value > 0 ? 'text-emerald-500' : value < 0 ? 'text-red-500' : 'text-textMain');

// Same flat tile as the Portfolio insights panel, so the two sections read as one design.
const SnapshotStat: React.FC<{ label: string; value: string; note: string; tone?: string }> = ({ label, value, note, tone = 'text-textMain' }) => (
  <div className="rounded-2xl border border-border bg-background p-4">
    <p className="text-xs font-bold uppercase tracking-wider text-secondary">{label}</p>
    <p className={`mt-2 text-lg font-extrabold tabular-nums sm:text-xl ${tone}`}>{value}</p>
    <p className="mt-1 text-[11px] text-secondary">{note}</p>
  </div>
);

const formatRelativeSeconds = (timestampMs: number): string => {
  const seconds = Math.max(0, Math.round((Date.now() - timestampMs) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
};

const startOfWeek = (date: Date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const addMonths = (date: Date, months: number) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

const addYears = (date: Date, years: number) => {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
};

const buildSmoothPath = (points: Array<{ x: number; y: number }>) => {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const path: string[] = [`M ${points[0].x} ${points[0].y}`];

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const midX = (prev.x + current.x) / 2;
    path.push(`C ${midX} ${prev.y}, ${midX} ${current.y}, ${current.x} ${current.y}`);
  }

  return path.join(' ');
};

const InvestmentTab: React.FC<InvestmentTabProps> = ({
  baseCurrency,
  investments,
  accounts,
  onSaveAccount,
  onDeleteAccount,
  valuations,
  transactions,
  onAddTransaction,
  onDeleteTransaction,
  onCreateHolding,
  onUpdateHolding,
  onDeleteHolding,
  onSaveValuation,
  onDeleteValuation,
  poker,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<InvestmentCategory>('All');

  const valuationsByHolding = useMemo(() => {
    const map = new Map<string, InvestmentValuation[]>();
    valuations.forEach(valuation => {
      const list = map.get(valuation.investmentId) || [];
      list.push(valuation);
      map.set(valuation.investmentId, list);
    });
    map.forEach(list => list.sort(compareValuations));
    return map;
  }, [valuations]);

  // Value, cost and gain of a holding in the base currency (the % gain is currency-independent).
  const getBaseMetrics = (investment: InvestmentHolding): PositionMetrics => {
    const valuationHistory = valuationsByHolding.get(investment.id) || [];
    if (investment.kind === 'Pokemon Cards' && valuationHistory.length > 0) {
      const first = valuationHistory[0];
      const latest = valuationHistory[valuationHistory.length - 1];
      const basis = convertCurrency(
        Number(first.marketValue),
        first.currency || investment.currency || baseCurrency,
        baseCurrency,
      );
      const currentValue = convertCurrency(
        Number(latest.marketValue),
        latest.currency || investment.currency || baseCurrency,
        baseCurrency,
      );
      const gain = currentValue - basis;

      return {
        basis,
        currentValue,
        gain,
        gainPct: basis > 0 ? (gain / basis) * 100 : 0,
      };
    }

    const metrics = getPositionMetrics(investment);
    const fromCurrency = investment.currency || baseCurrency;
    return {
      basis: convertCurrency(metrics.basis, fromCurrency, baseCurrency),
      currentValue: convertCurrency(metrics.currentValue, fromCurrency, baseCurrency),
      gain: convertCurrency(metrics.gain, fromCurrency, baseCurrency),
      gainPct: metrics.gainPct,
    };
  };
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [rangeMode, setRangeMode] = useState<RangeMode>('1M');
  const [chartZoom, setChartZoom] = useState(1);
  const [portfolioHidden, setPortfolioHidden] = useState(false);
  const [marketHistory, setMarketHistory] = useState<Record<string, StockIntradayHistory>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFailures, setHistoryFailures] = useState(0);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [valuationTarget, setValuationTarget] = useState<InvestmentHolding | null>(null);
  const [valuationDate, setValuationDate] = useState(new Date().toISOString().split('T')[0]);
  const [valuationPrice, setValuationPrice] = useState('');
  const [valuationNotes, setValuationNotes] = useState('');
  const [expandedValuationHoldingId, setExpandedValuationHoldingId] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<EntryMode>(investments.length === 0 ? 'holding' : 'transaction');
  const [entryInvestmentId, setEntryInvestmentId] = useState('');
  const [entryType, setEntryType] = useState<InvestmentTransactionType>('Buy');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryUnits, setEntryUnits] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [entryFees, setEntryFees] = useState('0');
  const [entryNotes, setEntryNotes] = useState('');
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [newHoldingName, setNewHoldingName] = useState('');
  const [newHoldingKind, setNewHoldingKind] = useState<InvestmentKind>('Stocks');
  const [newHoldingCurrency, setNewHoldingCurrency] = useState(baseCurrency);
  const [newHoldingSymbol, setNewHoldingSymbol] = useState('');
  const [newHoldingUnits, setNewHoldingUnits] = useState('');
  const [newHoldingAverageCost, setNewHoldingAverageCost] = useState('');
  const [newHoldingCurrentPrice, setNewHoldingCurrentPrice] = useState('');
  const [newHoldingNotes, setNewHoldingNotes] = useState('');
  const [newHoldingSource, setNewHoldingSource] = useState('');
  const [newHoldingPositionSide, setNewHoldingPositionSide] = useState<InvestmentPositionSide>('Long');
  const [newHoldingAccountId, setNewHoldingAccountId] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<AccountFilter>('all');
  const [isAccountManagerOpen, setIsAccountManagerOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountBroker, setAccountBroker] = useState('');
  const [accountType, setAccountType] = useState<InvestmentAccountType>('Margin');
  const [accountCurrency, setAccountCurrency] = useState('USD');
  const [accountColor, setAccountColor] = useState(ACCOUNT_COLORS[0]);
  const [accountNotes, setAccountNotes] = useState('');
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [quoteNote, setQuoteNote] = useState('');
  const [refreshingHoldingId, setRefreshingHoldingId] = useState<string | null>(null);
  const [priceRefreshedAt, setPriceRefreshedAt] = useState<number | null>(null);
  const [, forceRelativeTimeTick] = useState(0);
  const [tickerDetailHoldingId, setTickerDetailHoldingId] = useState<string | null>(null);

  // Purely cosmetic: forces a re-render every second so the "Xs ago" badge counts up smoothly
  // between polling cycles instead of appearing frozen at "0s ago" until the next refresh.
  React.useEffect(() => {
    if (priceRefreshedAt === null) return;
    const intervalId = setInterval(() => forceRelativeTimeTick(tick => tick + 1), 1000);
    return () => clearInterval(intervalId);
  }, [priceRefreshedAt]);
  const [editingHoldingId, setEditingHoldingId] = useState<string | null>(null);

  React.useEffect(() => {
    if (!investments.length) {
      setEntryInvestmentId('');
      return;
    }
    if (!entryInvestmentId || !investments.some(investment => investment.id === entryInvestmentId)) {
      setEntryInvestmentId(investments[0].id);
    }
  }, [investments, entryInvestmentId]);

  React.useEffect(() => {
    const selectedInvestment = investments.find(investment => investment.id === entryInvestmentId);
    if (selectedInvestment) {
      setEntryPrice(selectedInvestment.currentPrice ? selectedInvestment.currentPrice.toFixed(2) : '');
    }
  }, [entryInvestmentId, investments]);

  // Always reads the latest holdings inside the poll loop below without needing to restart
  // the interval every time a price updates `investments` (which would happen on every
  // single tick otherwise, since the effect would see a "changed" dependency each time).
  const investmentsRef = React.useRef(investments);
  React.useEffect(() => {
    investmentsRef.current = investments;
  }, [investments]);

  // Polls Stocks/Crypto prices every POLL_INTERVAL_MS while this tab is open and the browser
  // tab is actually visible (paused via the Page Visibility API otherwise, and resumed with an
  // immediate refresh on refocus, rather than left running in a background tab indefinitely).
  // There's no free push/streaming feed for this, so "live" here means frequent polling of the
  // same REST endpoint the manual refresh uses - refreshed one holding at a time rather than in
  // parallel, since concurrent calls to onUpdateHolding could otherwise race (see its own
  // comment in App.tsx for why that matters).
  React.useEffect(() => {
    const POLL_INTERVAL_MS = 20 * 1000;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let isRefreshing = false;

    const runRefreshCycle = async () => {
      if (isRefreshing || document.visibilityState !== 'visible') return;
      const quotable = investmentsRef.current.filter(
        (investment): investment is InvestmentHolding & { symbol: string } =>
          QUOTABLE_KINDS.includes(investment.kind) && Boolean(investment.symbol),
      );
      if (quotable.length === 0) return;

      isRefreshing = true;
      for (const holding of quotable) {
        if (cancelled) break;
        try {
          const quote = await fetchStockQuote(holding.symbol);
          if (!cancelled) {
            const quoteCurrency = quote.currency && CURRENCIES.includes(quote.currency) ? quote.currency : holding.currency;
            onUpdateHolding({ ...holding, currentPrice: quote.price, currency: quoteCurrency }, true);
          }
        } catch {
          // Best-effort background refresh - one bad symbol shouldn't stop the rest.
        }
      }
      isRefreshing = false;
      if (!cancelled) setPriceRefreshedAt(Date.now());
    };

    const scheduleNext = () => {
      timeoutId = setTimeout(() => {
        runRefreshCycle().finally(() => {
          if (!cancelled) scheduleNext();
        });
      }, POLL_INTERVAL_MS);
    };

    runRefreshCycle().finally(() => {
      if (!cancelled) scheduleNext();
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') runRefreshCycle();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // Deliberately runs once per mount and reads holdings via investmentsRef instead of
    // reacting to `investments` directly - see the ref effect just above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasQuotableHoldings = useMemo(
    () => investments.some(investment => QUOTABLE_KINDS.includes(investment.kind) && Boolean(investment.symbol)),
    [investments],
  );

  const accountsById = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts]);

  // A holding tagged to an account that no longer exists counts as unassigned.
  const holdingAccount = (investment: InvestmentHolding) =>
    investment.accountId ? accountsById.get(investment.accountId) : undefined;

  // Falls back to "all" if the selected account was just deleted.
  React.useEffect(() => {
    if (selectedAccount !== 'all' && selectedAccount !== 'unassigned' && !accountsById.has(selectedAccount)) {
      setSelectedAccount('all');
    }
  }, [selectedAccount, accountsById]);

  const accountInvestments = useMemo(() => {
    if (selectedAccount === 'all') return investments;
    if (selectedAccount === 'unassigned') return investments.filter(investment => !holdingAccount(investment));
    return investments.filter(investment => investment.accountId === selectedAccount);
  }, [investments, selectedAccount, accountsById]);

  const hasUnassignedHoldings = accounts.length > 0 && investments.some(investment => !holdingAccount(investment));
  const selectedAccountLabel = selectedAccount === 'all'
    ? (accounts.length > 0 ? 'All accounts' : 'Main')
    : selectedAccount === 'unassigned'
      ? 'Unassigned'
      : accountsById.get(selectedAccount)?.name || 'Main';

  const selectedInvestments = useMemo(() => {
    if (selectedCategory === 'All') return accountInvestments;
    return accountInvestments.filter(investment => investment.kind === selectedCategory);
  }, [accountInvestments, selectedCategory]);

  const selectedIntradayKey = selectedInvestments
    .filter(investment => QUOTABLE_KINDS.includes(investment.kind) && investment.symbol)
    .map(investment => [investment.id, investment.symbol, investment.units, investment.averageCost, investment.currency, investment.positionSide || 'Long'].join(':'))
    .sort()
    .join('|');

  React.useEffect(() => {
    setHoveredPoint(null);
    setChartZoom(1);
  }, [rangeMode, selectedIntradayKey]);

  React.useEffect(() => {
    const controller = new AbortController();
    const holdings = selectedInvestments.filter(item => QUOTABLE_KINDS.includes(item.kind) && item.symbol);
    const range = rangeMode === '1D' ? '1d' : ['MAX', '2Y', '5Y', '10Y'].includes(rangeMode) ? 'max' : ['6M', '1Y'].includes(rangeMode) ? '1y' : rangeMode === '3M' ? '3mo' : '1mo';
    setMarketHistory({}); setHistoryFailures(0); setHistoryLoading(holdings.length > 0);
    Promise.allSettled(holdings.map(async holding => ({ id: holding.id,
      data: await fetchStockIntradayHistory(holding.symbol!, rangeMode === '1D' ? '5m' : '1d', controller.signal, range),
    }))).then(results => {
      if (controller.signal.aborted) return;
      const next: Record<string, StockIntradayHistory> = {};
      let failures = 0;
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.data.candles.length) next[result.value.id] = result.value.data;
        else failures++;
      });
      setMarketHistory(next); setHistoryFailures(failures); setHistoryLoading(false);
    });
    return () => controller.abort();
  }, [rangeMode, selectedIntradayKey]);

  // The visible kinds (Cash/Other are hidden for now), plus whichever kind the holding
  // currently being edited already has - so editing an older Cash/Other holding doesn't
  // silently force it into one of the four visible kinds just to save any other change.
  const holdingKindOptions = useMemo(() => {
    const visibleKinds = CATEGORIES.filter((category): category is InvestmentKind => category !== 'All');
    const editingKind = editingHoldingId ? investments.find(holding => holding.id === editingHoldingId)?.kind : undefined;
    return editingKind && !visibleKinds.includes(editingKind) ? [...visibleKinds, editingKind] : visibleKinds;
  }, [editingHoldingId, investments]);

  const portfolioValue = useMemo(() => {
    return selectedInvestments.reduce((sum, investment) => sum + getBaseMetrics(investment).currentValue, 0);
  }, [selectedInvestments, baseCurrency, valuationsByHolding]);



  const costBasis = useMemo(() => {
    return selectedInvestments.reduce((sum, investment) => sum + getBaseMetrics(investment).basis, 0);
  }, [selectedInvestments, baseCurrency, valuationsByHolding]);

  const insightPositions = useMemo<InsightPosition[]>(
    () => selectedInvestments.map(holding => {
      const { currentValue, basis } = getBaseMetrics(holding);
      return { holding, value: currentValue, basis };
    }),
    [selectedInvestments, baseCurrency, valuationsByHolding],
  );

  const gainValue = portfolioValue - costBasis;
  const gainPct = costBasis > 0 ? (gainValue / costBasis) * 100 : 0;

  const bestPerformer = useMemo(() => {
    return selectedInvestments
      .map(investment => {
        const { currentValue, basis, gain, gainPct: gainPctAsset } = getBaseMetrics(investment);
        return { ...investment, currentValue, basis, gain, gainPctAsset };
      })
      .sort((a, b) => b.gainPctAsset - a.gainPctAsset)[0] ?? null;
  }, [selectedInvestments, baseCurrency, valuationsByHolding]);

  const topHolding = useMemo(() => {
    return selectedInvestments
      .map(investment => ({
        ...investment,
        currentValue: getBaseMetrics(investment).currentValue,
      }))
      .sort((a, b) => b.currentValue - a.currentValue)[0] ?? null;
  }, [selectedInvestments, baseCurrency, valuationsByHolding]);

  const selectedInvestmentIds = useMemo(() => new Set(selectedInvestments.map(investment => investment.id)), [selectedInvestments]);

  const selectedTransactions = useMemo(
    () => transactions
      .filter(transaction => selectedInvestmentIds.has(transaction.investmentId))
      .slice()
      .sort((a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()),
    [transactions, selectedInvestmentIds]
  );

  const investmentsById = useMemo(() => new Map(investments.map(investment => [investment.id, investment])), [investments]);
  const tickerDetailInvestment = tickerDetailHoldingId ? investmentsById.get(tickerDetailHoldingId) || null : null;

  // Realized profit/loss (in the base currency) per holding, from the trades stored with each transaction.
  const realizedByHolding = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach(transaction => {
      if (transaction.realizedPnl == null) return;
      const value = convertCurrency(transaction.realizedPnl, transaction.currency || baseCurrency, baseCurrency);
      map.set(transaction.investmentId, (map.get(transaction.investmentId) || 0) + value);
    });
    return map;
  }, [transactions, baseCurrency]);

  const realizedStats = useMemo(() => {
    let realized = 0;
    let closedTrades = 0;
    let wins = 0;
    selectedTransactions.forEach(transaction => {
      if (transaction.realizedPnl == null) return;
      const value = convertCurrency(transaction.realizedPnl, transaction.currency || baseCurrency, baseCurrency);
      realized += value;
      // Sells (longs) and buy-backs (shorts) are the trades that close a position; dividends and fees aren't.
      if (transaction.transactionType === 'Sell' || transaction.transactionType === 'Buy') {
        closedTrades += 1;
        if (value > 0) wins += 1;
      }
    });
    return { realized, closedTrades, wins };
  }, [selectedTransactions, baseCurrency]);

  const handleAddEntry = (event: React.FormEvent) => {
    event.preventDefault();
    const target = investments.find(investment => investment.id === entryInvestmentId);
    const units = Number(entryUnits);
    const price = Number(entryPrice);
    const fees = Number(entryFees) || 0;

    if (!target || !Number.isFinite(units) || units <= 0 || !Number.isFinite(price) || price < 0) {
      return;
    }

    // Can't close (sell, or buy back a short) more than the position holds.
    const closing = target.positionSide === 'Short' ? entryType === 'Buy' : entryType === 'Sell' || entryType === 'Transfer Out';
    if (closing && units > target.units) return;

    onAddTransaction({
      investmentId: target.id,
      transactionType: entryType,
      tradeDate: entryDate,
      units,
      price,
      fees,
      currency: target.currency || baseCurrency,
      notes: entryNotes.trim() || undefined,
      source: target.source || target.symbol || target.name,
      externalId: undefined,
    });

    setEntryUnits('');
    setEntryFees('0');
    setEntryNotes('');
    if (entryType === 'Buy') {
      setEntryPrice(target.currentPrice ? target.currentPrice.toFixed(2) : '');
    }
    setIsEntryModalOpen(false);
  };

  const resetHoldingForm = () => {
    setEditingHoldingId(null);
    setNewHoldingName('');
    setNewHoldingKind('Stocks');
    setNewHoldingCurrency(baseCurrency);
    setNewHoldingSymbol('');
    setNewHoldingUnits('');
    setNewHoldingAverageCost('');
    setNewHoldingCurrentPrice('');
    setNewHoldingNotes('');
    setNewHoldingSource('');
    setNewHoldingPositionSide('Long');
    // New holdings default to the account being viewed.
    setNewHoldingAccountId(selectedAccount !== 'all' && selectedAccount !== 'unassigned' ? selectedAccount : '');
    setQuoteError('');
    setQuoteNote('');
  };

  const startEditHolding = (holding: InvestmentHolding) => {
    setEditingHoldingId(holding.id);
    setNewHoldingName(holding.name);
    setNewHoldingKind(holding.kind);
    setNewHoldingCurrency(holding.currency || baseCurrency);
    setNewHoldingSymbol(holding.symbol || '');
    setNewHoldingUnits(String(holding.units));
    setNewHoldingAverageCost(String(holding.averageCost));
    setNewHoldingCurrentPrice(String(holding.currentPrice));
    setNewHoldingNotes(holding.notes || '');
    setNewHoldingSource(holding.source || '');
    setNewHoldingPositionSide(holding.positionSide === 'Short' ? 'Short' : 'Long');
    setNewHoldingAccountId(holding.accountId && accountsById.has(holding.accountId) ? holding.accountId : '');
    setEntryMode('holding');
    setIsEntryModalOpen(true);
  };

  const handleFetchQuote = async () => {
    if (!newHoldingSymbol.trim()) {
      setQuoteError('Enter a symbol first.');
      return;
    }
    // Show the symbol the way it's looked up and stored (e.g. "700" becomes "0700.HK").
    const symbol = normalizeTickerSymbol(newHoldingSymbol);
    setNewHoldingSymbol(symbol);

    setIsFetchingQuote(true);
    setQuoteError('');
    setQuoteNote('');
    try {
      const quote = await fetchStockQuote(symbol);
      setNewHoldingCurrentPrice(String(quote.price));
      if (quote.name && !newHoldingName.trim()) setNewHoldingName(quote.name);
      if (quote.currency && CURRENCIES.includes(quote.currency)) {
        setNewHoldingCurrency(quote.currency);
        setQuoteNote(`${quote.name ? `${quote.name} - ` : ''}priced in ${quote.currency}. Enter your average cost in ${quote.currency} too.`);
      } else if (quote.currency) {
        setQuoteNote(`Quoted in ${quote.currency}${quote.name ? ` (${quote.name})` : ''} - pick the matching currency yourself.`);
      } else if (quote.name) {
        setQuoteNote(quote.name);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Price lookup failed.';
      setQuoteError(isHongKongSymbol(symbol) ? `${message} Check the HKEX stock code.` : message);
    } finally {
      setIsFetchingQuote(false);
    }
  };

  // Currency to store after a refresh: the quote's, when it's one we support (the price is in that
  // currency, so the label has to match); otherwise whatever the holding already had.
  const currencyAfterQuote = (holding: InvestmentHolding, quoteCurrency: string | null) =>
    quoteCurrency && CURRENCIES.includes(quoteCurrency) ? quoteCurrency : holding.currency;

  const openLogValue = (holding: InvestmentHolding) => {
    setValuationTarget(holding);
    setValuationDate(new Date().toISOString().split('T')[0]);
    setValuationPrice(String(holding.currentPrice));
    setValuationNotes('');
  };

  const handleSubmitValuation = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valuationTarget) return;
    const price = Number(valuationPrice);
    if (!valuationDate || valuationPrice.trim() === '' || !Number.isFinite(price) || price < 0) return;

    const existing = valuationsByHolding.get(valuationTarget.id) || [];
    onSaveValuation({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      investmentId: valuationTarget.id,
      valuationDate,
      price,
      marketValue: valuationTarget.units * price,
      currency: valuationTarget.currency || baseCurrency,
      notes: valuationNotes.trim() || undefined,
    });

    // The card should show the latest logged value, so only move the current price when this
    // entry is the newest one (back-filling an older date shouldn't overwrite today's price).
    const isNewest = existing.every(item => item.valuationDate.split('T')[0] <= valuationDate);
    if (isNewest) onUpdateHolding({ ...valuationTarget, currentPrice: price }, true);

    setValuationTarget(null);
  };

  const handleRefreshHoldingPrice = async (holding: InvestmentHolding) => {
    if (!holding.symbol) return;
    setRefreshingHoldingId(holding.id);
    try {
      const quote = await fetchStockQuote(holding.symbol);
      onUpdateHolding({ ...holding, currentPrice: quote.price, currency: currencyAfterQuote(holding, quote.currency) });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Price lookup failed.');
    } finally {
      setRefreshingHoldingId(null);
    }
  };

  const handleSubmitHolding = (event: React.FormEvent) => {
    event.preventDefault();

    const name = newHoldingName.trim();
    // Only stock symbols get the HK rewrite - crypto pairs like BTC-USD pass through unchanged anyway.
    const symbol = newHoldingKind === 'Stocks' && newHoldingSymbol.trim()
      ? normalizeTickerSymbol(newHoldingSymbol)
      : newHoldingSymbol.trim();
    const accountId = newHoldingAccountId || undefined;
    const notes = newHoldingNotes.trim();
    const source = newHoldingSource.trim();
    const units = Number(newHoldingUnits);
    const averageCost = Number(newHoldingAverageCost);
    const currentPrice = Number(newHoldingCurrentPrice);

    if (!name || !Number.isFinite(units) || units < 0 || !Number.isFinite(averageCost) || averageCost < 0 || !Number.isFinite(currentPrice) || currentPrice < 0) {
      return;
    }

    const editingHolding = editingHoldingId ? investments.find(holding => holding.id === editingHoldingId) : undefined;

    if (editingHolding) {
      onUpdateHolding({
        ...editingHolding,
        name,
        kind: newHoldingKind,
        symbol: symbol || undefined,
        units,
        averageCost,
        currentPrice,
        color: colorForInvestmentKind(newHoldingKind),
        notes: notes || undefined,
        source: source || undefined,
        positionSide: newHoldingPositionSide,
        accountId,
        currency: newHoldingCurrency,
      });
    } else {
      onCreateHolding({
        id: crypto.randomUUID(),
        name,
        kind: newHoldingKind,
        symbol: symbol || undefined,
        units,
        averageCost,
        currentPrice,
        currency: newHoldingCurrency,
        color: colorForInvestmentKind(newHoldingKind),
        notes: notes || undefined,
        acquiredDate: new Date().toISOString().split('T')[0],
        source: source || undefined,
        positionSide: newHoldingPositionSide,
        accountId,
        isActive: true,
      });
    }

    resetHoldingForm();
    setIsEntryModalOpen(false);
  };

  const resetAccountForm = () => {
    setEditingAccountId(null);
    setAccountName('');
    setAccountBroker('');
    setAccountType('Margin');
    setAccountCurrency('USD');
    setAccountColor(ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length]);
    setAccountNotes('');
  };

  const openAccountManager = () => {
    resetAccountForm();
    setIsAccountManagerOpen(true);
  };

  const startEditAccount = (account: InvestmentAccount) => {
    setEditingAccountId(account.id);
    setAccountName(account.name);
    setAccountBroker(account.broker || '');
    setAccountType(account.accountType);
    setAccountCurrency(account.currency);
    setAccountColor(account.color);
    setAccountNotes(account.notes || '');
  };

  const handleSubmitAccount = (event: React.FormEvent) => {
    event.preventDefault();
    const name = accountName.trim();
    if (!name) return;
    const existing = editingAccountId ? accountsById.get(editingAccountId) : undefined;
    onSaveAccount({
      ...existing,
      id: existing?.id || crypto.randomUUID(),
      name,
      broker: accountBroker.trim() || undefined,
      accountType,
      currency: accountCurrency,
      color: accountColor,
      notes: accountNotes.trim() || undefined,
    });
    resetAccountForm();
    // `accounts` doesn't include the one just added until the next render, so step the color here.
    if (!existing) setAccountColor(ACCOUNT_COLORS[(accounts.length + 1) % ACCOUNT_COLORS.length]);
  };

  const isPoker = selectedCategory === 'Poker';
  const pokerAccent = colorForInvestmentKind('Poker (MTT)');
  const pokerBankroll = useMemo(() => bankrollStats(poker.bankroll, poker.tournaments, poker.sessions), [poker.bankroll, poker.tournaments, poker.sessions]);

  const categorySummary = useMemo(() => {
    return CATEGORIES.filter(isHoldingKind).map(category => {
      const items = accountInvestments.filter(investment => investment.kind === category);
      const basis = items.reduce((sum, investment) => sum + getBaseMetrics(investment).basis, 0);
      const value = items.reduce((sum, investment) => sum + getBaseMetrics(investment).currentValue, 0);
      const gain = value - basis;
      return {
        category,
        count: items.length,
        value,
        gain,
        gainPct: basis > 0 ? (gain / basis) * 100 : 0,
      };
    });
  }, [accountInvestments, baseCurrency, valuationsByHolding]);

  const chartData = useMemo(() => {
    const now = new Date();
    const selectedIds = new Set(selectedInvestments.map(item => item.id));
    const records = valuations.filter(item => selectedIds.has(item.investmentId) && new Date(item.valuationDate).getTime() <= now.getTime()).slice().sort(compareValuations);
    const requestedStart = rangeMode === 'MAX'
      ? new Date(records[0]?.valuationDate || now)
      : rangeMode.endsWith('Y') ? addYears(now, -Number.parseInt(rangeMode))
      : new Date(now.getTime() - rangeConfig[rangeMode].points * 86400000);
    const start = requestedStart.getTime();
    const end = now.getTime();
    const count = Math.min(366, Math.max(2, Math.ceil((end - start) / 86400000) + 1));
    const grid = Array.from({ length: count }, (_, index) => start + (end - start) * index / (count - 1));
    const marketTimes = Object.values<StockIntradayHistory>(marketHistory).flatMap(item => item.candles.map(candle => candle.timestamp));
    // Preserve record boundaries and every market close, including zero before the first record.
    const events = [...records.map(item => new Date(item.valuationDate).getTime()), ...marketTimes].filter(time => time >= start && time <= end);
    const timestamps = [...new Set([...grid, ...events])].sort((a, b) => a - b);
    const history = timestamps.map(timestamp => {
      let total = 0;
      for (const holding of selectedInvestments) {
        const result = recordedHoldingValueAt(holding, records.filter(item => item.investmentId === holding.id), marketHistory[holding.id], timestamp);
        total += convertCurrency(result.value, result.currency || baseCurrency, baseCurrency);
      }
      return {
        timestamp,
        name: new Date(timestamp).toLocaleString(undefined, rangeMode === '1D'
          ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
          : { month: 'short', day: 'numeric', year: 'numeric' }),
        total,
      };
    });
    return { label: rangeConfig[rangeMode].label, history, hasRecords: records.length > 0 };
  }, [rangeMode, selectedInvestments, valuations, baseCurrency, marketHistory]);

  const svgChart = useMemo(() => {
    const width = 760;
    const height = 280;
    const padding = { top: 18, right: 18, bottom: 28, left: 48 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const values = chartData.history.map(point => point.total);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const pad = Math.max((high - low) * 0.15, Math.abs(high) * 0.001, 0.01);
    const minValue = low - pad;
    const maxValue = high + pad;
    const range = maxValue - minValue;

    const points = chartData.history.map((point, index) => {
      const x = padding.left + (chartData.history.length === 1 ? plotWidth / 2 : ((point.timestamp - chartData.history[0].timestamp) / Math.max(1, chartData.history.at(-1)!.timestamp - chartData.history[0].timestamp)) * plotWidth);
      const normalized = (point.total - minValue) / range;
      const y = padding.top + (1 - normalized) * plotHeight;
      return { x, y, value: point.total, name: point.name };
    });

    const linePath = buildSmoothPath(points);
    const areaPath = `${linePath} L ${points.at(-1)?.x ?? padding.left} ${height - padding.bottom} L ${points[0]?.x ?? padding.left} ${height - padding.bottom} Z`;

    return {
      width,
      height,
      padding,
      points,
      linePath,
      areaPath,
      minValue,
      maxValue,
    };
  }, [chartData.history]);

  const selectedSummary = selectedCategory === 'All'
    ? {
        title: 'All Categories',
        description: 'Combined view of your full portfolio.',
      }
    : {
        title: selectedCategory,
        description: `${selectedInvestments.length} holding${selectedInvestments.length === 1 ? '' : 's'} in this category.`,
      };

  const totalValuations = valuations.filter(valuation => selectedCategory === 'All' || investments.find(item => item.id === valuation.investmentId)?.kind === selectedCategory).length;

  const entryHolding = investments.find(investment => investment.id === entryInvestmentId);
  const isShortEntry = entryHolding?.positionSide === 'Short';
  const entryUnitsNumber = Number(entryUnits);
  const entryPriceNumber = Number(entryPrice);
  const entryFeesNumber = Number(entryFees) || 0;
  const entryClosesPosition = Boolean(entryHolding) && (isShortEntry
    ? entryType === 'Buy'
    : entryType === 'Sell' || entryType === 'Transfer Out');
  const entryExceedsPosition = Boolean(entryHolding) && entryClosesPosition
    && Number.isFinite(entryUnitsNumber) && entryUnitsNumber > (entryHolding?.units ?? 0);
  const entryPreview = entryHolding && Number.isFinite(entryUnitsNumber) && entryUnitsNumber > 0
    && Number.isFinite(entryPriceNumber) && entryPriceNumber >= 0 && !entryExceedsPosition
    ? applyInvestmentTransaction(entryHolding, {
        transactionType: entryType,
        units: entryUnitsNumber,
        price: entryPriceNumber,
        fees: entryFeesNumber,
        tradeDate: entryDate,
      })
    : null;

  return (
    <div className="desktop-layout investment-layout pb-24 animate-fade-in space-y-6">
      {tickerDetailInvestment && (
        <TickerDetail
          investment={tickerDetailInvestment}
          metrics={getBaseMetrics(tickerDetailInvestment)}
          baseCurrency={baseCurrency}
          priceRefreshedAt={priceRefreshedAt}
          isRefreshing={refreshingHoldingId === tickerDetailInvestment.id}
          onClose={() => setTickerDetailHoldingId(null)}
          onRefresh={() => handleRefreshHoldingPrice(tickerDetailInvestment)}
        />
      )}
      {isAccountManagerOpen && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 overflow-y-auto" onClick={() => setIsAccountManagerOpen(false)}>
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-surface border border-border shadow-2xl overflow-hidden animate-fade-in sm:my-8 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-background shrink-0">
              <div>
                <h3 className="text-base font-bold text-textMain">Investment Accounts</h3>
                <p className="text-xs text-secondary mt-0.5">Broker, margin and cash accounts your holdings are held in.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAccountManagerOpen(false)}
                className="rounded-full p-2 text-secondary hover:text-textMain hover:bg-border/30 shrink-0"
                aria-label="Close accounts"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
              {accounts.length > 0 && (
                <div className="space-y-2">
                  {accounts.map(account => {
                    const held = investments.filter(investment => investment.accountId === account.id);
                    const value = held.reduce((sum, investment) => sum + getBaseMetrics(investment).currentValue, 0);
                    return (
                      <div
                        key={account.id}
                        className={`flex items-center justify-between gap-3 rounded-2xl border bg-background p-3 ${editingAccountId === account.id ? 'border-primary' : 'border-border'}`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: account.color }} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-textMain">
                              {account.name}
                              <span className="ml-2 text-[10px] font-bold text-secondary">{account.accountType}</span>
                            </p>
                            <p className="truncate text-[11px] text-secondary">
                              {[account.broker, account.currency, `${held.length} holding${held.length === 1 ? '' : 's'}`, formatMoney(value, baseCurrency)].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <button type="button" onClick={() => startEditAccount(account)} className="text-primary text-xs font-bold flex items-center gap-1">
                            <Pencil size={12} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => { if (editingAccountId === account.id) resetAccountForm(); onDeleteAccount(account.id); }}
                            className="text-rose-500 text-xs font-bold flex items-center gap-1"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <form onSubmit={handleSubmitAccount} className="space-y-3 rounded-2xl border border-border bg-background p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-secondary">{editingAccountId ? 'Edit account' : 'New account'}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Name</label>
                    <input
                      type="text"
                      value={accountName}
                      onChange={e => setAccountName(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                      placeholder="e.g. IBKR Margin"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Broker</label>
                    <input
                      type="text"
                      value={accountBroker}
                      onChange={e => setAccountBroker(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                      placeholder="e.g. Interactive Brokers"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Type</label>
                    <div className="flex rounded-xl border border-border bg-background p-1">
                      {ACCOUNT_TYPES.map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setAccountType(type)}
                          className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${accountType === type ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Currency</label>
                    <select
                      value={accountCurrency}
                      onChange={e => setAccountCurrency(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary [color-scheme:light] dark:[color-scheme:dark]"
                    >
                      {(CURRENCIES.includes(accountCurrency) ? CURRENCIES : [accountCurrency, ...CURRENCIES]).map(code => (
                        <option key={code} value={code}>{getCurrencySymbol(code)} {code}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {ACCOUNT_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setAccountColor(color)}
                        className={`h-7 w-7 rounded-full border-2 ${accountColor === color ? 'border-textMain' : 'border-transparent'}`}
                        style={{ backgroundColor: color }}
                        aria-label={`Use color ${color}`}
                        aria-pressed={accountColor === color}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Notes</label>
                  <input
                    type="text"
                    value={accountNotes}
                    onChange={e => setAccountNotes(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                    placeholder="Optional, e.g. account number ending 1234"
                  />
                </div>
                <div className="flex gap-2">
                  {editingAccountId && (
                    <button type="button" onClick={resetAccountForm} className="flex-1 rounded-xl border border-border py-3 text-sm font-bold text-secondary hover:text-textMain">
                      Cancel
                    </button>
                  )}
                  <button type="submit" disabled={!accountName.trim()} className="flex-1 rounded-xl bg-primary text-white font-bold py-3 text-sm shadow-sm hover:opacity-90 disabled:opacity-40">
                    {editingAccountId ? 'Save Account' : 'Add Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      <div className="investment-controls bg-surface rounded-2xl border border-border p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Select a Category</h3>
            <p className="text-xs text-secondary mt-1">Choose a portfolio to view and add entries.</p>
          </div>
          <div className={`${isPoker ? 'hidden' : 'hidden sm:flex'} items-center gap-2 text-secondary text-xs`}>
            <ChevronDown size={14} />
            {chartData.label}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(category => {
            const count = category === 'All'
              ? accountInvestments.length
              : category === 'Poker'
                ? poker.tournaments.length + poker.sessions.length
                : accountInvestments.filter(investment => investment.kind === category).length;

            return (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                aria-pressed={selectedCategory === category}
                className={`px-3 py-2 rounded-full border text-xs font-bold transition-colors ${selectedCategory === category ? 'bg-primary text-white border-primary shadow-sm' : 'bg-background text-secondary border-border hover:text-textMain hover:border-primary/40'}`}
              >
                {category}
                <span className="ml-1 opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {!isPoker && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-secondary">Account</p>
            <button
              type="button"
              onClick={openAccountManager}
              className="flex items-center gap-1 text-xs font-bold text-primary hover:opacity-80"
            >
              {accounts.length > 0 ? <Settings2 size={12} /> : <Plus size={12} />}
              {accounts.length > 0 ? 'Manage accounts' : 'Add a broker / margin account'}
            </button>
          </div>
          {accounts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'All', color: undefined as string | undefined, count: investments.length },
                ...accounts.map(account => ({
                  id: account.id,
                  label: account.name,
                  color: account.color,
                  count: investments.filter(investment => investment.accountId === account.id).length,
                })),
                ...(hasUnassignedHoldings
                  ? [{ id: 'unassigned', label: 'Unassigned', color: undefined, count: investments.filter(investment => !holdingAccount(investment)).length }]
                  : []),
              ].map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedAccount(option.id)}
                  aria-pressed={selectedAccount === option.id}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-bold transition-colors ${selectedAccount === option.id ? 'bg-primary text-white border-primary shadow-sm' : 'bg-background text-secondary border-border hover:text-textMain hover:border-primary/40'}`}
                >
                  {accountsById.get(option.id) && <BrokerageLogo account={accountsById.get(option.id)!} className="h-6 w-6" />}
                  {option.label}
                  <span className="opacity-70">({option.count})</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-secondary">Create accounts (e.g. "IBKR Margin", "Futu Cash") to tag holdings and see each account's value separately.</p>
          )}
        </div>
        )}
      </div>


      {isPoker && <PokerPanel {...poker} baseCurrency={baseCurrency} />}

      {!isPoker && (<>
      <div className="investment-chart rounded-[1.5rem] p-5 shadow-2xl border overflow-hidden relative bg-slate-50 text-slate-950 border-slate-200 dark:bg-[#111111] dark:text-white dark:border-white/10">
        <div className="absolute inset-0 opacity-60 pointer-events-none bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.08),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(34,211,238,0.06),_transparent_30%)] dark:bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.12),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(34,211,238,0.08),_transparent_30%)]" />
        <div className="absolute -right-6 -top-8 w-32 h-32 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-slate-600 text-sm font-bold dark:text-white/65">
                <BrokerageLogo account={accountsById.get(selectedAccount)} className="h-9 w-9" />
                <span className="text-slate-700 dark:text-white/70">Portfolio</span>
                <span className="text-cyan-600 dark:text-cyan-400">{selectedAccountLabel}</span>
                {selectedAccount !== 'all' && selectedAccount !== 'unassigned' && accountsById.get(selectedAccount) && (
                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-600 dark:text-cyan-300">
                    {accountsById.get(selectedAccount)!.accountType}
                  </span>
                )}
                {hasQuotableHoldings && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"
                    title="Stock/crypto prices refresh automatically every 20s while this tab is open and visible"
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    Live{priceRefreshedAt ? ` · ${formatRelativeSeconds(priceRefreshedAt)}` : ''}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-none">{portfolioHidden ? '****' : formatMoney(portfolioValue, baseCurrency)}</h2>
                <p className="text-sm sm:text-base text-slate-600 font-medium dark:text-white/65">{portfolioHidden ? 'Balance hidden' : 'Total across selected holdings'}</p>
              </div>
              <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold border ${gainValue >= 0 ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-300'}`}>
                <span>{portfolioHidden ? '****' : `${gainValue >= 0 ? '+' : ''}${formatMoney(gainValue, baseCurrency)}`}</span>
                <span className="opacity-90">{portfolioHidden ? '****' : `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}% vs. what you paid`}</span>
              </div>
            </div>
            <button type="button" onClick={() => setPortfolioHidden(value => !value)} aria-pressed={portfolioHidden} className="shrink-0 mt-1 text-slate-500 hover:text-cyan-600 transition-colors dark:text-white/55 dark:hover:text-cyan-300" aria-label="Toggle portfolio visibility">
              {portfolioHidden ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {RANGES.map(range => (
                <button
                  key={range}
                  onClick={() => setRangeMode(range)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-colors ${rangeMode === range ? 'bg-emerald-200 text-emerald-950 border-emerald-300 shadow-sm dark:bg-emerald-400/20 dark:text-emerald-200 dark:border-emerald-400/30' : 'bg-slate-200 text-slate-700 border-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:text-white/70 dark:border-white/10 dark:hover:bg-white/15'}`}
                >
                  {range}
                </button>
              ))}
            </div>

          </div>

          <div className="rounded-[1.25rem] border border-slate-200 bg-white/90 p-4 shadow-inner shadow-black/5 dark:border-white/10 dark:bg-white/[0.025] dark:shadow-black/20">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold dark:text-white/45">
                Portfolio value history
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-600 dark:text-white/60">
                <LineChartIcon size={14} />
                {chartData.label}
                <div className="ml-1 flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-white/10 dark:bg-white/[0.05]" aria-label="Chart zoom controls">
                  <button
                    type="button"
                    onClick={() => setChartZoom(current => Math.max(1, current - 0.5))}
                    disabled={chartZoom <= 1}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-black text-slate-600 hover:bg-white disabled:opacity-30 dark:text-white/65 dark:hover:bg-white/10"
                    aria-label="Zoom out chart"
                  >
                    &minus;
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartZoom(1)}
                    className="min-w-10 px-1 text-[10px] font-black text-slate-600 dark:text-white/65"
                    aria-label="Reset chart zoom"
                  >
                    {chartZoom.toFixed(chartZoom % 1 === 0 ? 0 : 1)}&times;
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartZoom(current => Math.min(4, current + 0.5))}
                    disabled={chartZoom >= 4}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-black text-slate-600 hover:bg-white disabled:opacity-30 dark:text-white/65 dark:hover:bg-white/10"
                    aria-label="Zoom in chart"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <p className="mb-3 text-xs text-slate-600 dark:text-white/55">{selectedSummary.description}</p>
            <div className={`relative h-[260px] sm:h-[300px] w-full overflow-x-auto overscroll-x-contain rounded-xl ${portfolioHidden ? 'invisible' : ''}`} role="region" aria-label="Scrollable investment chart">
              <svg
                viewBox={`0 0 ${svgChart.width} ${svgChart.height}`}
                preserveAspectRatio="none"
                onPointerLeave={() => setHoveredPoint(null)}
                onPointerMove={event => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const x = (event.clientX - bounds.left) / bounds.width * svgChart.width;
                  const index = svgChart.points.reduce((nearest, point, index, points) => Math.abs(point.x - x) < Math.abs(points[nearest].x - x) ? index : nearest, 0);
                  setHoveredPoint(Math.max(0, Math.min(svgChart.points.length - 1, index)));
                }}
                className="h-full max-w-none overflow-visible transition-[width] duration-200"
                style={{ width: `${chartZoom * 100}%`, minWidth: '100%' }}
              >
                <defs>
                  <linearGradient id="investmentSvgFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.03" />
                  </linearGradient>
                  <linearGradient id="investmentSvgLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#0ea5e9" />
                  </linearGradient>
                </defs>

                {Array.from({ length: 5 }).map((_, index) => {
                  const y = 18 + (index * (280 - 46)) / 4;
                  return <line key={index} x1="48" x2="742" y1={y} y2={y} stroke="rgba(100,116,139,0.10)" strokeDasharray="4 6" className="dark:stroke-[rgba(255,255,255,0.06)]" />;
                })}

                <>

                    {svgChart.points.map((point, index) => {
                      const showLabel = index === 0 || index === svgChart.points.length - 1 || index === Math.floor(svgChart.points.length / 2);
                      return (
                        <g key={`${point.name}-${index}`}>
                          <title>{point.name}: {formatMoney(point.value, baseCurrency)}</title>
                          {showLabel && (
                            <text x={point.x} y={svgChart.height - 8} textAnchor="middle" fill="rgba(71,85,105,0.85)" fontSize="10" className="dark:fill-[rgba(255,255,255,0.45)]">
                              {point.name}
                            </text>
                          )}
                        </g>
                      );
                    })}
                    {hoveredPoint !== null && svgChart.points[hoveredPoint] && (
                      <g>
                        <line x1={svgChart.points[hoveredPoint].x} x2={svgChart.points[hoveredPoint].x} y1="18" y2="252" stroke="#22d3ee" strokeDasharray="4 4" opacity="0.5" />
                        <circle cx={svgChart.points[hoveredPoint].x} cy={svgChart.points[hoveredPoint].y} r="5" fill="#22d3ee" />
                      </g>
                    )}
                    <path d={svgChart.areaPath} fill="url(#investmentSvgFill)" />
                    <path d={svgChart.linePath} fill="none" stroke="url(#investmentSvgLine)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx={svgChart.points.at(-1)?.x ?? 48} cy={svgChart.points.at(-1)?.y ?? 18} r="7" fill="#22d3ee" opacity="0.16" />
                    <circle cx={svgChart.points.at(-1)?.x ?? 48} cy={svgChart.points.at(-1)?.y ?? 18} r="4" fill="#22d3ee" />
                </>

                <text x="8" y="22" fill="rgba(71,85,105,0.72)" fontSize="10" className="dark:fill-[rgba(255,255,255,0.42)]">
                  {formatMoney(svgChart.maxValue, baseCurrency)}
                </text>
                <text x="8" y="266" fill="rgba(71,85,105,0.72)" fontSize="10" className="dark:fill-[rgba(255,255,255,0.42)]">
                  {formatMoney(svgChart.minValue, baseCurrency)}
                </text>
              </svg>
            </div>
            {!portfolioHidden && chartData.hasRecords && (
              <p className="mt-2 text-sm font-semibold text-cyan-600 dark:text-cyan-300" aria-live="polite">
                {hoveredPoint !== null && svgChart.points[hoveredPoint]
                  ? svgChart.points[hoveredPoint].name + ' | ' + formatMoney(svgChart.points[hoveredPoint].value, baseCurrency)
                  : 'Period change: ' + formatMoney((chartData.history.at(-1)?.total ?? 0) - (chartData.history[0]?.total ?? 0), baseCurrency)}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-white/50">
              <p>
                {historyLoading ? 'Loading market price history...' : chartData.hasRecords ? 'Zero before the first record. Market prices track movement between recorded values; current FX rates apply.' + (historyFailures ? ` ${historyFailures} holding(s) unavailable; recorded values carried forward.` : '') : 'No recorded valuations yet. Portfolio history is zero until your first record.'}
              </p>
              <p>{selectedInvestments.length} holdings</p>
              {chartZoom > 1 && <p className="w-full sm:w-auto">Swipe sideways to inspect the enlarged chart.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="investment-recent bg-surface rounded-2xl border border-border p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Recent Entries</h3>
            <p className="text-xs text-secondary mt-1">Newest transaction logs for the selected portfolio slice.</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-secondary">Entries</p>
            <p className="text-sm font-bold text-textMain">{selectedTransactions.length}</p>
          </div>
        </div>

        {deleteError && <p role="alert" className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500">{deleteError}</p>}
        {selectedTransactions.length === 0 ? (
          <div className="text-center py-8 text-secondary">
            <p className="text-sm font-medium">No transaction logs yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedTransactions.slice(0, 8).map(transaction => (
              <div key={transaction.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${transaction.transactionType === 'Buy' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : transaction.transactionType === 'Sell' ? 'bg-red-500/10 text-red-600 border-red-500/20' : 'bg-slate-500/10 text-slate-600 border-slate-500/20'}`}>
                      {transactionTypeLabel(transaction.transactionType, investmentsById.get(transaction.investmentId)?.positionSide === 'Short')}
                    </span>
                    <p className="text-sm font-semibold text-textMain truncate">
                      {new Date(transaction.tradeDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-secondary truncate">
                    {transaction.units} units at {transaction.price.toFixed(2)} {transaction.currency}
                    {transaction.fees ? ` · fees ${transaction.fees.toFixed(2)}` : ''}
                    {transaction.notes ? ` · ${transaction.notes}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  {transaction.realizedPnl != null && transaction.realizedPnl !== 0 && (
                    <p className={`text-sm font-bold ${transaction.realizedPnl > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {transaction.realizedPnl > 0 ? '+' : ''}{transaction.realizedPnl.toFixed(2)} <span className="text-[10px] font-semibold">realized</span>
                    </p>
                  )}
                  <p className="text-sm font-bold text-textMain">{transaction.currency}</p>
                  <p className="text-[10px] text-secondary">{transaction.source || 'Manual entry'}</p>
                </div>
                <button
                  type="button"
                  disabled={deletingTransactionId != null}
                  onClick={async () => {
                    if (deletingTransactionId != null) return;
                    setDeleteError('');
                    setDeletingTransactionId(transaction.id);
                    try {
                      await onDeleteTransaction(transaction.id);
                    } catch (error) {
                      setDeleteError(error instanceof Error ? error.message : 'Could not delete this entry. Please try again.');
                    } finally {
                      setDeletingTransactionId(null);
                    }
                  }}
                  aria-label={`Delete ${transaction.transactionType} entry for ${transaction.source || 'investment'} on ${transaction.tradeDate}`}
                  title="Delete entry"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-40"
                >
                  {deletingTransactionId === transaction.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-24 right-5 z-40">
        <button
          type="button"
          onClick={() => {
            resetHoldingForm();
            setEntryMode(investments.length === 0 ? 'holding' : 'transaction');
            setIsEntryModalOpen(true);
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-2xl shadow-primary/30 border border-white/10 transition-transform hover:scale-105 active:scale-95"
          aria-label="Add investment item"
        >
          <Plus size={24} />
        </button>
      </div>
      </>)}


      {valuationTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={() => setValuationTarget(null)}>
          <div
            className="bg-surface w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-border my-4 sm:my-8"
            onClick={event => event.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex justify-between items-center bg-background">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-textMain">Log value</h3>
                <p className="text-[10px] text-secondary truncate">{valuationTarget.name} - {valuationTarget.units} unit{valuationTarget.units === 1 ? '' : 's'}</p>
              </div>
              <button type="button" onClick={() => setValuationTarget(null)} className="text-secondary hover:text-textMain p-1 -mr-1" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitValuation} className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Date</label>
                <input
                  type="date"
                  value={valuationDate}
                  onChange={e => setValuationDate(e.target.value)}
                  className="w-full h-12 min-w-0 bg-background border border-border rounded-xl px-3 text-sm text-textMain focus:border-primary outline-none [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">
                  {valuationTarget.units === 1 ? 'Value' : 'Price per unit'} ({valuationTarget.currency})
                </label>
                <input
                  autoFocus
                  type="number"
                  step="0.0001"
                  min="0"
                  value={valuationPrice}
                  onChange={e => setValuationPrice(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:border-primary outline-none no-spinner"
                  placeholder="0.00"
                />
                {valuationTarget.units !== 1 && Number.isFinite(Number(valuationPrice)) && valuationPrice.trim() !== '' && (
                  <p className="mt-1 text-[10px] text-secondary">
                    Total value: {formatMoney(valuationTarget.units * Number(valuationPrice), valuationTarget.currency)}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Notes</label>
                <input
                  type="text"
                  value={valuationNotes}
                  onChange={e => setValuationNotes(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:border-primary outline-none"
                  placeholder="Optional"
                />
              </div>
              <button
                type="submit"
                disabled={valuationPrice.trim() === '' || !Number.isFinite(Number(valuationPrice)) || Number(valuationPrice) < 0 || !valuationDate}
                className="w-full rounded-xl bg-primary text-white font-bold py-3 text-sm shadow-lg disabled:opacity-40"
              >
                Save value
              </button>
            </form>
          </div>
        </div>
      )}

      {isEntryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 overflow-y-auto" onClick={() => { resetHoldingForm(); setIsEntryModalOpen(false); }}>
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-surface border border-border shadow-2xl overflow-hidden animate-fade-in sm:my-8 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-background shrink-0">
              <div>
                <h3 className="text-base font-bold text-textMain">
                  {entryMode === 'holding' ? (editingHoldingId ? 'Edit Holding' : 'Add Holding') : 'Log Entry'}
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  {entryMode === 'holding'
                    ? editingHoldingId
                      ? 'Update this holding\'s details.'
                      : 'Create a stock, crypto, or card holding.'
                    : 'Store a buy, sell, dividend, or fee.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { resetHoldingForm(); setIsEntryModalOpen(false); }}
                className="rounded-full p-2 text-secondary hover:text-textMain hover:bg-border/30 shrink-0"
                aria-label="Close log entry modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pt-4 shrink-0">
              <div className="flex rounded-2xl border border-border bg-background p-1">
                <button
                  type="button"
                  onClick={() => setEntryMode('holding')}
                  className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-all ${entryMode === 'holding' ? 'bg-primary text-white shadow-lg shadow-blue-500/25' : 'text-secondary hover:text-textMain'}`}
                >
                  Add Holding
                </button>
                <button
                  type="button"
                  onClick={() => investments.length > 0 && setEntryMode('transaction')}
                  disabled={investments.length === 0}
                  className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-all ${entryMode === 'transaction' ? 'bg-primary text-white shadow-lg shadow-blue-500/25' : 'text-secondary hover:text-textMain'} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Log Transaction
                </button>
              </div>
              {investments.length === 0 && (
                <p className="mt-2 text-xs text-secondary">You need to create your first holding before logging stock transactions.</p>
              )}
            </div>

            {entryMode === 'holding' ? (
              <form onSubmit={handleSubmitHolding} className="p-5 space-y-3 flex-1 min-h-0 overflow-y-auto">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Name</label>
                  <input
                    type="text"
                    value={newHoldingName}
                    onChange={e => setNewHoldingName(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                    placeholder="e.g. Apple Inc."
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Category</label>
                    <select
                      value={newHoldingKind}
                      onChange={e => setNewHoldingKind(e.target.value as InvestmentKind)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                    >
                      {holdingKindOptions.map(category => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Symbol</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newHoldingSymbol}
                        onChange={e => setNewHoldingSymbol(e.target.value)}
                        onBlur={() => {
                          if (newHoldingKind === 'Stocks' && newHoldingSymbol.trim()) setNewHoldingSymbol(normalizeTickerSymbol(newHoldingSymbol));
                        }}
                        className="w-full min-w-0 bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                        placeholder={newHoldingKind === 'Crypto' ? 'BTC-USD' : 'AAPL or 0700'}
                      />
                      {QUOTABLE_KINDS.includes(newHoldingKind) && (
                        <button
                          type="button"
                          onClick={handleFetchQuote}
                          disabled={isFetchingQuote || !newHoldingSymbol.trim()}
                          title="Fetch current price from Yahoo Finance"
                          className="shrink-0 rounded-xl border border-border bg-background px-3 text-secondary hover:text-primary hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isFetchingQuote ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {QUOTABLE_KINDS.includes(newHoldingKind) && (quoteError || quoteNote) ? (
                  <p className={`text-[11px] ${quoteError ? 'text-rose-500' : 'text-secondary'}`}>
                    {quoteError || quoteNote}
                  </p>
                ) : newHoldingKind === 'Stocks' && (
                  <p className="text-[11px] text-secondary">
                    US: ticker (AAPL). Hong Kong: stock code (700, 00700 or 0700.HK). Tap refresh to fetch the price and name.
                  </p>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary">Account</label>
                    <button
                      type="button"
                      onClick={openAccountManager}
                      className="text-[10px] font-bold text-primary hover:opacity-80"
                    >
                      {accounts.length > 0 ? 'Manage' : '+ New account'}
                    </button>
                  </div>
                  <select
                    value={newHoldingAccountId}
                    onChange={e => setNewHoldingAccountId(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary [color-scheme:light] dark:[color-scheme:dark]"
                  >
                    <option value="">No account</option>
                    {accounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.accountType}{account.broker ? ` (${account.broker})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {QUOTABLE_KINDS.includes(newHoldingKind) && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Position</label>
                    <div className="flex rounded-xl border border-border bg-background p-1">
                      <button
                        type="button"
                        onClick={() => setNewHoldingPositionSide('Long')}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all ${newHoldingPositionSide === 'Long' ? 'bg-emerald-500 text-white' : 'text-secondary hover:text-textMain'}`}
                      >
                        <TrendingUp size={13} /> Long
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewHoldingPositionSide('Short')}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all ${newHoldingPositionSide === 'Short' ? 'bg-rose-500 text-white' : 'text-secondary hover:text-textMain'}`}
                      >
                        <TrendingDown size={13} /> Short
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-secondary">Short means you profit when the price falls.</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Units</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={newHoldingUnits}
                      onChange={e => setNewHoldingUnits(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Avg Cost</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={newHoldingAverageCost}
                      onChange={e => setNewHoldingAverageCost(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Current Price</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={newHoldingCurrentPrice}
                      onChange={e => setNewHoldingCurrentPrice(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Source</label>
                    <input
                      type="text"
                      value={newHoldingSource}
                      onChange={e => setNewHoldingSource(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                      placeholder="Broker / exchange"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Currency</label>
                    <select
                      value={newHoldingCurrency}
                      onChange={e => setNewHoldingCurrency(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary [color-scheme:light] dark:[color-scheme:dark]"
                    >
                      {(CURRENCIES.includes(newHoldingCurrency) ? CURRENCIES : [newHoldingCurrency, ...CURRENCIES]).map(code => (
                        <option key={code} value={code}>{getCurrencySymbol(code)} {code}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Notes</label>
                  <input
                    type="text"
                    value={newHoldingNotes}
                    onChange={e => setNewHoldingNotes(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                    placeholder="Optional notes"
                  />
                </div>

                <button type="submit" className="w-full rounded-xl bg-primary text-white font-bold py-3 shadow-sm hover:opacity-90 transition-opacity">
                  {editingHoldingId ? 'Save Changes' : 'Create Holding'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleAddEntry} className="p-5 space-y-3 flex-1 min-h-0 overflow-y-auto">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Investment</label>
                  <select
                    value={entryInvestmentId}
                    onChange={e => setEntryInvestmentId(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                  >
                    {investments.map(investment => (
                      <option key={investment.id} value={investment.id}>
                        {investment.name} ({investment.symbol || investment.kind}){holdingAccount(investment) ? ` · ${holdingAccount(investment)!.name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Type</label>
                    <select
                      value={entryType}
                      onChange={e => setEntryType(e.target.value as InvestmentTransactionType)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                    >
                      {TRANSACTION_TYPES.map(type => (
                        <option key={type} value={type}>{transactionTypeLabel(type, isShortEntry)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Date</label>
                    <input
                      type="date"
                      value={entryDate}
                      onChange={e => setEntryDate(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Units</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={entryUnits}
                      onChange={e => setEntryUnits(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Price</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={entryPrice}
                      onChange={e => setEntryPrice(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Fees</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={entryFees}
                      onChange={e => setEntryFees(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Notes</label>
                  <input
                    type="text"
                    value={entryNotes}
                    onChange={e => setEntryNotes(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                    placeholder="Optional notes"
                  />
                </div>

                {isShortEntry && (
                  <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-500">
                    Short position: <strong>Short sell</strong> opens or adds to it, <strong>Buy back</strong> closes it. You profit when you buy back below your average sale price.
                  </p>
                )}
                {entryHolding && entryExceedsPosition && (
                  <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500">
                    You only hold {entryHolding.units} unit{entryHolding.units === 1 ? '' : 's'} of {entryHolding.name} - you can't {isShortEntry ? 'buy back' : 'sell'} {entryUnitsNumber}.
                  </p>
                )}
                {entryHolding && entryPreview && (
                  <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-secondary space-y-0.5">
                    {entryPreview.realizedPnl !== undefined && (
                      <p className={`text-sm font-bold ${entryPreview.realizedPnl > 0 ? 'text-emerald-500' : entryPreview.realizedPnl < 0 ? 'text-red-500' : 'text-textMain'}`}>
                        Realized {entryPreview.realizedPnl > 0 ? '+' : ''}{formatMoney(entryPreview.realizedPnl, entryHolding.currency)}
                      </p>
                    )}
                    <p>
                      After this: {entryPreview.holding.units} unit{entryPreview.holding.units === 1 ? '' : 's'}
                      {entryPreview.holding.units > 0 ? ` at avg ${entryPreview.holding.averageCost.toFixed(2)} ${entryHolding.currency}` : ' (position closed)'}
                    </p>
                  </div>
                )}

                <button type="submit" disabled={entryExceedsPosition} className="w-full rounded-xl bg-primary text-white font-bold py-3 shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
                  Save Transaction
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <section className="investment-categories bg-surface rounded-2xl border border-border p-4 shadow-sm" aria-labelledby="portfolio-categories-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Browse portfolios</p>
            <h3 id="portfolio-categories-heading" className="mt-1 text-lg font-extrabold text-textMain">Asset categories</h3>
          </div>
          <p className="hidden text-xs text-secondary sm:block">Select a category to focus the dashboard</p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categorySummary.map(summary => {
            const isSelected = selectedCategory === summary.category;
            const accent = colorForInvestmentKind(summary.category);
            const CategoryIcon = summary.category === 'Crypto'
              ? Coins
              : summary.category === 'Stocks'
                ? TrendingUp
                : Shield;

            return (
              <button
                key={summary.category}
                type="button"
                onClick={() => setSelectedCategory(summary.category)}
                aria-pressed={isSelected}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  isSelected ? 'border-primary bg-background ring-1 ring-primary' : 'border-border bg-background hover:border-secondary'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ color: accent, backgroundColor: `${accent}1f` }}>
                      <CategoryIcon size={15} />
                    </span>
                    <span className="truncate text-xs font-bold uppercase tracking-wide text-textMain">{summary.category}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-secondary">{summary.count} holding{summary.count === 1 ? '' : 's'}</span>
                </div>
                <p className="mt-3 text-lg font-extrabold tabular-nums text-textMain sm:text-xl">{formatMoney(summary.value, baseCurrency)}</p>
                <p className={`mt-1 text-[11px] font-semibold ${summary.gain > 0 ? 'text-emerald-500' : summary.gain < 0 ? 'text-red-500' : 'text-secondary'}`}>
                  {summary.gain > 0 ? '+' : ''}{summary.gainPct.toFixed(1)}% {summary.category === 'Pokemon Cards' ? 'change' : 'gain'}
                </p>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSelectedCategory('Poker')}
            aria-pressed={isPoker}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              isPoker ? 'border-primary bg-background ring-1 ring-primary' : 'border-border bg-background hover:border-secondary'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ color: pokerAccent, backgroundColor: `${pokerAccent}1f` }}>
                  <Spade size={15} />
                </span>
                <span className="truncate text-xs font-bold uppercase tracking-wide text-textMain">Poker</span>
              </span>
              <span className="shrink-0 text-[11px] text-secondary">{poker.tournaments.length} MTT · {poker.sessions.length} cash</span>
            </div>
            <p className="mt-3 text-lg font-extrabold tabular-nums text-textMain sm:text-xl">{formatMoney(pokerBankroll.bankroll, 'USD')}</p>
            <p className={`mt-1 text-[11px] font-semibold ${toneFor(pokerBankroll.totalProfit) === 'text-textMain' ? 'text-secondary' : toneFor(pokerBankroll.totalProfit)}`}>
              {pokerBankroll.returnOnDeposits === undefined ? 'Bankroll' : `${pokerBankroll.returnOnDeposits > 0 ? '+' : ''}${(pokerBankroll.returnOnDeposits * 100).toFixed(1)}% return on deposits`}
            </p>
          </button>
        </div>
      </section>

      {!isPoker && (<>
      <section className="investment-summary bg-surface rounded-2xl border border-border p-4 shadow-sm" aria-labelledby="selected-portfolio-heading">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Performance snapshot</p>
          <h3 id="selected-portfolio-heading" className="mt-1 text-lg font-extrabold text-textMain">{selectedSummary.title}</h3>
          <p className="mt-1 text-xs text-secondary">{selectedSummary.description}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <SnapshotStat label="Portfolio value" value={formatMoney(portfolioValue, baseCurrency)} note="Current market value" />
          <SnapshotStat
            label={selectedCategory === 'Pokemon Cards' ? 'Original value' : 'Cost basis'}
            value={formatMoney(costBasis, baseCurrency)}
            note={selectedCategory === 'Pokemon Cards' ? 'Your first logged value' : 'What you put in originally'}
          />
          <SnapshotStat
            label={selectedCategory === 'Pokemon Cards' ? 'Value change' : 'Unrealized gain'}
            value={`${gainValue > 0 ? '+' : ''}${formatMoney(gainValue, baseCurrency)}`}
            note={`${gainPct > 0 ? '+' : ''}${gainPct.toFixed(1)}% ${selectedCategory === 'Pokemon Cards' ? 'since first logged value' : 'overall'}`}
            tone={toneFor(gainValue)}
          />
          {selectedCategory !== 'Pokemon Cards' && (
            <>
              <SnapshotStat
                label="Realized P&L"
                value={`${realizedStats.realized > 0 ? '+' : ''}${formatMoney(realizedStats.realized, baseCurrency)}`}
                note="Locked in by sells, buy-backs and dividends"
                tone={toneFor(realizedStats.realized)}
              />
              <SnapshotStat
                label="Total P&L"
                value={`${gainValue + realizedStats.realized > 0 ? '+' : ''}${formatMoney(gainValue + realizedStats.realized, baseCurrency)}`}
                note="Unrealized + realized"
                tone={toneFor(gainValue + realizedStats.realized)}
              />
              <SnapshotStat
                label="Closed trades"
                value={String(realizedStats.closedTrades)}
                note={realizedStats.closedTrades > 0
                  ? `${realizedStats.wins} win${realizedStats.wins === 1 ? '' : 's'} \u00b7 ${((realizedStats.wins / realizedStats.closedTrades) * 100).toFixed(0)}% win rate`
                  : 'Log a Sell (or Buy back for a short) to start'}
              />
            </>
          )}
        </div>
      </section>

      <PortfolioInsights
        baseCurrency={baseCurrency}
        positions={insightPositions}
        transactions={transactions}
        valuationsByHolding={valuationsByHolding}
        accounts={accounts}
      />

      <div className="investment-holdings bg-surface rounded-2xl border border-border p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Category Details</h3>
            <p className="text-xs text-secondary mt-1">Holdings inside {selectedCategory === 'All' ? 'your portfolio' : selectedCategory}.</p>
          </div>
          <div className="flex items-center gap-2 text-secondary text-xs">
            <BarChart3 size={18} className="text-primary" />
            {totalValuations} valuations
          </div>
        </div>

        {selectedInvestments.length === 0 ? (
          <div className="text-center py-10 text-secondary">
            <Shield size={22} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">No investments in this category yet.</p>
          </div>
        ) : (
          <div className="desktop-collection holdings-collection space-y-3">
            {selectedInvestments.map(investment => {
              const { currentValue, gain: profit, gainPct: profitPct } = getBaseMetrics(investment);

              return (
                <div key={investment.id} className="bg-background rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <InvestmentLogo investment={investment} className="h-11 w-11 shrink-0 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <h4 className="font-bold text-textMain truncate">{investment.name}</h4>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800/50">
                            {investment.kind}
                          </span>
                          {investment.positionSide === 'Short' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800/50">
                              Short
                            </span>
                          )}
                          {holdingAccount(investment) && (
                            <span
                              className="flex shrink-0 items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-surface text-secondary"
                              title={`${holdingAccount(investment)!.accountType} account`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: holdingAccount(investment)!.color }} />
                              {holdingAccount(investment)!.name}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-secondary truncate">
                          {investment.symbol ? `${investment.symbol} - ` : ''}
                          {investment.source || investment.notes || 'No extra notes'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-textMain">{formatMoney(currentValue, baseCurrency)}</p>
                      <p className={`text-[10px] font-semibold ${profit > 0 ? 'text-emerald-500' : profit < 0 ? 'text-red-500' : 'text-secondary'}`}>
                        {profit > 0 ? '+' : ''}{formatMoney(profit, baseCurrency)} ({profitPct > 0 ? '+' : ''}{profitPct.toFixed(1)}%)
                      </p>
                      {realizedByHolding.has(investment.id) && (
                        <p className={`text-[10px] font-semibold ${(realizedByHolding.get(investment.id) || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          Realized {(realizedByHolding.get(investment.id) || 0) >= 0 ? '+' : ''}{formatMoney(realizedByHolding.get(investment.id) || 0, baseCurrency)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-secondary">
                    <div className="bg-surface rounded-xl border border-border px-3 py-2">
                      <p className="uppercase tracking-wide font-bold">Units</p>
                      <p className="text-sm font-bold text-textMain mt-1">{investment.units}</p>
                    </div>
                    <div className="bg-surface rounded-xl border border-border px-3 py-2">
                      <p className="uppercase tracking-wide font-bold">Price</p>
                      <p className="text-sm font-bold text-textMain mt-1">{formatMoney(investment.currentPrice, investment.currency)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                    {QUOTABLE_KINDS.includes(investment.kind) && investment.symbol && (
                      <button
                        type="button"
                        onClick={() => setTickerDetailHoldingId(investment.id)}
                        className="flex items-center gap-1 rounded-lg bg-cyan-500/10 px-2.5 py-1.5 text-xs font-black text-cyan-600 hover:bg-cyan-500/15 dark:text-cyan-300"
                      >
                        <LineChartIcon size={12} />
                        View chart
                      </button>
                    )}
                    {QUOTABLE_KINDS.includes(investment.kind) && investment.symbol && (
                      <button
                        type="button"
                        onClick={() => handleRefreshHoldingPrice(investment)}
                        disabled={refreshingHoldingId === investment.id}
                        title="Refresh price from Yahoo Finance"
                        className="text-secondary hover:text-primary text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        {refreshingHoldingId === investment.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Refresh Price
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openLogValue(investment)}
                      title="Record what this holding is worth today, to track its ups and downs"
                      className="text-emerald-500 text-xs font-bold flex items-center gap-1"
                    >
                      <LineChartIcon size={12} />
                      Log value
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditHolding(investment)}
                      className="text-primary text-xs font-bold flex items-center gap-1"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteHolding(investment.id)}
                      className="text-rose-500 text-xs font-bold flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>

                  {(valuationsByHolding.get(investment.id)?.length ?? 0) > 0 && (() => {
                    const history = valuationsByHolding.get(investment.id) || [];
                    const isOpen = expandedValuationHoldingId === investment.id;
                    const first = history[0];
                    const last = history[history.length - 1];
                    const change = last.marketValue - first.marketValue;
                    const changePct = first.marketValue !== 0 ? (change / first.marketValue) * 100 : 0;
                    return (
                      <div className="mt-3 border-t border-border pt-3">
                        <button
                          type="button"
                          onClick={() => setExpandedValuationHoldingId(isOpen ? null : investment.id)}
                          className="w-full flex items-center justify-between gap-2 text-[11px] font-bold text-secondary hover:text-textMain"
                        >
                          <span>{isOpen ? 'Hide value history' : `Value history (${history.length})`}</span>
                          {history.length > 1 && (
                            <span className={change >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                              {change >= 0 ? '+' : ''}{formatMoney(change, investment.currency)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%) since {first.valuationDate.split('T')[0]}
                            </span>
                          )}
                        </button>
                        {isOpen && (
                          <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto">
                            {history.slice().reverse().map((entry, reverseIndex) => {
                              const previous = history[history.length - 2 - reverseIndex];
                              const delta = previous ? entry.marketValue - previous.marketValue : null;
                              const deltaPct = previous && previous.marketValue !== 0 ? (delta! / previous.marketValue) * 100 : null;
                              return (
                                <div key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="text-secondary shrink-0">
                                    {entry.valuationDate.split('T')[0]}
                                    {entry.createdAt && !Number.isNaN(new Date(entry.createdAt).getTime()) && (
                                      <span className="ml-1 opacity-70">{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    )}
                                  </span>
                                  <span className="font-semibold text-textMain">{formatMoney(entry.marketValue, entry.currency)}</span>
                                  <span className={`min-w-[5.5rem] text-right text-[10px] font-semibold ${delta === null ? 'text-secondary' : delta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {delta === null ? 'first entry' : `${delta >= 0 ? '+' : ''}${formatMoney(delta, entry.currency)}${deltaPct !== null ? ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''}`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => { if (confirm(`Delete the ${entry.valuationDate.split('T')[0]} value?`)) onDeleteValuation(entry.id); }}
                                    className="text-secondary hover:text-red-500 shrink-0"
                                    aria-label="Delete logged value"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>)}
    </div>
  );
};

export default InvestmentTab;
