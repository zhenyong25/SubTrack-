import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ExternalLink, Download, Search, Loader2 } from 'lucide-react';
import { CARD_GRADES, latestPokemonPrices, safeMarketUrl, type PokemonTrackedCard, type PokemonPrice } from '../services/pokemonCardService';
import { openPokemonCardStore } from '../services/pokemonCardStorage';
import { fetchPsaCert } from '../services/pokemonMarketService';
import PokemonCardPicker from './PokemonCardPicker';
import PokemonMarketPanel from './PokemonMarketPanel';

const input = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-textMain';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold hover:border-primary disabled:opacity-40';
const money = (value: number, currency: string) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const blankCard = (): PokemonTrackedCard => ({ id: crypto.randomUUID(), name: '', set: '', number: '', language: '', grade: 'Raw', certificate: '', notes: '', prices: [] });
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="grid gap-1 text-xs font-bold text-secondary">{label}{children}</label>;

export default function PokemonCardPanel({ baseCurrency }: { baseCurrency: string }) {
  const [store, setStore] = useState<Awaited<ReturnType<typeof openPokemonCardStore>> | null>(null);
  const [cards, setCards] = useState<PokemonTrackedCard[]>([]);
  const [notice, setNotice] = useState('Loading card tracker…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<PokemonTrackedCard | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [history, setHistory] = useState<string | null>(null);
  const [lookup, setLookup] = useState<{ busy: boolean; message: string; failed?: boolean }>({ busy: false, message: '' });
  const [pickerVersion, setPickerVersion] = useState(0); // remounts the picker after a PSA lookup fills the card
  // Fills the card from PSA's record for the certificate on the slab's label.
  async function lookUpCertificate() {
    if (!draft || lookup.busy) return;
    if (!/^\d{5,12}$/.test(draft.certificate.trim())) { setLookup({ busy: false, message: 'Enter the certificate number printed on the PSA label (digits only).', failed: true }); return; }
    setLookup({ busy: true, message: '' }); setError('');
    try {
      const slab = await fetchPsaCert(draft.certificate);
      const halfGrade = slab.grade !== null && /\.5\s*$/.test(slab.gradeLabel) ? `PSA label: ${slab.gradeLabel}` : '';
      setDraft(current => current && {
        ...current, certificate: slab.certificate, name: slab.name, set: slab.set, number: slab.number, language: slab.language,
        grade: slab.grade ? `PSA ${slab.grade}` : current.grade,
        notes: current.notes || [slab.year, slab.variety, halfGrade].filter(Boolean).join(' · '),
        catalogId: undefined, catalogSetId: undefined, imageUrl: undefined, rarity: undefined, catalogSourceUrl: undefined, pokedexNumber: undefined, englishSpeciesName: undefined,
      });
      setPickerVersion(version => version + 1);
      setLookup({ busy: false, message: `Found ${slab.name} · ${slab.gradeLabel || 'grade not listed'}${slab.population ? ` · PSA population ${slab.population.toLocaleString()}` : ''}. Check the details, then save.` });
    } catch (e) {
      setLookup({ busy: false, message: e instanceof Error ? e.message : 'PSA could not be reached.', failed: true });
    }
  }
  useEffect(() => {
    let active = true;
    openPokemonCardStore().then(result => { if (active) { setStore(result); setCards(result.cards); setNotice(result.notice); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  async function persist(next: PokemonTrackedCard[]) {
    if (!store || busy) return false;
    setBusy(true); setError('');
    try { const message = await store.save(next); setCards(next); setNotice(message); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save cards.'); return false; }
    finally { setBusy(false); }
  }
  function backup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(cards, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `pokemon-cards-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const visible = cards.filter(card => `${card.name} ${card.set} ${card.number} ${card.language} ${card.certificate}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'All' || (filter === 'PSA' ? card.grade !== 'Raw' : card.grade === 'Raw')));
  return <section className="rounded-3xl border border-border bg-surface p-4 sm:p-6 space-y-5 text-textMain">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-extrabold">Pokémon card tracker</h2><p className="mt-1 text-sm text-secondary">Your high-value cards and PSA slabs, with market quotes fetched automatically from free sources.</p><p className="mt-1 text-xs text-secondary">Portfolio total stays manually entered. These reference prices do not change your holdings or net worth.</p></div>
      <div className="flex gap-2"><button className={button} onClick={backup} disabled={!cards.length}><Download size={15} />Backup JSON</button><button className={button} disabled={!store || busy} onClick={() => { setDraft(blankCard()); setLookup({ busy: false, message: '' }); setError(''); }}><Plus size={15} />Add card</button></div>
    </div>
    <p className="text-xs text-secondary" role="status">{notice} Market quotes refresh automatically while this section is open.</p>
    {error && !draft && <p role="alert" className="text-sm text-red-500">{error}</p>}
    <div className="flex flex-wrap gap-3"><input className={`${input} sm:!w-80`} aria-label="Search tracked cards" placeholder="Search name, set, number or PSA certificate" value={query} onChange={e => setQuery(e.target.value)} /><select className={`${input} !w-auto`} aria-label="Filter owned grade" value={filter} onChange={e => setFilter(e.target.value)}><option>All</option><option value="Raw">Owned raw</option><option value="PSA">Owned PSA slabs</option></select><span className="self-center text-xs text-secondary">{cards.length} tracked cards</span></div>
    {draft && <form className="rounded-2xl border border-border p-4 space-y-4" onSubmit={async e => {
      e.preventDefault(); const clean = { ...draft, name: draft.name.trim(), set: draft.set.trim(), certificate: draft.grade === 'Raw' ? '' : draft.certificate.trim() };
      if (!clean.name || !clean.set) { setError('Enter a card name and set.'); return; }
      if (await persist(cards.some(c => c.id === clean.id) ? cards.map(c => c.id === clean.id ? clean : c) : [...cards, clean])) setDraft(null);
    }}>
      <h3 className="font-bold">{cards.some(c => c.id === draft.id) ? 'Edit card' : 'Add a tracked card'}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Your card's grade"><select className={input} value={draft.grade} onChange={e => setDraft({ ...draft, grade: e.target.value as PokemonTrackedCard['grade'] })}>{CARD_GRADES.map(g => <option key={g} value={g}>{g === 'Raw' ? 'Raw / ungraded' : g}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="PSA certificate number - fills in the card for you">
          <div className="flex gap-2">
            <input inputMode="numeric" pattern="[0-9]+" className={input} value={draft.certificate} placeholder="e.g. 118141547" onChange={e => setDraft({ ...draft, certificate: e.target.value.replace(/\s/g, '') })}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookUpCertificate(); } }} />
            <button type="button" className={`${button} shrink-0`} disabled={lookup.busy || !draft.certificate.trim()} onClick={lookUpCertificate}>{lookup.busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}Look up</button>
          </div>
        </Field></div>
      </div>
      {lookup.message && <p role={lookup.failed ? 'alert' : 'status'} className={`text-xs ${lookup.failed ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{lookup.message}</p>}
      {draft.grade === 'Raw' && !draft.certificate && <p className="text-xs text-secondary">Raw cards do not need a PSA grade or certificate. Choose the card below, or enter its details if the catalog is missing it.</p>}
      <PokemonCardPicker key={`${draft.id}:${pickerVersion}`} card={draft} onChange={patch => setDraft(current => current ? { ...current, ...patch } : current)} />
      <Field label="Notes / raw condition / variant"><textarea className={input} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="e.g. Near mint, reverse holo, first edition" /></Field>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2"><button disabled={busy} className={button} type="submit">{busy ? 'Saving…' : 'Save card'}</button><button disabled={busy} className={button} type="button" onClick={() => setDraft(null)}>Cancel</button></div>
    </form>}
    {!visible.length && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-secondary">{cards.length ? 'No matching cards.' : 'Add a card to automatically fetch available raw and PSA market quotes.'}</div>}
    {visible.map(card => {
      const latest = latestPokemonPrices(card.prices);
      const groups = new Map<string, PokemonPrice[]>();
      latest.forEach(p => { const key = `${p.grade} · ${p.currency} · ${p.kind}`; groups.set(key, [...(groups.get(key) || []), p]); });
      return <article key={card.id} className="rounded-2xl border border-border p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold">{card.name} <span className="text-sm text-primary">{card.grade}</span></h3><p className="text-sm text-secondary">{[card.set, card.number, card.language].filter(Boolean).join(' · ')}</p>{card.certificate && <a className="text-xs text-primary underline" href={`https://www.psacard.com/cert/${encodeURIComponent(card.certificate)}`} target="_blank" rel="noopener noreferrer">PSA certificate {card.certificate}</a>}{card.notes && <p className="mt-1 text-xs text-secondary whitespace-pre-wrap">{card.notes}</p>}</div><div className="flex flex-wrap gap-2"><button disabled={busy} className={button} aria-label={`Edit ${card.name}`} onClick={() => { setDraft({ ...card });  }}><Pencil size={14} /></button><button disabled={busy} className={button} aria-label={`Delete ${card.name}`} onClick={async () => { if (window.confirm(`Delete ${card.name} and its price history?`)) { if (await persist(cards.filter(c => c.id !== card.id))) { if (draft?.id === card.id) setDraft(null);  } } }}><Trash2 size={14} /></button></div></div>
        {(card.imageUrl || card.englishSpeciesName || card.rarity) && <div className="flex items-center gap-3">{card.imageUrl && <img src={card.imageUrl} alt={card.name} className="h-24 w-16 object-contain" loading="lazy" />}<div className="text-xs text-secondary">{card.englishSpeciesName && <p className="font-bold text-textMain">English Pokémon name: {card.englishSpeciesName}</p>}{card.rarity && <p>Rarity: {card.rarity}</p>}{safeMarketUrl(card.catalogSourceUrl || '') && <a className="text-primary underline" href={safeMarketUrl(card.catalogSourceUrl || '')} target="_blank" rel="noopener noreferrer">Card identity source</a>}</div></div>}
        <PokemonMarketPanel key={card.id} card={card} />
        {groups.size ? <div className="grid gap-3 lg:grid-cols-2">{[...groups].map(([key, prices]) => {
          const values = prices.map(p => p.amount);
          return <div key={key} className="rounded-xl border border-border bg-background p-3"><p className="text-xs font-bold text-secondary">{key}</p><p className="mt-1 font-bold">{money(Math.min(...values), prices[0].currency)}{Math.max(...values) !== Math.min(...values) && ` – ${money(Math.max(...values), prices[0].currency)}`}</p><p className="text-[11px] text-secondary">Latest recorded per source · observation dates may differ</p><div className="mt-2 space-y-2">{prices.map(p => <div key={p.id} className="flex items-center justify-between gap-2 text-xs"><span>{p.source} <span className="text-secondary">{p.date}</span>{safeMarketUrl(p.url) && <a className="ml-1 inline-flex text-primary" aria-label={`Open ${p.source} source`} href={safeMarketUrl(p.url)} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /></a>}</span><strong>{money(p.amount, p.currency)}</strong></div>)}</div></div>;
        })}</div> : null}
        {card.prices.length > 0 && <><button className="text-xs font-bold text-primary" aria-expanded={history === card.id} onClick={() => setHistory(history === card.id ? null : card.id)}>{history === card.id ? 'Hide' : 'Show'} price history ({card.prices.length})</button>{history === card.id && <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="text-secondary">{['Date', 'Source', 'Grade', 'Type', 'Price', ''].map((h, i) => <th key={i} className="p-2">{h}</th>)}</tr></thead><tbody>{[...card.prices].sort((a, b) => b.date.localeCompare(a.date)).map(p => <tr key={p.id} className="border-t border-border"><td className="p-2 whitespace-nowrap">{p.date}</td><td className="p-2">{safeMarketUrl(p.url) ? <a className="text-primary underline" href={safeMarketUrl(p.url)} target="_blank" rel="noopener noreferrer">{p.source}</a> : p.source}</td><td className="p-2 whitespace-nowrap">{p.grade}</td><td className="p-2">{p.kind}</td><td className="p-2 whitespace-nowrap">{money(p.amount, p.currency)}</td><td className="p-2"><button className="text-red-500" disabled={busy} aria-label={`Delete ${p.source} ${p.grade} price from ${p.date}`} onClick={() => { if (window.confirm('Delete this price observation?')) void persist(cards.map(c => c.id === card.id ? { ...c, prices: c.prices.filter(item => item.id !== p.id) } : c)); }}><Trash2 size={13} /></button></td></tr>)}</tbody></table></div>}</>}
      </article>;
    })}
  </section>;
}
