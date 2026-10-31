import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, Pencil, Plus, Trash2, Trophy, Wallet, X, Coins } from 'lucide-react';
import { CURRENCIES } from '../types';
import type { PokerCashSession, PokerMttBankrollEventType, PokerMttBankrollTransaction, PokerMttTournament } from '../types';
import { fallbackRate, fetchUsdRate, type FxRate } from '../services/fxService';
import { filterPokerEvents, filterPokerSessions, filterPokerTournaments, pokerBankrollHistory, type PokerFilters } from '../services/pokerDashboardService';
import {
  RANGE_LABELS,
  amountIn,
  bankrollStats,
  buyInPerEntry,
  cashStats,
  groupByPeriod,
  homeCurrency,
  homeCurrencyStats,
  inRange,
  isInTheMoney,
  profitSeries,
  sessionProfit,
  tournamentProfit,
  tournamentStats,
  type PokerPeriod,
  type PokerRange,
} from '../services/pokerService';

// Poker bankroll dashboard, shown when the Poker category is picked in the Investments tab.
// New entries are passed up with an empty investmentId; the app ties them to the poker holding.

export interface PokerPanelProps {
  tournaments: PokerMttTournament[];
  sessions: PokerCashSession[];
  bankroll: PokerMttBankrollTransaction[];
  onSaveTournament: (tournament: PokerMttTournament) => void;
  onDeleteTournament: (tournamentId: string) => void;
  onSaveSession: (session: PokerCashSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onSaveBankrollEvent: (event: PokerMttBankrollTransaction) => void;
  onDeleteBankrollEvent: (eventId: string) => void;
  baseCurrency?: string; // the default currency deposits are sent in
}


type View = 'overview' | 'tournaments' | 'cash' | 'bankroll';
type FormKind = 'tournament' | 'cash' | 'bankroll';

const VIEWS: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'cash', label: 'Cash games' },
  { id: 'bankroll', label: 'Bankroll' },
];
const RANGES: PokerRange[] = ['all', 'ytd', '90d', '30d'];
const PERIODS: { id: PokerPeriod; label: string }[] = [{ id: 'week', label: 'Weekly' }, { id: 'month', label: 'Monthly' }, { id: 'year', label: 'Yearly' }];
const RESULTS = [{ id: 'all', label: 'All results' }, { id: 'winning', label: 'Winning' }, { id: 'losing', label: 'Losing' }, { id: 'even', label: 'Break-even' }];
const SORTS = [{ id: 'newest', label: 'Newest first' }, { id: 'oldest', label: 'Oldest first' }, { id: 'profit-high', label: 'Highest profit' }, { id: 'profit-low', label: 'Lowest profit' }];
const EVENT_TYPES: PokerMttBankrollEventType[] = ['Deposit', 'Withdrawal', 'Adjustment'];
const LIST_LIMIT = 25;

const COLORS = { total: '#ec4899', tournaments: '#8b5cf6', cash: '#0ea5e9', deposits: '#0ea5e9', win: '#10b981', loss: '#ef4444' };
const INPUT_CLASS = 'w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:border-primary outline-none';
const LABEL_CLASS = 'block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1';
const BOX = 'min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm';
const chartTooltip = { background: 'var(--color-surface, #1e293b)', borderRadius: 12, border: '1px solid #64748b', color: '#94a3b8', fontSize: 12 };

const usd = (value: number) => `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedUsd = (value: number) => `${value > 0 ? '+' : ''}${usd(value)}`;
// Other currencies read like the rest of the app ("500.00 SGD"), so they're never mistaken for USD.
const money = (value: number, currency: string) => (currency === 'USD'
  ? usd(value)
  : `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`);
const signedMoney = (value: number, currency: string) => `${value > 0 ? '+' : ''}${money(value, currency)}`;
const signedPct = (value?: number) => (value === undefined ? '-' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`);
const plainPct = (value?: number) => (value === undefined ? '-' : `${(value * 100).toFixed(1)}%`);
const compact = (value: number) => Number(value).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const tone = (value: number) => (value > 0 ? 'text-emerald-500' : value < 0 ? 'text-red-500' : 'text-textMain');
const shortDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const num = (value: string) => (value.trim() === '' ? NaN : Number(value));

const Stat: React.FC<{ label: string; value: string; note?: string; valueTone?: string }> = ({ label, value, note, valueTone = 'text-textMain' }) => (
  <div className="min-w-0 rounded-2xl border border-border bg-background p-4">
    <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">{label}</p>
    <p className={`mt-2 break-words text-lg font-extrabold tabular-nums sm:text-xl ${valueTone}`}>{value}</p>
    {note && <p className="mt-1 text-[11px] text-secondary">{note}</p>}
  </div>
);

const Segmented = <T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (value: T) => void; label: string }) => (
  <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded-xl bg-background p-1">
    {options.map(option => (
      <button
        key={option.id}
        type="button"
        aria-pressed={value === option.id}
        onClick={() => onChange(option.id)}
        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${value === option.id ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const Modal: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }> = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={onClose}>
    <div role="dialog" aria-label={title} className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-border my-4 sm:my-8" onClick={event => event.stopPropagation()}>
      <div className="p-4 border-b border-border flex justify-between items-center bg-background">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-textMain">{title}</h3>
          {subtitle && <p className="text-[11px] text-secondary">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="text-secondary hover:text-textMain p-1 -mr-1" aria-label="Close"><X size={18} /></button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  </div>
);

const IconButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }> = ({ label, onClick, children, danger }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} className={`rounded-lg p-2 text-secondary transition-colors ${danger ? 'hover:bg-red-500/10 hover:text-red-500' : 'hover:bg-background hover:text-textMain'}`}>
    {children}
  </button>
);

const EmptyState: React.FC<{ text: string; action: string; onAction: () => void }> = ({ text, action, onAction }) => (
  <div className="rounded-xl bg-background p-6 text-center">
    <p className="text-xs text-secondary">{text}</p>
    <button type="button" onClick={onAction} className="mt-3 inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white"><Plus size={14} />{action}</button>
  </div>
);

const PokerPanel: React.FC<PokerPanelProps> = props => {
  const { tournaments, sessions, bankroll } = props;
  const today = todayLocal();
  const [view, setView] = useState<View>('overview');
  const [range, setRange] = useState<PokerRange>('all');
  const [period, setPeriod] = useState<PokerPeriod>('month');
  const [form, setForm] = useState<{ kind: FormKind; id?: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [chartMode, setChartMode] = useState<'cumulative' | 'period'>('cumulative');
  const [bankrollChartMode, setBankrollChartMode] = useState<'balance' | 'flows'>('balance');
  const [showPeriodTable, setShowPeriodTable] = useState(false);
  const [tournamentFilters, setTournamentFilters] = useState<PokerFilters>({ search: '', result: 'all', sort: 'newest', format: 'all', buyIn: 'all' });
  const [cashFilters, setCashFilters] = useState<PokerFilters>({ search: '', result: 'all', sort: 'newest', game: '', venue: '' });
  const [eventSearch, setEventSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [eventSort, setEventSort] = useState<'newest' | 'oldest'>('newest');

  // Form fields (one form open at a time, so they share state).
  const [date, setDate] = useState(today);
  const [name, setName] = useState('');
  const [perEntry, setPerEntry] = useState('');
  const [entries, setEntries] = useState('1');
  const [isBounty, setIsBounty] = useState(false);
  const [bounty, setBounty] = useState('');
  const [reward, setReward] = useState('');
  const [placement, setPlacement] = useState('');
  const [venue, setVenue] = useState('');
  const [buyIn, setBuyIn] = useState('');
  const [cashOut, setCashOut] = useState('');
  const [hours, setHours] = useState('');
  const [eventType, setEventType] = useState<PokerMttBankrollEventType>('Deposit');
  const [amount, setAmount] = useState('');
  const [depositCurrency, setDepositCurrency] = useState('USD');
  const [usdCredited, setUsdCredited] = useState('');
  const [notes, setNotes] = useState('');

  // Deposits may be sent in another currency (e.g. SGD); results stay in USD.
  const home = useMemo(() => homeCurrency(bankroll), [bankroll]);
  const defaultCurrency = home || (props.baseCurrency && props.baseCurrency !== 'USD' ? props.baseCurrency : 'USD');
  const [rates, setRates] = useState<Record<string, FxRate>>({});
  const loadRate = (currency: string) => {
    if (currency === 'USD' || rates[currency]) return;
    setRates(current => ({ ...current, [currency]: fallbackRate(currency) }));
    void fetchUsdRate(currency).then(rate => setRates(current => ({ ...current, [currency]: rate })));
  };
  useEffect(() => { if (home) loadRate(home); }, [home]);
  const rateFor = (currency: string) => (currency === 'USD' ? { rate: 1, live: true } : rates[currency] || fallbackRate(currency));
  const homeRate = home ? rateFor(home) : undefined;

  const rangedTournaments = useMemo(() => tournaments.filter(t => inRange(t.tournamentDate, range, today)), [tournaments, range, today]);
  const rangedSessions = useMemo(() => sessions.filter(s => inRange(s.sessionDate, range, today)), [sessions, range, today]);
  const filteredTournaments = useMemo(() => filterPokerTournaments(tournaments, range, today, tournamentFilters), [tournaments, range, today, tournamentFilters]);
  const filteredSessions = useMemo(() => filterPokerSessions(sessions, range, today, cashFilters), [sessions, range, today, cashFilters]);
  const rangedEvents = useMemo(() => bankroll.filter(event => inRange(event.eventDate, range, today)), [bankroll, range, today]);
  const mtt = useMemo(() => tournamentStats(view === 'tournaments' ? filteredTournaments : rangedTournaments), [view, filteredTournaments, rangedTournaments]);
  const cash = useMemo(() => cashStats(view === 'cash' ? filteredSessions : rangedSessions), [view, filteredSessions, rangedSessions]);
  const roll = useMemo(() => bankrollStats(bankroll, tournaments, sessions), [bankroll, tournaments, sessions]);
  const chartTournaments = view === 'cash' ? [] : view === 'tournaments' ? filteredTournaments : rangedTournaments;
  const chartSessions = view === 'tournaments' ? [] : view === 'cash' ? filteredSessions : rangedSessions;
  const chartProfit = (view === 'cash' ? 0 : mtt.profit) + (view === 'tournaments' ? 0 : cash.profit);
  const series = useMemo(() => profitSeries(chartTournaments, chartSessions), [chartTournaments, chartSessions]);
  const resultPeriods = useMemo(() => groupByPeriod([], chartTournaments, chartSessions, period).slice(0, 24).reverse(), [chartTournaments, chartSessions, period]);
  const ledger = useMemo(() => pokerBankrollHistory(bankroll, tournaments, sessions, range, today), [bankroll, tournaments, sessions, range, today]);
  const rangeRoll = useMemo(() => bankrollStats(rangedEvents, rangedTournaments, rangedSessions), [rangedEvents, rangedTournaments, rangedSessions]);

  const homeStats = useMemo(
    () => (home && homeRate ? homeCurrencyStats(bankroll, roll.bankroll, home, homeRate.rate) : undefined),
    [bankroll, roll.bankroll, home, homeRate?.rate],
  );

  const periods = useMemo(() => {
    const rows = groupByPeriod(rangedEvents, rangedTournaments, rangedSessions, period, home && homeRate ? { currency: home, rate: homeRate.rate } : undefined);
    // Running bankroll at the end of each period, worked out oldest first.
    let running = ledger.opening;
    const withBalance = rows.slice().reverse().map(row => {
      running += row.deposits - row.withdrawals + row.profit;
      return { ...row, balance: running };
    });
    return withBalance.reverse();
  }, [rangedEvents, rangedTournaments, rangedSessions, period, home, homeRate?.rate, ledger.opening]);
  const periodChart = useMemo(() => periods.slice(0, 12).reverse().map(row => ({ ...row, withdrawalsNegative: -row.withdrawals })), [periods]);

  const switchView = (next: View) => { setView(next); setShowAll(false); setShowStats(false); };
  useEffect(() => { setShowAll(false); }, [range, tournamentFilters, cashFilters, eventSearch, eventFilter, eventSort]);

  const openForm = (kind: FormKind, id?: string) => {
    setDate(today); setName(''); setPerEntry(''); setEntries('1'); setIsBounty(false); setBounty(''); setReward('');
    setPlacement(''); setVenue(''); setBuyIn(''); setCashOut(''); setHours(''); setEventType('Deposit'); setAmount(''); setNotes('');
    setDepositCurrency(defaultCurrency); setUsdCredited('');
    if (kind === 'bankroll') loadRate(defaultCurrency);
    if (kind === 'tournament' && id) {
      const t = tournaments.find(item => item.id === id);
      if (t) {
        setDate(t.tournamentDate.slice(0, 10)); setName(t.tournamentName); setEntries(String(t.entries || 1));
        setPerEntry(String(Number(buyInPerEntry(t).toFixed(2)))); setIsBounty(Boolean(t.isBounty || t.bountyUsd > 0));
        setBounty(t.bountyUsd ? String(t.bountyUsd) : ''); setReward(t.cashoutUsd ? String(t.cashoutUsd) : '');
        setPlacement(t.placement ? String(t.placement) : ''); setNotes(t.notes || '');
      }
    }
    if (kind === 'cash' && id) {
      const s = sessions.find(item => item.id === id);
      if (s) {
        setDate(s.sessionDate.slice(0, 10)); setName(s.game || ''); setVenue(s.venue || ''); setBuyIn(String(s.buyInUsd));
        setCashOut(String(s.cashOutUsd)); setHours(s.durationHours ? String(s.durationHours) : ''); setNotes(s.notes || '');
      }
    }
    setForm({ kind, id });
  };

  // ------------------------------------------------------------------ form validation & save
  const entriesNumber = Math.max(1, Math.floor(num(entries) || 1));
  const perEntryNumber = num(perEntry);
  const tournamentTotal = Number.isFinite(perEntryNumber) ? perEntryNumber * entriesNumber : NaN;
  const rewardNumber = num(reward) || 0;
  const bountyNumber = isBounty ? num(bounty) || 0 : 0;
  const tournamentValid = name.trim() !== '' && Number.isFinite(perEntryNumber) && perEntryNumber >= 0 && rewardNumber >= 0 && bountyNumber >= 0 && Boolean(date);

  const buyInNumber = num(buyIn);
  const cashOutNumber = num(cashOut);
  const cashValid = Number.isFinite(buyInNumber) && buyInNumber >= 0 && Number.isFinite(cashOutNumber) && cashOutNumber >= 0 && Boolean(date);

  // Adjustments (rakeback, bonuses) happen on the poker site, so they're always USD.
  const eventCurrency = eventType === 'Adjustment' ? 'USD' : depositCurrency;
  const formRate = rateFor(eventCurrency);
  const amountNumber = num(amount);
  const estimatedUsd = Number.isFinite(amountNumber) ? amountNumber / formRate.rate : NaN;
  // The USD actually credited, if typed (the site's own rate and fees); otherwise today's rate.
  const amountUsdNumber = eventCurrency === 'USD' ? amountNumber : usdCredited.trim() !== '' ? num(usdCredited) : estimatedUsd;
  const bankrollValid = Number.isFinite(amountNumber) && Number.isFinite(amountUsdNumber) && Boolean(date)
    && (eventType === 'Adjustment' ? amountNumber !== 0 : amountNumber > 0 && amountUsdNumber > 0);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    if (form.kind === 'tournament' && tournamentValid) {
      const existing = tournaments.find(item => item.id === form.id);
      props.onSaveTournament({
        id: existing?.id || crypto.randomUUID(),
        investmentId: existing?.investmentId || '',
        tournamentDate: date,
        tournamentName: name.trim(),
        placement: num(placement) > 0 ? Math.floor(num(placement)) : undefined,
        entries: entriesNumber,
        buyInUsd: Number(tournamentTotal.toFixed(2)),
        cashoutUsd: rewardNumber,
        bountyUsd: bountyNumber,
        isBounty,
        notes: notes.trim() || undefined,
        createdAt: existing?.createdAt,
      });
    } else if (form.kind === 'cash' && cashValid) {
      const existing = sessions.find(item => item.id === form.id);
      props.onSaveSession({
        id: existing?.id || crypto.randomUUID(),
        investmentId: existing?.investmentId || '',
        sessionDate: date,
        game: name.trim() || undefined,
        venue: venue.trim() || undefined,
        buyInUsd: buyInNumber,
        cashOutUsd: cashOutNumber,
        durationHours: num(hours) > 0 ? num(hours) : undefined,
        notes: notes.trim() || undefined,
        createdAt: existing?.createdAt,
      });
    } else if (form.kind === 'bankroll' && bankrollValid) {
      props.onSaveBankrollEvent({
        id: crypto.randomUUID(),
        investmentId: '',
        eventDate: date,
        eventType,
        amountUsd: Number(amountUsdNumber.toFixed(2)),
        ...(eventCurrency !== 'USD' ? { currency: eventCurrency, amount: amountNumber } : {}),
        notes: notes.trim() || undefined,
      });
    } else {
      return;
    }
    setForm(null);
  };

  // ------------------------------------------------------------------ pieces
  const rangeFilter = (
    <Segmented label="Date range" options={RANGES.map(id => ({ id, label: RANGE_LABELS[id] }))} value={range} onChange={setRange} />
  );

  const addButton = (kind: FormKind, label: string) => (
    <button type="button" onClick={() => openForm(kind)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90">
      <Plus size={14} />{label}
    </button>
  );

  const showMore = (total: number) => total > LIST_LIMIT && (
    <button type="button" onClick={() => setShowAll(value => !value)} className="mt-3 w-full rounded-xl border border-border py-2 text-xs font-bold text-secondary hover:text-textMain">
      {showAll ? 'Show fewer' : `Show all ${total}`}
    </button>
  );
  const filterSelect = (label: string, value: string, options: { id: string; label: string }[], onChange: (value: string) => void) => <label className="min-w-0 space-y-1 text-[10px] font-semibold text-secondary">{label}<select aria-label={label} value={value} onChange={event => onChange(event.target.value)} className="block w-full min-w-0 rounded-lg border border-border bg-background p-2 text-xs text-textMain">{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
  const searchInput = (label: string, value: string, onChange: (value: string) => void) => <label className="min-w-0 space-y-1 text-[10px] font-semibold text-secondary">{label}<input aria-label={label} type="search" value={value} onChange={event => onChange(event.target.value)} placeholder="Name, notes, date…" className="block w-full min-w-0 rounded-lg border border-border bg-background p-2 text-xs text-textMain" /></label>;

  const profitChart = (
    <div className={`${BOX} poker-results-card`} data-poker-chart={view}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-textMain">{view === 'tournaments' ? 'Tournament' : view === 'cash' ? 'Cash-game' : 'Poker'} results</h4>
          <p className="mt-0.5 text-xs text-secondary">Profit after buy-ins, {RANGE_LABELS[range].toLowerCase()}{view === 'overview' ? '.' : ' and current filters.'}</p>
        </div>
        <p className={`text-lg font-extrabold tabular-nums ${tone(chartProfit)}`}>{signedUsd(chartProfit)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><Segmented label="Results chart type" options={[{ id: 'cumulative', label: 'Cumulative' }, { id: 'period', label: 'By period' }]} value={chartMode} onChange={setChartMode} />{chartMode === 'period' && <Segmented label="Results chart grouping" options={PERIODS} value={period} onChange={setPeriod} />}</div>
      {series.length > 0 ? (
        <div className="mt-3 h-64 min-w-0" role="img" aria-label={`${view === 'tournaments' ? 'Tournament' : view === 'cash' ? 'Cash-game' : 'Poker'} ${chartMode} results: ${signedUsd(chartProfit)} total`}>
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === 'cumulative' ? <LineChart data={series} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="date" tickFormatter={value => shortDate(String(value))} minTickGap={40} tick={{ fontSize: 10 }} />
              <YAxis width={55} tickFormatter={compact} tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <ReferenceLine y={0} stroke="#64748b" />
              <Tooltip labelFormatter={label => shortDate(String(label))} formatter={(value: number) => signedUsd(Number(value))} contentStyle={chartTooltip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {view === 'overview' && <Line name="Total" dataKey="total" stroke={COLORS.total} strokeWidth={2} dot={series.length === 1 ? { r: 4 } : false} isAnimationActive={false} />}
              {view !== 'cash' && <Line name="Tournaments" dataKey="tournaments" stroke={COLORS.tournaments} strokeWidth={2} dot={series.length === 1 ? { r: 4 } : false} isAnimationActive={false} />}
              {view !== 'tournaments' && <Line name="Cash games" dataKey="cash" stroke={COLORS.cash} strokeWidth={2} dot={series.length === 1 ? { r: 4 } : false} isAnimationActive={false} />}
            </LineChart> : <BarChart data={resultPeriods} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} vertical={false} /><XAxis dataKey="label" minTickGap={25} tick={{ fontSize: 10 }} /><YAxis width={55} tickFormatter={compact} tick={{ fontSize: 10 }} /><ReferenceLine y={0} stroke="#64748b" /><Tooltip formatter={(value: number) => signedUsd(Number(value))} contentStyle={chartTooltip} /><Bar dataKey="profit" name="Profit" maxBarSize={36} radius={[3, 3, 0, 0]}>{resultPeriods.map(row => <Cell key={row.key} fill={row.profit >= 0 ? COLORS.win : COLORS.loss} />)}</Bar></BarChart>}
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-3 flex h-40 items-center justify-center rounded-xl bg-background p-4 text-center text-xs text-secondary">No results match this range and filters.</div>
      )}
      <p className="mt-2 text-[10px] text-secondary">{chartMode === 'cumulative' ? 'Cumulative profit starts from the selected results; deposits and withdrawals are excluded.' : 'Latest 24 active periods in the selection. Green = profit; red = loss.'}</p>
    </div>
  );

  const tournamentTiles = (
    <div className="space-y-2"><div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
      <Stat label="Total winnings" value={usd(mtt.winnings)} note={mtt.bounties > 0 ? `${usd(mtt.cashouts)} rewards + ${usd(mtt.bounties)} bounties` : 'End rewards'} />
      <Stat label="Profit" value={signedUsd(mtt.profit)} note={`${usd(mtt.buyIns)} in buy-ins`} valueTone={tone(mtt.profit)} />
      <Stat label="ROI" value={signedPct(mtt.roi)} note="Profit / buy-ins" valueTone={tone(mtt.roi || 0)} />
      {showStats && <>
      <Stat label="In the money" value={`${mtt.itm.toLocaleString()} / ${mtt.count.toLocaleString()}`} note={`${plainPct(mtt.itmRate)} ITM rate`} />
      <Stat label="Largest winning" value={usd(mtt.largestWin)} note="Best single tournament" />
      <Stat label="Average buy-in" value={mtt.averageBuyIn === undefined ? '-' : usd(mtt.averageBuyIn)} note={`${mtt.entries.toLocaleString()} entries`} />
      <Stat label="Highest buy-in" value={mtt.highestBuyIn === undefined ? '-' : usd(mtt.highestBuyIn)} note="Per entry" />
      <Stat label="Lowest buy-in" value={mtt.lowestBuyIn === undefined ? '-' : usd(mtt.lowestBuyIn)} note="Per entry" />
      <Stat label="Bounty events" value={mtt.bountyEvents.toLocaleString()} note={`${usd(mtt.bounties)} in bounties`} />
      </>}
    </div><button type="button" aria-expanded={showStats} onClick={() => setShowStats(value => !value)} className="text-xs font-semibold text-primary">{showStats ? 'Fewer tournament statistics' : 'More tournament statistics'}</button></div>
  );

  const cashTiles = (
    <div className="space-y-2"><div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
      <Stat label="Profit" value={signedUsd(cash.profit)} note={`${usd(cash.buyIns)} bought in`} valueTone={tone(cash.profit)} />
      <Stat label="Sessions" value={cash.sessions.toLocaleString()} note={`${cash.winningSessions} winning · ${plainPct(cash.winRate)}`} />
      <Stat label="Hourly" value={cash.hourly === undefined ? '-' : `${signedUsd(cash.hourly)}/h`} note={cash.hours > 0 ? `${cash.hours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hours logged` : 'Log session hours to see it'} valueTone={tone(cash.hourly || 0)} />
      {showStats && <>
      <Stat label="Average session" value={cash.averageResult === undefined ? '-' : signedUsd(cash.averageResult)} valueTone={tone(cash.averageResult || 0)} />
      <Stat label="Biggest win" value={signedUsd(cash.biggestWin)} valueTone={tone(cash.biggestWin)} />
      <Stat label="Biggest loss" value={signedUsd(cash.biggestLoss)} valueTone={tone(cash.biggestLoss)} />
      </>}
    </div><button type="button" aria-expanded={showStats} onClick={() => setShowStats(value => !value)} className="text-xs font-semibold text-primary">{showStats ? 'Fewer cash-game statistics' : 'More cash-game statistics'}</button></div>
  );

  // ------------------------------------------------------------------ views
  const overview = (
    <div className="poker-two-column">
      <div className="poker-full-width grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bankroll" value={usd(roll.bankroll)} note="Deposits + results" />
        <Stat label="Net deposits" value={usd(roll.netDeposits)} note={`${usd(roll.deposits)} in · ${usd(roll.withdrawals)} out`} />
        <Stat label="Total profit" value={signedUsd(roll.totalProfit)} note={roll.adjustments ? `incl. ${signedUsd(roll.adjustments)} adjustments` : 'Tournaments + cash games'} valueTone={tone(roll.totalProfit)} />
        <Stat
          label="Return on deposits"
          value={signedPct(roll.returnOnDeposits)}
          note={homeStats && home ? `In ${home}: ${signedPct(homeStats.returnOnDeposits)} (incl. exchange rate)` : 'Total profit / deposited'}
          valueTone={tone(roll.returnOnDeposits || 0)}
        />
      </div>
      <div className="poker-full-width flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-secondary">Results</p>
        {rangeFilter}
      </div>
      {profitChart}
      <div className="poker-result-cards grid auto-rows-fr gap-3 self-stretch md:grid-cols-2 lg:grid-cols-1">
        {([
          { id: 'tournaments' as View, title: 'Tournaments', Icon: Trophy, color: COLORS.tournaments, profit: mtt.profit, lines: [`${mtt.count} played · ${mtt.itm} ITM (${plainPct(mtt.itmRate)})`, `ROI ${signedPct(mtt.roi)} · ${usd(mtt.buyIns)} in buy-ins`] },
          { id: 'cash' as View, title: 'Cash games', Icon: Coins, color: COLORS.cash, profit: cash.profit, lines: [`${cash.sessions} sessions · ${plainPct(cash.winRate)} winning`, cash.hourly === undefined ? `${usd(cash.buyIns)} bought in` : `${signedUsd(cash.hourly)}/h over ${cash.hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}h`] },
        ]).map(card => (
          <button key={card.id} type="button" onClick={() => switchView(card.id)} className={`${BOX} poker-result-link text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`} style={{ '--poker-accent': card.color } as React.CSSProperties}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-textMain">
                <span className="poker-result-icon flex h-9 w-9 items-center justify-center rounded-xl"><card.Icon size={18} /></span>
                {card.title}
              </span>
              <ArrowRight size={18} className="text-secondary" />
            </div>
            <p className={`mt-3 text-xl font-extrabold tabular-nums ${tone(card.profit)}`}>{signedUsd(card.profit)}</p>
            {card.lines.map(line => <p key={line} className="mt-1 text-[11px] text-secondary">{line}</p>)}
            <p className="mt-4 text-xs font-bold text-secondary">View {card.title.toLowerCase()} <span aria-hidden="true">→</span></p>
          </button>
        ))}
      </div>
    </div>
  );

  const sortedTournaments = filteredTournaments;
  const tournamentsView = (
    <div className="poker-two-column" data-poker-view="tournaments">
      <div className="poker-full-width flex flex-wrap items-center justify-between gap-2">
        {rangeFilter}
        <div className="flex items-center gap-3"><button type="button" onClick={() => setTournamentFilters({ search: '', result: 'all', sort: 'newest', format: 'all', buyIn: 'all' })} className="text-xs font-semibold text-secondary">Reset filters</button>{addButton('tournament', 'Log tournament')}</div>
      </div>
      <div className="poker-full-width grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {searchInput('Search tournaments', tournamentFilters.search, search => setTournamentFilters(current => ({ ...current, search })))}
        {filterSelect('Tournament result', tournamentFilters.result, [...RESULTS, { id: 'itm', label: 'In the money' }, { id: 'missed', label: 'No end reward' }], result => setTournamentFilters(current => ({ ...current, result: result as PokerFilters['result'] })))}
        {filterSelect('Tournament format', tournamentFilters.format || 'all', [{ id: 'all', label: 'All formats' }, { id: 'bounty', label: 'Bounty / knockout' }, { id: 'regular', label: 'Regular' }], format => setTournamentFilters(current => ({ ...current, format: format as PokerFilters['format'] })))}
        {filterSelect('Buy-in per entry', tournamentFilters.buyIn || 'all', [{ id: 'all', label: 'All buy-ins' }, { id: 'micro', label: '$5 or less' }, { id: 'low', label: 'Over $5 to $20' }, { id: 'higher', label: 'Over $20' }], buyIn => setTournamentFilters(current => ({ ...current, buyIn: buyIn as PokerFilters['buyIn'] })))}
        {filterSelect('Sort tournaments', tournamentFilters.sort, SORTS, sort => setTournamentFilters(current => ({ ...current, sort: sort as PokerFilters['sort'] })))}
      </div>
      <div className="poker-analysis space-y-3">{tournamentTiles}{profitChart}</div>
      <div className={`${BOX} poker-log`}>
        <h4 className="text-sm font-bold text-textMain">Tournament log <span className="ml-1 text-xs font-normal text-secondary">{sortedTournaments.length} / {rangedTournaments.length}</span></h4>
        <p className="mt-0.5 text-xs text-secondary">A reward means you finished in the money. Bounties are counted in winnings, not ITM.</p>
        {sortedTournaments.length === 0 ? (
          <div className="mt-3"><EmptyState text={tournaments.length ? 'No tournaments match this selection.' : 'No tournaments logged yet.'} action="Log tournament" onAction={() => openForm('tournament')} /></div>
        ) : (
          <ul className="poker-log-list mt-3 divide-y divide-border">
            {(showAll ? sortedTournaments : sortedTournaments.slice(0, LIST_LIMIT)).map(t => {
              const profit = tournamentProfit(t);
              return (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-textMain">{t.tournamentName}</p>
                      {(t.isBounty || t.bountyUsd > 0) && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">Bounty</span>}
                      {isInTheMoney(t) && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">ITM{t.placement ? ` · #${t.placement}` : ''}</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-secondary">
                      {shortDate(t.tournamentDate)} · {t.entries > 1 ? `${t.entries} × ${usd(buyInPerEntry(t))} = ${usd(t.buyInUsd)}` : `${usd(t.buyInUsd)} buy-in`}
                      {t.cashoutUsd > 0 && ` · reward ${usd(t.cashoutUsd)}`}
                      {t.bountyUsd > 0 && ` · bounties ${usd(t.bountyUsd)}`}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-extrabold tabular-nums ${tone(profit)}`}>{signedUsd(profit)}</p>
                  <div className="flex shrink-0">
                    <IconButton label={`Edit ${t.tournamentName}`} onClick={() => openForm('tournament', t.id)}><Pencil size={14} /></IconButton>
                    <IconButton danger label={`Delete ${t.tournamentName}`} onClick={() => confirm(`Delete ${t.tournamentName} on ${shortDate(t.tournamentDate)}?`) && props.onDeleteTournament(t.id)}><Trash2 size={14} /></IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {showMore(sortedTournaments.length)}
      </div>
    </div>
  );

  const sortedSessions = filteredSessions;
  const cashView = (
    <div className="poker-two-column" data-poker-view="cash">
      <div className="poker-full-width flex flex-wrap items-center justify-between gap-2">
        {rangeFilter}
        <div className="flex items-center gap-3"><button type="button" onClick={() => setCashFilters({ search: '', result: 'all', sort: 'newest', game: '', venue: '' })} className="text-xs font-semibold text-secondary">Reset filters</button>{addButton('cash', 'Log session')}</div>
      </div>
      <div className="poker-full-width grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {searchInput('Search cash sessions', cashFilters.search, search => setCashFilters(current => ({ ...current, search })))}
        {filterSelect('Cash-game result', cashFilters.result, RESULTS, result => setCashFilters(current => ({ ...current, result: result as PokerFilters['result'] })))}
        {filterSelect('Cash game', cashFilters.game || '', [{ id: '', label: 'All games' }, ...[...new Set<string>(sessions.map((row: PokerCashSession) => row.game).filter((value: string | undefined): value is string => Boolean(value)))].sort().map(game => ({ id: game, label: game }))], game => setCashFilters(current => ({ ...current, game })))}
        {filterSelect('Cash venue', cashFilters.venue || '', [{ id: '', label: 'All venues' }, ...[...new Set<string>(sessions.map((row: PokerCashSession) => row.venue).filter((value: string | undefined): value is string => Boolean(value)))].sort().map(venue => ({ id: venue, label: venue }))], venue => setCashFilters(current => ({ ...current, venue })))}
        {filterSelect('Sort cash sessions', cashFilters.sort, SORTS, sort => setCashFilters(current => ({ ...current, sort: sort as PokerFilters['sort'] })))}
      </div>
      <div className="poker-analysis space-y-3">{cashTiles}{profitChart}</div>
      <div className={`${BOX} poker-log`}>
        <h4 className="text-sm font-bold text-textMain">Session log <span className="ml-1 text-xs font-normal text-secondary">{sortedSessions.length} / {rangedSessions.length}</span></h4>
        <p className="mt-0.5 text-xs text-secondary">Total bought in for the session (rebuys included) and what you left with.</p>
        {sortedSessions.length === 0 ? (
          <div className="mt-3"><EmptyState text={sessions.length ? 'No sessions match this selection.' : 'No cash sessions logged yet.'} action="Log session" onAction={() => openForm('cash')} /></div>
        ) : (
          <ul className="poker-log-list mt-3 divide-y divide-border">
            {(showAll ? sortedSessions : sortedSessions.slice(0, LIST_LIMIT)).map(s => {
              const result = sessionProfit(s);
              const title = [s.game, s.venue].filter(Boolean).join(' · ') || 'Cash session';
              return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-textMain">{title}</p>
                    <p className="mt-0.5 text-[11px] text-secondary">
                      {shortDate(s.sessionDate)} · in {usd(s.buyInUsd)} · out {usd(s.cashOutUsd)}{s.durationHours ? ` · ${s.durationHours}h` : ''}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-extrabold tabular-nums ${tone(result)}`}>{signedUsd(result)}</p>
                  <div className="flex shrink-0">
                    <IconButton label={`Edit ${title}`} onClick={() => openForm('cash', s.id)}><Pencil size={14} /></IconButton>
                    <IconButton danger label={`Delete ${title}`} onClick={() => confirm(`Delete the session on ${shortDate(s.sessionDate)}?`) && props.onDeleteSession(s.id)}><Trash2 size={14} /></IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {showMore(sortedSessions.length)}
      </div>
    </div>
  );

  const sortedEvents = useMemo(() => filterPokerEvents(bankroll, range, today, eventSearch, eventFilter, eventSort), [bankroll, range, today, eventSearch, eventFilter, eventSort]);
  const bankrollView = (
    <div className="poker-two-column" data-poker-view="bankroll">
      <div className="poker-full-width flex flex-wrap items-center justify-between gap-2">
        {rangeFilter}
        {(bankrollChartMode === 'flows' || showPeriodTable) && <Segmented label="Group by" options={PERIODS} value={period} onChange={setPeriod} />}
        {addButton('bankroll', 'Log deposit')}
      </div>
      <div className="poker-full-width grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Opening bankroll" value={usd(ledger.opening)} note="Before this date range" />
        <Stat label="Closing bankroll" value={usd(ledger.closing)} note={`${signedUsd(rangeRoll.totalProfit)} results in range`} />
        <Stat label="Deposited in range" value={usd(rangeRoll.deposits)} note={home && homeRate ? `${money(rangedEvents.filter(event => event.eventType === 'Deposit').reduce((sum, event) => sum + amountIn(event, home, homeRate.rate), 0), home)} sent` : `${rangedEvents.filter(event => event.eventType === 'Deposit').length} deposits`} />
        <Stat label="Withdrawn in range" value={usd(rangeRoll.withdrawals)} note="Adjustments count in results" />
      </div>
      {home && homeRate && (
        <p className="poker-full-width text-[11px] text-secondary">
          1 USD = {homeRate.rate.toFixed(4)} {home} ({homeRate.live ? 'live rate' : 'estimated rate - live rate unavailable'}). Deposits retain the original amount sent and USD credited.
        </p>
      )}
      <div className={`${BOX} poker-analysis`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-textMain">{bankrollChartMode === 'balance' ? 'Bankroll balance' : `Cash flows by ${period}`}</h4><Segmented label="Bankroll chart type" options={[{ id: 'balance', label: 'Balance' }, { id: 'flows', label: 'Cash flows' }]} value={bankrollChartMode} onChange={setBankrollChartMode} /></div>
        <p className="mt-1 text-xs text-secondary">{bankrollChartMode === 'balance' ? `Opening balance ${usd(ledger.opening)} carried into this range.` : `Latest ${Math.min(12, periodChart.length)} active ${period}s in this range.`}</p>
        {(bankrollChartMode === 'balance' ? ledger.points.length > 0 : periodChart.length > 0) ? (
          <div className="mt-3 h-64 min-w-0" role="img" aria-label={bankrollChartMode === 'balance' ? 'Poker bankroll balance over time' : `Poker cash flows by ${period}`}>
            <ResponsiveContainer width="100%" height="100%">
              {bankrollChartMode === 'balance' ? <LineChart data={ledger.points} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} vertical={false} /><XAxis dataKey="date" tickFormatter={value => shortDate(String(value))} minTickGap={40} tick={{ fontSize: 10 }} /><YAxis width={55} tickFormatter={compact} tick={{ fontSize: 10 }} domain={['auto', 'auto']} /><ReferenceLine y={0} stroke="#64748b" /><Tooltip labelFormatter={label => shortDate(String(label))} formatter={(value: number) => usd(Number(value))} contentStyle={chartTooltip} /><Line name="Bankroll" dataKey="balance" type="stepAfter" stroke={COLORS.total} strokeWidth={2} dot={ledger.points.length === 1 ? { r: 4 } : false} isAnimationActive={false} /></LineChart> : <BarChart data={periodChart} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="label" tickFormatter={value => String(value).replace('Week of ', '')} minTickGap={20} tick={{ fontSize: 10 }} />
                <YAxis width={55} tickFormatter={compact} tick={{ fontSize: 10 }} />
                <ReferenceLine y={0} stroke="#64748b" />
                <Tooltip formatter={(value: number, key) => (key === 'Deposited' ? usd(Number(value)) : signedUsd(Number(value)))} contentStyle={chartTooltip} cursor={{ fill: 'rgba(100,116,139,0.12)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar name="Deposited" dataKey="deposits" fill={COLORS.deposits} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar name="Withdrawn" dataKey="withdrawalsNegative" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar name="Results" dataKey="profit" fill={COLORS.win} radius={[4, 4, 0, 0]} maxBarSize={28}>
                  {periodChart.map(row => <Cell key={row.key} fill={row.profit >= 0 ? COLORS.win : COLORS.loss} />)}
                </Bar>
              </BarChart>}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-3"><EmptyState text="Log a deposit to start tracking your bankroll." action="Log deposit" onAction={() => openForm('bankroll')} /></div>
        )}
        {periods.length > 0 && <button type="button" aria-expanded={showPeriodTable} onClick={() => setShowPeriodTable(value => !value)} className="mt-3 text-xs font-semibold text-primary">{showPeriodTable ? 'Hide period breakdown' : 'Show period breakdown'}</button>}
        {showPeriodTable && periods.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] whitespace-nowrap text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-secondary">
                <tr>
                  <th className="py-2 pr-3 font-bold">Period</th>
                  <th className="py-2 pr-3 text-right font-bold">Deposited{home ? ` (${home})` : ''}</th>
                  <th className="py-2 pr-3 text-right font-bold">Withdrawn{home ? ` (${home})` : ''}</th>
                  <th className="py-2 pr-3 text-right font-bold">Results</th>
                  <th className="py-2 pr-3 text-right font-bold">Profit / deposits</th>
                  <th className="py-2 pr-3 text-right font-bold">Bankroll</th>
                  <th className="py-2 font-bold">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(showAll ? periods : periods.slice(0, LIST_LIMIT)).map(row => (
                  <tr key={row.key} className="text-textMain">
                    <td className="py-2 pr-3 font-semibold">{row.label}</td>
                    <td className="py-2 pr-3 text-right tabular-nums" title={home && row.deposits ? `${usd(row.deposits)} credited` : undefined}>
                      {row.deposits ? (home ? money(row.depositsHome, home) : usd(row.deposits)) : '-'}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums" title={home && row.withdrawals ? `${usd(row.withdrawals)} paid out` : undefined}>
                      {row.withdrawals ? (home ? money(row.withdrawalsHome, home) : usd(row.withdrawals)) : '-'}
                    </td>
                    <td className={`py-2 pr-3 text-right font-bold tabular-nums ${tone(row.profit)}`}>{signedUsd(row.profit)}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${tone(row.profit)}`} title="Results / deposited in this period">{row.deposits > 0 ? signedPct(row.profit / row.deposits) : '-'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{usd(row.balance)}</td>
                    <td className="py-2 text-secondary">
                      {[row.tournaments && `${row.tournaments} MTT · ${row.itm} ITM`, row.sessions && `${row.sessions} cash`].filter(Boolean).join(' · ') || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showPeriodTable && showMore(periods.length)}
      </div>
      <div className={`${BOX} poker-log`}>
        <h4 className="text-sm font-bold text-textMain">Deposits & withdrawals</h4>
        <p className="mt-0.5 text-xs text-secondary">{sortedEvents.length} transactions in this selection. These log filters do not change the balance or charts.</p>
        <div className="mt-3 grid grid-cols-2 gap-2"><div className="col-span-2">{searchInput('Search bankroll transactions', eventSearch, setEventSearch)}</div>{filterSelect('Bankroll transaction type', eventFilter, [{ id: '', label: 'All transactions' }, ...EVENT_TYPES.map(id => ({ id, label: id }))], setEventFilter)}{filterSelect('Sort bankroll transactions', eventSort, SORTS.slice(0, 2), sort => setEventSort(sort as 'newest' | 'oldest'))}</div>
        {sortedEvents.length === 0 ? (
          <p className="mt-3 rounded-xl bg-background p-4 text-center text-xs text-secondary">No transactions match this selection.</p>
        ) : (
          <ul className="poker-log-list mt-3 divide-y divide-border">
            {(showAll ? sortedEvents : sortedEvents.slice(0, LIST_LIMIT)).map(e => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-textMain">{e.eventType}</p>
                  <p className="text-[11px] text-secondary">{shortDate(e.eventDate)}{e.notes ? ` · ${e.notes}` : ''}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-extrabold tabular-nums ${e.eventType === 'Adjustment' ? tone(e.amountUsd) : 'text-textMain'}`}>
                    {e.eventType === 'Adjustment'
                      ? signedUsd(e.amountUsd)
                      : `${e.eventType === 'Withdrawal' ? '-' : '+'}${e.currency && e.amount != null ? money(e.amount, e.currency) : usd(e.amountUsd)}`}
                  </p>
                  {e.currency && e.amount != null && (
                    <p className="text-[11px] text-secondary tabular-nums">{usd(e.amountUsd)} {e.eventType === 'Withdrawal' ? 'paid out' : 'credited'}</p>
                  )}
                </div>
                <IconButton danger label={`Delete ${e.eventType.toLowerCase()} on ${shortDate(e.eventDate)}`} onClick={() => confirm(`Delete this ${e.eventType.toLowerCase()}?`) && props.onDeleteBankrollEvent(e.id)}><Trash2 size={14} /></IconButton>
              </li>
            ))}
          </ul>
        )}
        {showMore(sortedEvents.length)}
      </div>
    </div>
  );

  // ------------------------------------------------------------------ form modal
  const field = (id: string, label: string, input: React.ReactNode, className = '') => (
    <div className={className}><label htmlFor={id} className={LABEL_CLASS}>{label}</label>{input}</div>
  );
  const moneyInput = (id: string, value: string, onChange: (value: string) => void, placeholder = '0.00', autoFocus = false) => (
    <input id={id} type="number" inputMode="decimal" min="0" step="any" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoFocus={autoFocus} className={INPUT_CLASS} />
  );

  const tournamentPreview = Number.isFinite(tournamentTotal)
    ? `Total buy-in ${usd(tournamentTotal)} · result ${signedUsd(rewardNumber + bountyNumber - tournamentTotal)}${rewardNumber > 0 ? ' · in the money' : ''}`
    : 'Enter the buy-in per entry';

  const modal = form && (
    <Modal
      title={`${form.id ? 'Edit' : 'Log'} ${form.kind === 'tournament' ? 'tournament' : form.kind === 'cash' ? 'cash session' : 'bankroll entry'}`}
      subtitle={form.kind === 'bankroll' ? 'Sent in any currency; the bankroll is kept in USD' : 'Amounts in USD'}
      onClose={() => setForm(null)}
    >
      <form onSubmit={submit} className="space-y-3">
        {form.kind === 'tournament' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {field('poker-name', 'Tournament', <input id="poker-name" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Sunday Million" className={INPUT_CLASS} />, 'col-span-2')}
              {field('poker-date', 'Date', <input id="poker-date" type="date" value={date} max={today} onChange={event => setDate(event.target.value)} className={INPUT_CLASS} />)}
              {field('poker-placement', 'Finish (optional)', <input id="poker-placement" type="number" min="1" inputMode="numeric" value={placement} onChange={event => setPlacement(event.target.value)} placeholder="e.g. 12" className={INPUT_CLASS} />)}
              {field('poker-per-entry', 'Buy-in per entry', moneyInput('poker-per-entry', perEntry, setPerEntry, '11.00'))}
              {field('poker-entries', 'Entries (re-entries incl.)', <input id="poker-entries" type="number" min="1" step="1" inputMode="numeric" value={entries} onChange={event => setEntries(event.target.value)} className={INPUT_CLASS} />)}
            </div>
            <label className="flex items-center gap-2 rounded-xl bg-background p-3 text-sm text-textMain">
              <input type="checkbox" checked={isBounty} onChange={event => setIsBounty(event.target.checked)} className="h-4 w-4 accent-[var(--color-primary,#06b6d4)]" />
              Bounty / knockout event
            </label>
            <div className="grid grid-cols-2 gap-3">
              {field('poker-reward', 'End reward', moneyInput('poker-reward', reward, setReward, '0 if no cash'), isBounty ? '' : 'col-span-2')}
              {isBounty && field('poker-bounty', 'Bounties won', moneyInput('poker-bounty', bounty, setBounty))}
            </div>
            <p className="text-[11px] text-secondary">{tournamentPreview}</p>
          </>
        )}
        {form.kind === 'cash' && (
          <div className="grid grid-cols-2 gap-3">
            {field('poker-game', 'Game', <input id="poker-game" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. NLH 1/2" className={INPUT_CLASS} />)}
            {field('poker-venue', 'Venue (optional)', <input id="poker-venue" value={venue} onChange={event => setVenue(event.target.value)} placeholder="e.g. GGPoker" className={INPUT_CLASS} />)}
            {field('poker-date', 'Date', <input id="poker-date" type="date" value={date} max={today} onChange={event => setDate(event.target.value)} className={INPUT_CLASS} />)}
            {field('poker-hours', 'Hours (optional)', <input id="poker-hours" type="number" min="0" step="0.25" inputMode="decimal" value={hours} onChange={event => setHours(event.target.value)} placeholder="e.g. 2.5" className={INPUT_CLASS} />)}
            {field('poker-buy-in', 'Total buy-in', moneyInput('poker-buy-in', buyIn, setBuyIn, '200.00'))}
            {field('poker-cash-out', 'Cash-out', moneyInput('poker-cash-out', cashOut, setCashOut, '0 if busted'))}
            <p className="col-span-2 text-[11px] text-secondary">
              {cashValid ? <>Result <span className={`font-bold ${tone(cashOutNumber - buyInNumber)}`}>{signedUsd(cashOutNumber - buyInNumber)}</span></> : 'Enter the buy-in and cash-out'}
            </p>
          </div>
        )}
        {form.kind === 'bankroll' && (
          <div className="grid grid-cols-2 gap-3">
            {field('poker-event-type', 'Type', (
              <select id="poker-event-type" value={eventType} onChange={event => setEventType(event.target.value as PokerMttBankrollEventType)} className={INPUT_CLASS}>
                {EVENT_TYPES.map(type => <option key={type}>{type}</option>)}
              </select>
            ))}
            {field('poker-date', 'Date', <input id="poker-date" type="date" value={date} max={today} onChange={event => setDate(event.target.value)} className={INPUT_CLASS} />)}
            {eventType !== 'Adjustment' && field('poker-currency', 'Sent in', (
              <select id="poker-currency" value={depositCurrency} onChange={event => { setDepositCurrency(event.target.value); setUsdCredited(''); loadRate(event.target.value); }} className={INPUT_CLASS}>
                {CURRENCIES.map(code => <option key={code}>{code}</option>)}
              </select>
            ))}
            {field('poker-amount', eventType === 'Adjustment' ? 'Amount in USD (negative to reduce)' : `Amount (${eventCurrency})`, (
              <input id="poker-amount" autoFocus type="number" inputMode="decimal" step="any" min={eventType === 'Adjustment' ? undefined : '0'} value={amount} onChange={event => setAmount(event.target.value)} placeholder={eventCurrency === 'USD' ? '100.00' : '500.00'} className={INPUT_CLASS} />
            ), eventType === 'Adjustment' ? 'col-span-2' : '')}
            {eventCurrency !== 'USD' && (
              <>
                {field('poker-usd-credited', `USD ${eventType === 'Withdrawal' ? 'paid out' : 'credited'}`, (
                  <input
                    id="poker-usd-credited"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={usdCredited}
                    onChange={event => setUsdCredited(event.target.value)}
                    placeholder={Number.isFinite(estimatedUsd) ? estimatedUsd.toFixed(2) : '0.00'}
                    className={INPUT_CLASS}
                  />
                ), 'col-span-2')}
                <p className="col-span-2 -mt-1 text-[11px] text-secondary">
                  1 USD = {formRate.rate.toFixed(4)} {eventCurrency} ({formRate.live ? 'live' : 'estimated'}). Leave USD blank to use this rate, or type what the site actually {eventType === 'Withdrawal' ? 'paid out' : 'credited'} after fees.
                </p>
              </>
            )}
          </div>
        )}
        {field('poker-notes', 'Notes (optional)', <input id="poker-notes" value={notes} onChange={event => setNotes(event.target.value)} className={INPUT_CLASS} />)}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setForm(null)} className="flex-1 rounded-xl border border-border py-3 text-sm font-bold text-secondary hover:text-textMain">Cancel</button>
          <button
            type="submit"
            disabled={form.kind === 'tournament' ? !tournamentValid : form.kind === 'cash' ? !cashValid : !bankrollValid}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {form.id ? 'Save changes' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );

  return (
    <section className="poker-panel min-w-0 bg-surface rounded-2xl border border-border p-4 shadow-sm space-y-4" aria-labelledby="poker-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Poker</p>
          <h3 id="poker-heading" className="mt-1 flex flex-wrap items-center gap-2 text-lg font-extrabold text-textMain">
            <Wallet size={18} style={{ color: COLORS.total }} />Bankroll {usd(roll.bankroll)}
            {homeStats && home && <span className="text-sm font-semibold text-secondary">≈ {money(homeStats.valueNow, home)}</span>}
          </h3>
          <p className="mt-1 text-xs text-secondary">All-time bankroll · {home ? `results in USD, deposits sent in ${home}.` : 'tournaments, cash games and deposits in USD.'}</p>
        </div>
        <Segmented label="Poker view" options={VIEWS} value={view} onChange={switchView} />
      </div>
      {view === 'overview' && overview}
      {view === 'tournaments' && tournamentsView}
      {view === 'cash' && cashView}
      {view === 'bankroll' && bankrollView}
      {modal}
    </section>
  );
};

export default PokerPanel;
