import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, ChevronDown, ExternalLink, Gift, Loader2, RefreshCw, Search } from 'lucide-react';
import CardFace from './CardFace';
import {
  MARKET_COUNTRIES, STALE_AFTER_MS, categoriesOf, fetchMarketCards, filterMarketCards, issuersOf, ownsCard, readCachedMarket,
  type MarketCard, type MarketCardList, type MarketCountry, type MarketSort,
} from '../services/creditCardMarketService';

// Every credit card currently offered in a country, read from a comparison site so you don't have
// to visit it. The last list stays on this device; Refresh fetches a fresh one.

const input = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-textMain';

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h ago` : new Date(iso).toLocaleDateString();
};

interface Props {
  country: MarketCountry;
  ownCardNames: string[];
}

export default function CreditCardMarket({ country, ownCardNames }: Props) {
  const [list, setList] = useState<MarketCardList | null>(() => readCachedMarket(country));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [request, setRequest] = useState<{ refresh: boolean; n: number } | null>(null);
  const [query, setQuery] = useState('');
  const [issuer, setIssuer] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<MarketSort>('featured');
  const [open, setOpen] = useState<string | null>(null);

  // A country switch starts from that country's saved list, and fetches when there's none or
  // it's more than a day old.
  useEffect(() => {
    const cached = readCachedMarket(country);
    setList(cached); setError(''); setIssuer(''); setCategory(''); setOpen(null);
    if (!cached || Date.now() - Date.parse(cached.fetchedAt) > STALE_AFTER_MS) setRequest({ refresh: false, n: Date.now() });
  }, [country]);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    fetchMarketCards(country, request.refresh, controller.signal)
      .then(next => { if (!controller.signal.aborted) setList(next); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'The card list couldn\'t be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request]);

  const cards = list?.country === country ? list.cards : [];
  const issuers = useMemo(() => issuersOf(cards), [cards]);
  const categories = useMemo(() => categoriesOf(cards), [cards]);
  const visible = useMemo(() => filterMarketCards(cards, { query, issuer, category, sort }), [cards, query, issuer, category, sort]);
  const owned = useMemo(() => new Set(cards.filter(card => ownsCard(card, ownCardNames)).map(card => card.id)), [cards, ownCardNames]);
  const { title, source, sourceUrl } = MARKET_COUNTRIES[country];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-textMain">{title}</h2>
          <p className="mt-1 text-xs text-secondary">
            {list?.country === country
              ? <>{cards.length} cards from <a href={list.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">{list.source}</a> · updated {ago(list.fetchedAt)}</>
              : loading ? 'Loading the latest list…' : 'No list loaded yet.'}
            {owned.size > 0 && <> · <span className="font-semibold text-emerald-600 dark:text-emerald-400">{owned.size} you have</span></>}
          </p>
        </div>
        <button type="button" disabled={loading} onClick={() => setRequest({ refresh: true, n: Date.now() })}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            {error}{cards.length > 0 && ' Showing the last list saved on this device.'}
            {cards.length === 0 && <> <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline">Browse {source} directly</a> in the meantime.</>}
          </span>
        </p>
      )}
      {list?.country === country && list.warnings.map(warning => <p key={warning} className="text-xs text-amber-600 dark:text-amber-400">{warning}</p>)}

      {cards.length > 0 && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="relative">
              <span className="sr-only">Search cards</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input className={`${input} pl-9`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, bank, cashback, miles…" />
            </label>
            <select className={input} aria-label="Bank" value={issuer} onChange={e => setIssuer(e.target.value)}>
              <option value="">All banks ({issuers.length})</option>
              {issuers.map(name => <option key={name}>{name}</option>)}
            </select>
            <select className={input} aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as MarketSort)}>
              <option value="featured">Sort: {list?.source}'s order</option>
              <option value="fee">Sort: lowest annual fee</option>
              <option value="income">Sort: lowest min. income</option>
              <option value="name">Sort: name</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {['', ...categories].map(option => (
              <button key={option || 'all'} type="button" onClick={() => setCategory(option)} aria-pressed={category === option}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${category === option ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-secondary hover:border-primary/40 hover:text-textMain'}`}>
                {option || 'All'}
              </button>
            ))}
          </div>
          <p className="text-xs text-secondary" role="status">{visible.length === cards.length ? `${cards.length} cards` : `${visible.length} of ${cards.length} cards`}</p>
        </div>
      )}

      {loading && cards.length === 0 && <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-10 text-sm text-secondary"><Loader2 size={16} className="animate-spin" /> Fetching every card on the market…</div>}
      {!loading && cards.length > 0 && visible.length === 0 && <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-secondary">No cards match these filters.</p>}

      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map(card => <MarketCardTile key={card.id} card={card} source={list?.source || ''} owned={owned.has(card.id)} expanded={open === card.id} onToggle={() => setOpen(open === card.id ? null : card.id)} />)}
      </div>

      {cards.length > 0 && <p className="text-[11px] leading-relaxed text-secondary">Details come from {list?.source} and can change at any time - check the bank's own terms before applying. SubTrack isn't paid for any of these cards.</p>}
    </section>
  );
}

const MarketCardTile: React.FC<{ card: MarketCard; source: string; owned: boolean; expanded: boolean; onToggle: () => void }> = ({ card, source, owned, expanded, onToggle }) => {
  const facts = [
    ['Annual fee', card.annualFee],
    ['Min. income', card.minIncome],
    ['Interest', card.interestRate],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));
  const hasMore = Boolean(card.summary || card.keyFeatures.length || card.minIncomeForeigner);
  return (
    <article className={`flex flex-col rounded-2xl border bg-surface p-4 ${owned ? 'border-emerald-500/50' : 'border-border'}`}>
      <div className="flex gap-3">
        <CardFace src={card.imageUrl} label={card.issuer} className="w-28 shrink-0 self-start" />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold leading-snug text-textMain">{card.name}</h3>
          <p className="mt-0.5 text-xs text-secondary">{[card.issuer, card.network].filter(Boolean).join(' · ')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {owned && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"><BadgeCheck size={11} /> You have this</span>}
            {card.categories.slice(0, 4).map(category => <span key={category} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-secondary">{category}</span>)}
          </div>
        </div>
      </div>

      {card.highlights.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {card.highlights.slice(0, 3).map(item => (
            <li key={`${item.value}-${item.label}`} className="rounded-lg bg-background px-2.5 py-2">
              <p className="text-sm font-extrabold leading-tight text-textMain">{item.value}</p>
              <p className="mt-0.5 line-clamp-3 text-[10px] leading-snug text-secondary" title={item.label}>{item.label}</p>
            </li>
          ))}
        </ul>
      )}

      {facts.length > 0 && (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-secondary">{label}</dt>
              <dd className="mt-0.5 line-clamp-2 font-semibold text-textMain" title={value}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {card.promotion && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
          <Gift size={13} className="mt-0.5 shrink-0" />
          <span>{card.promotion}{card.promotionEnds && <span className="text-amber-700/70 dark:text-amber-300/70"> · until {new Date(`${card.promotionEnds}T00:00:00`).toLocaleDateString()}</span>}</span>
        </p>
      )}

      {expanded && hasMore && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs text-secondary">
          {card.summary && <p className="leading-relaxed">{card.summary}</p>}
          {card.minIncomeForeigner && <p><span className="font-semibold text-textMain">Min. income (foreigners):</span> {card.minIncomeForeigner}</p>}
          {card.keyFeatures.length > 0 && <ul className="list-disc space-y-1 pl-4">{card.keyFeatures.map(feature => <li key={feature}>{feature}</li>)}</ul>}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-3 text-xs font-bold">
        {hasMore && <button type="button" onClick={onToggle} aria-expanded={expanded} className="inline-flex items-center gap-1 text-textMain hover:text-primary">{expanded ? 'Less' : 'More details'} <ChevronDown size={13} className={expanded ? 'rotate-180' : ''} /></button>}
        <a href={card.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">View on {source} <ExternalLink size={12} /></a>
        {card.applyUrl && <a href={card.applyUrl} target="_blank" rel="noopener noreferrer nofollow" className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-white">Apply</a>}
      </div>
    </article>
  );
};
