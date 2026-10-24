import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, CreditCard, Filter, Loader2, Search, Tag, TrendingUp, Wallet, X } from 'lucide-react';
import type { SearchKind, SearchRecord, SearchFilters } from '../services/globalSearchService';
import { normalizeTags, SEARCH_LABELS, searchRecords } from '../services/globalSearchService';
import TagInput, { TagChips } from './TagInput';

interface Props {
  records: SearchRecord[];
  onClose: () => void;
  onOpenRecord: (record: SearchRecord) => void;
  onSaveTags: (record: SearchRecord, tags: string[]) => Promise<void>;
}
const iconFor = { expense: Wallet, subscription: CreditCard, transaction: TrendingUp };
const singular = { expense: 'Expense', subscription: 'Subscription', transaction: 'Investment transaction' };
const dateLabel = (record: SearchRecord) => record.kind === 'subscription' ? 'Renewal / end date' : record.kind === 'expense' ? 'Expense date' : 'Trade date';
const money = (record: SearchRecord) => record.amount == null ? 'Stock split' : `${record.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${record.currency}`;

function RecordDetails({ record, suggestions, onSaveTags, onOpenRecord, onBack }: { key?: string; record: SearchRecord; suggestions: string[]; onSaveTags: Props['onSaveTags']; onOpenRecord: Props['onOpenRecord']; onBack: () => void }) {
  const [tags, setTags] = useState(record.tags);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(tags) !== JSON.stringify(record.tags);
  return <section className="min-w-0 space-y-5 p-4 sm:p-5" aria-label="Selected search result">
    <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-primary md:hidden"><ArrowLeft size={15} /> Back to results</button>
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">{singular[record.kind]}</p>
      <h3 className="break-words text-lg font-bold text-textMain">{record.title}</h3>
      <p className="mt-2 text-2xl font-bold text-textMain">{money(record)}</p>
      {record.kind === 'transaction' && <p className="mt-1 text-[10px] text-secondary">Trade value excludes fees, except for fee entries.</p>}
    </div>
    <dl className="space-y-2 text-xs">
      {[{ label: dateLabel(record), value: record.date }, ...record.details].map(item => <div key={item.label} className="flex justify-between gap-4"><dt className="shrink-0 text-secondary">{item.label}</dt><dd className="min-w-0 break-words text-right font-medium text-textMain">{item.value}</dd></div>)}
    </dl>
    {record.notes && <div><p className="mb-1 text-xs font-semibold text-secondary">Notes</p><p className="whitespace-pre-wrap break-words text-sm text-textMain">{record.notes}</p></div>}
    <div className="border-t border-border pt-4">
      <TagInput value={tags} onChange={next => { setTags(next); setError(''); setSaved(false); }} suggestions={suggestions} disabled={saving} />
      <button type="button" disabled={!dirty || saving} onClick={async () => {
        setSaving(true); setError('');
        try { await onSaveTags(record, normalizeTags(tags)); setSaved(true); }
        catch (err) { setError(err instanceof Error ? err.message : 'Could not save tags. Try again.'); }
        finally { setSaving(false); }
      }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />} {saving ? 'Saving...' : 'Save tags'}
      </button>
      {error && <p role="alert" className="mt-2 break-words text-xs text-red-500">{error}</p>}
      {saved && !dirty && <p role="status" className="mt-2 flex items-center gap-1 text-xs text-emerald-500"><Check size={13} /> Tags saved</p>}
    </div>
    <button type="button" onClick={() => onOpenRecord(record)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-primary hover:border-primary">
      {record.kind === 'expense' ? 'Edit expense' : record.kind === 'subscription' ? 'Open subscription' : 'Open portfolio'} <ArrowUpRight size={14} />
    </button>
  </section>;
}

export default function GlobalSearch({ records, onClose, onOpenRecord, onSaveTags }: Props) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [kind, setKind] = useState<SearchKind | 'all'>('all');
  const [tags, setTags] = useState<string[]>([]);
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [currency, setCurrency] = useState(''); const [sort, setSort] = useState<SearchFilters['sort']>('relevance');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);
  const dialogRef = useRef<HTMLDivElement>(null); const inputRef = useRef<HTMLInputElement>(null);
  const knownTags = useMemo(() => [...new Set(records.flatMap(record => record.tags))].sort((a, b) => a.localeCompare(b)), [records]);
  const currencies = useMemo(() => [...new Set(records.map(record => record.currency))].sort(), [records]);
  const dateError = from && to && from > to;
  const { results, counts } = useMemo(() => searchRecords(records, { query: deferredQuery, kind, tags, from, to, currency, sort }), [records, deferredQuery, kind, tags, from, to, currency, sort]);
  const selected = selectedKey ? records.find(record => record.key === selectedKey) : undefined;
  const activeFilters = tags.length + Number(Boolean(from || to)) + Number(Boolean(currency));
  useEffect(() => { setVisibleCount(50); }, [deferredQuery, kind, tags, from, to, currency, sort]);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const nodes = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]') || [])].filter(node => node.getClientRects().length > 0);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [onClose]);
  const clear = () => { setQuery(''); setKind('all'); setTags([]); setFrom(''); setTo(''); setCurrency(''); setSelectedKey(null); inputRef.current?.focus(); };
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm sm:p-6" onClick={onClose}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="global-search-title" className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-surface text-textMain shadow-2xl sm:h-[min(800px,90dvh)] sm:max-w-5xl sm:rounded-3xl sm:border sm:border-border" onClick={event => event.stopPropagation()}>
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 pb-3 sm:px-5" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <Search size={20} className="shrink-0 text-primary" />
        <div className="min-w-0 flex-1"><h2 id="global-search-title" className="text-sm font-bold">Global search</h2><p className="text-[10px] text-secondary">Expenses, subscriptions and investment transactions</p></div>
        <button type="button" onClick={onClose} aria-label="Close global search" className="rounded-full p-2 text-secondary hover:bg-background hover:text-textMain"><X size={20} /></button>
      </div>
      <div className="shrink-0 space-y-3 border-b border-border p-4 sm:px-5">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-primary">
          <Search size={16} className="shrink-0 text-secondary" />
          <input ref={inputRef} type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search all records" placeholder="Search names, notes, amounts or #tags" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-secondary" />
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Record type">
          {(['all', 'expense', 'subscription', 'transaction'] as const).map(value => <button key={value} type="button" onClick={() => { setKind(value); setSelectedKey(null); }} aria-pressed={kind === value} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${kind === value ? 'border-primary bg-primary text-white' : 'border-border text-secondary hover:text-primary'}`}>{value === 'all' ? 'All' : SEARCH_LABELS[value]} <span className="ml-1 opacity-70">{counts[value]}</span></button>)}
          <button type="button" onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen} aria-controls="global-search-filters" className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-secondary hover:text-primary"><Filter size={14} /> Filters{activeFilters ? ` (${activeFilters})` : ''}</button>
        </div>
        {filtersOpen && <div id="global-search-filters" className="space-y-3 rounded-xl border border-border bg-background p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="min-w-0 text-[10px] font-semibold text-secondary">From<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface p-2 text-xs text-textMain [color-scheme:light] dark:[color-scheme:dark]" /></label>
            <label className="min-w-0 text-[10px] font-semibold text-secondary">To<input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface p-2 text-xs text-textMain [color-scheme:light] dark:[color-scheme:dark]" /></label>
            <label className="min-w-0 text-[10px] font-semibold text-secondary">Currency<select value={currency} onChange={event => setCurrency(event.target.value)} className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface p-2 text-xs text-textMain"><option value="">All currencies</option>{currencies.map(value => <option key={value}>{value}</option>)}</select></label>
            <label className="min-w-0 text-[10px] font-semibold text-secondary">Sort<select value={sort} onChange={event => setSort(event.target.value as SearchFilters['sort'])} className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface p-2 text-xs text-textMain"><option value="relevance">Best match</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
          </div>
          <div><p className="mb-2 text-[10px] font-semibold text-secondary">Tags · matches all selected tags</p><div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">{knownTags.length ? knownTags.map(tag => <button key={tag} type="button" onClick={() => { setTags(current => current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag]); setSelectedKey(null); }} aria-pressed={tags.includes(tag)} className={`max-w-full break-words rounded-full border px-2 py-1 text-[10px] ${tags.includes(tag) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-secondary'}`}>#{tag}</button>) : <p className="text-[11px] text-secondary">Select a result to add your first tag.</p>}</div></div>
          <p className="text-[10px] text-secondary">Dates use expense dates, subscription renewals/end dates, and trade dates.</p>
          {dateError && <p role="alert" className="text-xs text-red-500">The end date must be on or after the start date.</p>}
        </div>}
        {(activeFilters > 0 || query || kind !== 'all') && <button type="button" onClick={clear} className="text-[11px] font-semibold text-primary">Clear search and filters</button>}
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className={`${selected ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 flex-col`}>
          <p role="status" className="shrink-0 px-4 py-2 text-[10px] text-secondary sm:px-5">{results.length} result{results.length === 1 ? '' : 's'}{query !== deferredQuery ? ' · Updating...' : ''}</p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 sm:px-3">
            {results.slice(0, visibleCount).map(record => {
              const Icon = iconFor[record.kind];
              return <button key={record.key} type="button" onClick={() => setSelectedKey(record.key)} aria-pressed={selectedKey === record.key} className={`mb-1 flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${selectedKey === record.key ? 'border-primary/30 bg-primary/10' : 'border-transparent hover:bg-background'}`}>
                <span className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary"><Icon size={17} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{record.title}</span><span className="mt-0.5 block truncate text-[10px] text-secondary">{singular[record.kind]} · {record.subtitle}</span><span className="mt-1 block text-[10px] text-secondary">{record.date}</span>{record.tags.length > 0 && <span className="mt-2 block"><TagChips tags={record.tags} /></span>}</span>
                <span className="shrink-0 text-right text-xs font-bold">{record.amount == null ? 'Split' : <>{record.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}<span className="mt-0.5 block text-[10px] font-medium text-secondary">{record.currency}</span></>}</span>
              </button>;
            })}
            {!results.length && <div className="px-6 py-12 text-center"><Search size={28} className="mx-auto mb-3 text-secondary opacity-40" /><p className="text-sm font-semibold">{records.length ? 'No matching records' : 'Your search starts here'}</p><p className="mt-1 text-xs text-secondary">{records.length ? 'Try another word or clear a filter.' : 'Add an expense, subscription or investment transaction to get started.'}</p></div>}
            {results.length > visibleCount && <button type="button" onClick={() => setVisibleCount(count => count + 50)} className="mt-2 w-full rounded-xl border border-border py-2.5 text-xs font-bold text-primary">Show more ({results.length - visibleCount} remaining)</button>}
          </div>
        </div>
        {selected ? <div className="min-w-0 flex-1 overflow-y-auto border-border md:w-[340px] md:flex-none md:border-l"><RecordDetails key={selected.key} record={selected} suggestions={knownTags} onSaveTags={onSaveTags} onOpenRecord={onOpenRecord} onBack={() => setSelectedKey(null)} /></div> : <div className="hidden w-[300px] shrink-0 items-center justify-center border-l border-border p-6 text-center md:flex"><div><Tag size={26} className="mx-auto mb-3 text-primary opacity-50" /><p className="text-sm font-semibold">Everything in one place</p><p className="mt-2 text-xs leading-relaxed text-secondary">Choose a result to see its details and manage tags. Use #travel or #\"work expenses\" to search a tag.</p></div></div>}
      </div>
    </div>
  </div>;
}
