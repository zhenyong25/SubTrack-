import React, { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ExternalLink, Eye, EyeOff, KeyRound, Landmark, Loader2, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Wallet, X } from 'lucide-react';
import type { CryptoChain, CryptoExchange, CryptoSource } from '../types';
import { EXCHANGES, getExchangeKeys, setExchangeKeys } from '../services/cryptoExchangeService';
import { CHAINS, EVM_CHAINS, chainsForFamily, detectAddressFamily, shortAddress, type AddressFamily } from '../services/cryptoChains';
import { fetchHistory, type HistoryRange } from '../services/cryptoPriceService';
import { valueHistory, type AssetRow } from '../services/cryptoPortfolio';
import { isWalletName, resolveWalletName } from '../services/cryptoNames';
import { fallbackRate, fetchUsdRate, type FxRate } from '../services/fxService';
import type { CryptoPortfolio } from './useCryptoPortfolio';
import CryptoSourceLogo from './CryptoSourceLogo';

// Crypto dashboard for the Investments tab: every wallet and exchange in one live view.

interface CryptoPanelProps {
  sources: CryptoSource[];
  selectedSource?: string;
  addRequest?: number;
  portfolio: CryptoPortfolio;
  baseCurrency: string;
  onSaveSource: (source: CryptoSource) => void;
  onDeleteSource: (sourceId: string) => void;
}

const RANGES: HistoryRange[] = ['24h', '7d', '30d', '90d', '1y'];
// Allocation colours in a fixed order (assigned by rank of value, never cycled); the rest is "Other".
const ALLOCATION_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];
const OTHER_COLOR = '#64748b';
const SOURCE_COLORS = ['#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#ec4899', '#3b82f6', '#ef4444', '#64748b'];
const FAMILY_LABEL: Record<AddressFamily, string> = { bitcoin: 'Bitcoin', evm: 'EVM (Ethereum & L2s)', solana: 'Solana', tron: 'Tron' };

const INPUT_CLASS = 'w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:border-primary outline-none';
const LABEL_CLASS = 'block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1';
const BOX = 'min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm';
const chartTooltip = { background: 'var(--color-surface, #1e293b)', borderRadius: 12, border: '1px solid #64748b', color: '#94a3b8', fontSize: 12 };

const usd = (value: number, digits = 2) => `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const signedUsd = (value: number) => `${value > 0 ? '+' : ''}${usd(value)}`;
const price = (value?: number) => (value === undefined ? '-' : value >= 1 ? usd(value) : `$${value.toPrecision(3)}`);
const pct = (value?: number, digits = 2) => (value === undefined ? '-' : `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`);
const amountText = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: value >= 1000 ? 2 : value >= 1 ? 4 : 8 });
const compact = (value: number) => Number(value).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const tone = (value?: number) => (value === undefined || value === 0 ? 'text-secondary' : value > 0 ? 'text-emerald-500' : 'text-red-500');
const ago = (timestamp?: number) => {
  if (!timestamp) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
};
const chainName = (chain: string) => (chain in CHAINS ? CHAINS[chain as CryptoChain].name : chain === 'manual' ? 'Manual holdings' : 'Exchanges');
const chainColor = (chain: string) => (chain in CHAINS ? CHAINS[chain as CryptoChain].color : OTHER_COLOR);

// Coin logo: the explorer's icon when there is one, else a public icon set, else initials.
const CoinLogo: React.FC<{ symbol: string; logo?: string; size?: number }> = ({ symbol, logo, size = 32 }) => {
  const candidates = useMemo(() => [logo, `https://assets.coincap.io/assets/icons/${symbol.toLowerCase().replace(/\.e$/, '')}@2x.png`].filter(Boolean) as string[], [logo, symbol]);
  const [index, setIndex] = useState(0);
  const style = { width: size, height: size };
  if (index >= candidates.length) {
    return <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-extrabold text-secondary">{symbol.slice(0, 3).toUpperCase()}</span>;
  }
  return <img src={candidates[index]} alt="" style={style} className="shrink-0 rounded-full bg-background object-contain" loading="lazy" onError={() => setIndex(i => i + 1)} />;
};

const Stat: React.FC<{ label: string; value: string; note?: string; valueTone?: string }> = ({ label, value, note, valueTone = 'text-textMain' }) => (
  <div className="rounded-2xl border border-border bg-background p-4">
    <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">{label}</p>
    <p className={`mt-2 text-lg font-extrabold tabular-nums sm:text-xl ${valueTone}`}>{value}</p>
    {note && <p className="mt-1 text-[11px] text-secondary">{note}</p>}
  </div>
);

const Bars: React.FC<{ rows: { key: string; label: React.ReactNode; value: number; color: string }[]; total: number }> = ({ rows, total }) => (
  <div className="space-y-2.5">
    <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-background" aria-hidden>
      {rows.map(row => <span key={row.key} style={{ width: `${total > 0 ? (row.value / total) * 100 : 0}%`, backgroundColor: row.color }} className="h-full first:rounded-l-full last:rounded-r-full" />)}
    </div>
    {rows.map(row => (
      <div key={row.key} className="flex items-center gap-2 text-xs">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
        <span className="min-w-0 flex-1 truncate text-textMain">{row.label}</span>
        <span className="tabular-nums text-secondary">{usd(row.value, 0)}</span>
        <span className="w-12 text-right font-bold tabular-nums text-textMain">{total > 0 ? `${((row.value / total) * 100).toFixed(1)}%` : '-'}</span>
      </div>
    ))}
  </div>
);

const CryptoPanel: React.FC<CryptoPanelProps> = ({ sources: allSources, selectedSource = 'all', addRequest = 0, portfolio, baseCurrency, onSaveSource, onDeleteSource }) => {
  const sources = useMemo(() => selectedSource === 'all' ? allSources : allSources.filter(source => source.id === selectedSource), [allSources, selectedSource]);
  const { summary, priced, scans } = portfolio;
  const [range, setRange] = useState<HistoryRange>('7d');
  const [history, setHistory] = useState<{ timestamp: number; value: number }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [editing, setEditing] = useState<CryptoSource | 'new' | null>(null);
  const [fx, setFx] = useState<FxRate>(() => fallbackRate(baseCurrency));
  const [, setTick] = useState(0);

  useEffect(() => { void fetchUsdRate(baseCurrency).then(setFx); }, [baseCurrency]);
  // Re-render every 10s so "updated 20s ago" stays truthful between refreshes.
  useEffect(() => { const timer = window.setInterval(() => setTick(t => t + 1), 10_000); return () => window.clearInterval(timer); }, []);

  // Value history at today's holdings, for the 25 largest positions (they're nearly all of it).
  const visible = useMemo(() => priced.filter(b => !b.hidden).sort((a, b) => b.valueUsd - a.valueUsd), [priced]);
  const historyKeys = useMemo(() => [...new Set(visible.map(b => b.priceKey).filter(Boolean) as string[])].slice(0, 25), [visible]);
  const historyKeyList = historyKeys.join(',');
  const [historyPrices, setHistoryPrices] = useState<Map<string, { timestamp: number; price: number }[]>>(new Map());
  useEffect(() => {
    if (!historyKeys.length) { setHistoryPrices(new Map()); return; }
    const controller = new AbortController();
    setHistoryLoading(true);
    fetchHistory(historyKeys, range, controller.signal)
      .then(setHistoryPrices)
      .catch(() => { if (!controller.signal.aborted) setHistoryPrices(new Map()); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [historyKeyList, range]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const points = valueHistory(visible, historyPrices);
    // The last point is always the live value.
    setHistory(points.length ? [...points, { timestamp: Math.floor(Date.now() / 1000), value: summary.totalUsd }] : []);
  }, [historyPrices, visible, summary.totalUsd]);
  const rangeChange = history.length > 1 ? history[history.length - 1].value - history[0].value : undefined;
  const rangeChangePct = history.length > 1 && history[0].value > 0 ? (history[history.length - 1].value / history[0].value - 1) * 100 : undefined;

  const sourceById = useMemo(() => new Map(sources.map(source => [source.id, source])), [sources]);
  const sourceLabel = (id: string) => (id === 'manual' ? 'Manual' : sourceById.get(id)?.label || 'Removed');
  const allocation = useMemo(() => {
    const top = summary.assets.slice(0, ALLOCATION_COLORS.length);
    const rest = summary.assets.slice(ALLOCATION_COLORS.length).reduce((sum, a) => sum + a.valueUsd, 0);
    return [
      ...top.map((asset, index) => ({ key: asset.key, label: asset.symbol, value: asset.valueUsd, color: ALLOCATION_COLORS[index] })),
      ...(rest > 0 ? [{ key: 'other', label: `Other (${summary.assets.length - top.length})`, value: rest, color: OTHER_COLOR }] : []),
    ];
  }, [summary.assets]);
  const networks = useMemo(
    () => Object.entries(summary.byChain as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([chain, value]) => ({ key: chain, label: chainName(chain), value, color: chainColor(chain) })),
    [summary.byChain],
  );
  const largest = summary.assets[0];
  const errors = sources.flatMap(source => (scans[source.id]?.errors || []).map(error => ({ source, error })));
  const local = (value: number) => (baseCurrency === 'USD' ? '' : `≈ ${(value * fx.rate).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${baseCurrency}`);

  // ------------------------------------------------------------------ add / edit wallet
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [chains, setChains] = useState<CryptoChain[]>([]);
  // A name (vitalik.eth, you.base.eth) is looked up and the address behind it is what's tracked.
  const isName = isWalletName(address);
  const [resolved, setResolved] = useState<{ name: string; address: string | null } | null>(null);
  useEffect(() => {
    if (!isName) { setResolved(null); return; }
    const name = address.trim().toLowerCase();
    if (resolved?.name === name) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void resolveWalletName(name, controller.signal)
        .then(found => setResolved({ name, address: found }))
        .catch(() => { if (!controller.signal.aborted) setResolved({ name, address: null }); });
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [address, isName]); // eslint-disable-line react-hooks/exhaustive-deps
  const resolving = isName && resolved?.name !== address.trim().toLowerCase();
  const effectiveAddress = isName ? (!resolving && resolved?.address) || '' : address.trim();
  const family = detectAddressFamily(effectiveAddress);
  const openEditor = (source: CryptoSource | 'new') => {
    setEditing(source);
    setLabel(source === 'new' ? '' : source.label);
    setAddress(source === 'new' ? '' : source.address || '');
    setChains(source === 'new' ? [] : source.chains || []);
  };
  useEffect(() => { if (addRequest > 0) openEditor('new'); }, [addRequest]);
  // A different kind of address gets that family's networks (all EVM networks for a 0x address).
  useEffect(() => {
    if (!family) return;
    setChains(current => (current.length && current.every(chain => chainsForFamily(family).includes(chain)) ? current : chainsForFamily(family)));
  }, [family]);
  const changeAddress = (value: string) => setAddress(value);
  const duplicate = family && allSources.some(source => source.address?.toLowerCase() === effectiveAddress.toLowerCase() && (editing === 'new' || source.id !== (editing as CryptoSource)?.id));
  const canSave = Boolean(family && chains.length && !duplicate);
  const saveWallet = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave || !family) return;
    const existing = editing !== 'new' ? editing : undefined;
    onSaveSource({
      id: existing?.id || crypto.randomUUID(),
      kind: 'wallet',
      label: label.trim() || (isName ? address.trim().toLowerCase() : `${FAMILY_LABEL[family].split(' ')[0]} wallet ${shortAddress(effectiveAddress)}`),
      address: effectiveAddress,
      chains,
      color: existing?.color || SOURCE_COLORS[sources.length % SOURCE_COLORS.length],
      customTokens: existing?.customTokens,
      createdAt: existing?.createdAt,
    });
    setEditing(null);
  };

  // ------------------------------------------------------------------ add / edit exchange
  const [exchangeEditing, setExchangeEditing] = useState<CryptoSource | 'new' | null>(null);
  const [exchange, setExchange] = useState<CryptoExchange>('binance');
  const [exchangeLabel, setExchangeLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const openExchangeEditor = (source: CryptoSource | 'new') => {
    setExchangeEditing(source);
    setExchange(source === 'new' ? 'binance' : source.exchange || 'binance');
    setExchangeLabel(source === 'new' ? '' : source.label);
    // The secret is never shown again; leaving these blank keeps the key already on this device.
    setApiKey(''); setApiSecret(''); setPassphrase('');
  };
  const storedKeys = exchangeEditing && exchangeEditing !== 'new' ? getExchangeKeys(exchangeEditing.id) : undefined;
  const typedKeys = Boolean(apiKey.trim() && apiSecret.trim() && (!EXCHANGES[exchange].needsPassphrase || passphrase.trim()));
  const canSaveExchange = typedKeys || Boolean(storedKeys && !apiKey && !apiSecret);
  const saveExchange = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSaveExchange || !exchangeEditing) return;
    const existing = exchangeEditing !== 'new' ? exchangeEditing : undefined;
    const id = existing?.id || crypto.randomUUID();
    if (typedKeys) setExchangeKeys(id, { apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), passphrase: passphrase.trim() || undefined });
    onSaveSource({
      id,
      kind: 'exchange',
      exchange,
      label: exchangeLabel.trim() || EXCHANGES[exchange].name,
      color: existing?.color || EXCHANGES[exchange].color,
      createdAt: existing?.createdAt,
    });
    if (existing && typedKeys) portfolio.rescan(id); // new sources are scanned as soon as they appear
    setExchangeEditing(null);
  };
  const removeSource = (source: CryptoSource) => {
    const what = source.kind === 'exchange' ? `${source.label}? Its API key is deleted from this device; your exchange account isn't touched.` : `${source.label}? Nothing happens to the wallet itself.`;
    if (!confirm(`Stop tracking ${what}`)) return;
    if (source.kind === 'exchange') setExchangeKeys(source.id, null);
    onDeleteSource(source.id);
  };

  const visibleAssets: AssetRow[] = showAllAssets ? summary.assets : summary.assets.slice(0, 12);

  return (
    <section className="crypto-panel bg-surface rounded-2xl border border-border p-4 shadow-sm space-y-4" aria-labelledby="crypto-heading">
      {/* Header: live total */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Crypto
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-emerald-600 dark:text-emerald-400" title="Prices refresh every 30s; wallets are rescanned every 5 minutes">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>
              Live 24/7
            </span>
          </p>
          <h3 id="crypto-heading" className="mt-1 text-2xl font-extrabold tabular-nums text-textMain sm:text-3xl">{usd(summary.totalUsd)}</h3>
          <p className="mt-1 text-xs text-secondary">
            <span className={`font-bold ${tone(summary.change24hUsd)}`}>{signedUsd(summary.change24hUsd)} ({pct(summary.change24hPct)})</span> today
            {local(summary.totalUsd) && <> · {local(summary.totalUsd)}</>}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { portfolio.rescan(); void portfolio.refreshPrices(); }} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-xs font-bold text-secondary hover:text-textMain" aria-label="Refresh balances and prices">
              <RefreshCw size={14} className={portfolio.scanning || portfolio.pricing ? 'animate-spin' : ''} />Refresh
            </button>
            <button type="button" onClick={() => openExchangeEditor('new')} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-xs font-bold text-secondary hover:text-textMain"><Landmark size={14} />Add exchange</button>
            <button type="button" onClick={() => openEditor('new')} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"><Plus size={14} />Add wallet</button>
          </div>
          <p className="text-[11px] text-secondary">Prices {ago(portfolio.pricedAt)}{portfolio.scanning ? ' · scanning wallets…' : ''}</p>
        </div>
      </div>

      {(portfolio.priceError || errors.length > 0) && (
        <div className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          {portfolio.priceError && <p className="flex items-center gap-1.5"><AlertTriangle size={13} />Live prices: {portfolio.priceError} - showing the last known prices.</p>}
          {errors.map(({ source, error }) => <p key={`${source.id}-${error}`} className="flex items-center gap-1.5"><AlertTriangle size={13} />{source.label} - {error}{/[.!?]$/.test(error) ? '' : '.'} {source.kind === 'exchange' ? 'Showing the last synced balances; retrying in about a minute.' : 'Showing its last known balances there; retrying in about a minute.'}</p>)}
        </div>
      )}

      {sources.length === 0 && summary.assets.length === 0 ? (
        <div className="rounded-xl bg-background p-8 text-center">
          <Wallet size={28} className="mx-auto text-secondary" />
          <p className="mt-3 text-sm font-bold text-textMain">Track your crypto wherever it's held</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-secondary">Paste a public wallet address - Bitcoin, Ethereum and its L2s, Solana or Tron - or connect an exchange with a read-only API key. Everything is priced live, around the clock.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={() => openEditor('new')} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white"><Plus size={14} />Add wallet</button>
            <button type="button" onClick={() => openExchangeEditor('new')} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-bold text-secondary hover:text-textMain"><Landmark size={14} />Add exchange</button>
          </div>
        </div>
      ) : (
        <>
          {/* Value over time */}
          <div className={BOX}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-textMain">Value over time</h4>
                <p className="mt-0.5 text-xs text-secondary">Today's holdings at past prices.{' '}
                  {rangeChange !== undefined && <span className={`font-bold ${tone(rangeChange)}`}>{signedUsd(rangeChange)} ({pct(rangeChangePct)}) over {range}</span>}
                </p>
              </div>
              <div role="group" aria-label="Chart range" className="flex gap-1 rounded-xl bg-background p-1">
                {RANGES.map(option => (
                  <button key={option} type="button" aria-pressed={range === option} onClick={() => setRange(option)} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${range === option ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}>{option.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <div className="mt-3 h-56 min-w-0" role="img" aria-label={`Crypto value over ${range}`}>
              {history.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cryptoValue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} vertical={false} />
                    <XAxis dataKey="timestamp" tickFormatter={value => new Date(Number(value) * 1000).toLocaleString(undefined, range === '24h' ? { hour: 'numeric' } : { day: 'numeric', month: 'short' })} minTickGap={40} tick={{ fontSize: 10 }} />
                    <YAxis width={55} tickFormatter={compact} tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                    <Tooltip labelFormatter={value => new Date(Number(value) * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} formatter={(value: number) => [usd(Number(value)), 'Value']} contentStyle={chartTooltip} />
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#cryptoValue)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl bg-background text-xs text-secondary">
                  {historyLoading || portfolio.scanning ? <><Loader2 size={14} className="mr-2 animate-spin" />Loading price history…</> : 'No price history yet.'}
                </div>
              )}
            </div>
          </div>

          {/* Key figures */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="24h change" value={signedUsd(summary.change24hUsd)} note={pct(summary.change24hPct)} valueTone={tone(summary.change24hUsd)} />
            <Stat label="Largest holding" value={largest ? largest.symbol : '-'} note={largest ? `${(largest.share * 100).toFixed(1)}% of crypto · ${usd(largest.valueUsd, 0)}` : undefined} />
            <Stat label="Stablecoins" value={usd(summary.stableUsd, 0)} note={summary.totalUsd > 0 ? `${((summary.stableUsd / summary.totalUsd) * 100).toFixed(1)}% held as dollars` : undefined} />
            <Stat label="Where it's held" value={`${sources.length} source${sources.length === 1 ? '' : 's'}`} note={`${networks.length} network${networks.length === 1 ? '' : 's'} · ${summary.assets.length} coins`} />
          </div>

          {/* Allocation + networks */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className={BOX}>
              <h4 className="text-sm font-bold text-textMain">Allocation</h4>
              <p className="mb-3 mt-0.5 text-xs text-secondary">The same coin on different networks counts once.</p>
              <Bars rows={allocation} total={summary.totalUsd} />
            </div>
            <div className={BOX}>
              <h4 className="text-sm font-bold text-textMain">By network</h4>
              <p className="mb-3 mt-0.5 text-xs text-secondary">Where your value sits on-chain.</p>
              <Bars rows={networks} total={summary.totalUsd} />
            </div>
          </div>

          {/* Holdings */}
          <div className={BOX}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-textMain">Holdings</h4>
                <p className="mt-0.5 text-xs text-secondary">Live prices · every wallet and network combined.</p>
              </div>
              {summary.hidden.length > 0 && (
                <button type="button" onClick={() => setShowHidden(value => !value)} className="inline-flex items-center gap-1 text-xs font-bold text-secondary hover:text-textMain">
                  {showHidden ? <EyeOff size={13} /> : <Eye size={13} />}{showHidden ? 'Hide' : 'Show'} {summary.hidden.length} hidden token{summary.hidden.length === 1 ? '' : 's'}
                </button>
              )}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-secondary">
                  <tr>
                    <th className="py-2 pr-3 font-bold">Asset</th>
                    <th className="py-2 pr-3 text-right font-bold">Price</th>
                    <th className="py-2 pr-3 text-right font-bold">24h</th>
                    <th className="py-2 pr-3 text-right font-bold">Amount</th>
                    <th className="py-2 pr-3 text-right font-bold">Value</th>
                    <th className="py-2 pr-3 text-right font-bold">Share</th>
                    <th className="py-2 font-bold">Held in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleAssets.map(asset => (
                    <tr key={asset.key} className="text-textMain">
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2.5">
                          <CoinLogo symbol={asset.symbol} logo={asset.logo} />
                          <div className="min-w-0">
                            <p className="font-bold">{asset.symbol}{asset.isStable && <span className="ml-1.5 rounded bg-background px-1.5 py-0.5 text-[9px] font-bold text-secondary">STABLE</span>}</p>
                            {asset.name && <p className="max-w-[160px] truncate text-[11px] text-secondary">{asset.name}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{price(asset.priceUsd)}</td>
                      <td className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${tone(asset.change24h)}`}>{pct(asset.change24h)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{amountText(asset.amount)}</td>
                      <td className="py-2.5 pr-3 text-right font-bold tabular-nums">{usd(asset.valueUsd)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-secondary">{(asset.share * 100).toFixed(1)}%</td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {asset.chains.map(chain => <span key={chain} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ color: CHAINS[chain].color, backgroundColor: `${CHAINS[chain].color}1f` }}><CryptoSourceLogo chain={chain} size={14} />{CHAINS[chain].name}</span>)}
                          {asset.sourceIds.filter(id => !sourceById.get(id)?.address).map(id => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-bold text-secondary">{sourceById.get(id)?.exchange && <CryptoSourceLogo exchange={sourceById.get(id)!.exchange} size={14} />}{sourceLabel(id)}</span>)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {summary.assets.length > 12 && (
              <button type="button" onClick={() => setShowAllAssets(value => !value)} className="mt-3 w-full rounded-xl border border-border py-2 text-xs font-bold text-secondary hover:text-textMain">
                {showAllAssets ? 'Show fewer' : `Show all ${summary.assets.length}`}
              </button>
            )}
            {showHidden && (
              <div className="mt-3 rounded-xl bg-background p-3">
                <p className="text-[11px] text-secondary">Not counted: tokens flagged as spam or with an unreliable price (airdropped scam tokens are common), tokens with no market price, and dust under $0.01.</p>
                <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-[11px]">
                  {summary.hidden.slice(0, 200).map((balance, index) => (
                    <li key={`${balance.sourceId}-${balance.priceKey}-${index}`} className="flex justify-between gap-2 text-secondary">
                      <span className="truncate">{balance.symbol} · {balance.chain ? CHAINS[balance.chain].name : sourceLabel(balance.sourceId)}</span>
                      <span className="shrink-0">{balance.hidden === 'spam' ? 'spam / unreliable' : balance.hidden === 'dust' ? 'dust' : 'no price'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sources */}
          <div className={BOX}>
            <h4 className="text-sm font-bold text-textMain">Wallets & exchanges</h4>
            <p className="mt-0.5 text-xs text-secondary">Everything here is read-only: the app can see balances, never move funds.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {sources.map(source => {
                const scan = scans[source.id];
                const value = summary.bySource[source.id] || 0;
                return (
                  <div key={source.id} className="rounded-xl border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-sm font-bold text-textMain">
                          <CryptoSourceLogo exchange={source.exchange} chain={source.chains?.length === 1 ? source.chains[0] : undefined} size={24} />
                          {source.label}
                        </p>
                        {source.address && <p className="mt-0.5 font-mono text-[11px] text-secondary" title={source.address}>{shortAddress(source.address)}</p>}
                        {source.exchange && (getExchangeKeys(source.id)
                          ? <p className="mt-0.5 flex items-center gap-1 text-[11px] text-secondary"><ShieldCheck size={11} className="text-emerald-500" />{EXCHANGES[source.exchange].name} · read-only key on this device</p>
                          : <button type="button" onClick={() => openExchangeEditor(source)} className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400"><KeyRound size={11} />Add the API key on this device</button>)}
                      </div>
                      <p className="shrink-0 text-sm font-extrabold tabular-nums text-textMain">{usd(value)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(source.chains || []).map(chain => (
                        <a key={chain} href={source.address ? CHAINS[chain].explorer(source.address) : undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold hover:opacity-80" style={{ color: CHAINS[chain].color, backgroundColor: `${CHAINS[chain].color}1f` }}>
                          <CryptoSourceLogo chain={chain} size={14} />{CHAINS[chain].name}<ExternalLink size={9} />
                        </a>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-secondary">
                        {scan?.scanning ? 'Scanning…' : `Scanned ${ago(scan?.scannedAt)}`}
                        {scan?.errors?.length ? <span className="text-amber-600 dark:text-amber-400" title={scan.errors.join('\n')}> · {scan.balances.length === 0 ? 'sync failed - see the warning above' : `${scan.errors.length} ${source.kind === 'exchange' ? 'part' : 'network'}${scan.errors.length === 1 ? '' : 's'} failed`}</span> : null}
                      </p>
                      <div className="flex">
                        <button type="button" aria-label={`Rescan ${source.label}`} title="Rescan" onClick={() => portfolio.rescan(source.id)} className="rounded-lg p-1.5 text-secondary hover:bg-surface hover:text-textMain"><RefreshCw size={13} className={scan?.scanning ? 'animate-spin' : ''} /></button>
                        <button type="button" aria-label={`Edit ${source.label}`} title="Edit" onClick={() => (source.kind === 'exchange' ? openExchangeEditor(source) : openEditor(source))} className="rounded-lg p-1.5 text-secondary hover:bg-surface hover:text-textMain"><Pencil size={13} /></button>
                        <button type="button" aria-label={`Remove ${source.label}`} title="Remove" onClick={() => removeSource(source)} className="rounded-lg p-1.5 text-secondary hover:bg-red-500/10 hover:text-red-500"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="grid min-h-[110px] grid-cols-2 gap-2">
                <button type="button" onClick={() => openEditor('new')} className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs font-bold text-secondary hover:border-primary hover:text-primary"><Plus size={14} />Add wallet</button>
                <button type="button" onClick={() => openExchangeEditor('new')} className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs font-bold text-secondary hover:border-primary hover:text-primary"><Landmark size={14} />Add exchange</button>
              </div>
            </div>
            {summary.bySource.manual > 0 && <p className="mt-3 text-[11px] text-secondary">Includes {usd(summary.bySource.manual)} of manually added crypto holdings (listed below).</p>}
          </div>
        </>
      )}

      {exchangeEditing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={() => setExchangeEditing(null)}>
          <div role="dialog" aria-label={exchangeEditing === 'new' ? 'Add exchange' : 'Edit exchange'} className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-border my-4 sm:my-8" onClick={event => event.stopPropagation()}>
            <div className="p-4 border-b border-border flex justify-between items-center bg-background">
              <div>
                <h3 className="text-base font-bold text-textMain">{exchangeEditing === 'new' ? 'Connect an exchange' : `Edit ${exchangeEditing.label}`}</h3>
                <p className="text-[11px] text-secondary">Read-only API key - balances only, never trading or withdrawals.</p>
              </div>
              <button type="button" onClick={() => setExchangeEditing(null)} className="text-secondary hover:text-textMain p-1 -mr-1" aria-label="Close"><X size={18} /></button>
            </div>
            <form onSubmit={saveExchange} className="space-y-3 p-4" autoComplete="off">
              <div>
                <p className={LABEL_CLASS}>Exchange</p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {(Object.keys(EXCHANGES) as CryptoExchange[]).map(id => (
                    <button key={id} type="button" aria-pressed={exchange === id} disabled={exchangeEditing !== 'new'} onClick={() => setExchange(id)}
                      className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] font-bold transition-colors disabled:cursor-default ${exchange === id ? 'border-primary bg-background text-textMain ring-1 ring-primary' : 'border-border text-secondary hover:text-textMain disabled:opacity-40'}`}>
                      <CryptoSourceLogo exchange={id} size={24} />{EXCHANGES[id].name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-background p-3 text-[11px] text-secondary">
                <p className="font-bold text-textMain">Create a read-only key on {EXCHANGES[exchange].name}</p>
                <p className="mt-1">{EXCHANGES[exchange].keyHelp}</p>
                <p className="mt-1">Never enable trading or withdrawals. The key stays in this browser only - it's sent through this app's server to {EXCHANGES[exchange].name} on each sync and never saved there or in your account.</p>
              </div>
              <div>
                <label htmlFor="exchange-label" className={LABEL_CLASS}>Name (optional)</label>
                <input id="exchange-label" value={exchangeLabel} onChange={event => setExchangeLabel(event.target.value)} placeholder={EXCHANGES[exchange].name} className={INPUT_CLASS} />
              </div>
              <div>
                <label htmlFor="exchange-key" className={LABEL_CLASS}>{exchange === 'coinbase' ? 'API key name' : 'API key'}</label>
                <input id="exchange-key" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={storedKeys ? 'Leave blank to keep the saved key' : exchange === 'coinbase' ? 'organizations/…/apiKeys/…' : ''} spellCheck={false} className={`${INPUT_CLASS} font-mono text-xs`} />
              </div>
              <div>
                <label htmlFor="exchange-secret" className={LABEL_CLASS}>{EXCHANGES[exchange].secretLabel}</label>
                {exchange === 'coinbase'
                  ? <textarea id="exchange-secret" rows={3} value={apiSecret} onChange={event => setApiSecret(event.target.value)} placeholder={storedKeys ? 'Leave blank to keep the saved key' : '-----BEGIN EC PRIVATE KEY-----…'} spellCheck={false} className={`${INPUT_CLASS} font-mono text-xs`} />
                  : <input id="exchange-secret" type="password" value={apiSecret} onChange={event => setApiSecret(event.target.value)} placeholder={storedKeys ? 'Leave blank to keep the saved key' : ''} spellCheck={false} autoComplete="new-password" className={`${INPUT_CLASS} font-mono text-xs`} />}
              </div>
              {EXCHANGES[exchange].needsPassphrase && (
                <div>
                  <label htmlFor="exchange-passphrase" className={LABEL_CLASS}>Passphrase</label>
                  <input id="exchange-passphrase" type="password" value={passphrase} onChange={event => setPassphrase(event.target.value)} placeholder={storedKeys ? 'Leave blank to keep the saved key' : 'Set when creating the key'} autoComplete="new-password" className={INPUT_CLASS} />
                </div>
              )}
              {storedKeys && <p className="flex items-center gap-1 text-[11px] text-secondary"><ShieldCheck size={12} className="text-emerald-500" />A key is saved on this device. Fill in all fields to replace it.</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setExchangeEditing(null)} className="flex-1 rounded-xl border border-border py-3 text-sm font-bold text-secondary hover:text-textMain">Cancel</button>
                <button type="submit" disabled={!canSaveExchange} className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white disabled:opacity-40">{exchangeEditing === 'new' ? 'Connect & sync' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={() => setEditing(null)}>
          <div role="dialog" aria-label={editing === 'new' ? 'Add wallet' : 'Edit wallet'} className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-border my-4 sm:my-8" onClick={event => event.stopPropagation()}>
            <div className="p-4 border-b border-border flex justify-between items-center bg-background">
              <div>
                <h3 className="text-base font-bold text-textMain">{editing === 'new' ? 'Add wallet' : 'Edit wallet'}</h3>
                <p className="text-[11px] text-secondary">Public address only - never a seed phrase or private key.</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="text-secondary hover:text-textMain p-1 -mr-1" aria-label="Close"><X size={18} /></button>
            </div>
            <form onSubmit={saveWallet} className="space-y-3 p-4">
              <div>
                <label htmlFor="crypto-address" className={LABEL_CLASS}>Public address or name</label>
                <input id="crypto-address" autoFocus value={address} onChange={event => changeAddress(event.target.value)} placeholder="bc1…, 0x…, T…, Solana, or name.eth / name.base.eth" spellCheck={false} autoComplete="off" className={`${INPUT_CLASS} font-mono text-xs`} />
                <p className={`mt-1 text-[11px] ${address && !family && !resolving ? 'text-red-500' : 'text-secondary'}`}>
                  {!address
                    ? 'The network is detected from the address. ENS names and Basenames work too.'
                    : isName
                      ? resolving
                        ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" />Looking up {address.trim()}…</span>
                        : family
                          ? <>Resolves to <span className="font-mono">{shortAddress(effectiveAddress)}</span> · EVM (Ethereum & L2s)</>
                          : `No address is set for ${address.trim()}.`
                      : family ? `${FAMILY_LABEL[family]} address` : "That doesn't look like a Bitcoin, EVM, Solana or Tron address."}
                  {duplicate && <span className="text-red-500"> · already tracked</span>}
                </p>
              </div>
              {family === 'evm' && (
                <div>
                  <p className={LABEL_CLASS}>Networks to scan</p>
                  <div className="flex flex-wrap gap-1.5">
                    {EVM_CHAINS.map(chain => {
                      const on = chains.includes(chain);
                      return (
                        <button key={chain} type="button" aria-pressed={on} onClick={() => setChains(current => (on ? current.filter(c => c !== chain) : [...current, chain]))}
                          className={`rounded-full border px-2.5 py-1 text-xs font-bold transition-colors ${on ? 'border-transparent text-white' : 'border-border text-secondary hover:text-textMain'}`}
                          style={on ? { backgroundColor: CHAINS[chain].color } : undefined}>
                          <CryptoSourceLogo chain={chain} size={14} />{CHAINS[chain].name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[11px] text-secondary">Ethereum finds every token; the L2s and BNB Chain read the native coin plus popular tokens.</p>
                </div>
              )}
              <div>
                <label htmlFor="crypto-label" className={LABEL_CLASS}>Name (optional)</label>
                <input id="crypto-label" value={label} onChange={event => setLabel(event.target.value)} placeholder="e.g. Ledger, MetaMask, Phantom" className={INPUT_CLASS} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditing(null)} className="flex-1 rounded-xl border border-border py-3 text-sm font-bold text-secondary hover:text-textMain">Cancel</button>
                <button type="submit" disabled={!canSave} className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white disabled:opacity-40">{editing === 'new' ? 'Add & scan' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default CryptoPanel;
