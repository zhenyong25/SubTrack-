import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Search, X } from 'lucide-react';
import { CANDLESTICK_PATTERNS, exampleWithContext, findPatterns, patternSize, type Bar, type CandlestickPattern, type PatternFamily, type PatternMatch, type PatternSignal } from '../services/candlestickPatterns';
import { fetchStockIntradayHistory, normalizeTickerSymbol, type StockCandle } from '../services/stockQuoteService';
import type { TradeRules } from '../services/tradingMath';
import { INPUT_CLASS, Panel } from './tradeUi';

// Trade → Patterns: every common candlestick pattern drawn out. Click one for how to recognise
// it, what it suggests and how to confirm it. Checking a ticker scans its last three months of
// daily candles and marks where each pattern appeared.

const SIGNAL_STYLE: Record<PatternSignal, string> = {
  bullish: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  bearish: 'bg-red-500/10 text-red-600 dark:text-red-400',
  neutral: 'bg-slate-500/10 text-secondary',
};
const SIGNAL_LABEL: Record<PatternSignal, string> = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };
const FAMILIES: PatternFamily[] = ['Single candle', 'Two candles', 'Three candles', 'Four candles', 'Five candles'];
const RECENT = 10; // sessions counted as "recent" on a checked ticker
const byId = new Map(CANDLESTICK_PATTERNS.map(pattern => [pattern.id, pattern]));
const dayLabel = (timestamp: number) => new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'America/New_York' });

// Candles drawn to fill the width. Candles outside `focus` are faded; `bands` shade pattern spans.
const CandleChart: React.FC<{ bars: Bar[]; focus?: Set<number>; bands?: Array<[number, number]>; height: number; label: string }> = ({ bars, focus, bands = [], height, label }) => {
  const high = Math.max(...bars.map(bar => bar.high));
  const low = Math.min(...bars.map(bar => bar.low));
  const pad = (high - low) * 0.08 || 1;
  const y = (price: number) => ((high + pad - price) / (high - low + pad * 2)) * 100;
  const step = 10;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${bars.length * step} 100`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
      {bands.map(([start, end], n) => <rect key={n} x={start * step} width={(end - start + 1) * step} y={0} height={100} fill="var(--color-primary)" fillOpacity={0.14} />)}
      {bars.map((bar, index) => {
        const up = bar.close > bar.open;
        const flat = Math.abs(bar.close - bar.open) <= Math.max((bar.high - bar.low) * 0.1, (high - low) * 0.004);
        const colour = flat ? 'var(--color-text-main, #94a3b8)' : up ? '#10b981' : '#ef4444';
        const top = y(Math.max(bar.open, bar.close));
        const x = index * step + step / 2;
        return (
          <g key={index} opacity={focus && !focus.has(index) ? 0.3 : 1}>
            <line x1={x} x2={x} y1={y(bar.high)} y2={y(bar.low)} stroke={colour} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <rect x={index * step + step * 0.2} width={step * 0.6} y={top} height={Math.max(y(Math.min(bar.open, bar.close)) - top, 0.8)} fill={colour} />
          </g>
        );
      })}
    </svg>
  );
};

const exampleFocus = (pattern: CandlestickPattern) => {
  const bars = exampleWithContext(pattern);
  return { bars, focus: new Set(bars.map((_, index) => index).slice(-patternSize(pattern))) };
};

interface Checked { symbol: string; candles: StockCandle[]; matches: PatternMatch[] }

const TradePatternsPanel: React.FC<{ rules: TradeRules }> = ({ rules }) => {
  const [signal, setSignal] = useState<PatternSignal | 'all'>('all');
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<PatternFamily | ''>('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState(rules.watchlist[0] || '');
  const [checked, setChecked] = useState<Checked | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const check = async (raw = symbol) => {
    const next = normalizeTickerSymbol(raw);
    if (!next) { setError('Enter a ticker first.'); return; }
    setSymbol(next); setLoading(true); setError('');
    try {
      const history = await fetchStockIntradayHistory(next, '1d', undefined, '3mo');
      const candles = history.candles.filter(bar => [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite));
      if (candles.length < 10) throw new Error(`Not enough daily candles for ${next}.`);
      setChecked({ symbol: next, candles, matches: findPatterns(candles) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that ticker.');
    } finally { setLoading(false); }
  };

  const recent = useMemo(() => checked ? checked.matches.filter(match => match.index >= checked.candles.length - RECENT) : [], [checked]);
  const lastSeen = useMemo(() => {
    const seen = new Map<string, PatternMatch>();
    recent.forEach(match => { if (!seen.has(match.patternId)) seen.set(match.patternId, match); });
    return seen;
  }, [recent]);

  const visible = CANDLESTICK_PATTERNS.filter(pattern => (signal === 'all' || pattern.signal === signal) && (!family || pattern.family === family)
    && (!query.trim() || `${pattern.name} ${pattern.aka || ''} ${pattern.family} ${pattern.kind}`.toLowerCase().includes(query.trim().toLowerCase())));
  const open = openId ? byId.get(openId) : undefined;
  const sessionsAgo = (match: PatternMatch) => checked!.candles.length - 1 - match.index;
  const agoText = (match: PatternMatch) => { const ago = sessionsAgo(match); return ago === 0 ? 'latest candle' : `${ago} session${ago === 1 ? '' : 's'} ago`; };

  return (
    <div className="space-y-4">
      <Panel eyebrow="Spot them on a chart" title="Check a ticker">
        <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void check(); }}>
          <input value={symbol} onChange={event => setSymbol(event.target.value.toUpperCase())} placeholder="Ticker, e.g. AAPL" aria-label="Ticker to check" className={`${INPUT_CLASS} max-w-[12rem]`} />
          <button type="submit" disabled={loading} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Check
          </button>
          {rules.watchlist.slice(0, 8).map(item => (
            <button key={item} type="button" onClick={() => void check(item)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${checked?.symbol === item ? 'border-primary text-primary' : 'border-border text-secondary hover:text-textMain'}`}>{item}</button>
          ))}
        </form>
        {error && <p role="alert" className="mt-3 text-xs text-red-500">{error}</p>}
        {checked && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-border bg-background p-2">
              <CandleChart
                bars={checked.candles.slice(-40)} height={150} label={`${checked.symbol} daily candles`}
                bands={recent.map(match => [match.start, match.index].map(i => i - Math.max(0, checked.candles.length - 40)) as [number, number])}
              />
              <p className="mt-1 flex justify-between text-[10px] text-secondary"><span>{dayLabel(checked.candles[Math.max(0, checked.candles.length - 40)].timestamp)}</span><span>{checked.symbol} · daily · last 40 sessions</span><span>{dayLabel(checked.candles.at(-1)!.timestamp)}</span></p>
            </div>
            <div>
              <p className="text-xs font-bold text-textMain">Found in the last {RECENT} sessions</p>
              {recent.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {recent.map(match => { const pattern = byId.get(match.patternId)!; return (
                    <button key={`${match.patternId}-${match.index}`} type="button" onClick={() => setOpenId(pattern.id)} className={`rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold ${SIGNAL_STYLE[pattern.signal]}`}>
                      {pattern.name} <span className="font-normal opacity-80">· {dayLabel(checked.candles[match.index].timestamp)}</span>
                    </button>
                  ); })}
                </div>
              ) : <p className="mt-1 text-xs text-secondary">No patterns on {checked.symbol}'s recent daily candles.</p>}
            </div>
          </div>
        )}
        <p className="mt-3 text-[10px] text-secondary">Patterns are matched with fixed textbook rules on delayed daily candles. A match is a shape, not a buy or sell signal.</p>
      </Panel>

      <Panel eyebrow="Learn the shapes" title={`Candlestick patterns · ${visible.length}`} action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-border bg-background p-1" role="group" aria-label="Pattern signal">
            {(['all', 'bullish', 'bearish', 'neutral'] as const).map(item => (
              <button key={item} type="button" aria-pressed={signal === item} onClick={() => setSignal(item)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${signal === item ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}>
                {item === 'all' ? 'All' : SIGNAL_LABEL[item]}
              </button>
            ))}
          </div>
          <select value={family} onChange={event => setFamily(event.target.value as PatternFamily | '')} aria-label="Pattern size" className={`${INPUT_CLASS} w-auto py-1.5`}>
            <option value="">Any size</option>
            {FAMILIES.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search patterns" aria-label="Search patterns" className={`${INPUT_CLASS} w-40 py-1.5`} />
        </div>
      }>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map(pattern => {
            const { bars, focus } = exampleFocus(pattern);
            const seen = lastSeen.get(pattern.id);
            return (
              <button key={pattern.id} type="button" onClick={() => setOpenId(pattern.id)} className="group flex flex-col rounded-2xl border border-border bg-background p-3 text-left transition-colors hover:border-primary">
                <CandleChart bars={bars} focus={focus} height={96} label={`${pattern.name} example`} />
                <p className="mt-2 text-sm font-bold text-textMain group-hover:text-primary">{pattern.name}</p>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold">
                  <span className={`rounded-full px-2 py-0.5 ${SIGNAL_STYLE[pattern.signal]}`}>{SIGNAL_LABEL[pattern.signal]}</span>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-secondary">{pattern.family}</span>
                </div>
                {seen && checked && <p className="mt-1.5 text-[10px] font-semibold text-primary">On {checked.symbol} · {agoText(seen)}</p>}
              </button>
            );
          })}
        </div>
        {!visible.length && <p className="text-sm text-secondary">No patterns match that search.</p>}
      </Panel>

      {open && <PatternDetail pattern={open} checked={checked} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
    </div>
  );
};

const PatternDetail: React.FC<{ pattern: CandlestickPattern; checked: Checked | null; onClose: () => void; onOpen: (id: string) => void }> = ({ pattern, checked, onClose, onOpen }) => {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const { bars, focus } = exampleFocus(pattern);
  const found = checked ? checked.matches.filter(match => match.patternId === pattern.id) : [];
  const windowStart = checked ? Math.max(0, checked.candles.length - 60) : 0;
  const shown = found.filter(match => match.start >= windowStart);
  const opposite = CANDLESTICK_PATTERNS.filter(item => item.id !== pattern.id && item.family === pattern.family && item.signal !== pattern.signal && item.signal !== 'neutral' && pattern.signal !== 'neutral').slice(0, 3);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="pattern-title" onClick={event => event.stopPropagation()} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{pattern.family} · {pattern.kind}</p>
            <h3 id="pattern-title" className="mt-1 text-xl font-extrabold text-textMain">{pattern.name}</h3>
            <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold">
              <span className={`rounded-full px-2 py-0.5 ${SIGNAL_STYLE[pattern.signal]}`}>{SIGNAL_LABEL[pattern.signal]}</span>
              <span className="rounded-full bg-background px-2 py-0.5 text-secondary">Reliability: {pattern.reliability}</span>
              {pattern.trend && <span className="rounded-full bg-background px-2 py-0.5 text-secondary">Needs a prior {pattern.trend === 'up' ? 'rally' : 'decline'}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-secondary hover:text-textMain"><X size={18} /></button>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-background p-3">
          <CandleChart bars={bars} focus={focus} bands={[[bars.length - patternSize(pattern), bars.length - 1]]} height={170} label={`${pattern.name} example`} />
          <p className="mt-1 text-center text-[10px] text-secondary">Faded candles show the trend before it; the shaded candles are the pattern.</p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-secondary">How to identify it</p>
            <ul className="mt-2 space-y-1.5 text-sm text-textMain">
              {pattern.identify.map(rule => <li key={rule} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{rule}</li>)}
            </ul>
          </div>
          <div className="space-y-3 text-sm">
            <div><p className="text-xs font-bold uppercase tracking-wide text-secondary">What it suggests</p><p className="mt-1 text-textMain">{pattern.meaning}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-wide text-secondary">Confirmation</p><p className="mt-1 text-textMain">{pattern.confirm}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-wide text-amber-500">Watch out</p><p className="mt-1 text-textMain">{pattern.watchOut}</p></div>
          </div>
        </div>

        {opposite.length > 0 && (
          <p className="mt-4 text-xs text-secondary">Opposite: {opposite.map((item, n) => <React.Fragment key={item.id}>{n > 0 && ', '}<button type="button" onClick={() => onOpen(item.id)} className="font-semibold text-primary">{item.name}</button></React.Fragment>)}</p>
        )}

        <div className="mt-5 border-t border-border pt-4">
          {!checked ? <p className="text-xs text-secondary">Check a ticker above to see where this pattern appeared on its chart.</p> : (
            <>
              <p className="text-xs font-bold text-textMain">{pattern.name} on {checked.symbol}: {found.length ? `${found.length} time${found.length === 1 ? '' : 's'} in the last ${checked.candles.length} sessions` : `not found in the last ${checked.candles.length} sessions`}</p>
              {shown.length > 0 && (
                <div className="mt-2 rounded-xl border border-border bg-background p-2">
                  <CandleChart bars={checked.candles.slice(windowStart)} bands={shown.map(match => [match.start - windowStart, match.index - windowStart])} height={140} label={`${pattern.name} on ${checked.symbol}`} />
                  <p className="mt-1 text-[10px] text-secondary">Shaded: each {pattern.name} in the last {checked.candles.length - windowStart} sessions.</p>
                </div>
              )}
              {found.length > 0 && <p className="mt-2 text-xs text-secondary">{found.slice(0, 8).map(match => dayLabel(checked.candles[match.index].timestamp)).join(' · ')}</p>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TradePatternsPanel;
