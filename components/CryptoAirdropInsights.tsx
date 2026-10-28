import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import type { CryptoSource } from '../types';
import { AIRDROP_CHAIN_NAMES, fetchAirdropInsights, type AirdropInsight } from '../services/airdropInsightsService';

const input = 'min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-xs text-textMain';
const money = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(amount);

export default function CryptoAirdropInsights({ sources }: { sources: CryptoSource[] }) {
  const [data, setData] = useState<{ items: AirdropInsight[]; fetchedAt: number }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [network, setNetwork] = useState('all');
  const [sort, setSort] = useState('tvl');
  const [minimum, setMinimum] = useState('100000');
  const [limit, setLimit] = useState(6);
  const walletChains = useMemo(() => new Set(sources.flatMap(source => (source.chains || []).map(chain => AIRDROP_CHAIN_NAMES[chain]))), [sources]);
  const load = async (force = false) => {
    setLoading(true); setError('');
    try { setData(await fetchAirdropInsights(force)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load airdrop research.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { setLimit(6); }, [search, network, sort, minimum]);
  const rows = useMemo(() => (data?.items || []).filter(row =>
    row.tvl >= Number(minimum) && `${row.name} ${row.category}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (network === 'all' || network === 'mine' ? network === 'all' || row.chains.some(chain => walletChains.has(chain)) : row.chains.includes(network))
  ).sort((a, b) => sort === 'new' ? (b.listedAt || 0) - (a.listedAt || 0) : b.tvl - a.tvl), [data, search, network, minimum, sort, walletChains]);
  const networks = useMemo(() => [...new Set((data?.items || []).flatMap(row => row.chains))].sort(), [data]);
  return <section className="min-w-0 rounded-2xl border border-violet-500/30 bg-background p-4" aria-labelledby="airdrop-insights-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 id="airdrop-insights-heading" className="flex items-center gap-2 text-sm font-bold text-textMain"><Sparkles size={17} className="text-violet-500" />Airdrop insights</h3><p className="mt-1 text-xs text-secondary">Tokenless protocol watchlist · research candidates, airdrops unconfirmed.</p></div>
      <button type="button" disabled={loading} onClick={() => void load(true)} className={`${input} inline-flex items-center gap-1.5 disabled:opacity-50`}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />{loading ? 'Loading…' : 'Refresh insights'}</button>
    </div>
    <p className="mt-2 text-[11px] text-secondary">Source: <a href="https://defillama.com/airdrops" target="_blank" rel="noopener noreferrer" className="text-primary underline">DefiLlama</a> protocol data{data ? ` · fetched ${new Date(data.fetchedAt).toLocaleString()}` : ''}. No listed token ticker is a research signal; eligibility, claim dates and rewards are not verified.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <input type="search" aria-label="Search airdrop insights" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search projects or categories" className={input} />
      <select aria-label="Airdrop network" value={network} onChange={event => setNetwork(event.target.value)} className={input}><option value="all">All networks</option><option value="mine">My wallet networks</option>{networks.map(chain => <option key={chain}>{chain}</option>)}</select>
      <select aria-label="Minimum protocol TVL" value={minimum} onChange={event => setMinimum(event.target.value)} className={input}><option value="0">Any TVL</option><option value="100000">TVL ≥ $100K</option><option value="1000000">TVL ≥ $1M</option><option value="10000000">TVL ≥ $10M</option></select>
      <select aria-label="Sort airdrop insights" value={sort} onChange={event => setSort(event.target.value)} className={input}><option value="tvl">Highest TVL</option><option value="new">Recently listed</option></select>
    </div>
    {error && <p role="alert" className="mt-3 text-xs text-amber-700 dark:text-amber-300">{error}{data ? ' Showing previously fetched data.' : ' Retry or open the source link above.'}</p>}
    {data && <p className="mt-3 text-xs text-secondary">{rows.length} research candidates{network === 'mine' ? ' on networks in your wallets. Network overlap does not establish eligibility.' : '. TVL measures deposited value, not airdrop likelihood or safety.'}</p>}
    {!loading && !error && !rows.length && <p className="mt-3 text-xs text-secondary">{network === 'mine' && !walletChains.size ? 'Add a wallet with networks to use this filter. Exchange balances do not establish network activity.' : 'No projects match these filters.'}</p>}
    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.slice(0, limit).map(row => <article key={row.id} className="min-w-0 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="break-words text-sm font-bold text-textMain">{row.name}</h4><span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-300">Unconfirmed</span></div>
      <p className="mt-1 text-[11px] text-secondary">{row.category} · {row.chains.join(', ')}</p>
      <p className="mt-3 text-sm font-bold text-textMain">{money(row.tvl)} TVL <span className="text-[11px] font-normal text-secondary">· 7d {row.change7d === undefined ? 'unavailable' : `${row.change7d > 0 ? '+' : ''}${row.change7d.toFixed(1)}%`}</span></p>
      <p className="mt-2 text-[11px] text-secondary">{row.chains.some(chain => walletChains.has(chain)) ? 'Matches a network in your wallets. Review the project’s official announcements for reward programmes.' : 'Explore official announcements for reward programmes and participation requirements.'}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-primary"><a href={`https://defillama.com/protocol/${row.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">Source data <ExternalLink size={11} /></a>{row.website && <a href={row.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">Project website <ExternalLink size={11} /></a>}</div>
    </article>)}</div>
    {rows.length > 6 && <button type="button" onClick={() => setLimit(limit >= rows.length ? 6 : limit + 6)} className="mt-3 text-xs font-bold text-primary">{limit >= rows.length ? 'Show fewer' : `Show more (${Math.min(limit, rows.length)} / ${rows.length})`}</button>}
  </section>;
}
