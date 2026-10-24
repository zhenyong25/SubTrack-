import React, { useState } from 'react';
import { Loader2, Plus, Radar, X } from 'lucide-react';
import { fetchStockIntradayHistory, normalizeTickerSymbol } from '../services/stockQuoteService';
import { SETUP_LABELS, dailySetups, minutesOf, orbState, toSessions, type DailySetup, type OrbState, type TradeRules } from '../services/tradingMath';
import { INPUT_CLASS, Panel, hhmm, nyNow } from './tradeUi';

interface TradeScannerPanelProps {
  rules: TradeRules;
  holdingSymbols: string[];
  onSaveRules: (rules: TradeRules) => void;
  onPlan: (symbol: string) => void;
}

interface ScanRow {
  symbol: string;
  name?: string | null;
  price?: number;
  change?: number;
  rsi?: number;
  vsMa20?: number;
  setups: DailySetup[];
  orb?: OrbState;
  error?: string;
}

const TradeScannerPanel: React.FC<TradeScannerPanelProps> = ({ rules, holdingSymbols, onSaveRules, onPlan }) => {
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);

  const symbols = Array.from(new Set([...rules.watchlist, ...holdingSymbols].map(normalizeTickerSymbol).filter(Boolean)));

  const addSymbol = () => {
    const next = input.split(/[\s,]+/).map(normalizeTickerSymbol).filter(Boolean);
    if (next.length === 0) return;
    onSaveRules({ ...rules, watchlist: Array.from(new Set([...rules.watchlist, ...next])) });
    setInput('');
  };
  const removeSymbol = (symbol: string) => onSaveRules({ ...rules, watchlist: rules.watchlist.filter(item => normalizeTickerSymbol(item) !== symbol) });

  // One ticker at a time, to stay gentle on the free price feed.
  const scan = async () => {
    const results: ScanRow[] = [];
    setRows([]);
    setProgress({ done: 0, total: symbols.length });
    const now = nyNow();
    for (const symbol of symbols) {
      try {
        const daily = await fetchStockIntradayHistory(symbol, '1d', undefined, '1y');
        const closes = daily.candles.map(candle => candle.close);
        const analysis = dailySetups(closes);
        const price = daily.currentPrice ?? closes.at(-1);
        const row: ScanRow = {
          symbol,
          name: daily.name,
          price,
          // Daily bars carry no previous close, so fall back to the bar before the latest.
          change: price && (daily.previousClose || closes.at(-2)) ? price / (daily.previousClose || closes.at(-2)!) - 1 : undefined,
          rsi: analysis.rsi,
          vsMa20: price && analysis.ma20 ? price / analysis.ma20 - 1 : undefined,
          setups: analysis.setups,
        };
        if (daily.exchangeTimezone === 'America/New_York') {
          const intraday = await fetchStockIntradayHistory(symbol, '5m', undefined, '1d');
          const today = toSessions(intraday.candles).find(session => session.day === now.day);
          if (today) {
            const completed = today.bars.filter(bar => bar.timestamp + 5 * 60 * 1000 <= Date.now()).length;
            row.orb = orbState(today, minutesOf(rules.noEntriesAfter), completed);
          }
        }
        results.push(row);
      } catch (error) {
        results.push({ symbol, setups: [], error: error instanceof Error ? error.message : 'Lookup failed' });
      }
      setRows([...results]);
      setProgress({ done: results.length, total: symbols.length });
    }
    setProgress(null);
    setScannedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  };

  const sorted = [...rows].sort((a, b) => Number(b.orb?.status === 'triggered') - Number(a.orb?.status === 'triggered') || b.setups.length - a.setups.length);

  return (
    <Panel
      eyebrow="Find setups"
      title="Setup scanner"
      action={(
        <button type="button" onClick={() => void scan()} disabled={symbols.length === 0 || Boolean(progress)} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
          {progress ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />}
          {progress ? `Scanning ${progress.done}/${progress.total}` : `Scan ${symbols.length} ticker${symbols.length === 1 ? '' : 's'}`}
        </button>
      )}
    >
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); addSymbol(); }}>
        <input value={input} onChange={event => setInput(event.target.value.toUpperCase())} placeholder="Add tickers to your watchlist, e.g. NVDA, AMD" className={INPUT_CLASS} aria-label="Add tickers" />
        <button type="submit" disabled={!input.trim()} className="flex shrink-0 items-center gap-1 rounded-xl border border-border px-3 text-sm font-bold text-primary hover:border-primary disabled:opacity-40">
          <Plus size={15} /> Add
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {symbols.length === 0 && <p className="text-xs text-secondary">Add tickers, or hold stocks in Investments - they're scanned too.</p>}
        {symbols.map(symbol => {
          const fromWatchlist = rules.watchlist.map(normalizeTickerSymbol).includes(symbol);
          return (
            <span key={symbol} className="flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-bold text-textMain">
              {symbol}
              {fromWatchlist
                ? <button type="button" onClick={() => removeSymbol(symbol)} aria-label={`Remove ${symbol}`} className="text-secondary hover:text-red-500"><X size={12} /></button>
                : <span className="text-[10px] font-normal text-secondary">holding</span>}
            </span>
          );
        })}
      </div>

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] whitespace-nowrap text-left text-xs">
            <thead className="bg-background text-[10px] uppercase tracking-wide text-secondary">
              <tr>
                <th className="px-3 py-2 font-bold">Ticker</th>
                <th className="px-3 py-2 text-right font-bold">Price</th>
                <th className="px-3 py-2 text-right font-bold">Day</th>
                <th className="px-3 py-2 text-right font-bold">RSI 14</th>
                <th className="px-3 py-2 text-right font-bold">vs 20-day avg</th>
                <th className="px-3 py-2 font-bold">Daily setups</th>
                <th className="px-3 py-2 font-bold">Opening range today</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map(row => (
                <tr key={row.symbol}>
                  <td className="px-3 py-2">
                    <span className="font-bold text-textMain">{row.symbol}</span>
                    {row.name && <span className="ml-1.5 text-[11px] text-secondary">{row.name.length > 22 ? `${row.name.slice(0, 22)}…` : row.name}</span>}
                  </td>
                  {row.error ? (
                    <td colSpan={6} className="px-3 py-2 text-red-500">{row.error}</td>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums text-textMain">{row.price?.toFixed(2) ?? '—'}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${row.change === undefined ? 'text-secondary' : row.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {row.change === undefined ? '—' : `${row.change >= 0 ? '+' : ''}${(row.change * 100).toFixed(2)}%`}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${row.rsi !== undefined && row.rsi < 30 ? 'font-bold text-amber-500' : row.rsi !== undefined && row.rsi > 70 ? 'font-bold text-amber-500' : 'text-textMain'}`}>{row.rsi?.toFixed(0) ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-textMain">{row.vsMa20 === undefined ? '—' : `${row.vsMa20 >= 0 ? '+' : ''}${(row.vsMa20 * 100).toFixed(1)}%`}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {row.setups.length === 0 && <span className="text-secondary">—</span>}
                          {row.setups.map(setup => <span key={setup} className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">{SETUP_LABELS[setup]}</span>)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {!row.orb ? <span className="text-secondary">—</span>
                          : row.orb.status === 'triggered' ? <span className="font-bold text-emerald-500">Breakout {hhmm(row.orb.minute)} @ {row.orb.price.toFixed(2)}</span>
                            : row.orb.status === 'waiting' ? <span className="text-textMain">Waiting · range {row.orb.range.low.toFixed(2)}–{row.orb.range.high.toFixed(2)}</span>
                              : row.orb.status === 'expired' ? <span className="text-secondary">No breakout</span>
                                : <span className="text-secondary">Forming</span>}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2 text-right">
                    {!row.error && <button type="button" onClick={() => onPlan(row.symbol)} className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-primary hover:border-primary">Plan</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[10px] text-secondary">
        {scannedAt && `Scanned at ${scannedAt}. `}Rule matches from delayed Yahoo prices, not recommendations - they go stale as prices move, so re-scan before acting. Daily setups use closes, including today's so far.
      </p>
    </Panel>
  );
};

export default TradeScannerPanel;
