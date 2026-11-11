import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Flame, Loader2, Plus, RefreshCw } from 'lucide-react';
import type { HotStocksResponse } from '../server/hotStocks';
import { DEFAULT_HOT_FILTERS, compactUsd, fetchHotStocks, rankHotStocks, type HotDirection, type HotFilters, type HotSort, type HotStock } from '../services/hotStocks';
import { normalizeTickerSymbol } from '../services/stockQuoteService';
import type { TradeRules } from '../services/tradingMath';
import { INPUT_CLASS, LABEL_CLASS, Panel } from './tradeUi';
import InvestmentLogo from './InvestmentLogo';

interface TradeHotPanelProps {
  rules: TradeRules;
  onSaveRules: (rules: TradeRules) => void;
  onPlan: (symbol: string) => void;
}

const SORT_OPTIONS: Array<{ id: HotSort; label: string }> = [
  { id: 'score', label: 'Hot score' },
  { id: 'rvol', label: 'Relative volume' },
  { id: 'dollarVolume', label: '$ traded' },
  { id: 'move', label: 'Biggest move' },
  { id: 'range', label: 'Day range' },
];
const LIQUIDITY_OPTIONS = [20e6, 50e6, 100e6, 500e6, 1e9];
const DIRECTIONS: Array<{ id: HotDirection; label: string }> = [{ id: 'all', label: 'All' }, { id: 'up', label: 'Gainers' }, { id: 'down', label: 'Losers' }];
const MARKET_STATE: Record<string, string> = { REGULAR: 'Market open', PRE: 'Pre-market', PREPRE: 'Pre-market', POST: 'After hours', POSTPOST: 'After hours', CLOSED: 'Market closed' };
const SHOWN = 30;

const pct = (value: number | null, digits = 1, signed = false) => value === null ? '—' : `${signed && value > 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;

const Metric: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone = 'text-textMain' }) => (
  <div className="min-w-0 rounded-xl bg-background px-2 py-1.5">
    <p className="truncate text-[9px] font-bold uppercase tracking-wide text-secondary">{label}</p>
    <p className={`mt-0.5 truncate text-xs font-black tabular-nums ${tone}`}>{value}</p>
  </div>
);

const TradeHotPanel: React.FC<TradeHotPanelProps> = ({ rules, onSaveRules, onPlan }) => {
  const [data, setData] = useState<HotStocksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<HotFilters>(DEFAULT_HOT_FILTERS);
  const [sort, setSort] = useState<HotSort>('score');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const next = await fetchHotStocks(signal);
      if (!signal?.aborted) setData(next);
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Could not load hot stocks.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const marketState = useMemo(() => {
    const counts = new Map<string, number>();
    for (const quote of data?.quotes || []) if (quote.marketState) counts.set(quote.marketState, (counts.get(quote.marketState) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [data]);

  // Refresh every minute while the market is open and this tab is visible.
  useEffect(() => {
    if (marketState !== 'REGULAR') return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60000);
    return () => window.clearInterval(timer);
  }, [marketState, load]);

  const ranked = useMemo(() => rankHotStocks(data?.quotes || [], filters, sort, data?.fetchedAt), [data, filters, sort]);
  const watchlist = useMemo(() => new Set(rules.watchlist.map(normalizeTickerSymbol)), [rules.watchlist]);
  const watch = (symbol: string) => onSaveRules({ ...rules, watchlist: Array.from(new Set([...rules.watchlist, symbol])) });

  const card = (stock: HotStock, rank: number) => {
    const watched = watchlist.has(normalizeTickerSymbol(stock.symbol));
    return (
      <li key={stock.symbol} className="flex flex-col rounded-2xl border border-border bg-surface p-3" data-hot-symbol={stock.symbol}>
        <div className="flex items-start gap-2.5">
          <span className="mt-1 w-5 shrink-0 text-center text-[10px] font-black text-secondary">{rank}</span>
          <InvestmentLogo investment={{ kind: 'Stocks', symbol: stock.symbol, name: stock.name, color: '#3b82f6' }} className="h-9 w-9 shrink-0 rounded-xl !p-1 !text-[10px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-textMain">{stock.symbol} <span className="font-semibold text-secondary">{stock.name}</span></p>
            <p className="mt-0.5 text-xs tabular-nums">
              <span className="font-bold text-textMain">{stock.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={`ml-1.5 font-bold ${stock.changePct > 0 ? 'text-emerald-500' : stock.changePct < 0 ? 'text-red-500' : 'text-secondary'}`}>{pct(stock.changePct, 2, true)}</span>
            </p>
          </div>
          <div className="shrink-0 text-right" title="Hot score: liquidity 30%, relative volume 30%, day range 20%, move 10%, spread 10%">
            <p className={`text-lg font-black tabular-nums leading-none ${stock.score >= 70 ? 'text-orange-500' : stock.score >= 50 ? 'text-amber-500' : 'text-secondary'}`}>{stock.score}</p>
            <p className="text-[9px] font-bold uppercase tracking-wide text-secondary">score</p>
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          <Metric label="Traded" value={compactUsd(stock.dollarVolume)} />
          <Metric label="Rel. vol" value={stock.rvol === null ? '—' : `${stock.rvol.toFixed(1)}×`} tone={stock.rvol !== null && stock.rvol >= 2 ? 'text-orange-500' : 'text-textMain'} />
          <Metric label="Range" value={pct(stock.rangePct)} />
          <Metric label="Spread" value={pct(stock.spreadPct, 2)} tone={stock.spreadPct !== null && stock.spreadPct > 0.005 ? 'text-amber-500' : 'text-textMain'} />
        </div>
        {(stock.reasons.length > 0 || stock.flags.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {stock.reasons.map(reason => <span key={reason} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{reason}</span>)}
            {stock.flags.map(flag => <span key={flag} className="flex items-center gap-0.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400"><AlertTriangle size={10} />{flag}</span>)}
          </div>
        )}
        <div className="mt-auto flex gap-2 pt-3">
          <button type="button" onClick={() => onPlan(stock.symbol)} className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">Plan trade</button>
          <button type="button" disabled={watched} onClick={() => watch(stock.symbol)} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-primary hover:border-primary disabled:text-secondary disabled:hover:border-border">
            {watched ? <><Check size={13} /> Watching</> : <><Plus size={13} /> Watchlist</>}
          </button>
        </div>
      </li>
    );
  };

  const updated = data ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <Panel
      eyebrow="Liquid · in play"
      title="Hot stocks"
      action={(
        <div className="flex items-center gap-2">
          {data && <span className="text-[11px] text-secondary">{marketState ? `${MARKET_STATE[marketState] || marketState} · ` : ''}updated {updated}</span>}
          <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
          </button>
        </div>
      )}
    >
      <p className="text-xs text-secondary">
        US stocks from the most active and biggest-mover lists, kept only if they're <strong className="text-textMain">liquid</strong> (lots of money traded on a typical day, so you can get in and out at a fair price) and ranked by how <strong className="text-textMain">in play</strong> they are today: trading more than usual, moving in a wide range, with a tight bid-ask spread.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className={LABEL_CLASS} htmlFor="hot-sort">Sort by</label>
          <select id="hot-sort" value={sort} onChange={event => setSort(event.target.value as HotSort)} className={INPUT_CLASS}>
            {SORT_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="hot-liquidity">Typical day traded</label>
          <select id="hot-liquidity" value={filters.minAvgDollarVolume} onChange={event => setFilters(current => ({ ...current, minAvgDollarVolume: Number(event.target.value) }))} className={INPUT_CLASS}>
            {LIQUIDITY_OPTIONS.map(value => <option key={value} value={value}>{compactUsd(value)}+</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="hot-price">Min price ($)</label>
          <input id="hot-price" type="number" min="0" step="1" value={filters.minPrice} onChange={event => setFilters(current => ({ ...current, minPrice: Math.max(0, Number(event.target.value) || 0) }))} className={INPUT_CLASS} />
        </div>
        <div>
          <span className={LABEL_CLASS}>Direction</span>
          <div className="flex rounded-xl border border-border bg-background p-0.5" role="group" aria-label="Direction">
            {DIRECTIONS.map(option => (
              <button key={option.id} type="button" aria-pressed={filters.direction === option.id} onClick={() => setFilters(current => ({ ...current, direction: option.id }))}
                className={`flex-1 rounded-lg px-2 py-2 text-xs font-bold ${filters.direction === option.id ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}>{option.label}</button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p>}
      {data && marketState && marketState !== 'REGULAR' && <p className="mt-3 text-[11px] text-secondary">The US market isn't open, so this ranks the last session. Relative volume and the open will reset once trading starts at 09:30 New York.</p>}
      {data && data.failedLists.length > 0 && <p className="mt-3 text-[11px] text-amber-600 dark:text-amber-400">Some lists didn't load ({data.failedLists.join(', ').replaceAll('_', ' ')}), so a few movers may be missing.</p>}
      {loading && !data && <div className="flex items-center justify-center gap-2 py-12 text-sm text-secondary"><Loader2 size={16} className="animate-spin" /> Finding what's in play…</div>}
      {data && ranked.length === 0 && <p className="py-10 text-center text-sm text-secondary">No stocks pass these filters right now. Try a lower liquidity bar or price.</p>}

      {ranked.length > 0 && (
        <>
          <p className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-secondary"><Flame size={13} className="text-orange-500" /> {ranked.length} of {data!.quotes.length} pass your filters</p>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="hot-stocks">
            {(showAll ? ranked : ranked.slice(0, SHOWN)).map((stock, index) => card(stock, index + 1))}
          </ul>
          {ranked.length > SHOWN && <button type="button" onClick={() => setShowAll(value => !value)} className="mt-2 w-full rounded-xl py-2 text-xs font-bold text-primary hover:bg-primary/5">{showAll ? 'Show fewer' : `Show all ${ranked.length}`}</button>}
        </>
      )}

      <p className="mt-4 text-[10px] leading-relaxed text-secondary">
        Yahoo Finance quotes, delayed up to 15 minutes. Relative volume compares today with the 10-day average, pro-rated for the time of day while the market is open; spreads only show during the regular session. Outside it, the numbers are from the last session. A hot stock is one that's moving, not one that will keep moving - set your stop with Plan trade before entering, and paper-trade first.
      </p>
    </Panel>
  );
};

export default TradeHotPanel;
