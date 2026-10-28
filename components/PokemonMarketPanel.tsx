import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import type { PokemonTrackedCard } from '../services/pokemonCardService';
import { safeMarketUrl } from '../services/pokemonCardService';
import { fetchPokemonMarket, marketIdentityKey, type PokemonMarketResult } from '../services/pokemonMarketService';

const money = (amount: number, currency: string) => `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
const maxAge = 30 * 60 * 1000;
const PokemonMarketPanel: React.FC<{ card: PokemonTrackedCard }> = ({ card }) => {
  const identity = marketIdentityKey(card);
  const storageKey = `subtrack_pokemon_market_v1:${identity}`;
  const [snapshots, setSnapshots] = useState<PokemonMarketResult[]>([]);
  const snapshotRef = useRef<PokemonMarketResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const latest = snapshots[0];
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    let cached: PokemonMarketResult[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(parsed)) cached = parsed.filter(p => p && typeof p.fetchedAt === 'string' && Array.isArray(p.quotes) && Array.isArray(p.messages));
    } catch { /* Public market snapshots can be fetched again. */ }
    snapshotRef.current = cached;
    setSnapshots(cached); setError('');
    async function load() {
      if (inFlight) return;
      inFlight = true; setLoading(true); setError('');
      try {
        const result = await fetchPokemonMarket(card, controller.signal);
        if (!active) return;
        // A failed refresh must not erase the last successful source quote.
        if (!result.quotes.length && snapshotRef.current[0]?.quotes.length) {
          setError(result.messages.join(' ') || 'No current quote returned. Showing the previous snapshot.'); return;
        }
        const next = [result, ...snapshotRef.current.filter(s => s.fetchedAt.slice(0, 10) !== result.fetchedAt.slice(0, 10))].slice(0, 90);
        snapshotRef.current = next; setSnapshots(next);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); }
        catch { setError('Prices fetched, but this device could not save the snapshot history.'); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Prices are temporarily unavailable.'); }
      finally { inFlight = false; if (active) setLoading(false); }
    }
    if (refresh || !cached[0] || Date.now() - Date.parse(cached[0].fetchedAt) > maxAge) void load();
    else setLoading(false);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, maxAge);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [identity, refresh]);
  const quotes = latest?.quotes || [];
  const owned = quotes.filter(q => q.grade === card.grade);
  return <div className="rounded-2xl border border-primary/20 bg-background p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-bold">Automatic market prices</h4><p className="text-xs text-secondary">Free sources · fetched automatically · raw and PSA quotes stay separate</p></div><button type="button" disabled={loading} onClick={() => setRefresh(n => n + 1)} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{loading ? 'Fetching…' : 'Refresh market'}</button></div>
    {error && <p role="alert" className="text-xs text-amber-600 dark:text-amber-400">{error}{latest && ' Last saved prices are shown below.'}</p>}
    {loading && !latest && <p role="status" className="text-sm text-secondary">Finding an exact language, set, name and card-number match…</p>}
    {!loading && !owned.length && <p className="text-sm text-secondary">No free {card.grade === 'Raw' ? 'raw' : card.grade} quote is available for this printing.</p>}
    {quotes.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{quotes.map((quote, i) => <div key={`${quote.source}-${quote.sourceId}-${quote.grade}-${i}`} className="rounded-xl border border-border bg-surface p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-primary">{quote.grade === 'Raw' ? 'Raw / ungraded' : quote.grade}</span>{safeMarketUrl(quote.url) && <a className="inline-flex items-center gap-1 text-xs text-primary" href={safeMarketUrl(quote.url)} target="_blank" rel="noopener noreferrer">{quote.source}<ExternalLink size={11} /></a>}</div><p className="mt-2 text-xl font-extrabold tabular-nums">{money(quote.amount, quote.currency)}</p><p className="mt-1 text-xs text-secondary">{quote.variant}</p><p className="mt-1 text-[11px] text-secondary">{quote.basis}</p><p className="mt-2 text-[11px] text-secondary">Source date: {quote.updatedAt ? new Date(quote.updatedAt).toLocaleDateString() : 'Not supplied'}</p></div>)}</div>}
    {latest && <><p className="text-[11px] text-secondary">Fetched {new Date(latest.fetchedAt).toLocaleString()}. Sources may publish older or cached quotes. No grade prices are calculated from raw values.</p>{latest.messages.map(message => <p key={message} className="text-xs text-secondary">{message}</p>)}</>}
    {snapshots.length > 0 && <><button type="button" className="text-xs font-bold text-primary" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Hide' : 'Show'} automatic snapshot history ({snapshots.length})</button>{showHistory && <div className="overflow-x-auto"><p className="mb-2 text-[11px] text-secondary">Latest fetched snapshot per day, kept on this device. Tracking starts with your first fetch.</p><table className="w-full text-left text-xs"><thead><tr>{['Fetched', 'Source', 'Grade', 'Variant', 'Price'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{snapshots.flatMap(snapshot => snapshot.quotes.map((quote, i) => <tr key={`${snapshot.fetchedAt}-${i}`} className="border-t border-border"><td className="p-2 whitespace-nowrap">{new Date(snapshot.fetchedAt).toLocaleDateString()}</td><td className="p-2">{quote.source}</td><td className="p-2 whitespace-nowrap">{quote.grade}</td><td className="p-2">{quote.variant}</td><td className="p-2 whitespace-nowrap">{money(quote.amount, quote.currency)}</td></tr>))}</tbody></table></div>}</>}
  </div>;
};
export default PokemonMarketPanel;
