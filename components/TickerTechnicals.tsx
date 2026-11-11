import React from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, ScanLine } from 'lucide-react';
import { CANDLESTICK_PATTERNS, type PatternMatch } from '../services/candlestickPatterns';
import type { StockCandle } from '../services/stockQuoteService';

const byId = new Map(CANDLESTICK_PATTERNS.map(p => [p.id, p]));
const colors = { bullish: 'text-emerald-600 dark:text-emerald-400', bearish: 'text-rose-600 dark:text-rose-400', neutral: 'text-secondary' };
const signalStyles = { bullish: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', bearish: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', neutral: 'bg-slate-500/10 text-secondary' };
const signalIcons = { bullish: ArrowUpRight, bearish: ArrowDownRight, neutral: ArrowRight };
interface Props {
  candles: StockCandle[]; matches: PatternMatch[]; selected: PatternMatch | null;
  onSelect: (match: PatternMatch | null) => void; timeLabel: (timestamp: number) => string;
  intervalLabel: string; live: boolean; loading: boolean;
}

export default function TickerTechnicals({ candles, matches, selected, onSelect, timeLabel, intervalLabel, live, loading }: Props) {
  const recent = matches.filter(m => m.index >= candles.length - 10);
  const pattern = selected ? byId.get(selected.patternId) : undefined;
  return <div className="border-t border-border p-4 sm:p-5" data-testid="ticker-patterns">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="flex items-center gap-2 text-xs font-bold text-textMain"><ScanLine size={15} className="text-secondary" />Candlestick patterns{!loading && !live && recent.length > 0 && <span className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] text-secondary">{recent.length}</span>}</h3>
      <span className="text-[10px] text-secondary">Last 10 candles · {intervalLabel}</span>
    </div>
    {loading ? <p className="mt-2 text-xs text-secondary">Checking this chart…</p>
      : live ? <p className="mt-2 text-xs text-secondary">Pattern detection needs market OHLC candles. Choose a market interval instead of collected live quotes.</p>
        : !candles.length ? <p className="mt-2 text-xs text-secondary">No market candles are available for pattern checks.</p>
        : recent.length ? <div className="mt-3 grid max-h-52 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
          {recent.map(match => {
            const p = byId.get(match.patternId)!;
            const isSelected = selected?.index === match.index && selected?.patternId === match.patternId;
            const SignalIcon = signalIcons[p.signal];
            return <button type="button" key={`${match.patternId}:${match.index}`} aria-pressed={isSelected}
              onClick={() => onSelect(match)} className={`flex min-w-0 items-center gap-2.5 rounded-xl border bg-surface p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isSelected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary'}`}>
              <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${signalStyles[p.signal]}`}><SignalIcon size={17} /></span>
              <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold text-textMain">{p.name}</span>
              <span className="mt-1 block text-[10px] text-secondary">{timeLabel(candles[match.index].timestamp)}{match.index === candles.length - 1 ? ' · latest' : ''}</span></span>
              <span className={`shrink-0 rounded-md px-1.5 py-1 text-[9px] font-semibold capitalize ${signalStyles[p.signal]}`}>{p.signal}</span>
            </button>;
          })}
        </div> : <p className="mt-2 text-xs text-secondary">No matching patterns in the last 10 candles of this view.</p>}
    {pattern && selected && <div className="mt-3 rounded-xl border border-border bg-surface p-4" data-testid="ticker-pattern-detail">
      <div className="flex items-center justify-between gap-3"><h4 className={`text-sm font-bold ${colors[pattern.signal]}`}>{pattern.name}</h4><button type="button" className="text-xs text-secondary underline" onClick={() => onSelect(null)}>Clear selection</button></div>
      <p className="mt-1 text-[10px] text-secondary">{timeLabel(candles[selected.index].timestamp)} · {pattern.family} · {pattern.kind}</p>
      <p className="mt-2 text-xs text-textMain">{pattern.meaning}</p>
      <p className="mt-2 text-xs text-secondary"><strong className="text-textMain">Confirmation to look for: </strong>{pattern.confirm}</p>
      <p className="mt-1 text-xs text-secondary">{pattern.watchOut}</p>
    </div>}
    {!live && <p className="mt-3 text-[11px] leading-relaxed text-secondary">Select a pattern to inspect it on the chart. Patterns use {intervalLabel.toLowerCase()} candles and may change until the candle closes. A pattern alone does not predict the next move.</p>}
  </div>;
}
