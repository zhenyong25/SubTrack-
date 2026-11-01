import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, ExternalLink, Lock, Pencil, Phone, Plus, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { SELLER_PLATFORMS, matchSellers, type FlaggedSeller, type PokemonExtras } from '../services/pokemonExtrasService';
import { singaporeDate } from '../services/pokemonEventService';

// Your private scam watchlist: sellers or buyers you've had trouble with, a quick check before a
// trade, the warning signs common in card deals, and where to report. Nothing here is shared -
// it's your own notes, not a public blacklist.

const input = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-textMain';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="grid gap-1 text-xs font-bold text-secondary">{label}{children}</label>;
const blank = (currency: string): FlaggedSeller => ({ id: crypto.randomUUID(), name: '', platform: 'Carousell', handle: '', contact: '', reason: '', date: singaporeDate(), amountLost: null, currency, evidenceUrl: '', reportRef: '' });
const RED_FLAGS = [
  'Pressure to pay now, or a "deposit to hold" the card before you\'ve seen it.',
  'Won\'t meet in person or do cash on delivery, and insists on bank transfer or PayNow first.',
  'Asks to move from the marketplace chat to WhatsApp or Telegram, outside the platform\'s protection.',
  'Price well below what the same card sells for - check recent sold listings.',
  'A graded slab whose certificate number isn\'t found on the grader\'s site, or doesn\'t match the card, grade or label.',
  'New or empty account, no reviews, or photos that turn up elsewhere in a reverse image search.',
  'Sealed product with resealed wrap, wrong weight, or a seller who won\'t show the box from all sides.',
];
const LINKS: Array<[string, string, string]> = [
  ['ScamShield', 'https://www.scamshield.gov.sg', 'Official anti-scam advice and checks'],
  ['Scam Alert', 'https://www.scamalert.sg', 'Current scam types reported in Singapore'],
  ['Police e-services', 'https://eservices.police.gov.sg', 'Make a police report online'],
];

interface Props {
  extras: PokemonExtras;
  busy: boolean;
  baseCurrency: string;
  onSave: (next: PokemonExtras) => Promise<boolean>;
}

export default function PokemonScamPanel({ extras, busy, baseCurrency, onSave }: Props) {
  const [check, setCheck] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<FlaggedSeller | null>(null);

  const matches = useMemo(() => matchSellers(extras.sellers, check), [extras.sellers, check]);
  const listed = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return [...extras.sellers].sort((a, b) => b.date.localeCompare(a.date))
      .filter(seller => words.every(word => `${seller.name} ${seller.handle} ${seller.contact} ${seller.platform} ${seller.reason}`.toLowerCase().includes(word)));
  }, [extras.sellers, query]);
  const lost = useMemo(() => {
    const totals = new Map<string, number>();
    extras.sellers.forEach(seller => { if (seller.amountLost) totals.set(seller.currency, (totals.get(seller.currency) || 0) + seller.amountLost); });
    return [...totals];
  }, [extras.sellers]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || (!draft.name.trim() && !draft.handle.trim() && !draft.contact.trim())) return;
    const clean = { ...draft, name: draft.name.trim(), handle: draft.handle.trim(), contact: draft.contact.trim(), reason: draft.reason.trim(), evidenceUrl: /^https?:\/\//i.test(draft.evidenceUrl.trim()) ? draft.evidenceUrl.trim() : '', reportRef: draft.reportRef.trim() };
    const exists = extras.sellers.some(seller => seller.id === clean.id);
    if (await onSave({ ...extras, sellers: exists ? extras.sellers.map(seller => seller.id === clean.id ? clean : seller) : [...extras.sellers, clean] })) setDraft(null);
  };
  const remove = (id: string) => onSave({ ...extras, sellers: extras.sellers.filter(seller => seller.id !== id) });
  const backup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(extras.sellers, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `scam-watchlist-${singaporeDate()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-surface p-4 text-textMain sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold"><ShieldAlert size={20} className="text-primary" /> Scam watch</h2>
          <p className="mt-1 text-sm text-secondary">Check a seller before you trade, keep notes on anyone who scammed or flaked on you, and know where to report.</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-secondary"><Lock size={12} /> Private to you - your notes aren't shared or published.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={backup} disabled={!extras.sellers.length} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold hover:border-primary disabled:opacity-40"><Download size={15} /> Backup</button>
          <button type="button" onClick={() => setDraft(blank(baseCurrency))} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white"><Plus size={15} /> Flag someone</button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-background p-4">
        <p className="text-sm font-bold">Check before you trade</p>
        <label className="relative mt-2 block">
          <span className="sr-only">Name, username, profile link or phone number</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input className={`${input} pl-9`} value={check} onChange={e => setCheck(e.target.value)} placeholder="Name, username, profile link or phone number" />
        </label>
        {check.trim().length >= 3 && (matches.length
          ? (
            <div role="alert" className="mt-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
              <p className="flex items-center gap-1.5 font-bold"><AlertTriangle size={15} /> On your watchlist</p>
              {matches.map(seller => <p key={seller.id} className="mt-1 text-xs">{[seller.name, seller.handle, seller.contact].filter(Boolean).join(' · ')} ({seller.platform}) - {seller.reason || 'no reason noted'}</p>)}
            </div>
          )
          : <p className="mt-2 flex items-start gap-1.5 text-xs text-secondary"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" /> Not on your watchlist. That only covers people you've flagged - still check their reviews, and the warning signs below.</p>)}
      </div>

      {draft && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center justify-between"><h3 className="font-bold">{extras.sellers.some(seller => seller.id === draft.id) ? 'Edit entry' : 'Flag someone'}</h3><button type="button" onClick={() => setDraft(null)} aria-label="Close" className="text-secondary hover:text-textMain"><X size={16} /></button></div>
          <p className="text-xs text-secondary">Stick to what happened to you. Fill in at least a name, username or contact.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name"><input className={input} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Platform"><select className={input} value={draft.platform} onChange={e => setDraft({ ...draft, platform: e.target.value })}>{SELLER_PLATFORMS.map(platform => <option key={platform}>{platform}</option>)}</select></Field>
            <Field label="Date"><input type="date" className={input} value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Username or profile link"><input className={input} value={draft.handle} onChange={e => setDraft({ ...draft, handle: e.target.value })} /></Field>
            <Field label="Phone or other contact"><input className={input} value={draft.contact} onChange={e => setDraft({ ...draft, contact: e.target.value })} /></Field>
          </div>
          <Field label="What happened"><textarea className={input} placeholder="e.g. Paid a deposit for a PSA 10, seller blocked me" value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_1fr]">
            <Field label="Amount lost"><input type="number" min="0" step="0.01" className={input} value={draft.amountLost ?? ''} onChange={e => setDraft({ ...draft, amountLost: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} /></Field>
            <Field label="Currency"><input className={`${input} sm:w-24`} maxLength={3} value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></Field>
            <Field label="Evidence link"><input className={input} placeholder="Chat screenshot, listing" value={draft.evidenceUrl} onChange={e => setDraft({ ...draft, evidenceUrl: e.target.value })} /></Field>
            <Field label="Report / case no."><input className={input} value={draft.reportRef} onChange={e => setDraft({ ...draft, reportRef: e.target.value })} /></Field>
          </div>
          <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        </form>
      )}

      {extras.sellers.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">Your watchlist <span className="font-normal text-secondary">· {extras.sellers.length} {extras.sellers.length === 1 ? 'entry' : 'entries'}{lost.length > 0 && <> · {lost.map(([currency, amount]) => `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`).join(' + ')} lost</>}</span></p>
            <input className={`${input} sm:!w-64`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter your watchlist" aria-label="Filter your watchlist" />
          </div>
          <ul className="grid gap-2 lg:grid-cols-2">
            {listed.map(seller => (
              <li key={seller.id} className="rounded-2xl border border-red-500/25 bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-bold">{seller.name || seller.handle || seller.contact}</p>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-secondary">{seller.platform}</span>
                </div>
                <p className="mt-0.5 text-xs text-secondary">{[seller.name && seller.handle, seller.contact].filter(Boolean).join(' · ')}</p>
                {seller.reason && <p className="mt-1 text-xs">{seller.reason}</p>}
                <p className="mt-1 text-[11px] text-secondary">{new Date(`${seller.date}T00:00:00`).toLocaleDateString()}{seller.amountLost ? ` · lost ${seller.amountLost.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${seller.currency}` : ''}{seller.reportRef && ` · report ${seller.reportRef}`}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold">
                  {seller.evidenceUrl && <a href={seller.evidenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Evidence <ExternalLink size={10} /></a>}
                  <button type="button" onClick={() => setDraft(seller)} className="inline-flex items-center gap-1 text-secondary hover:text-textMain"><Pencil size={11} /> Edit</button>
                  <button type="button" disabled={busy} onClick={() => remove(seller.id)} className="inline-flex items-center gap-1 text-red-500"><Trash2 size={11} /> Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-background p-4 text-xs leading-relaxed text-secondary">
          <p className="flex items-center gap-1.5 text-sm font-bold text-textMain"><AlertTriangle size={14} className="text-amber-500" /> Warning signs in card deals</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">{RED_FLAGS.map(flag => <li key={flag}>{flag}</li>)}</ul>
        </div>
        <div className="rounded-2xl border border-border bg-background p-4 text-xs leading-relaxed text-secondary">
          <p className="text-sm font-bold text-textMain">If you've been scammed</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Call your bank straight away to try to stop the transfer.</li>
            <li>Keep the chats, listing, payment record and the other person's details.</li>
            <li>Report it to the platform, and make a police report.</li>
          </ol>
          <p className="mt-3 flex items-center gap-1.5 font-bold text-textMain"><Phone size={13} /> ScamShield Helpline: <a href="tel:1799" className="text-primary">1799</a></p>
          <ul className="mt-2 space-y-1">
            {LINKS.map(([label, url, description]) => (
              <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-primary hover:underline">{label} <ExternalLink size={10} /></a> - {description}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
