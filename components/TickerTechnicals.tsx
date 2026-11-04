import React from 'react';
import { CANDLESTICK_PATTERNS, type PatternMatch } from '../services/candlestickPatterns';
import type { StockCandle } from '../services/stockQuoteService';

const byId = new Map(CANDLESTICK_PATTERNS.map(p => [p.id, p]));
const colors = { bullish: 'text-emerald-600 dark:text-emerald-400', bearish: 'text-rose-600 dark:text-rose-400', neutral: 'text-secondary' };
interface Props {
  candles: StockCandle[]; matches: PatternMatch[]; selected: PatternMatch | null;
  onSelect: (match: PatternMatch | null) => void; timeLabel: (timestamp: number) => string;
  intervalLabel: string; live: boolean; loading: boolean;
}

export default function TickerTechnicals({ candles, matches, selected, onSelect, timeLabel, intervalLabel, live, loading }: Props) {
  const recent = matches.filter(m => m.index >= candles.length - 10);
  const pattern = selected ? byId.get(selected.patternId) : undefined;
  return <div className="border-t border-border px-4 py-4" data-testid="ticker-patterns">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-xs font-black text-textMain">Candlestick patterns</h3>
      <span className="text-[10px] text-secondary">Last 10 candles · {intervalLabel}</span>
    </div>
    {loading ? <p className="mt-2 text-xs text-secondary">Checking this chart…</p>
      : live ? <p className="mt-2 text-xs text-secondary">Pattern detection needs market OHLC candles. Choose a market interval instead of collected live quotes.</p>
        : !candles.length ? <p className="mt-2 text-xs text-secondary">No market candles are available for pattern checks.</p>
        : recent.length ? <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {recent.map(match => {
            const p = byId.get(match.patternId)!;
            return <button type="button" key={`${match.patternId}:${match.index}`} aria-pressed={selected?.index === match.index && selected?.patternId === match.patternId}
              onClick={() => onSelect(match)} className={`rounded-lg border border-border bg-background px-2.5 py-2 text-left text-[11px] ${colors[p.signal]} hover:border-primary`}>
              <span className="font-bold">{p.name}</span><span className="ml-1 capitalize">· {p.signal}</span>
              <span className="mt-0.5 block text-[10px] text-secondary">{timeLabel(candles[match.index].timestamp)}{match.index === candles.length - 1 ? ' · latest candle' : ''}</span>
            </button>;
          })}
        </div> : <p className="mt-2 text-xs text-secondary">No matching patterns in the last 10 candles of this view.</p>}
    {pattern && selected && <div className="mt-3 rounded-xl border border-border bg-background p-3" data-testid="ticker-pattern-detail">
      <div className="flex items-center justify-between gap-3"><h4 className={`text-sm font-bold ${colors[pattern.signal]}`}>{pattern.name}</h4><button type="button" className="text-xs text-secondary underline" onClick={() => onSelect(null)}>Clear selection</button></div>
      <p className="mt-1 text-[10px] text-secondary">{timeLabel(candles[selected.index].timestamp)} · {pattern.family} · {pattern.kind}</p>
      <p className="mt-2 text-xs text-textMain">{pattern.meaning}</p>
      <p className="mt-2 text-xs text-secondary"><strong className="text-textMain">Confirmation to look for: </strong>{pattern.confirm}</p>
      <p className="mt-1 text-xs text-secondary">{pattern.watchOut}</p>
    </div>}
    {!live && <p className="mt-3 text-[10px] leading-relaxed text-secondary">Shapes are checked against {intervalLabel.toLowerCase()} candles. The latest candle can change until it closes. A pattern alone does not predict the next move.</p>}
  </div>;
}
