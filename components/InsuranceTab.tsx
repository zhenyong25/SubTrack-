import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, Plane, Plus, Pencil, Trash2, X, RefreshCw, Sparkles } from 'lucide-react';
import { CURRENCIES } from '../types';
import { BenefitsEditor, BenefitsList, ImportPanel } from './InsuranceImport';
import { DocumentsEditor, DocumentsList } from './InsuranceDocuments';
import BankLogo from './BankLogo';
import { findInsurer } from '../services/insurerLogoService';
import { removePolicyDocuments, uploadPolicyDocument } from '../services/insuranceDocumentService';
import { INSURANCE_KINDS, STATUS_ORDER, annualPremium, deleteInsurance, insuranceMetrics, insuranceToday, loadInsurance, policyStatus, saveInsurance, statusLabel, type InsuranceDocument, type InsurancePolicy, type PolicyStatus } from '../services/insuranceService';

const box = 'rounded-2xl border border-border bg-surface p-5';
const input = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-textMain outline-none focus:border-primary';
const money = (n: number, currency: string) => `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const dateText = (date: string) => date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'No end date';
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';
const STATUS_STYLE: Record<PolicyStatus, string> = { Active: 'bg-emerald-500/10 text-emerald-500', Upcoming: 'bg-blue-500/10 text-blue-500', Expired: 'bg-red-500/10 text-red-400', Archived: 'bg-background text-secondary' };
// "Current" covers both labels for a policy in force: Active (recurring) and Current (one-time).
const STATUS_FILTERS: Array<[string, PolicyStatus | null]> = [['All', null], ['Current', 'Active'], ['Upcoming', 'Upcoming'], ['Expired', 'Expired'], ['Archived', 'Archived']];

function PolicyForm({ policy, isNew, startWithImport, onClose, onSaved }: { policy: InsurancePolicy; isNew: boolean; startWithImport: boolean; onClose: () => void; onSaved: (p: InsurancePolicy) => void }) {
  const [showImport, setShowImport] = useState(startWithImport);
  const [draft, setDraft] = useState(policy); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [pending, setPending] = useState<File[]>([]); const [removed, setRemoved] = useState<InsuranceDocument[]>([]);
  const addFile = (file: File) => setPending(files => files.some(f => f.name === file.name && f.size === file.size) ? files : [...files, file]);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { dialog.close(); document.body.style.overflow = overflow; }; }, []);
  const field = (key: keyof InsurancePolicy, label: string, type = 'text', required = false) => <label className="text-xs font-semibold text-secondary">{label}<input className={input} type={type} required={required} maxLength={type === 'text' ? 200 : undefined} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} value={String(draft[key])} onChange={e => setDraft({ ...draft, [key]: type === 'number' ? Number(e.target.value) : e.target.value })} /></label>;
  return <dialog aria-label="Insurance policy editor" ref={ref} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_24px)] max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-textMain shadow-2xl backdrop:bg-black/60">
    <div className="flex items-center justify-between border-b border-border p-5"><h2 className="font-bold">{isNew ? 'Add insurance' : 'Edit policy'}</h2><button type="button" disabled={busy} aria-label="Close insurance form" onClick={onClose} className="p-2 text-secondary"><X size={18} /></button></div>
    <form className="space-y-4 p-5" onSubmit={async e => { e.preventDefault(); setError(''); setBusy(true); const uploaded: InsuranceDocument[] = []; try {
        const clean = { ...draft, name: draft.name.trim(), insurer: draft.insurer.trim(), insuredPerson: draft.insuredPerson.trim(), benefits: (draft.benefits ?? []).map(b => ({ ...b, name: b.name.trim(), limitText: b.limitText.trim(), details: b.details.trim() })) };
        for (const file of pending) uploaded.push(await uploadPolicyDocument(clean.id, file));
        clean.documents = [...(draft.documents ?? []), ...uploaded];
        await saveInsurance(clean); await removePolicyDocuments(removed); onSaved(clean);
      } catch (err) { await removePolicyDocuments(uploaded); setError(errorText(err)); } finally { setBusy(false); } }}>
      {showImport ? <ImportPanel draft={draft} initial={policy} isNew={isNew} onApply={setDraft} onFileRead={file => { if (/pdf|image/.test(file.type)) addFile(file); }} /> : <button type="button" disabled={busy} onClick={() => setShowImport(true)} className="flex items-center gap-1.5 text-xs font-bold text-primary"><Sparkles size={14} />Fill in from a link or document</button>}
      <fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        {field('name', 'Policy / plan name', 'text', true)}{field('insurer', 'Insurance company', 'text', true)}
        {field('insuredPerson', 'Insured person(s)', 'text', true)}{field('policyNumber', 'Policy number')}
        <label className="text-xs font-semibold text-secondary">Insurance type<select className={input} value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as InsurancePolicy['kind'] })}>{INSURANCE_KINDS.map(k => <option key={k}>{k}</option>)}</select></label>
        <label className="text-xs font-semibold text-secondary">Currency<select className={input} value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
        {field('premium', 'Premium per payment', 'number', true)}
        <label className="text-xs font-semibold text-secondary">Payment frequency<select className={input} value={draft.frequency} onChange={e => setDraft({ ...draft, frequency: e.target.value as InsurancePolicy['frequency'] })}>{['Monthly', 'Quarterly', 'Yearly', 'One-time'].map(f => <option key={f}>{f}</option>)}</select></label>
        {field('coverage', 'Main coverage limit / sum assured', 'number')}{field('deductible', 'Deductible / excess', 'number')}
        {field('startDate', 'Coverage starts', 'date', draft.kind === 'Travel')}{field('endDate', 'Coverage ends', 'date', draft.kind === 'Travel')}
        {field('renewalDate', 'Next premium / renewal date', 'date')}{field('emergencyPhone', 'Claims / emergency phone', 'tel')}
        {draft.kind === 'Travel' && field('destination', 'Destination / covered region', 'text', true)}
        <label className="text-xs font-semibold text-secondary sm:col-span-2">Benefits, exclusions and notes<textarea className={input} rows={3} maxLength={4000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Medical limits, beneficiaries, riders, baggage, cancellation and claim contacts…" /></label>
        <BenefitsEditor benefits={draft.benefits ?? []} currency={draft.currency} onChange={benefits => setDraft(d => ({ ...d, benefits }))} />
        <DocumentsEditor saved={draft.documents ?? []} pending={pending} onAdd={addFile} onRemovePending={file => setPending(files => files.filter(f => f !== file))} onRemoveSaved={doc => { setDraft(d => ({ ...d, documents: (d.documents ?? []).filter(x => x.path !== doc.path) })); setRemoved(r => [...r, doc]); }} />
        <label className="flex items-center gap-2 text-xs text-secondary"><input type="checkbox" checked={draft.archived} onChange={e => setDraft({ ...draft, archived: e.target.checked })} />Archived / cancelled</label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save policy'}</button>
    </form>
  </dialog>;
}

export default function InsuranceTab({ baseCurrency }: { baseCurrency: string; key?: string }) {
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [view, setView] = useState('All'); const [status, setStatus] = useState('All'); const [query, setQuery] = useState(''); const [currency, setCurrency] = useState(baseCurrency);
  const [form, setForm] = useState<{ policy: InsurancePolicy; isNew: boolean; startWithImport: boolean } | null>(null); const [deleting, setDeleting] = useState<InsurancePolicy | null>(null); const [busy, setBusy] = useState(false);
  const [today, setToday] = useState(insuranceToday);
  useEffect(() => { const timer = window.setInterval(() => setToday(insuranceToday()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { let alive = true; loadInsurance().then(data => { if (alive) setPolicies(data); }).catch(e => { if (alive) setError(errorText(e)); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const refresh = async () => { setLoading(true); setError(''); try { setPolicies(await loadInsurance()); } catch (e) { setError(errorText(e)); } finally { setLoading(false); } };
  const metrics = insuranceMetrics(policies, currency, today);
  const ofView = useMemo(() => policies.filter(p => (view === 'All' || (view === 'Personal' ? p.kind !== 'Travel' : p.kind === 'Travel')) && `${p.name} ${p.insurer} ${p.insuredPerson} ${p.policyNumber} ${p.destination} ${(p.benefits ?? []).map(b => b.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())), [policies, view, query]);
  const counts = useMemo(() => { const c: Partial<Record<PolicyStatus, number>> = {}; for (const p of ofView) { const s = policyStatus(p, today); c[s] = (c[s] || 0) + 1; } return c; }, [ofView, today]);
  const wanted = STATUS_FILTERS.find(([label]) => label === status)?.[1] ?? null;
  // In force and upcoming soonest first; expired and archived most recent first.
  const visible = useMemo(() => ofView.map(p => ({ p, s: policyStatus(p, today) })).filter(x => !wanted || x.s === wanted).sort((a, b) => {
    const rank = STATUS_ORDER.indexOf(a.s) - STATUS_ORDER.indexOf(b.s); if (rank) return rank;
    if (a.s === 'Upcoming') return a.p.startDate.localeCompare(b.p.startDate);
    const byEnd = (a.p.endDate || '9999').localeCompare(b.p.endDate || '9999');
    return a.s === 'Active' ? byEnd : -byEnd;
  }).map(x => x.p), [ofView, wanted, today]);
  const create = (startWithImport = false) => setForm({ isNew: true, startWithImport, policy: { id: crypto.randomUUID(), name: '', insurer: '', policyNumber: '', insuredPerson: '', kind: view === 'Travel' ? 'Travel' : 'Medical', currency: baseCurrency, premium: 0, frequency: view === 'Travel' ? 'One-time' : 'Monthly', coverage: 0, deductible: 0, startDate: today, endDate: '', renewalDate: '', destination: '', emergencyPhone: '', notes: '', archived: false, benefits: [] } });
  return <div className="space-y-5 pb-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-extrabold"><ShieldCheck className="text-primary" />Insurance</h1><p className="mt-1 text-sm text-secondary">Your policies, protection and travel cover in one place.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => create(true)} disabled={loading || !!error} className="flex items-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-40"><Sparkles size={16} />Import from link or PDF</button><button onClick={() => create()} disabled={loading || !!error} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Plus size={16} />Add policy</button></div></div>
    {error && <div role="alert" className={`${box} text-sm text-red-400`}>{error}<button onClick={refresh} className="ml-3 inline-flex items-center gap-1 text-primary"><RefreshCw size={14} />Retry</button></div>}
    {loading ? <p role="status" className="py-10 text-center text-secondary">Loading insurance…</p> : !error && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-1 rounded-xl bg-surface p-1">{['All', 'Personal', 'Travel'].map(v => <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-lg px-4 py-2 text-xs font-bold ${view === v ? 'bg-primary text-white' : 'text-secondary'}`}>{v === 'All' ? 'All policies' : v}</button>)}</div><label className="flex items-center gap-2 text-xs text-secondary">Metrics currency<select className="rounded-lg border border-border bg-surface p-2 text-textMain" value={currency} onChange={e => setCurrency(e.target.value)}>{[...new Set([baseCurrency, ...policies.map(p => p.currency)])].map(c => <option key={c}>{c}</option>)}</select></label></div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[
        ['Active policies', String(metrics.active), `In ${currency}`], ['Annual premiums', money(metrics.annual, currency), `${money(metrics.annual / 12, currency)} / month equivalent`], ['Due within 30 days', String(metrics.due), 'Includes overdue dates'], ['Travel premiums', money(metrics.travel, currency), 'One-time · current and upcoming policies'],
      ].map(([label, value, note]) => <div key={label} className={box}><p className="text-xs text-secondary">{label}</p><p className="mt-2 break-words text-xl font-extrabold tabular-nums">{value}</p><p className="mt-1 text-[11px] text-secondary">{note}</p></div>)}</div>
      <div className={box}><h2 className="text-sm font-bold">Coverage by type · {currency}</h2><p className="mt-1 text-xs text-secondary">Recorded main limits for active policies. Limits can overlap and do not indicate a combined claim entitlement.</p><div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-7">{metrics.coverage.map(c => <div key={c.kind}><p className="text-[11px] text-secondary">{c.kind}</p><p className="mt-1 text-sm font-bold tabular-nums">{money(c.amount, currency)}</p></div>)}</div></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">{view === 'All' ? 'Policy register' : `${view} insurance`} <span className="text-xs font-normal text-secondary">{visible.length} policies</span></h2><input aria-label="Search insurance policies" type="search" placeholder="Search policies, people, benefits…" value={query} onChange={e => setQuery(e.target.value)} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm sm:w-80" /></div>
      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">{STATUS_FILTERS.filter(([label]) => label !== 'Archived' || counts.Archived || status === 'Archived').map(([label, s]) => <button key={label} aria-pressed={status === label} onClick={() => setStatus(label)} className={`rounded-full border px-3 py-1 text-xs font-bold ${status === label ? 'border-primary bg-primary text-white' : 'border-border text-secondary'}`}>{label} <span className="font-normal opacity-80">{s ? counts[s] || 0 : ofView.length}</span></button>)}</div>
      {!visible.length ? <div className={`${box} py-12 text-center`}><ShieldCheck size={32} className="mx-auto mb-3 text-secondary" /><h3 className="font-bold">{policies.length ? 'No matching policies' : 'Start your insurance register'}</h3><p className="mt-2 text-sm text-secondary">{policies.length ? 'Try another search, status or policy type.' : 'Add personal cover or travel insurance to track premiums, limits and dates.'}</p>{!policies.length && <button onClick={() => create()} className="mt-4 text-sm font-bold text-primary">Add your first policy</button>}</div> : <div className="grid gap-4 lg:grid-cols-2">{visible.map(p => <article key={p.id} className={`${box} flex flex-col border-t-2 border-t-blue-400/40`}>
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><BankLogo bank={findInsurer(p.insurer)} className="h-11 w-11" fallback={<span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{p.kind === 'Travel' ? <Plane size={20} /> : <ShieldCheck size={20} />}</span>} /><div className="min-w-0"><p className="text-xs text-secondary">{p.kind} · {p.insurer}</p><h3 className="mt-1 break-words font-bold">{p.name}</h3><p className="mt-1 text-xs text-secondary">{p.insuredPerson}{p.policyNumber && ` · ${p.policyNumber}`}</p></div></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${STATUS_STYLE[policyStatus(p, today)]}`}>{statusLabel(p, today)}</span></div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-xs"><div><dt className="text-secondary">Premium · {p.frequency.toLowerCase()}</dt><dd className="mt-1 font-bold">{money(p.premium, p.currency)}</dd></div><div><dt className="text-secondary">Main coverage limit</dt><dd className="mt-1 font-bold">{money(p.coverage, p.currency)}</dd></div><div><dt className="text-secondary">Coverage dates</dt><dd className="mt-1">{p.startDate ? dateText(p.startDate) : 'Start not recorded'} → {dateText(p.endDate)}</dd></div><div><dt className="text-secondary">Next premium / renewal</dt><dd className={`mt-1 ${p.renewalDate && p.renewalDate < today && !p.archived && policyStatus(p, today) !== 'Expired' ? 'text-amber-500' : ''}`}>{p.renewalDate ? dateText(p.renewalDate) : 'Not recorded'}</dd></div></dl>
        {p.kind === 'Travel' && <p className="mt-4 rounded-lg bg-background p-3 text-xs text-secondary">Destination / region: <span className="text-textMain">{p.destination}</span></p>}
        <details className="mt-4 text-xs"><summary className="cursor-pointer text-secondary">Policy details</summary><div className="mt-3 space-y-2"><p>Deductible / excess: {money(p.deductible, p.currency)}</p>{p.frequency !== 'One-time' && <p>Annual premium equivalent: {money(annualPremium(p), p.currency)}</p>}{p.emergencyPhone && <p>Claims / emergency: {p.emergencyPhone}</p>}{p.notes && <p className="whitespace-pre-wrap break-words text-secondary">{p.notes}</p>}</div></details>
        <DocumentsList policy={p} />
        <BenefitsList policy={p} />
        <div aria-hidden="true" className="min-h-4 flex-1" />
        <div className="mt-auto flex justify-end gap-3 border-t border-border pt-3"><button onClick={() => setForm({ policy: p, isNew: false, startWithImport: false })} className="flex items-center gap-1 text-xs font-semibold text-secondary"><Pencil size={14} />Edit</button><button onClick={() => setDeleting(p)} className="flex items-center gap-1 text-xs text-secondary"><Trash2 size={14} />Delete</button></div>
      </article>)}</div>}
      <p className="text-[11px] text-secondary">Premium metrics include current and upcoming policies in the selected currency; archived and expired policies are excluded. One-time premiums are excluded from annual totals. Records do not create expenses automatically.</p>
    </>}
    {form && <PolicyForm policy={form.policy} isNew={form.isNew} startWithImport={form.startWithImport} onClose={() => setForm(null)} onSaved={p => { setPolicies(rows => [...rows.filter(row => row.id !== p.id), p]); setForm(null); }} />}
    {deleting && <div className={`${box} fixed bottom-24 left-1/2 z-50 w-[calc(100%_-_32px)] max-w-md -translate-x-1/2 shadow-2xl`} role="alertdialog" aria-modal="false" aria-label="Delete insurance policy"><p className="text-sm">Delete {deleting.name}? This removes the saved policy record{deleting.documents?.length ? ' and its stored documents' : ''}.</p><div className="mt-3 flex justify-end gap-4"><button disabled={busy} onClick={() => setDeleting(null)} className="text-sm text-secondary">Cancel</button><button disabled={busy} onClick={async () => { setBusy(true); try { await deleteInsurance(deleting.id); await removePolicyDocuments(deleting.documents ?? []); setPolicies(rows => rows.filter(p => p.id !== deleting.id)); setDeleting(null); } catch (e) { setError(errorText(e)); setDeleting(null); } finally { setBusy(false); } }} className="text-sm font-bold text-red-400">{busy ? 'Deleting…' : 'Delete policy'}</button></div></div>}
  </div>;
}

