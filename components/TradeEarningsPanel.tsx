import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Crosshair, Loader2, Moon, Plus, Search, Sun, X } from 'lucide-react';
import { getInvestmentLogoUrls } from '../services/investmentLogoService';
import { normalizeTickerSymbol } from '../services/stockQuoteService';
import {
  EARNINGS_TIME_LABELS, defaultWeekStart, earningsResult, fetchEarningsWeek, filterEarnings, formatEps, formatMarketCap, groupEarnings, shiftWeek, weekDays,
  type EarningsEvent, type EarningsTime, type EarningsWeek,
} from '../services/earningsCalendarService';
import type { TradeRules } from '../services/tradingMath';
import { INPUT_CLASS, Panel, nyNow } from './tradeUi';

interface TradeEarningsPanelProps {
  rules: TradeRules;
  holdingSymbols: string[];
  onSaveRules: (rules: TradeRules) => void;
  onPlan: (symbol: string) => void;
}

const CAP_FILTERS = [
  { value: 0, label: 'Any size' },
  { value: 2e9, label: '$2B+' },
  { value: 10e9, label: '$10B+' },
  { value: 100e9, label: '$100B+' },
];
const SLOT_ICONS: Record<EarningsTime, React.ElementType | null> = { bmo: Sun, amc: Moon, unknown: null };
const SLOT_PREVIEW = 12;

const dayLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...options });

const TickerLogo: React.FC<{ symbol: string; className?: string }> = ({ symbol, className = 'h-8 w-8' }) => {
  const candidates = useMemo(() => getInvestmentLogoUrls('Stocks', symbol), [symbol]);
  const [failed, setFailed] = useState<string[]>([]);
  const source = candidates.find(candidate => !failed.includes(candidate));
  return source ? (
    <span className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1`}>
      <img src={source} alt="" className="h-full w-full object-contain" loading="lazy" decoding="async" referrerPolicy="origin"
        onError={() => setFailed(previous => [...previous, source])} />
    </span>
  ) : (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-lg bg-slate-500 text-[10px] font-black text-white`}>{symbol.slice(0, 2)}</span>
  );
};

const RESULT_TONES = { beat: 'bg-emerald-500', miss: 'bg-red-500', inline: 'bg-slate-400', pending: '' };

const TradeEarningsPanel: React.FC<TradeEarningsPanelProps> = ({ rules, holdingSymbols, onSaveRules, onPlan }) => {
  const today = nyNow().day;
  const [weekStart, setWeekStart] = useState(() => defaultWeekStart(today));
  const [week, setWeek] = useState<EarningsWeek | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [minMarketCap, setMinMarketCap] = useState(10e9);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<EarningsEvent | null>(null);
  const cache = useRef(new Map<string, EarningsWeek>());

  const watchlist = useMemo(() => new Set(rules.watchlist.map(normalizeTickerSymbol)), [rules.watchlist]);
  const mine = useMemo(() => new Set([...watchlist, ...holdingSymbols.map(normalizeTickerSymbol)]), [watchlist, holdingSymbols]);

  useEffect(() => {
    const cached = cache.current.get(weekStart);
    setSelected(null);
    setExpanded([]);
    setError('');
    if (cached) { setWeek(cached); return; }
    const controller = new AbortController();
    setLoading(true);
    fetchEarningsWeek(weekStart, controller.signal)
      .then(data => { if (!data.failedDays.length) cache.current.set(weekStart, data); setWeek(data); })
      .catch(reason => { if (!controller.signal.aborted) { setWeek(null); setError(reason instanceof Error ? reason.message : 'Could not load the earnings calendar.'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [weekStart]);

  const days = week?.days || weekDays(weekStart);
  // "My tickers" ignores the size filter - a small holding is still worth knowing about.
  const visible = useMemo(() => filterEarnings(week?.events || [], { mine: mineOnly ? mine : null, minMarketCap: mineOnly ? 0 : minMarketCap, query }), [week, mineOnly, mine, minMarketCap, query]);
  const groups = useMemo(() => groupEarnings(visible, days), [visible, days]);
  const mineThisWeek = useMemo(() => (week?.events || []).filter(event => mine.has(event.symbol)), [week, mine]);
  const thisWeek = defaultWeekStart(today);

  return (
    <Panel
      eyebrow="Plan around reports"
      title="Earnings calendar"
      action={(
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setWeekStart(shiftWeek(weekStart, -1))} aria-label="Previous week" className="rounded-lg border border-border p-2 text-secondary hover:text-textMain"><ChevronLeft size={15} /></button>
          <span className="min-w-[132px] text-center text-sm font-bold tabular-nums text-textMain">
            {dayLabel(days[0], { month: 'short', day: 'numeric' })} – {dayLabel(days[4], { month: 'short', day: 'numeric' })}
          </span>
          <button type="button" onClick={() => setWeekStart(shiftWeek(weekStart, 1))} aria-label="Next week" className="rounded-lg border border-border p-2 text-secondary hover:text-textMain"><ChevronRight size={15} /></button>
          {weekStart !== thisWeek && <button type="button" onClick={() => setWeekStart(thisWeek)} className="ml-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-primary hover:border-primary">This week</button>}
        </div>
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-border bg-background p-1" role="group" aria-label="Which companies">
          {[{ id: false, label: 'All' }, { id: true, label: `My tickers${mineThisWeek.length ? ` (${mineThisWeek.length})` : ''}` }].map(option => (
            <button key={String(option.id)} type="button" aria-pressed={mineOnly === option.id} onClick={() => setMineOnly(option.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mineOnly === option.id ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}>
              {option.label}
            </button>
          ))}
        </div>
        <select value={minMarketCap} onChange={event => setMinMarketCap(Number(event.target.value))} disabled={mineOnly} aria-label="Minimum market cap"
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-textMain disabled:opacity-40 [color-scheme:light] dark:[color-scheme:dark]">
          {CAP_FILTERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <div className="relative min-w-[160px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a ticker or company" aria-label="Find a ticker or company" className={`${INPUT_CLASS} !py-2 pl-8 text-xs`} />
        </div>
      </div>

      {selected && (
        <EarningsDetail event={selected} watched={watchlist.has(selected.symbol)} held={mine.has(selected.symbol) && !watchlist.has(selected.symbol)}
          onClose={() => setSelected(null)} onPlan={() => onPlan(selected.symbol)}
          onWatch={() => onSaveRules({ ...rules, watchlist: Array.from(new Set([...rules.watchlist, selected.symbol])) })} />
      )}

      {error && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p>}
      {week && week.failedDays.length > 0 && (
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Couldn't load {week.failedDays.map(day => dayLabel(day, { weekday: 'long' })).join(', ')} - try again shortly.
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-secondary"><Loader2 size={18} className="animate-spin" /> Loading earnings…</div>
      ) : week && (
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          {days.map(day => {
            const slots = groups.get(day)!;
            const count = slots.bmo.length + slots.amc.length + slots.unknown.length;
            return (
              <div key={day} className={`min-w-0 rounded-2xl border bg-background p-3 ${day === today ? 'border-primary' : 'border-border'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-extrabold text-textMain">
                    {dayLabel(day, { weekday: 'short' })} <span className="font-semibold text-secondary">{dayLabel(day, { month: 'short', day: 'numeric' })}</span>
                  </p>
                  <span className="text-[10px] font-bold text-secondary">{day === today ? 'Today · ' : ''}{count}</span>
                </div>
                {count === 0 && <p className="mt-3 text-[11px] text-secondary">No reports{mineOnly || minMarketCap || query ? ' match' : ''}.</p>}
                {(['bmo', 'amc', 'unknown'] as const).map(slot => {
                  const list = slots[slot];
                  if (list.length === 0) return null;
                  const key = `${day}-${slot}`;
                  const shown = expanded.includes(key) ? list : list.slice(0, SLOT_PREVIEW);
                  const Icon = SLOT_ICONS[slot];
                  return (
                    <div key={slot} className="mt-3">
                      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-secondary">
                        {Icon && <Icon size={11} />} {EARNINGS_TIME_LABELS[slot]} · {list.length}
                      </p>
                      <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-3">
                        {shown.map(event => {
                          const result = earningsResult(event);
                          const isSelected = selected?.symbol === event.symbol && selected.date === event.date;
                          return (
                            <button key={event.symbol} type="button" onClick={() => setSelected(isSelected ? null : event)} title={`${event.name} · ${formatMarketCap(event.marketCap)}`}
                              className={`relative flex min-w-0 flex-col items-center gap-1 rounded-xl border bg-surface px-1 py-1.5 hover:border-primary ${isSelected ? 'border-primary ring-1 ring-primary' : mine.has(event.symbol) ? 'border-primary/60' : 'border-border'}`}>
                              <TickerLogo symbol={event.symbol} />
                              <span className="w-full truncate text-center text-[10px] font-bold text-textMain">{event.symbol}</span>
                              {result !== 'pending' && <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${RESULT_TONES[result]}`} aria-label={result} />}
                            </button>
                          );
                        })}
                      </div>
                      {list.length > SLOT_PREVIEW && (
                        <button type="button" onClick={() => setExpanded(previous => (previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key]))}
                          className="mt-1.5 text-[11px] font-bold text-primary">
                          {expanded.includes(key) ? 'Show fewer' : `+${list.length - SLOT_PREVIEW} more`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[10px] text-secondary">
        From Nasdaq's public earnings calendar, unofficial and sometimes late to update - confirm the date on the company's investor-relations page. Highlighted tiles are your watchlist and holdings; a dot shows a beat (green) or miss (red) against the EPS estimate. Gaps around earnings can blow straight through a stop.
      </p>
    </Panel>
  );
};

const EarningsDetail: React.FC<{ event: EarningsEvent; watched: boolean; held: boolean; onClose: () => void; onPlan: () => void; onWatch: () => void }> = ({ event, watched, held, onClose, onPlan, onWatch }) => {
  const result = earningsResult(event);
  const facts = [
    { label: 'Market cap', value: formatMarketCap(event.marketCap) },
    { label: 'Quarter', value: event.fiscalQuarter || '—' },
    { label: 'EPS estimate', value: formatEps(event.epsEstimate), note: event.estimateCount ? `${event.estimateCount} analyst${event.estimateCount === 1 ? '' : 's'}` : undefined },
    { label: 'Year ago EPS', value: formatEps(event.lastYearEps), note: event.lastYearDate || undefined },
    ...(result === 'pending' ? [] : [{
      label: 'Reported EPS',
      value: formatEps(event.eps),
      note: event.surprisePct === null ? undefined : `${event.surprisePct > 0 ? '+' : ''}${event.surprisePct.toFixed(1)}% surprise`,
      tone: result === 'beat' ? 'text-emerald-500' : result === 'miss' ? 'text-red-500' : 'text-textMain',
    }]),
  ];
  return (
    <div className="mt-4 rounded-2xl border border-primary/40 bg-background p-4">
      <div className="flex items-start gap-3">
        <TickerLogo symbol={event.symbol} className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold text-textMain">{event.symbol} <span className="text-sm font-semibold text-secondary">{event.name}</span></p>
          <p className="text-xs text-secondary">{dayLabel(event.date, { weekday: 'long', month: 'short', day: 'numeric' })} · {EARNINGS_TIME_LABELS[event.time]}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className="text-secondary hover:text-textMain"><X size={16} /></button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {facts.map(fact => (
          <div key={fact.label} className="rounded-xl border border-border bg-surface px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-secondary">{fact.label}</p>
            <p className={`mt-0.5 text-sm font-extrabold tabular-nums ${'tone' in fact && fact.tone ? fact.tone : 'text-textMain'}`}>{fact.value}</p>
            {fact.note && <p className="text-[10px] text-secondary">{fact.note}</p>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onPlan} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white"><Crosshair size={13} /> Plan a trade</button>
        {watched ? <span className="self-center text-xs text-secondary">On your watchlist</span>
          : held ? <span className="self-center text-xs text-secondary">In your holdings</span>
            : <button type="button" onClick={onWatch} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-primary hover:border-primary"><Plus size={13} /> Add to watchlist</button>}
      </div>
    </div>
  );
};

export default TradeEarningsPanel;
