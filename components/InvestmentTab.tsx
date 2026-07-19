import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  CircleDollarSign,
  Coins,
  Eye,
  LineChart as LineChartIcon,
  Pencil,
  Plus,
  Shield,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import type { InvestmentHolding, InvestmentKind, InvestmentTransaction, InvestmentTransactionType, InvestmentValuation, PokerMttBankrollTransaction, PokerMttTournament, PokerMttBankrollEventType } from '../types';

type RangeMode = '1D' | '7D' | '1M' | '3M' | '6M' | 'MAX';
type InvestmentCategory = 'All' | InvestmentKind;

interface InvestmentTabProps {
  baseCurrency: string;
  investments: InvestmentHolding[];
  valuations: InvestmentValuation[];
  transactions: InvestmentTransaction[];
  pokerMttTournaments: PokerMttTournament[];
  pokerMttBankrollTransactions: PokerMttBankrollTransaction[];
  onAddTransaction: (transaction: Omit<InvestmentTransaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCreateHolding: (holding: InvestmentHolding) => void;
  onAddPokerMttTournament: (tournament: PokerMttTournament) => void;
  onDeletePokerMttTournament: (tournamentId: string) => void;
  onAddPokerMttBankrollTransaction: (event: PokerMttBankrollTransaction) => void;
}

const CATEGORIES: InvestmentCategory[] = ['All', 'Crypto', 'Stocks', 'Pokemon Cards', 'Poker (MTT)', 'Cash', 'Other'];
const RANGES: RangeMode[] = ['1D', '7D', '1M', '3M', '6M', 'MAX'];
const TRANSACTION_TYPES: InvestmentTransactionType[] = ['Buy', 'Sell', 'Dividend', 'Fee', 'Transfer In', 'Transfer Out', 'Split'];
type EntryMode = 'holding' | 'transaction';

const rangeConfig: Record<RangeMode, { points: number; label: string }> = {
  '1D': { points: 1, label: 'Today' },
  '7D': { points: 7, label: 'Last 7 days' },
  '1M': { points: 30, label: 'Last 1 month' },
  '3M': { points: 90, label: 'Last 3 months' },
  '6M': { points: 180, label: 'Last 6 months' },
  MAX: { points: 365 * 5, label: 'All time' },
};

const formatMoney = (value: number, currency: string) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;

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
  valuations,
  transactions,
  pokerMttTournaments,
  pokerMttBankrollTransactions,
  onAddTransaction,
  onCreateHolding,
  onAddPokerMttTournament,
  onDeletePokerMttTournament,
  onAddPokerMttBankrollTransaction,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<InvestmentCategory>('All');
  const [rangeMode, setRangeMode] = useState<RangeMode>('1M');
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
  const [newHoldingSymbol, setNewHoldingSymbol] = useState('');
  const [newHoldingUnits, setNewHoldingUnits] = useState('');
  const [newHoldingAverageCost, setNewHoldingAverageCost] = useState('');
  const [newHoldingCurrentPrice, setNewHoldingCurrentPrice] = useState('');
  const [newHoldingNotes, setNewHoldingNotes] = useState('');
  const [newHoldingSource, setNewHoldingSource] = useState('');
  const [pokerTournamentInvestmentId, setPokerTournamentInvestmentId] = useState('');
  const [pokerTournamentDate, setPokerTournamentDate] = useState(new Date().toISOString().split('T')[0]);
  const [pokerTournamentName, setPokerTournamentName] = useState('');
  const [pokerTournamentPlacement, setPokerTournamentPlacement] = useState('');
  const [pokerTournamentEntries, setPokerTournamentEntries] = useState('1');
  const [pokerTournamentBuyInUsd, setPokerTournamentBuyInUsd] = useState('');
  const [pokerTournamentCashoutUsd, setPokerTournamentCashoutUsd] = useState('0');
  const [pokerTournamentBountyUsd, setPokerTournamentBountyUsd] = useState('0');
  const [pokerTournamentNotes, setPokerTournamentNotes] = useState('');
  const [editingPokerTournamentId, setEditingPokerTournamentId] = useState<string | null>(null);
  const [pokerBankrollInvestmentId, setPokerBankrollInvestmentId] = useState('');
  const [pokerBankrollDate, setPokerBankrollDate] = useState(new Date().toISOString().split('T')[0]);
  const [pokerBankrollType, setPokerBankrollType] = useState<PokerMttBankrollEventType>('Deposit');
  const [pokerBankrollAmount, setPokerBankrollAmount] = useState('');
  const [pokerBankrollNotes, setPokerBankrollNotes] = useState('');

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

  const pokerHoldings = useMemo(() => investments.filter(investment => investment.kind === 'Poker (MTT)'), [investments]);
  const pokerHoldingIds = useMemo(() => new Set(pokerHoldings.map(investment => investment.id)), [pokerHoldings]);

  React.useEffect(() => {
    if (pokerHoldings.length === 0) {
      setPokerTournamentInvestmentId('');
      setPokerBankrollInvestmentId('');
      return;
    }

    if (!pokerTournamentInvestmentId || !pokerHoldingIds.has(pokerTournamentInvestmentId)) {
      setPokerTournamentInvestmentId(pokerHoldings[0].id);
    }

    if (!pokerBankrollInvestmentId || !pokerHoldingIds.has(pokerBankrollInvestmentId)) {
      setPokerBankrollInvestmentId(pokerHoldings[0].id);
    }
  }, [pokerHoldings, pokerHoldingIds, pokerTournamentInvestmentId, pokerBankrollInvestmentId]);

  const resetPokerTournamentForm = () => {
    setEditingPokerTournamentId(null);
    setPokerTournamentDate(new Date().toISOString().split('T')[0]);
    setPokerTournamentName('');
    setPokerTournamentPlacement('');
    setPokerTournamentEntries('1');
    setPokerTournamentBuyInUsd('');
    setPokerTournamentCashoutUsd('0');
    setPokerTournamentBountyUsd('0');
    setPokerTournamentNotes('');
  };

  const selectedInvestments = useMemo(() => {
    if (selectedCategory === 'All') return investments;
    return investments.filter(investment => investment.kind === selectedCategory);
  }, [investments, selectedCategory]);

  const portfolioValue = useMemo(() => {
    return selectedInvestments.reduce((sum, investment) => sum + (investment.units * investment.currentPrice), 0);
  }, [selectedInvestments]);

  const costBasis = useMemo(() => {
    return selectedInvestments.reduce((sum, investment) => sum + (investment.units * investment.averageCost), 0);
  }, [selectedInvestments]);

  const gainValue = portfolioValue - costBasis;
  const gainPct = costBasis > 0 ? (gainValue / costBasis) * 100 : 0;

  const bestPerformer = useMemo(() => {
    return selectedInvestments
      .map(investment => {
        const currentValue = investment.units * investment.currentPrice;
        const basis = investment.units * investment.averageCost;
        const gain = currentValue - basis;
        const gainPctAsset = basis > 0 ? (gain / basis) * 100 : 0;
        return { ...investment, currentValue, basis, gain, gainPctAsset };
      })
      .sort((a, b) => b.gainPctAsset - a.gainPctAsset)[0] ?? null;
  }, [selectedInvestments]);

  const topHolding = useMemo(() => {
    return selectedInvestments
      .map(investment => ({
        ...investment,
        currentValue: investment.units * investment.currentPrice,
      }))
      .sort((a, b) => b.currentValue - a.currentValue)[0] ?? null;
  }, [selectedInvestments]);

  const selectedInvestmentIds = useMemo(() => new Set(selectedInvestments.map(investment => investment.id)), [selectedInvestments]);

  const selectedTransactions = useMemo(
    () => transactions
      .filter(transaction => selectedInvestmentIds.has(transaction.investmentId))
      .slice()
      .sort((a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()),
    [transactions, selectedInvestmentIds]
  );

  const transactionChartData = useMemo(() => {
    const relevant = transactions
      .filter(transaction => selectedInvestmentIds.has(transaction.investmentId))
      .slice()
      .sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime());

    if (relevant.length === 0) {
      return {
        label: 'No transaction history yet',
        history: [{ name: 'No entries', total: 0 }],
        minValue: 0,
        maxValue: 1,
      };
    }

    const dailyTotals = new Map<string, number>();

    relevant.forEach(transaction => {
      const dateKey = transaction.tradeDate.split('T')[0];
      const flow =
        transaction.transactionType === 'Buy' || transaction.transactionType === 'Transfer In'
          ? -((transaction.units * transaction.price) + transaction.fees)
          : transaction.transactionType === 'Sell'
            ? (transaction.units * transaction.price) - transaction.fees
            : transaction.transactionType === 'Dividend'
              ? transaction.price
              : transaction.transactionType === 'Fee'
                ? -transaction.fees
                : 0;
      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + flow);
    });

    let running = 0;
    const history = Array.from(dailyTotals.entries()).map(([dateKey, delta]) => {
      running += delta;
      const label = new Date(dateKey).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return {
        name: label,
        total: running,
      };
    });

    const values = history.map(point => point.total);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    return {
      label: 'Cumulative net cash flow',
      history,
      minValue,
      maxValue,
    };
  }, [transactions, selectedInvestmentIds]);

  const handleAddEntry = (event: React.FormEvent) => {
    event.preventDefault();
    const target = investments.find(investment => investment.id === entryInvestmentId);
    const units = Number(entryUnits);
    const price = Number(entryPrice);
    const fees = Number(entryFees) || 0;

    if (!target || !Number.isFinite(units) || units <= 0 || !Number.isFinite(price) || price < 0) {
      return;
    }

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

  const handleCreateHolding = (event: React.FormEvent) => {
    event.preventDefault();

    const name = newHoldingName.trim();
    const symbol = newHoldingSymbol.trim();
    const notes = newHoldingNotes.trim();
    const source = newHoldingSource.trim();
    const units = Number(newHoldingUnits);
    const averageCost = Number(newHoldingAverageCost);
    const currentPrice = Number(newHoldingCurrentPrice);

    if (!name || !Number.isFinite(units) || units < 0 || !Number.isFinite(averageCost) || averageCost < 0 || !Number.isFinite(currentPrice) || currentPrice < 0) {
      return;
    }

    onCreateHolding({
      id: crypto.randomUUID(),
      name,
      kind: newHoldingKind,
      symbol: symbol || undefined,
      units,
      averageCost,
      currentPrice,
      currency: baseCurrency,
      color:
        newHoldingKind === 'Crypto'
          ? '#8b5cf6'
          : newHoldingKind === 'Stocks'
            ? '#0ea5e9'
            : newHoldingKind === 'Pokemon Cards'
              ? '#f59e0b'
              : newHoldingKind === 'Poker (MTT)'
                ? '#ec4899'
                : newHoldingKind === 'Cash'
                  ? '#10b981'
                  : '#64748b',
      notes: notes || undefined,
      acquiredDate: new Date().toISOString().split('T')[0],
      source: source || undefined,
      isActive: true,
    });

    setNewHoldingName('');
    setNewHoldingKind('Stocks');
    setNewHoldingSymbol('');
    setNewHoldingUnits('');
    setNewHoldingAverageCost('');
    setNewHoldingCurrentPrice('');
    setNewHoldingNotes('');
    setNewHoldingSource('');
    setIsEntryModalOpen(false);
  };

  const handleAddPokerTournament = (event: React.FormEvent) => {
    event.preventDefault();

    const targetInvestmentId = pokerTournamentInvestmentId || pokerHoldings[0]?.id;
    const tournamentName = pokerTournamentName.trim();
    const entries = Number(pokerTournamentEntries);
    const buyInUsd = Number(pokerTournamentBuyInUsd);
    const cashoutUsd = Number(pokerTournamentCashoutUsd) || 0;
    const bountyUsd = Number(pokerTournamentBountyUsd) || 0;
    const placement = pokerTournamentPlacement.trim() === '' ? undefined : Number(pokerTournamentPlacement);

    if (!targetInvestmentId || !tournamentName || !Number.isFinite(entries) || entries <= 0 || !Number.isFinite(buyInUsd) || buyInUsd < 0) {
      return;
    }

    onAddPokerMttTournament({
      id: editingPokerTournamentId || crypto.randomUUID(),
      investmentId: targetInvestmentId,
      tournamentDate: pokerTournamentDate,
      tournamentName,
      placement: placement && Number.isFinite(placement) ? placement : undefined,
      entries,
      buyInUsd,
      cashoutUsd,
      bountyUsd,
      notes: pokerTournamentNotes.trim() || undefined,
    });

    resetPokerTournamentForm();
  };

  const startEditPokerTournament = (tournament: PokerMttTournament) => {
    setEditingPokerTournamentId(tournament.id);
    setPokerTournamentInvestmentId(tournament.investmentId);
    setPokerTournamentDate(tournament.tournamentDate);
    setPokerTournamentName(tournament.tournamentName);
    setPokerTournamentPlacement(tournament.placement?.toString() || '');
    setPokerTournamentEntries(String(tournament.entries));
    setPokerTournamentBuyInUsd(String(tournament.buyInUsd));
    setPokerTournamentCashoutUsd(String(tournament.cashoutUsd));
    setPokerTournamentBountyUsd(String(tournament.bountyUsd));
    setPokerTournamentNotes(tournament.notes || '');
  };

  const deleteTournament = (tournamentId: string) => {
    if (!confirm('Delete this tournament entry?')) return;
    onDeletePokerMttTournament(tournamentId);
    if (editingPokerTournamentId === tournamentId) {
      resetPokerTournamentForm();
    }
  };

  const handleAddPokerBankroll = (event: React.FormEvent) => {
    event.preventDefault();

    const targetInvestmentId = pokerBankrollInvestmentId || pokerHoldings[0]?.id;
    const amountUsd = Number(pokerBankrollAmount);
    if (!targetInvestmentId || !Number.isFinite(amountUsd) || amountUsd <= 0) {
      return;
    }

    onAddPokerMttBankrollTransaction({
      id: crypto.randomUUID(),
      investmentId: targetInvestmentId,
      eventDate: pokerBankrollDate,
      eventType: pokerBankrollType,
      amountUsd,
      notes: pokerBankrollNotes.trim() || undefined,
    });

    setPokerBankrollAmount('');
    setPokerBankrollNotes('');
  };

  const categorySummary = useMemo(() => {
    return CATEGORIES.filter(category => category !== 'All').map(category => {
      const items = investments.filter(investment => investment.kind === category);
      const value = items.reduce((sum, investment) => sum + (investment.units * investment.currentPrice), 0);
      const basis = items.reduce((sum, investment) => sum + (investment.units * investment.averageCost), 0);
      const gain = value - basis;
      return {
        category,
        count: items.length,
        value,
        gain,
        gainPct: basis > 0 ? (gain / basis) * 100 : 0,
      };
    });
  }, [investments]);

  const chartData = useMemo(() => {
    const { points, label } = rangeConfig[rangeMode];
    const fallbackFlatValue = selectedInvestments.reduce((sum, investment) => sum + (investment.units * investment.currentPrice), 0);
    if (selectedInvestments.length === 0) {
      const history = Array.from({ length: points }, (_, index) => {
        const name =
          rangeMode === '1D'
            ? 'Now'
            : rangeMode === '7D'
              ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index % 7]
              : rangeMode === 'MAX'
                ? `P${index + 1}`
                : `${index + 1}`;

        return { name, total: 1 };
      });
      return { label, history, domain: [0, 2] as [number, number] };
    }

    const selectedIds = new Set(selectedInvestments.map(investment => investment.id));
    const relevantValuations = valuations
      .filter(valuation => selectedIds.has(valuation.investmentId))
      .slice()
      .sort((a, b) => new Date(a.valuationDate).getTime() - new Date(b.valuationDate).getTime());

    const anchorDate = relevantValuations.length > 0
      ? new Date(relevantValuations[relevantValuations.length - 1].valuationDate)
      : new Date();
    anchorDate.setHours(0, 0, 0, 0);

    const buckets: { start: Date; end: Date; name: string }[] = [];
    const daysToUse = rangeMode === '1D' ? 1 : rangeMode === '7D' ? 7 : rangeMode === '1M' ? 30 : rangeMode === '3M' ? 90 : rangeMode === '6M' ? 180 : 365 * 5;
    const startDate = rangeMode === 'MAX'
      ? new Date(Math.min(...relevantValuations.map(item => new Date(item.valuationDate).getTime()), anchorDate.getTime()))
      : addDays(anchorDate, -(daysToUse - 1));

    if (rangeMode === 'MAX') {
      const seriesDates = relevantValuations.map(item => new Date(item.valuationDate).getTime());
      const firstDate = seriesDates.length > 0 ? new Date(Math.min(...seriesDates)) : anchorDate;
      const maxDate = anchorDate;
      const span = Math.max(1, Math.ceil((maxDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
      const bucketCount = Math.min(12, Math.max(5, Math.ceil(span / 30)));
      for (let i = 0; i < bucketCount; i += 1) {
        const start = addDays(firstDate, Math.floor((span / bucketCount) * i));
        const end = i === bucketCount - 1 ? addDays(maxDate, 1) : addDays(firstDate, Math.floor((span / bucketCount) * (i + 1)));
        buckets.push({
          start,
          end,
          name: start.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
        });
      }
    } else {
      for (let i = 0; i < points; i += 1) {
        const day = addDays(startDate, i);
        day.setHours(0, 0, 0, 0);
        buckets.push({
          start: day,
          end: addDays(day, 1),
          name:
            rangeMode === '1D'
              ? day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : rangeMode === '7D'
                ? day.toLocaleDateString(undefined, { weekday: 'short' })
                : day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        });
      }
    }

    const valuationMap = new Map<string, InvestmentValuation[]>();
    for (const valuation of relevantValuations) {
      const list = valuationMap.get(valuation.investmentId) ?? [];
      list.push(valuation);
      valuationMap.set(valuation.investmentId, list);
    }

    const history = buckets.map(bucket => {
      let total = 0;

      for (const investment of selectedInvestments) {
        const fallbackValue = investment.units * investment.currentPrice;
        const series = valuationMap.get(investment.id) ?? [];
        const valueAtBucket = series
          .filter(item => new Date(item.valuationDate).getTime() < bucket.end.getTime())
          .sort((a, b) => new Date(b.valuationDate).getTime() - new Date(a.valuationDate).getTime())[0];

        total += valueAtBucket ? Number(valueAtBucket.marketValue) : (series.length === 0 ? fallbackValue : 0);
      }

      return {
        name: bucket.name,
        total,
      };
    });

    const hasRealHistory = relevantValuations.length > 0;
    const baseValue = fallbackFlatValue > 0 ? fallbackFlatValue : 1;
    const flatHistory = history.map(point => ({
      ...point,
      total: hasRealHistory ? point.total : baseValue,
    }));

    const values = flatHistory.map(point => point.total);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const pad = Math.max(1, (maxValue - minValue) * 0.12 || maxValue * 0.12 || 1);

    return { label, history: flatHistory, domain: [Math.max(0, minValue - pad), maxValue + pad] as [number, number] };
  }, [rangeMode, selectedInvestments, valuations]);

  const svgChart = useMemo(() => {
    const width = 760;
    const height = 280;
    const padding = { top: 18, right: 18, bottom: 28, left: 48 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const values = chartData.history.map(point => point.total);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = Math.max(1, maxValue - minValue);

    const points = chartData.history.map((point, index) => {
      const x = padding.left + (chartData.history.length === 1 ? plotWidth / 2 : (index / (chartData.history.length - 1)) * plotWidth);
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

  const transactionSvgChart = useMemo(() => {
    const width = 760;
    const height = 220;
    const padding = { top: 18, right: 18, bottom: 26, left: 48 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const values = transactionChartData.history.map(point => point.total);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = Math.max(1, maxValue - minValue);

    const points = transactionChartData.history.map((point, index) => {
      const x = padding.left + (transactionChartData.history.length === 1 ? plotWidth / 2 : (index / (transactionChartData.history.length - 1)) * plotWidth);
      const normalized = (point.total - minValue) / range;
      const y = padding.top + (1 - normalized) * plotHeight;
      return { x, y, value: point.total, name: point.name };
    });

    const linePath = buildSmoothPath(points);
    const areaPath = `${linePath} L ${points.at(-1)?.x ?? padding.left} ${height - padding.bottom} L ${points[0]?.x ?? padding.left} ${height - padding.bottom} Z`;

    return {
      width,
      height,
      points,
      linePath,
      areaPath,
      minValue,
      maxValue,
    };
  }, [transactionChartData.history]);

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

  const selectedPokerHoldings = useMemo(() => {
    if (selectedCategory !== 'Poker (MTT)') return [];
    return selectedInvestments.filter(investment => investment.kind === 'Poker (MTT)');
  }, [selectedCategory, selectedInvestments]);

  const selectedPokerHoldingIds = useMemo(() => new Set(selectedPokerHoldings.map(investment => investment.id)), [selectedPokerHoldings]);

  const selectedPokerTournaments = useMemo(() => {
    if (selectedPokerHoldingIds.size === 0) return [];
    return pokerMttTournaments
      .filter(tournament => selectedPokerHoldingIds.has(tournament.investmentId))
      .slice()
      .sort((a, b) => new Date(a.tournamentDate).getTime() - new Date(b.tournamentDate).getTime());
  }, [pokerMttTournaments, selectedPokerHoldingIds]);

  const selectedPokerBankrollEvents = useMemo(() => {
    if (selectedPokerHoldingIds.size === 0) return [];
    return pokerMttBankrollTransactions
      .filter(event => selectedPokerHoldingIds.has(event.investmentId))
      .slice()
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  }, [pokerMttBankrollTransactions, selectedPokerHoldingIds]);

  const pokerStats = useMemo(() => {
    const tournamentCosts = selectedPokerTournaments.reduce((sum, tournament) => sum + Number(tournament.buyInUsd || 0), 0);
    const tournamentCashouts = selectedPokerTournaments.reduce((sum, tournament) => sum + Number(tournament.cashoutUsd || 0), 0);
    const tournamentBounties = selectedPokerTournaments.reduce((sum, tournament) => sum + Number(tournament.bountyUsd || 0), 0);
    const tournamentProfit = selectedPokerTournaments.reduce(
      (sum, tournament) => sum + (Number(tournament.cashoutUsd || 0) + Number(tournament.bountyUsd || 0) - Number(tournament.buyInUsd || 0)),
      0
    );

    const bankrollAdjustments = selectedPokerBankrollEvents.reduce((sum, event) => {
      const amount = Number(event.amountUsd || 0);
      if (event.eventType === 'Withdrawal') return sum - amount;
      return sum + amount;
    }, 0);

    const netPortfolio = bankrollAdjustments + tournamentProfit;
    const totalEvents = selectedPokerTournaments.length + selectedPokerBankrollEvents.length;
    const seriesEvents = [
      ...selectedPokerBankrollEvents.map(event => ({
        date: event.eventDate,
        label: event.eventType === 'Deposit' ? 'Deposit' : event.eventType === 'Withdrawal' ? 'Withdraw' : 'Adjust',
        delta: event.eventType === 'Withdrawal' ? -Number(event.amountUsd || 0) : Number(event.amountUsd || 0),
        notes: event.notes || '',
      })),
      ...selectedPokerTournaments.map(tournament => ({
        date: tournament.tournamentDate,
        label: tournament.tournamentName,
        delta: Number(tournament.cashoutUsd || 0) + Number(tournament.bountyUsd || 0) - Number(tournament.buyInUsd || 0),
        notes: `${tournament.entries} entries${tournament.placement ? ` - place ${tournament.placement}` : ''}`,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    const history = seriesEvents.map((event, index) => {
      running += event.delta;
      return {
        name: `#${index + 1}`,
        date: event.date,
        label: event.label,
        notes: event.notes,
        total: running,
      };
    });

    const values = history.map(point => point.total);
    const minValue = values.length > 0 ? Math.min(...values) : 0;
    const maxValue = values.length > 0 ? Math.max(...values) : 1;

    return {
      tournamentCount: selectedPokerTournaments.length,
      totalEvents,
      tournamentCosts,
      tournamentCashouts,
      tournamentBounties,
      tournamentProfit,
      bankrollAdjustments,
      netPortfolio,
      history,
      minValue,
      maxValue,
    };
  }, [selectedPokerBankrollEvents, selectedPokerTournaments]);

  const pokerGrowthChart = useMemo(() => {
    const width = 760;
    const height = 280;
    const padding = { top: 18, right: 18, bottom: 28, left: 48 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const values = pokerStats.history.map(point => point.total);
    const minValue = values.length > 0 ? Math.min(...values) : 0;
    const maxValue = values.length > 0 ? Math.max(...values) : 1;
    const range = Math.max(1, maxValue - minValue);

    const points = pokerStats.history.map((point, index) => {
      const x = padding.left + (pokerStats.history.length === 1 ? plotWidth / 2 : (index / (pokerStats.history.length - 1)) * plotWidth);
      const normalized = (point.total - minValue) / range;
      const y = padding.top + (1 - normalized) * plotHeight;
      return { x, y, ...point };
    });

    const linePath = buildSmoothPath(points);
    const areaPath = points.length > 0
      ? `${linePath} L ${points.at(-1)?.x ?? padding.left} ${height - padding.bottom} L ${points[0]?.x ?? padding.left} ${height - padding.bottom} Z`
      : '';

    const isProfitable = points.length > 1 ? points.at(-1)!.total >= points[0]!.total : false;

    return { width, height, points, linePath, areaPath, minValue, maxValue, isProfitable };
  }, [pokerStats.history]);

  return (
    <div className="pb-24 animate-fade-in space-y-6">
      <div className="flex flex-wrap gap-2">
        <button className="px-3 py-1.5 rounded-full bg-primary text-white text-sm font-bold shadow-sm">
          Overview
        </button>
        <button className="px-3 py-1.5 rounded-full bg-surface border border-border text-secondary text-sm font-semibold hover:text-textMain">
          Products
        </button>
      </div>

      <div className="rounded-[1.5rem] p-5 shadow-2xl border overflow-hidden relative bg-slate-50 text-slate-950 border-slate-200 dark:bg-[#111111] dark:text-white dark:border-white/10">
        <div className="absolute inset-0 opacity-60 pointer-events-none bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.08),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(34,211,238,0.06),_transparent_30%)] dark:bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.12),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(34,211,238,0.08),_transparent_30%)]" />
        <div className="absolute -right-6 -top-8 w-32 h-32 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-slate-600 text-sm font-bold dark:text-white/65">
                <span className="text-slate-700 dark:text-white/70">Portfolio</span>
                <span className="text-cyan-600 dark:text-cyan-400">Main</span>
                <ChevronDown size={14} className="text-cyan-600 dark:text-cyan-400" />
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-none">{formatMoney(portfolioValue, baseCurrency)}</h2>
                <p className="text-sm sm:text-base text-slate-600 font-medium dark:text-white/65">Combined Value: {formatMoney(portfolioValue, baseCurrency)}</p>
              </div>
              <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold border ${gainValue >= 0 ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-300'}`}>
                <span>{gainValue >= 0 ? '+' : ''}{formatMoney(gainValue, baseCurrency)}</span>
                <span className="opacity-90">{gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}% in the last month</span>
              </div>
            </div>
            <button className="shrink-0 mt-1 text-slate-500 hover:text-cyan-600 transition-colors dark:text-white/55 dark:hover:text-cyan-300" aria-label="Toggle portfolio visibility">
              <Eye size={20} />
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
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold dark:text-white/45">Portfolio Growth</p>
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-white/60">
                <LineChartIcon size={14} />
                {chartData.label}
              </div>
            </div>
            <p className="mb-3 text-xs text-slate-600 dark:text-white/55">{selectedSummary.description}</p>
            <div className="h-[360px] w-full">
              <svg viewBox={`0 0 ${svgChart.width} ${svgChart.height}`} className="w-full h-full overflow-visible">
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

                {svgChart.points.map((point, index) => {
                  const showLabel = index === 0 || index === svgChart.points.length - 1;
                  return (
                    <g key={`${point.name}-${index}`}>
                      <circle cx={point.x} cy={point.y} r={index === svgChart.points.length - 1 ? 5 : 3} fill="#22d3ee" opacity={index === svgChart.points.length - 1 ? 1 : 0.75} />
                      {showLabel && (
                        <text x={point.x} y={svgChart.height - 8} textAnchor="middle" fill="rgba(71,85,105,0.85)" fontSize="10" className="dark:fill-[rgba(255,255,255,0.45)]">
                          {point.name}
                        </text>
                      )}
                    </g>
                  );
                })}

                <path d={svgChart.areaPath} fill="url(#investmentSvgFill)" />
                <path d={svgChart.linePath} fill="none" stroke="url(#investmentSvgLine)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={svgChart.points.at(-1)?.x ?? 48} cy={svgChart.points.at(-1)?.y ?? 18} r="7" fill="#22d3ee" opacity="0.16" />
                <circle cx={svgChart.points.at(-1)?.x ?? 48} cy={svgChart.points.at(-1)?.y ?? 18} r="4" fill="#22d3ee" />

                <text x="8" y="22" fill="rgba(71,85,105,0.72)" fontSize="10" className="dark:fill-[rgba(255,255,255,0.42)]">
                  {formatMoney(svgChart.maxValue, baseCurrency)}
                </text>
                <text x="8" y="266" fill="rgba(71,85,105,0.72)" fontSize="10" className="dark:fill-[rgba(255,255,255,0.42)]">
                  {formatMoney(svgChart.minValue, baseCurrency)}
                </text>
              </svg>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-white/50">
              <p>Flat line appears when you have no history yet.</p>
              <p>{selectedInvestments.length} holdings</p>
            </div>
          </div>
        </div>
      </div>

      {selectedCategory === 'Poker (MTT)' && (
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Poker MTT Ledger</h3>
              <p className="text-xs text-secondary mt-1">
                Track tournament buy-ins, cashouts, bounties, and bankroll deposits for your poker portfolio.
              </p>
            </div>
            <div className="text-right text-xs text-secondary">
              <p>{selectedPokerHoldings.length} poker holding{selectedPokerHoldings.length === 1 ? '' : 's'} linked</p>
              <p>{pokerStats.tournamentCount} tournament{pokerStats.tournamentCount === 1 ? '' : 's'} logged</p>
            </div>
          </div>

          {selectedPokerHoldings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background p-5 text-center text-secondary">
              <Shield size={22} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">Create a Poker (MTT) holding first.</p>
              <p className="text-xs mt-1">Use Add Holding to create a poker bankroll account, then log tournaments here.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-border bg-background p-3">
                  <p className="text-[10px] uppercase text-secondary font-bold">Bankroll</p>
                  <p className="text-lg font-black text-textMain mt-1">{formatMoney(pokerStats.netPortfolio, baseCurrency)}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background p-3">
                  <p className="text-[10px] uppercase text-secondary font-bold">Tournament Profit</p>
                  <p className={`text-lg font-black mt-1 ${pokerStats.tournamentProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {pokerStats.tournamentProfit >= 0 ? '+' : ''}{formatMoney(pokerStats.tournamentProfit, baseCurrency)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background p-3">
                  <p className="text-[10px] uppercase text-secondary font-bold">Buy-ins</p>
                  <p className="text-lg font-black text-textMain mt-1">{formatMoney(pokerStats.tournamentCosts, baseCurrency)}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background p-3">
                  <p className="text-[10px] uppercase text-secondary font-bold">Cashouts + Bounties</p>
                  <p className="text-lg font-black text-textMain mt-1">{formatMoney(pokerStats.tournamentCashouts + pokerStats.tournamentBounties, baseCurrency)}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-secondary">Portfolio Growth</p>
                    <p className="text-xs text-secondary mt-1">Chronological bankroll movement across deposits and tournament results.</p>
                  </div>
                  <div className="text-right text-xs text-secondary">
                    <p>ROI {pokerStats.tournamentCosts > 0 ? `${((pokerStats.tournamentProfit / pokerStats.tournamentCosts) * 100).toFixed(1)}%` : '0.0%'}</p>
                    <p>{pokerStats.history.length} points</p>
                  </div>
                </div>
                <div className="h-72 w-full">
                  <svg viewBox={`0 0 ${pokerGrowthChart.width} ${pokerGrowthChart.height}`} className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="pokerGrowthFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={pokerGrowthChart.isProfitable ? '#22c55e' : '#ec4899'} stopOpacity="0.28" />
                        <stop offset="100%" stopColor={pokerGrowthChart.isProfitable ? '#22c55e' : '#ec4899'} stopOpacity="0.02" />
                      </linearGradient>
                      <linearGradient id="pokerGrowthLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={pokerGrowthChart.isProfitable ? '#22c55e' : '#ec4899'} />
                        <stop offset="100%" stopColor={pokerGrowthChart.isProfitable ? '#16a34a' : '#f97316'} />
                      </linearGradient>
                    </defs>
                    {Array.from({ length: 4 }).map((_, index) => {
                      const y = 18 + (index * (pokerGrowthChart.height - 44)) / 3;
                      return <line key={index} x1="48" x2="742" y1={y} y2={y} stroke="rgba(100,116,139,0.10)" strokeDasharray="4 6" className="dark:stroke-[rgba(255,255,255,0.06)]" />;
                    })}
                    {pokerGrowthChart.points.map((point, index) => {
                      const showLabel = index === 0 || index === pokerGrowthChart.points.length - 1;
                      return (
                        <g key={`${point.name}-${index}`}>
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r={index === pokerGrowthChart.points.length - 1 ? 5 : 3}
                            fill={pokerGrowthChart.isProfitable ? '#22c55e' : '#ec4899'}
                            opacity={index === pokerGrowthChart.points.length - 1 ? 1 : 0.75}
                          />
                          {showLabel && (
                            <text x={point.x} y={pokerGrowthChart.height - 8} textAnchor="middle" fill="rgba(71,85,105,0.85)" fontSize="10" className="dark:fill-[rgba(255,255,255,0.45)]">
                              {point.name}
                            </text>
                          )}
                        </g>
                      );
                    })}
                    {pokerGrowthChart.areaPath && <path d={pokerGrowthChart.areaPath} fill="url(#pokerGrowthFill)" />}
                    {pokerGrowthChart.linePath && <path d={pokerGrowthChart.linePath} fill="none" stroke="url(#pokerGrowthLine)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}
                    <text x="8" y="22" fill="rgba(71,85,105,0.72)" fontSize="10" className="dark:fill-[rgba(255,255,255,0.42)]">
                      {formatMoney(pokerGrowthChart.maxValue, baseCurrency)}
                    </text>
                    <text x="8" y={pokerGrowthChart.height - 10} fill="rgba(71,85,105,0.72)" fontSize="10" className="dark:fill-[rgba(255,255,255,0.42)]">
                      {formatMoney(pokerGrowthChart.minValue, baseCurrency)}
                    </text>
                  </svg>
                </div>
                <p className="mt-2 text-xs text-secondary">
                  The chart uses your poker event timeline, so bankroll changes appear in the order you logged them.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <form onSubmit={handleAddPokerTournament} className="rounded-2xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-textMain">{editingPokerTournamentId ? 'Edit Tournament' : 'Add Tournament'}</h4>
                      <p className="text-xs text-secondary mt-1">Log buy-in, cashout, bounty, and placement.</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-secondary bg-surface border border-border px-2 py-1 rounded-full">MTT</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Date</label>
                      <input type="date" value={pokerTournamentDate} onChange={e => setPokerTournamentDate(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Holding</label>
                      <select value={pokerTournamentInvestmentId} onChange={e => setPokerTournamentInvestmentId(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary">
                        {pokerHoldings.map(holding => (
                          <option key={holding.id} value={holding.id}>{holding.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Tournament</label>
                    <input type="text" value={pokerTournamentName} onChange={e => setPokerTournamentName(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary" placeholder="e.g. Sunday Mini Main" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Placement</label>
                      <input type="number" value={pokerTournamentPlacement} onChange={e => setPokerTournamentPlacement(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary no-spinner" placeholder="42" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Entries</label>
                      <input type="number" min="1" value={pokerTournamentEntries} onChange={e => setPokerTournamentEntries(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary no-spinner" placeholder="1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Buy-in USD</label>
                      <input type="number" min="0" step="0.01" value={pokerTournamentBuyInUsd} onChange={e => setPokerTournamentBuyInUsd(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary no-spinner" placeholder="11.00" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Cashout USD</label>
                      <input type="number" min="0" step="0.01" value={pokerTournamentCashoutUsd} onChange={e => setPokerTournamentCashoutUsd(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary no-spinner" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Bounty USD</label>
                      <input type="number" min="0" step="0.01" value={pokerTournamentBountyUsd} onChange={e => setPokerTournamentBountyUsd(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary no-spinner" placeholder="0.00" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Notes</label>
                    <input type="text" value={pokerTournamentNotes} onChange={e => setPokerTournamentNotes(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary" placeholder="Optional tournament notes" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="submit" className="flex-1 rounded-xl bg-primary text-white font-bold py-3 shadow-sm hover:opacity-90 transition-opacity">
                      {editingPokerTournamentId ? 'Update Tournament' : 'Save Tournament'}
                    </button>
                    {editingPokerTournamentId && (
                      <button
                        type="button"
                        onClick={resetPokerTournamentForm}
                        className="rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold text-secondary hover:text-textMain"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>

                <form onSubmit={handleAddPokerBankroll} className="rounded-2xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-textMain">Bankroll Movement</h4>
                      <p className="text-xs text-secondary mt-1">Deposit, withdraw, or adjust your poker fund.</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-secondary bg-surface border border-border px-2 py-1 rounded-full">Ledger</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Date</label>
                    <input type="date" value={pokerBankrollDate} onChange={e => setPokerBankrollDate(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Type</label>
                      <select value={pokerBankrollType} onChange={e => setPokerBankrollType(e.target.value as PokerMttBankrollEventType)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary">
                        <option value="Deposit">Deposit</option>
                        <option value="Withdrawal">Withdrawal</option>
                        <option value="Adjustment">Adjustment</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Holding</label>
                    <select value={pokerBankrollInvestmentId} onChange={e => setPokerBankrollInvestmentId(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary">
                      {pokerHoldings.map(holding => (
                        <option key={holding.id} value={holding.id}>{holding.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Amount USD</label>
                    <input type="number" min="0" step="0.01" value={pokerBankrollAmount} onChange={e => setPokerBankrollAmount(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary no-spinner" placeholder="500.00" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Notes</label>
                    <input type="text" value={pokerBankrollNotes} onChange={e => setPokerBankrollNotes(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary" placeholder="Optional notes" />
                  </div>
                  <button type="submit" className="w-full rounded-xl bg-primary text-white font-bold py-3 shadow-sm hover:opacity-90 transition-opacity">
                    Save Bankroll Entry
                  </button>
                </form>
              </div>

              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h4 className="text-sm font-bold text-textMain">Recent Tournaments</h4>
                    <p className="text-xs text-secondary mt-1">Newest poker results for the selected bankroll.</p>
                  </div>
                  <span className="text-xs text-secondary">{selectedPokerTournaments.length} total</span>
                </div>
                {selectedPokerTournaments.length === 0 ? (
                  <p className="text-sm text-secondary">No tournament results logged yet.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {selectedPokerTournaments.slice().reverse().map(tournament => {
                      const cost = Number(tournament.buyInUsd || 0);
                      const profit = Number(tournament.cashoutUsd || 0) + Number(tournament.bountyUsd || 0) - cost;
                      return (
                        <div key={tournament.id} className="rounded-xl border border-border bg-surface p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-textMain truncate">{tournament.tournamentName}</p>
                              <p className="text-xs text-secondary mt-1">
                                {new Date(tournament.tournamentDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                {tournament.placement ? ` - Place ${tournament.placement}` : ''}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEditPokerTournament(tournament)}
                                  className="text-primary text-xs font-bold flex items-center gap-1"
                                >
                                  <Pencil size={12} />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteTournament(tournament.id)}
                                  className="text-rose-500 text-xs font-bold flex items-center gap-1"
                                >
                                  <Trash2 size={12} />
                                  Delete
                                </button>
                              </div>
                              <p className={`mt-1 text-sm font-bold ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {profit >= 0 ? '+' : ''}{formatMoney(profit, 'USD')}
                              </p>
                              <p className="text-[10px] text-secondary">
                                Cost {formatMoney(cost, 'USD')} - {tournament.entries} entries
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm">
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
                      {transaction.transactionType}
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
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-textMain">{transaction.currency}</p>
                  <p className="text-[10px] text-secondary">{transaction.source || 'Manual entry'}</p>
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
            setEntryMode(investments.length === 0 ? 'holding' : 'transaction');
            setIsEntryModalOpen(true);
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-2xl shadow-primary/30 border border-white/10 transition-transform hover:scale-105 active:scale-95"
          aria-label="Add investment item"
        >
          <Plus size={24} />
        </button>
      </div>

      {isEntryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setIsEntryModalOpen(false)}>
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-surface border border-border shadow-2xl overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-background">
              <div>
                <h3 className="text-base font-bold text-textMain">{entryMode === 'holding' ? 'Add Holding' : 'Log Entry'}</h3>
                <p className="text-xs text-secondary mt-0.5">
                  {entryMode === 'holding'
                    ? 'Create a stock, crypto, or poker holding.'
                    : 'Store a buy, sell, dividend, or fee.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEntryModalOpen(false)}
                className="rounded-full p-2 text-secondary hover:text-textMain hover:bg-border/30"
                aria-label="Close log entry modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pt-4">
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
              <form onSubmit={handleCreateHolding} className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
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
                      {CATEGORIES.filter(category => category !== 'All').map(category => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Symbol</label>
                    <input
                      type="text"
                      value={newHoldingSymbol}
                      onChange={e => setNewHoldingSymbol(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                      placeholder="AAPL"
                    />
                  </div>
                </div>

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
                    <input
                      type="text"
                      value={baseCurrency}
                      disabled
                      className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none opacity-70"
                    />
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
                  Create Holding
                </button>
              </form>
            ) : (
              <form onSubmit={handleAddEntry} className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Investment</label>
                  <select
                    value={entryInvestmentId}
                    onChange={e => setEntryInvestmentId(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain outline-none focus:border-primary"
                  >
                    {investments.map(investment => (
                      <option key={investment.id} value={investment.id}>
                        {investment.name} ({investment.symbol || investment.kind})
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
                        <option key={type} value={type}>{type}</option>
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

                <button type="submit" className="w-full rounded-xl bg-primary text-white font-bold py-3 shadow-sm hover:opacity-90 transition-opacity">
                  Save Transaction
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Entry Flow</h3>
            <p className="text-xs text-secondary mt-1">{transactionChartData.label}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-secondary">Latest value</p>
            <p className="text-sm font-bold text-textMain">
              {transactionChartData.history.at(-1)?.total.toFixed(2) ?? '0.00'} {baseCurrency}
            </p>
          </div>
        </div>
        <div className="h-56 w-full">
          <svg viewBox={`0 0 ${transactionSvgChart.width} ${transactionSvgChart.height}`} className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="investmentTxFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="investmentTxLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#f97316" />
              </linearGradient>
            </defs>
            {Array.from({ length: 4 }).map((_, index) => {
              const y = 18 + (index * (transactionSvgChart.height - 44)) / 3;
              return <line key={index} x1="48" x2="742" y1={y} y2={y} stroke="rgba(100,116,139,0.10)" strokeDasharray="4 6" className="dark:stroke-[rgba(255,255,255,0.06)]" />;
            })}
            <path d={transactionSvgChart.areaPath} fill="url(#investmentTxFill)" />
            <path d={transactionSvgChart.linePath} fill="none" stroke="url(#investmentTxLine)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            {transactionSvgChart.points.map((point, index) => (
              <circle key={`${point.name}-${index}`} cx={point.x} cy={point.y} r={index === transactionSvgChart.points.length - 1 ? 5 : 3} fill="#f59e0b" opacity={index === transactionSvgChart.points.length - 1 ? 1 : 0.75} />
            ))}
            <text x="8" y="22" fill="rgba(71,85,105,0.72)" fontSize="10" className="dark:fill-[rgba(255,255,255,0.42)]">
              {transactionSvgChart.maxValue.toFixed(2)} {baseCurrency}
            </text>
            <text x="8" y={transactionSvgChart.height - 10} fill="rgba(71,85,105,0.72)" fontSize="10" className="dark:fill-[rgba(255,255,255,0.42)]">
              {transactionSvgChart.minValue.toFixed(2)} {baseCurrency}
            </text>
          </svg>
        </div>
        <p className="mt-2 text-xs text-secondary">This chart follows your transaction entries, so you can see how invested cash changes over time.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {categorySummary.map(summary => (
          <button
            key={summary.category}
            onClick={() => setSelectedCategory(summary.category)}
            className={`text-left bg-surface rounded-2xl border p-4 shadow-sm transition-colors ${selectedCategory === summary.category ? 'border-primary ring-2 ring-primary/10' : 'border-border hover:border-primary/40'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-secondary">{summary.category}</p>
                <p className="mt-2 text-lg font-extrabold text-textMain">{formatMoney(summary.value, baseCurrency)}</p>
              </div>
              <div className={`px-3 py-2 rounded-xl border ${summary.gain >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                <p className="text-[10px] font-bold uppercase tracking-wide">Gain</p>
                <p className="text-sm font-extrabold">{summary.gain >= 0 ? '+' : ''}{summary.gainPct.toFixed(1)}%</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-secondary">{summary.count} holding{summary.count === 1 ? '' : 's'}</p>
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Select a Category</h3>
            <p className="text-xs text-secondary mt-1">Tap a category to see the holdings inside it.</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-secondary text-xs">
            <ChevronDown size={14} />
            {chartData.label}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(category => {
            const count = category === 'All'
              ? investments.length
              : investments.filter(investment => investment.kind === category).length;

            return (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-2 rounded-full border text-xs font-bold transition-colors ${selectedCategory === category ? 'bg-primary text-white border-primary shadow-sm' : 'bg-background text-secondary border-border hover:text-textMain hover:border-primary/40'}`}
              >
                {category}
                <span className="ml-1 opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-secondary text-xs font-bold uppercase tracking-wider">
            <CircleDollarSign size={14} />
            Selected Value
          </div>
          <p className="mt-3 text-2xl font-extrabold text-textMain">{formatMoney(portfolioValue, baseCurrency)}</p>
          <p className="mt-1 text-xs text-secondary">{selectedSummary.title}</p>
        </div>

        <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-secondary text-xs font-bold uppercase tracking-wider">
            <Coins size={14} />
            Cost Basis
          </div>
          <p className="mt-3 text-2xl font-extrabold text-textMain">{formatMoney(costBasis, baseCurrency)}</p>
          <p className="mt-1 text-xs text-secondary">What you put in originally</p>
        </div>

        <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-secondary text-xs font-bold uppercase tracking-wider">
            <TrendingUp size={14} />
            Unrealized Gain
          </div>
          <p className={`mt-3 text-2xl font-extrabold ${gainValue >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {gainValue >= 0 ? '+' : ''}{formatMoney(gainValue, baseCurrency)}
          </p>
          <p className="mt-1 text-xs text-secondary">{gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}% overall</p>
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm">
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
          <div className="space-y-3">
            {selectedInvestments.map(investment => {
              const currentValue = investment.units * investment.currentPrice;
              const basis = investment.units * investment.averageCost;
              const profit = currentValue - basis;
              const profitPct = basis > 0 ? (profit / basis) * 100 : 0;

              return (
                <div key={investment.id} className="bg-background rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: investment.color }} />
                        <h4 className="font-bold text-textMain truncate">{investment.name}</h4>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800/50">
                          {investment.kind}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-secondary truncate">
                        {investment.symbol ? `${investment.symbol} - ` : ''}
                        {investment.source || investment.notes || 'No extra notes'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-textMain">{formatMoney(currentValue, baseCurrency)}</p>
                      <p className={`text-[10px] font-semibold ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {profit >= 0 ? '+' : ''}{formatMoney(profit, baseCurrency)} ({profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%)
                      </p>
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default InvestmentTab;
