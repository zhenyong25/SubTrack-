import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Loader2, RefreshCw, X } from 'lucide-react';
import { fetchCryptoMarket, type CryptoMarket } from '../services/cryptoMarketService';
import type { HistoryRange } from '../services/cryptoPriceService';

const RANGES: HistoryRange[] = ['24h', '7d', '30d', '90d', '1y'];
const formatPrice = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: value >= 1 ? 2 : 0, maximumSignificantDigits: value < 1 ? 5 : 9 })}`;

export default function CryptoAssetChart({ markets, onClose }: { markets: CryptoMarket[]; onClose: () => void }) {
  const [selected, setSelected] = useState(markets[0].key);
  const [range, setRange] = useState<HistoryRange>('7d');
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchCryptoMarket>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const market = markets.find(item => item.key === selected) || markets[0];
  useEffect(() => { setResult(null); setError(''); }, [market.key, range]);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    setError('');
    const load = async () => {
      if (running) return;
      running = true; setLoading(true);
      try {
        const next = await fetchCryptoMarket(market, range, controller.signal);
        if (!controller.signal.aborted) { setResult(next); setError(''); }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load market data.'); }
      finally { running = false; if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    const tick = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [market.key, range, refresh]);
  const points = result?.points || [];
  const latest = result?.price;
  // Keep quote time distinct from retrieval time; do not append a cached quote as "now".
  const first = points[0]?.price;
  const last = points.at(-1)?.price;
  const change = first && last ? (last / first - 1) * 100 : undefined;
  const color = change != null && change < 0 ? '#ef4444' : '#06b6d4';
  const date = (seconds: number) => new Date(seconds * 1000).toLocaleString(undefined, range === '24h' ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' });
  return createPortal(<dialog ref={element => { if (element && !element.open) element.showModal(); }} onCancel={onClose} className="m-auto max-h-[95dvh] w-[calc(100%-1rem)] max-w-5xl overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-textMain shadow-2xl backdrop:bg-black/70 sm:p-6" aria-labelledby="crypto-chart-title">
    <div className="flex items-start justify-between gap-3">
      <div><h3 id="crypto-chart-title" className="flex items-center gap-2 text-xl font-extrabold"><Activity size={22} className="text-primary" /> {market.symbol} price</h3><p className="mt-1 text-xs text-secondary">{market.name || market.symbol} · Market price per coin in USD</p></div>
      <button autoFocus type="button" onClick={onClose} aria-label="Close asset chart" className="rounded-lg p-2 text-secondary hover:bg-background"><X size={20} /></button>
    </div>
    {markets.length > 1 && <label className="mt-4 block text-xs text-secondary">Network / market<select aria-label="Asset market" value={market.key} onChange={event => setSelected(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-textMain">{markets.map(item => <option key={item.key} value={item.key}>{item.key}</option>)}</select></label>}
    <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-3xl font-extrabold tabular-nums">{latest == null ? loading ? 'Loading...' : 'Quote unavailable' : formatPrice(latest)}</p>
        {result?.change24h != null && <p className={`mt-1 text-sm font-bold ${result.change24h >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{result.change24h >= 0 ? '+' : ''}{result.change24h.toFixed(2)}% <span className="font-normal text-secondary">past 24h</span></p>}
      </div>
      <button disabled={loading} type="button" onClick={() => setRefresh(value => value + 1)} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold text-primary disabled:opacity-50">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh</button>
    </div>
    <div className="mt-5 flex flex-wrap gap-2" aria-label="Price chart range">{RANGES.map(value => <button type="button" key={value} aria-pressed={range === value} onClick={() => setRange(value)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${range === value ? 'bg-primary text-white' : 'border border-border bg-background text-secondary'}`}>{value === '1y' ? '1Y' : value.toUpperCase()}</button>)}</div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}{result && ' Showing the last fetched data.'}</p>}
    {result?.quoteError && <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">{result.quoteError}</p>}
    <div className="mt-4 h-72 sm:h-96">
      {loading && !result ? <div role="status" className="flex h-full items-center justify-center gap-2 text-sm text-secondary"><Loader2 size={18} className="animate-spin" /> Loading price history...</div> : points.length < 2 ? <div className="flex h-full items-center justify-center text-sm text-secondary">{result?.historyError || 'No price history available.'}</div> :
        <ResponsiveContainer width="100%" height="100%"><AreaChart data={points} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" /><XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']} tickFormatter={date} minTickGap={40} tick={{ fontSize: 11, fill: '#94a3b8' }} /><YAxis domain={['auto', 'auto']} width={85} tickFormatter={formatPrice} tick={{ fontSize: 11, fill: '#94a3b8' }} /><Tooltip labelFormatter={value => new Date(Number(value) * 1000).toLocaleString()} formatter={value => [formatPrice(Number(value)), 'Price (USD)']} contentStyle={{ background: 'var(--color-surface)', border: '1px solid #64748b', borderRadius: 12 }} /><ReferenceLine y={first} stroke="#94a3b8" strokeDasharray="4 4" /><Area type="linear" dataKey="price" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} />
        </AreaChart></ResponsiveContainer>}
    </div>
    {change != null && points.length > 1 && <p className="mt-2 text-sm text-secondary">Chart period change: <span className={`font-bold ${change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span></p>}
    <div className="mt-4 space-y-1 border-t border-border pt-3 text-[11px] text-secondary">
      <p>Source: <a href="https://defillama.com" target="_blank" rel="noreferrer" className="text-primary underline">DefiLlama</a> · Refreshes every minute while visible. Market snapshots may be delayed.</p>
      {result && <p>Fetched {new Date(result.fetchedAt).toLocaleString()}{result.quoteTimestamp ? ` · Quote as of ${new Date(result.quoteTimestamp * 1000).toLocaleString()}` : ''}</p>}
      <p className="break-all">Market: {market.key}</p>
    </div>
  </dialog>, document.body);
}
