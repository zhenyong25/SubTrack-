import React, { useState, useMemo } from 'react';
import { AccountStatement, AccountStatementKind, CardBenefit, CardPointTransaction, CardPointsActivityType, Expense, PaymentCard, Subscription } from '../types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getCardMilesSummary } from '../services/cardBenefitsService';
import { getCardExpiryStatus, getCardMonthlySpend } from '../services/storageService';
import CardLogo from './CardLogo';
import StatementsList from './StatementsList';
import StatementReconcilePanel from './StatementReconcilePanel';
import { AlertTriangle, ArrowLeft, Pencil, Plus, Trash2, TrendingUp, CalendarDays, ChevronLeft, ChevronRight, Edit3 } from 'lucide-react';

interface CardDetailProps {
  card: PaymentCard;
  subscriptions: Subscription[];
  expenses: Expense[];
  baseCurrency: string;
  benefits?: CardBenefit[];
  onEdit: (card: PaymentCard) => void;
  cardPointTransactions: CardPointTransaction[];
  onUpdateCardPointTransactions: (transactions: CardPointTransaction[]) => void;
  onClose: () => void;
  statements: AccountStatement[];
  statementsEnabled: boolean;
  onUploadStatement: (file: File, params: { accountKind: AccountStatementKind; cashAccountId?: string; cardId?: string }) => void | Promise<void>;
  onDownloadStatement: (statement: AccountStatement) => void | Promise<void>;
  onDeleteStatement: (statement: AccountStatement) => void | Promise<void>;
  onAddExpense: (expense: Omit<Expense, 'id'>) => Promise<Expense>;
  onUpdateExpense: (expense: Expense) => Promise<void>;
}

const POINT_ACTIVITY_TYPES: CardPointsActivityType[] = ['Earned', 'Redeemed', 'Expired', 'Adjusted', 'Transferred In', 'Transferred Out'];

type PointsRangeMode = 'Monthly' | 'Yearly';

type PointFormState = {
  id: string | null;
  activityDate: string;
  pointsDelta: string;
  activityType: CardPointsActivityType;
  source: string;
  notes: string;
};

const toDateInputValue = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createEmptyPointForm = (): PointFormState => ({
  id: null,
  activityDate: toDateInputValue(),
  pointsDelta: '',
  activityType: 'Earned',
  source: '',
  notes: '',
});

const normalizePointsDelta = (activityType: CardPointsActivityType, rawValue: number) => {
  const magnitude = Math.abs(rawValue);
  if (['Redeemed', 'Expired', 'Transferred Out'].includes(activityType)) {
    return -magnitude;
  }

  if (activityType === 'Transferred In' || activityType === 'Earned') {
    return magnitude;
  }

  return rawValue;
};

const formatMonthYear = (date: Date) =>
  date.toLocaleString('en-US', { month: 'short', year: '2-digit' });

const getWindowEnd = (range: PointsRangeMode, offset: number) => {
  if (range === 'Monthly') {
    return new Date(new Date().getFullYear(), new Date().getMonth() - (offset * 12), 1);
  }

  return new Date(new Date().getFullYear() - (offset * 6), 0, 1);
};

const CardDetail: React.FC<CardDetailProps> = ({
  card,
  subscriptions = [],
  expenses = [],
  baseCurrency,
  benefits = [],
  onEdit,
  cardPointTransactions = [],
  onUpdateCardPointTransactions,
  onClose,
  statements,
  statementsEnabled,
  onUploadStatement,
  onDownloadStatement,
  onDeleteStatement,
  onAddExpense,
  onUpdateExpense,
}) => {
  const isCreditCard = card.kind === 'Credit';
  const expiryStatus = getCardExpiryStatus(card);
  const [pointsRange, setPointsRange] = useState<PointsRangeMode>('Monthly');
  const [pointsWindowOffset, setPointsWindowOffset] = useState(0);
  const [isPointsFormOpen, setIsPointsFormOpen] = useState(false);
  const [pointForm, setPointForm] = useState<PointFormState>(createEmptyPointForm());
  const [reconcilingStatement, setReconcilingStatement] = useState<AccountStatement | null>(null);

  React.useEffect(() => {
    setPointForm(createEmptyPointForm());
    setPointsRange('Monthly');
    setPointsWindowOffset(0);
    setIsPointsFormOpen(false);
  }, [card.id]);

  const benefitRows = useMemo(() => {
    return benefits
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [benefits]);

  const milesSummary = useMemo(() => getCardMilesSummary(card.name, benefits), [card.name, benefits]);

  const pointsEntries = useMemo(() => {
    return cardPointTransactions
      .filter(transaction => transaction.cardId === card.id)
      .slice()
      .sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime());
  }, [card.id, cardPointTransactions]);

  const monthlySpend = useMemo(
    () => getCardMonthlySpend(card, expenses, subscriptions, baseCurrency),
    [card, expenses, subscriptions, baseCurrency],
  );

  const computedCreditDebt = isCreditCard ? monthlySpend : 0;
  const availableCredit = Math.max((card.creditLimit ?? 0) - computedCreditDebt, 0);

  const currentPoints = useMemo(() => {
    return pointsEntries.reduce((sum, transaction) => sum + Number(transaction.pointsDelta || 0), 0);
  }, [pointsEntries]);

  const krisflyerMiles = useMemo(() => currentPoints * milesSummary.exchangeRate, [currentPoints, milesSummary.exchangeRate]);

  const pointsSummary = useMemo(() => {
    const earned = pointsEntries.filter(entry => entry.pointsDelta > 0).reduce((sum, entry) => sum + entry.pointsDelta, 0);
    const redeemed = pointsEntries.filter(entry => entry.pointsDelta < 0).reduce((sum, entry) => sum + Math.abs(entry.pointsDelta), 0);
    return { earned, redeemed };
  }, [pointsEntries]);

  const pointsSliderMax = useMemo(() => {
    const largestEntry = pointsEntries.reduce((max, entry) => Math.max(max, Math.abs(Number(entry.pointsDelta || 0))), 0);
    return Math.max(1000, Math.ceil((largestEntry || 1000) / 500) * 500);
  }, [pointsEntries]);

  const pointsSliderValue = Math.abs(Number(pointForm.pointsDelta || 0));

  const pointsChartData = useMemo(() => {
    const bucketCount = pointsRange === 'Monthly' ? 12 : 6;
    const windowEnd = getWindowEnd(pointsRange, pointsWindowOffset);
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      if (pointsRange === 'Monthly') {
        const date = new Date(windowEnd.getFullYear(), windowEnd.getMonth() - (bucketCount - 1 - index), 1);
        return {
          key: `${date.getFullYear()}-${date.getMonth()}`,
          label: formatMonthYear(date),
          order: date.getTime(),
          netPoints: 0,
        };
      }

      const date = new Date(windowEnd.getFullYear() - (bucketCount - 1 - index), 0, 1);
      return {
        key: `${date.getFullYear()}`,
        label: `${date.getFullYear()}`,
        order: date.getTime(),
        netPoints: 0,
      };
    });

    const windowStart = buckets[0]?.order ?? 0;
    let carryInPoints = 0;

    pointsEntries.forEach(entry => {
      const entryDate = new Date(entry.activityDate);
      if (Number.isNaN(entryDate.getTime())) return;

      const delta = Number(entry.pointsDelta || 0);
      if (entryDate.getTime() < windowStart) {
        carryInPoints += delta;
        return;
      }

      const bucket = buckets.find(candidate => {
        if (pointsRange === 'Monthly') {
          return candidate.key === `${entryDate.getFullYear()}-${entryDate.getMonth()}`;
        }

        return candidate.key === `${entryDate.getFullYear()}`;
      });

      if (bucket) {
        bucket.netPoints += delta;
      }
    });

    let cumulative = carryInPoints;
    return buckets.map(bucket => {
      cumulative += bucket.netPoints;
      return {
        label: bucket.label,
        runningBalance: cumulative,
      };
    });
  }, [pointsEntries, pointsRange, pointsWindowOffset]);

  const chartWindowStart = useMemo(() => {
    const bucketCount = pointsRange === 'Monthly' ? 12 : 6;
    const windowEnd = getWindowEnd(pointsRange, pointsWindowOffset);
    if (pointsRange === 'Monthly') {
      return new Date(windowEnd.getFullYear(), windowEnd.getMonth() - (bucketCount - 1), 1);
    }

    return new Date(windowEnd.getFullYear() - (bucketCount - 1), 0, 1);
  }, [pointsRange, pointsWindowOffset]);

  const chartWindowLabel = useMemo(() => {
    if (pointsChartData.length === 0) return '';
    return `${pointsChartData[0].label} - ${pointsChartData[pointsChartData.length - 1].label}`;
  }, [pointsChartData]);

  const hasOlderWindow = useMemo(() => {
    if (pointsEntries.length === 0) return false;
    const earliest = new Date(pointsEntries[pointsEntries.length - 1].activityDate);
    if (Number.isNaN(earliest.getTime())) return false;
    return earliest.getTime() < chartWindowStart.getTime();
  }, [pointsEntries, chartWindowStart]);

  const pointFormCanSave = pointForm.activityDate && pointForm.pointsDelta.trim() !== '' && !Number.isNaN(Number(pointForm.pointsDelta));

  const resetPointForm = () => {
    setPointForm(createEmptyPointForm());
  };

  const startEditPoint = (entry: CardPointTransaction) => {
    setIsPointsFormOpen(true);
    setPointForm({
      id: entry.id,
      activityDate: entry.activityDate.split('T')[0],
      pointsDelta: String(entry.pointsDelta),
      activityType: entry.activityType,
      source: entry.source || '',
      notes: entry.notes || '',
    });
  };

  const savePointEntry = () => {
    const parsedPoints = Number(pointForm.pointsDelta);
    if (!Number.isFinite(parsedPoints) || parsedPoints === 0) {
      alert('Points change must be a non-zero number.');
      return;
    }

    const trimmedSource = pointForm.source.trim();
    const trimmedNotes = pointForm.notes.trim();
    const normalizedPoints = normalizePointsDelta(pointForm.activityType, parsedPoints);
    const nextEntry: CardPointTransaction = {
      id: pointForm.id || crypto.randomUUID(),
      cardId: card.id,
      activityDate: pointForm.activityDate,
      pointsDelta: normalizedPoints,
      activityType: pointForm.activityType,
      source: trimmedSource || undefined,
      notes: trimmedNotes || undefined,
      externalId: undefined,
    };

    const nextTransactions = pointForm.id
      ? cardPointTransactions.map(transaction => transaction.id === pointForm.id ? { ...transaction, ...nextEntry } : transaction)
      : [...cardPointTransactions, nextEntry];

    onUpdateCardPointTransactions(nextTransactions);
    resetPointForm();
    setIsPointsFormOpen(false);
  };

  const deletePointEntry = (transactionId: string) => {
    if (!confirm('Delete this points entry?')) return;
    onUpdateCardPointTransactions(cardPointTransactions.filter(transaction => transaction.id !== transactionId));
    if (pointForm.id === transactionId) {
      resetPointForm();
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col overflow-hidden animate-slide-up">
        <div
          className="flex items-center justify-between p-4 border-b border-border bg-surface shrink-0"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
        >
            <button onClick={onClose} className="p-2 -ml-2 text-secondary hover:text-textMain" aria-label="Back">
                <ArrowLeft size={24} />
            </button>
            <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-base font-bold text-textMain truncate">{card.name}</h3>
                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border border-border text-secondary">
                    {card.kind === 'Credit' ? 'Credit' : card.kind === 'Debit' ? 'Debit' : 'Multi-currency'}
                </span>
            </div>
            <button onClick={() => onEdit(card)} className="p-2 text-secondary hover:text-primary" aria-label="Edit card">
                <Pencil size={20} />
            </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-0 max-w-2xl w-full mx-auto">

            {/* Visual Card Representation */}
            <div className="flex justify-center mb-6 perspective-1000">
                <div
                    className="w-80 h-48 rounded-2xl relative p-6 text-white shadow-2xl transition-transform hover:scale-105"
                    style={{ background: card.color || '#1e293b', boxShadow: `0 10px 30px -10px ${card.color || '#1e293b'}` }}
                >
                    {/* Chip */}
                    <div className="w-12 h-9 mb-4 bg-yellow-200/20 rounded-md border border-yellow-200/40 relative overflow-hidden">
                         <div className="absolute top-1/2 w-full h-[1px] bg-yellow-200/40"></div>
                         <div className="absolute left-1/2 h-full w-[1px] bg-yellow-200/40"></div>
                         <div className="absolute top-2 left-2 w-4 h-5 border border-yellow-200/30 rounded-sm"></div>
                    </div>

                    {/* Number */}
                    <div className="mb-4 font-mono text-xl tracking-widest drop-shadow-md">
                        **** **** **** {card.last4Digits || '0000'}
                    </div>

                    {/* Bottom Info */}
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-[10px] uppercase opacity-70 mb-0.5">Card Holder</p>
                            <p className="text-sm font-bold tracking-wide uppercase truncate max-w-[120px]">{card.name || 'MY CARD'}</p>
                            {card.expiryMonth && card.expiryYear && (
                                <p className="text-[10px] tracking-wide opacity-70 mt-1">
                                    VALID THRU {card.expiryMonth.toString().padStart(2, '0')}/{card.expiryYear.toString().slice(-2)}
                                </p>
                            )}
                        </div>
                        <div className="scale-125 origin-bottom-right opacity-90">
                            <CardLogo type={card.type} name={card.name} />
                        </div>
                    </div>

                    {/* Gloss Effect */}
                    <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-white/20 to-transparent rounded-2xl pointer-events-none"></div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="rounded-xl border border-border bg-background p-4">
                        <p className="text-[10px] uppercase tracking-wide text-secondary font-bold">
                            {isCreditCard ? 'Current debt' : 'Current balance'}
                        </p>
                        <p className="text-xl font-black text-textMain mt-1">
                            {isCreditCard
                              ? `${computedCreditDebt.toFixed(2)} ${baseCurrency}`
                              : `${(card.currentBalance ?? 0).toFixed(2)} ${baseCurrency}`}
                        </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4">
                        <p className="text-[10px] uppercase tracking-wide text-secondary font-bold">
                            {isCreditCard ? 'Available credit' : 'Linked monthly spend'}
                        </p>
                        <p className="text-xl font-black text-textMain mt-1">
                            {isCreditCard
                              ? `${availableCredit.toFixed(2)} ${baseCurrency}`
                              : `${monthlySpend.toFixed(2)} ${baseCurrency}`}
                        </p>
                    </div>
                </div>

                {(expiryStatus === 'expired' || expiryStatus === 'expiring-soon') && (
                    <div className={`mb-6 flex items-start gap-2 p-3 rounded-lg ${
                        expiryStatus === 'expired'
                          ? 'bg-red-50 dark:bg-red-900/20'
                          : 'bg-amber-50 dark:bg-amber-900/20'
                    }`}>
                        <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${expiryStatus === 'expired' ? 'text-red-500' : 'text-amber-500'}`} />
                        <p className={`text-xs ${expiryStatus === 'expired' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                            {expiryStatus === 'expired'
                              ? `This card expired ${card.expiryMonth?.toString().padStart(2, '0')}/${card.expiryYear?.toString().slice(-2)}. Update it once you have a replacement.`
                              : `This card expires ${card.expiryMonth?.toString().padStart(2, '0')}/${card.expiryYear?.toString().slice(-2)} — renewal may be coming soon.`}
                        </p>
                    </div>
                )}

                {card.id !== 'new' && (
                    <div className="mb-6">
                        <div className="bg-background rounded-xl border border-border p-4">
                            <StatementsList
                                statements={statements}
                                accountKind="Card"
                                accountId={card.id}
                                enabled={statementsEnabled}
                                onUpload={onUploadStatement}
                                onDownload={onDownloadStatement}
                                onDelete={onDeleteStatement}
                                onReconcile={setReconcilingStatement}
                            />
                        </div>
                    </div>
                )}

                {card.id !== 'new' && (
                    <div className="mb-6">
                        <div className="bg-background rounded-xl border border-border p-4">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div>
                                    <h4 className="text-xs font-bold text-secondary uppercase">Card Points</h4>
                                    <p className="text-[10px] text-secondary mt-1">Running balance and points changes for this card.</p>
                                </div>
                                <div className="flex items-center gap-2 bg-surface border border-border rounded-full p-1">
                                    {(['Monthly', 'Yearly'] as PointsRangeMode[]).map(mode => (
                                        <button
                                            key={mode}
                                            onClick={() => {
                                              setPointsRange(mode);
                                              setPointsWindowOffset(0);
                                            }}
                                            className={`px-3 py-1 rounded-full text-[10px] font-bold transition-colors ${
                                              pointsRange === mode
                                                ? 'bg-primary text-white'
                                                : 'text-secondary hover:text-textMain'
                                            }`}
                                        >
                                            {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mb-4">
                                <div className="rounded-xl border border-border bg-surface p-3">
                                    <p className="text-[10px] uppercase text-secondary font-bold">Balance</p>
                                    <p className="text-lg font-black text-textMain mt-1 tracking-tight">{currentPoints.toFixed(0)}</p>
                                </div>
                                <div className="rounded-xl border border-border bg-surface p-3">
                                    <p className="text-[10px] uppercase text-secondary font-bold">KrisFlyer</p>
                                    <p className="text-lg font-black text-textMain mt-1 tracking-tight">{krisflyerMiles.toFixed(0)}</p>
                                </div>
                                <div className="rounded-xl border border-border bg-surface p-3">
                                    <p className="text-[10px] uppercase text-secondary font-bold">Redeemed</p>
                                    <p className="text-lg font-black text-textMain mt-1 tracking-tight">{pointsSummary.redeemed.toFixed(0)}</p>
                                </div>
                            </div>

                            <div className="h-56 w-full min-w-0 mb-4">
                                <div className="flex items-center justify-between mb-2 text-[10px] text-secondary">
                                    <span>{chartWindowLabel}</span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setPointsWindowOffset(offset => offset + 1)}
                                            disabled={!hasOlderWindow}
                                            className="w-7 h-7 rounded-full border border-border bg-surface text-secondary flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:text-textMain"
                                            aria-label="View older points"
                                        >
                                            <ChevronLeft size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPointsWindowOffset(offset => Math.max(offset - 1, 0))}
                                            disabled={pointsWindowOffset === 0}
                                            className="w-7 h-7 rounded-full border border-border bg-surface text-secondary flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:text-textMain"
                                            aria-label="View newer points"
                                        >
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 520, height: 224 }}>
                                    <LineChart data={pointsChartData}>
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-main)', borderRadius: '8px', fontSize: '12px' }}
                                            itemStyle={{ color: 'var(--color-text-main)', fontWeight: 'bold' }}
                                        />
                                        <Line type="monotone" dataKey="runningBalance" name="Running balance" stroke="#22c55e" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="flex items-center gap-2 text-[10px] text-secondary mb-3">
                                <CalendarDays size={12} />
                                <span>{pointsRange === 'Monthly' ? '12-month window' : '6-year window'}</span>
                                <span className="text-secondary/60">Use the arrows above to move backward or forward</span>
                            </div>

                            <div className="mb-3 text-[10px] text-secondary">
                                {milesSummary.transferLabel === '1:1'
                                  ? '1 point = 1 KrisFlyer mile'
                                  : `1 point = ${milesSummary.exchangeRate.toFixed(1)} KrisFlyer miles`}
                            </div>

                            <div className="border-t border-border pt-4">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div>
                                        <h5 className="text-xs font-bold text-textMain uppercase">Points Ledger</h5>
                                        <p className="text-[10px] text-secondary mt-1">Add entries as you earn, redeem, or adjust points.</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                          if (isPointsFormOpen) {
                                            setIsPointsFormOpen(false);
                                            resetPointForm();
                                            return;
                                          }

                                          setIsPointsFormOpen(true);
                                          resetPointForm();
                                        }}
                                        className="text-[10px] font-bold text-primary flex items-center gap-1"
                                    >
                                        <Plus size={12} />
                                        {isPointsFormOpen ? 'Hide Form' : 'New Entry'}
                                    </button>
                                </div>

                                <div
                                    className={`overflow-hidden transition-all duration-300 ease-out ${
                                      isPointsFormOpen ? 'max-h-[900px] opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none'
                                    }`}
                                >
                                    <div className="pt-1">
                                        <div className="grid gap-3 md:grid-cols-2 mb-4">
                                            <div>
                                                <label className="block text-[10px] font-semibold text-secondary uppercase mb-1">Date</label>
                                                <input
                                                    type="date"
                                                    value={pointForm.activityDate}
                                                    onChange={e => setPointForm(prev => ({ ...prev, activityDate: e.target.value }))}
                                                    className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm text-textMain focus:border-primary outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-semibold text-secondary uppercase mb-1">Points Change</label>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={pointsSliderMax}
                                                    step={50}
                                                    value={pointsSliderValue}
                                                    onChange={e => {
                                                      const nextMagnitude = Number(e.target.value);
                                                      const nextSigned = normalizePointsDelta(pointForm.activityType, nextMagnitude);
                                                      setPointForm(prev => ({ ...prev, pointsDelta: String(nextSigned) }));
                                                    }}
                                                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-surface accent-primary"
                                                />
                                                <div className="mt-2 flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={pointForm.pointsDelta}
                                                        onChange={e => setPointForm(prev => ({ ...prev, pointsDelta: e.target.value }))}
                                                        placeholder="e.g. 1200 or -500"
                                                        className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm text-textMain focus:border-primary outline-none no-spinner"
                                                    />
                                                    <span className="text-[10px] text-secondary whitespace-nowrap">
                                                        Max {pointsSliderMax.toLocaleString()}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-[10px] text-secondary">
                                                    Redeemed, expired, and transferred out entries are saved as negative values automatically.
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-semibold text-secondary uppercase mb-1">Type</label>
                                                <select
                                                    value={pointForm.activityType}
                                                    onChange={e => setPointForm(prev => ({ ...prev, activityType: e.target.value as CardPointsActivityType }))}
                                                    className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm text-textMain focus:border-primary outline-none"
                                                >
                                                    {POINT_ACTIVITY_TYPES.map(option => (
                                                        <option key={option} value={option}>{option}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-semibold text-secondary uppercase mb-1">Source</label>
                                                <input
                                                    type="text"
                                                    value={pointForm.source}
                                                    onChange={e => setPointForm(prev => ({ ...prev, source: e.target.value }))}
                                                    placeholder="Statement, promo, redemption..."
                                                    className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm text-textMain focus:border-primary outline-none"
                                                />
                                            </div>
                                        </div>

                                        <div className="mb-3">
                                            <label className="block text-[10px] font-semibold text-secondary uppercase mb-1">Notes</label>
                                            <textarea
                                                value={pointForm.notes}
                                                onChange={e => setPointForm(prev => ({ ...prev, notes: e.target.value }))}
                                                rows={3}
                                                placeholder="Optional notes about this entry"
                                                className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm text-textMain focus:border-primary outline-none resize-none"
                                            />
                                        </div>

                                        <div className="flex items-center gap-2 mb-4">
                                            <button
                                                onClick={savePointEntry}
                                                disabled={!pointFormCanSave}
                                                className="bg-primary text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {pointForm.id ? 'Update Entry' : 'Add Entry'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                  resetPointForm();
                                                  setIsPointsFormOpen(false);
                                                }}
                                                className="bg-background border border-border text-secondary font-bold px-4 py-2 rounded-xl text-sm"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                    {pointsEntries.length > 0 ? (
                                        pointsEntries.map(entry => (
                                            <div key={entry.id} className="rounded-xl border border-border bg-surface p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-sm font-bold ${entry.pointsDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                {entry.pointsDelta >= 0 ? '+' : ''}{entry.pointsDelta.toFixed(0)}
                                                            </span>
                                                            <span className="text-[10px] font-semibold text-secondary bg-background border border-border px-2 py-0.5 rounded-full">
                                                                {entry.activityType}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-secondary mt-1">{entry.activityDate.split('T')[0]}</p>
                                                        {(entry.source || entry.notes) && (
                                                            <p className="text-xs text-secondary mt-1 line-clamp-2">
                                                                {entry.source ? entry.source : ''}{entry.source && entry.notes ? ' · ' : ''}{entry.notes || ''}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button
                                                            onClick={() => startEditPoint(entry)}
                                                            className="text-primary text-xs font-bold flex items-center gap-1"
                                                        >
                                                            <Edit3 size={12} />
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => deletePointEntry(entry.id)}
                                                            className="text-rose-500 text-xs font-bold flex items-center gap-1"
                                                        >
                                                            <Trash2 size={12} />
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-6 text-secondary border border-dashed border-border rounded-xl bg-background">
                                            <TrendingUp size={18} className="mx-auto mb-2 opacity-50" />
                                            <p className="text-xs">No points entries yet for this card.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {benefitRows.length > 0 && (
                    <div className="mb-6 bg-background border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <h4 className="text-xs font-bold text-textMain uppercase">Reward Benefits</h4>
                                <p className="text-[10px] text-secondary mt-1">Shown below the category so you can spot the best spend buckets.</p>
                            </div>
                            <span className="text-[10px] font-bold text-secondary bg-surface border border-border px-2 py-1 rounded-full">
                                Miles
                            </span>
                        </div>
                        <div className="mb-3 text-[10px] text-secondary">
                            1 SGD spent = {Math.max(...benefitRows.map(benefit => benefit.earnRateMpd ?? 0), 0).toFixed(1)} miles
                        </div>
                        <div className="space-y-2">
                            {benefitRows.map((benefit) => (
                                <div
                                    key={benefit.id}
                                    className={`rounded-lg border p-3 ${
                                        benefit.isHighlighted
                                            ? 'border-primary/30 bg-primary/5'
                                            : 'border-border bg-surface'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-textMain">{benefit.category}</p>
                                            <p className="text-xs text-secondary truncate">{benefit.title}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs font-bold text-textMain">{(benefit.earnRateMpd ?? 0).toFixed(1)} miles per SGD</p>
                                            <p className="text-[10px] text-secondary">
                                              {benefit.krisflyerTransferRatio
                                                ? `KrisFlyer ${benefit.krisflyerTransferRatio < 1 ? `1:${(1 / benefit.krisflyerTransferRatio).toFixed(0)}` : `${benefit.krisflyerTransferRatio.toFixed(1)}:1`}`
                                                : 'KrisFlyer 1:1'}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-secondary mt-2">{benefit.description}</p>
                                    {benefit.issuer && (
                                        <div className="mt-2">
                                            <span className="text-[10px] font-semibold text-secondary bg-background border border-border px-2 py-0.5 rounded-full">
                                                {benefit.issuer}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>

        {reconcilingStatement && (
            <StatementReconcilePanel
                statement={reconcilingStatement}
                card={card}
                expenses={expenses}
                subscriptions={subscriptions}
                baseCurrency={baseCurrency}
                onAddExpense={onAddExpense}
                onUpdateExpense={onUpdateExpense}
                onClose={() => setReconcilingStatement(null)}
            />
        )}
    </div>
  );
};

export default CardDetail;
