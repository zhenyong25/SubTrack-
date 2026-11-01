import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ExternalLink, Pencil, Plus, ShieldCheck, Trash2, Wrench, X } from 'lucide-react';
import {
  SUBMISSION_SERVICES, SUBMISSION_STATUSES, nextStatus, submissionSummary, submissionTiming,
  type CardSubmission, type PokemonExtras,
} from '../services/pokemonExtrasService';
import { openPokemonCardStore } from '../services/pokemonCardStorage';
import { singaporeDate } from '../services/pokemonEventService';

// Cards you've sent out - to a grader, or for pressing, cleaning or repair - and where each one is.

const input = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-textMain';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="grid gap-1 text-xs font-bold text-secondary">{label}{children}</label>;
const PROVIDERS = ['PSA', 'Beckett (BGS)', 'CGC', 'TAG'];
const STATUS_STYLE: Record<string, string> = {
  Preparing: 'bg-slate-500/10 text-secondary', Sent: 'bg-blue-500/10 text-blue-600 dark:text-blue-300', 'Received by provider': 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
  'In progress': 'bg-amber-500/10 text-amber-700 dark:text-amber-300', 'Shipped back': 'bg-purple-500/10 text-purple-600 dark:text-purple-300', Returned: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
};
const blank = (currency: string): CardSubmission => ({
  id: crypto.randomUUID(), card: '', service: 'Grading', provider: 'PSA', sentDate: '', expectedDate: '', returnedDate: '', status: 'Preparing',
  cost: null, currency, tracking: '', result: '', notes: '',
});

interface Props {
  extras: PokemonExtras;
  busy: boolean;
  baseCurrency: string;
  onSave: (next: PokemonExtras) => Promise<boolean>;
}

export default function PokemonServicesPanel({ extras, busy, baseCurrency, onSave }: Props) {
  const [draft, setDraft] = useState<CardSubmission | null>(null);
  const [cardNames, setCardNames] = useState<string[]>([]);
  const [showReturned, setShowReturned] = useState(false);

  // Your tracked cards, offered as suggestions.
  useEffect(() => {
    let active = true;
    openPokemonCardStore().then(store => { if (active) setCardNames([...new Set(store.cards.map(card => [card.name, card.set, card.grade !== 'Raw' ? card.grade : ''].filter(Boolean).join(' · ')))]); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const today = singaporeDate();
  const summary = useMemo(() => submissionSummary(extras.submissions), [extras.submissions]);
  const ordered = useMemo(() => [...extras.submissions].sort((a, b) => SUBMISSION_STATUSES.indexOf(a.status) - SUBMISSION_STATUSES.indexOf(b.status) || (b.sentDate || '').localeCompare(a.sentDate || '')), [extras.submissions]);
  const active = ordered.filter(item => item.status !== 'Returned');
  const returned = ordered.filter(item => item.status === 'Returned');

  const put = (item: CardSubmission) => onSave({ ...extras, submissions: extras.submissions.some(existing => existing.id === item.id) ? extras.submissions.map(existing => existing.id === item.id ? item : existing) : [...extras.submissions, item] });
  const advance = (item: CardSubmission) => {
    const status = nextStatus(item.status);
    if (!status) return;
    put({ ...item, status, sentDate: status === 'Sent' && !item.sentDate ? today : item.sentDate, returnedDate: status === 'Returned' && !item.returnedDate ? today : item.returnedDate });
  };
  const remove = (id: string) => onSave({ ...extras, submissions: extras.submissions.filter(item => item.id !== id) });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !draft.card.trim()) return;
    if (await put({ ...draft, card: draft.card.trim(), provider: draft.provider.trim() })) setDraft(null);
  };

  const row = (item: CardSubmission) => {
    const timing = submissionTiming(item, today);
    const next = nextStatus(item.status);
    return (
      <li key={item.id} className="rounded-2xl border border-border bg-background p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold leading-snug">{item.card}</p>
            <p className="mt-0.5 text-xs text-secondary">{item.service}{item.provider && <> · {item.provider}</>}{item.cost != null && <> · {item.cost.toLocaleString(undefined, { maximumFractionDigits: 2 })} {item.currency}</>}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[item.status]}`}>{item.status}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-secondary">
          {item.sentDate && <span>Sent {new Date(`${item.sentDate}T00:00:00`).toLocaleDateString()}</span>}
          {timing && <span>{timing.out} day{timing.out === 1 ? '' : 's'} out</span>}
          {timing?.overdue ? <span className="font-bold text-red-500">{timing.overdue} day{timing.overdue === 1 ? '' : 's'} past expected</span> : item.expectedDate && item.status !== 'Returned' ? <span>Expected {new Date(`${item.expectedDate}T00:00:00`).toLocaleDateString()}</span> : null}
          {item.returnedDate && <span>Back {new Date(`${item.returnedDate}T00:00:00`).toLocaleDateString()}</span>}
          {item.tracking && <span>Tracking {item.tracking}</span>}
          {item.result && <span className="font-bold text-textMain">Result: {item.result}</span>}
        </div>
        {item.notes && <p className="mt-1 text-[11px] text-secondary">{item.notes}</p>}
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold">
          {next && <button type="button" disabled={busy} onClick={() => advance(item)} className="inline-flex items-center gap-1 text-primary disabled:opacity-50"><ArrowRight size={12} /> Mark {next.toLowerCase()}</button>}
          <button type="button" onClick={() => setDraft(item)} className="inline-flex items-center gap-1 text-secondary hover:text-textMain"><Pencil size={11} /> Edit</button>
          <button type="button" disabled={busy} onClick={() => remove(item.id)} className="inline-flex items-center gap-1 text-red-500"><Trash2 size={11} /> Delete</button>
        </div>
      </li>
    );
  };

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-surface p-4 text-textMain sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold"><Wrench size={20} className="text-primary" /> Grading & repair</h2>
          <p className="mt-1 text-sm text-secondary">Track cards sent for grading, pressing, cleaning or repair - where each one is and what it cost.</p>
        </div>
        <button type="button" onClick={() => setDraft(blank(baseCurrency))} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white"><Plus size={15} /> Add submission</button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Out now', String(summary.active)],
          ['Returned', String(summary.returned)],
          ['Avg. turnaround', summary.averageDays != null ? `${summary.averageDays} days` : '-'],
          ['Spent', summary.spent.length ? summary.spent.map(item => `${item.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.currency}`).join(' + ') : '-'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-background p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-secondary">{label}</p>
            <p className="mt-1 text-base font-extrabold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {draft && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center justify-between"><h3 className="font-bold">{extras.submissions.some(item => item.id === draft.id) ? 'Edit submission' : 'New submission'}</h3><button type="button" onClick={() => setDraft(null)} aria-label="Close" className="text-secondary hover:text-textMain"><X size={16} /></button></div>
          <Field label="Card"><input required list="submission-cards" className={input} placeholder="e.g. Charizard ex · 151" value={draft.card} onChange={e => setDraft({ ...draft, card: e.target.value })} /></Field>
          <datalist id="submission-cards">{cardNames.map(name => <option key={name} value={name} />)}</datalist>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Service"><select className={input} value={draft.service} onChange={e => setDraft({ ...draft, service: e.target.value as CardSubmission['service'] })}>{SUBMISSION_SERVICES.map(service => <option key={service}>{service}</option>)}</select></Field>
            <Field label="Provider"><input list="submission-providers" className={input} placeholder="Grader or repair shop" value={draft.provider} onChange={e => setDraft({ ...draft, provider: e.target.value })} /></Field>
            <Field label="Status"><select className={input} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as CardSubmission['status'] })}>{SUBMISSION_STATUSES.map(status => <option key={status}>{status}</option>)}</select></Field>
          </div>
          <datalist id="submission-providers">{PROVIDERS.map(name => <option key={name} value={name} />)}</datalist>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Sent on"><input type="date" className={input} value={draft.sentDate} onChange={e => setDraft({ ...draft, sentDate: e.target.value })} /></Field>
            <Field label="Expected back"><input type="date" className={input} value={draft.expectedDate} onChange={e => setDraft({ ...draft, expectedDate: e.target.value })} /></Field>
            <Field label="Returned on"><input type="date" className={input} value={draft.returnedDate} onChange={e => setDraft({ ...draft, returnedDate: e.target.value })} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <Field label="Cost"><input type="number" min="0" step="0.01" className={input} value={draft.cost ?? ''} onChange={e => setDraft({ ...draft, cost: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} /></Field>
            <Field label="Currency"><input className={`${input} sm:w-24`} maxLength={3} value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></Field>
            <Field label="Tracking / order no."><input className={input} value={draft.tracking} onChange={e => setDraft({ ...draft, tracking: e.target.value })} /></Field>
          </div>
          <Field label="Result"><input className={input} placeholder="e.g. PSA 9, or Pressed - dent gone" value={draft.result} onChange={e => setDraft({ ...draft, result: e.target.value })} /></Field>
          <Field label="Notes"><textarea className={input} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></Field>
          <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        </form>
      )}

      {extras.submissions.length === 0 && !draft
        ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-secondary">Nothing sent out yet. Add a submission when you send a card for grading or repair.</p>
        : (
          <>
            {active.length > 0 && <ul className="grid gap-2 lg:grid-cols-2">{active.map(row)}</ul>}
            {returned.length > 0 && (
              <div className="space-y-2">
                <button type="button" onClick={() => setShowReturned(value => !value)} className="text-xs font-bold text-primary">{showReturned ? 'Hide' : 'Show'} {returned.length} returned</button>
                {showReturned && <ul className="grid gap-2 lg:grid-cols-2">{returned.map(row)}</ul>}
              </div>
            )}
          </>
        )}

      <div className="rounded-2xl border border-border bg-background p-4 text-xs leading-relaxed text-secondary">
        <p className="flex items-center gap-1.5 font-bold text-textMain"><ShieldCheck size={14} className="text-primary" /> Before and after sending</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Photograph both sides of each card before it leaves, so any damage in transit is on record.</li>
          <li>Ship in a penny sleeve inside a semi-rigid or top-loader, sandwiched between card stock, with tracking.</li>
          <li>Singapore is humid - keep raw cards in a dry box or with silica gel to prevent warping and curling.</li>
          <li>When a slab comes back, check its certificate number on the grader's own site (for PSA: <a href="https://www.psacard.com/cert/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-bold text-primary">psacard.com/cert <ExternalLink size={10} /></a>).</li>
        </ul>
      </div>
    </section>
  );
}
