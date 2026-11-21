import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CalendarClock, CheckCircle2, ExternalLink, Lightbulb, Pencil, Plus, Receipt, RefreshCw, Trash2, Wand2, X } from 'lucide-react';
import type { Income } from '../types';
import { DocumentsEditor, StoredDocuments } from './InsuranceDocuments';
import { readPolicyDocument, removePolicyDocuments, uploadPolicyDocument } from '../services/insuranceDocumentService';
import {
  DONATION_MULTIPLIER, LIMITS, RATE_TABLE, RELIEF_CAP, RELIEF_CHECKLIST, RELIEF_FIELDS, REBATES, computeTax, currentYa, emptyYear,
  employmentFromIncomes, estimateCpf, incomeYear, savings, type ReliefKey, type TaxDocument, type TaxYear,
} from '../services/sgTaxService';
import { deleteTaxYear, loadTaxYears, saveTaxYear } from '../services/taxRecordService';

const box = 'rounded-2xl border border-border bg-surface p-5';
const input = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-textMain outline-none focus:border-primary';
const sgd = (n: number, digits = 0) => `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const pct = (n: number) => `${(n * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const STATUS_STYLE: Record<TaxYear['status'], string> = { Estimate: 'bg-blue-500/10 text-blue-500', Filed: 'bg-amber-500/10 text-amber-500', Assessed: 'bg-emerald-500/10 text-emerald-500' };
const SECTIONS = [['Overview', 'Overview'], ['Records', 'Records'], ['Save', 'Save tax'], ['Learn', 'Learn']] as const;
const readTaxDocument = (doc: TaxDocument) => readPolicyDocument(doc, 'tax');

export default function TaxTab({ incomes }: { incomes: Income[]; key?: string }) {
  const [today, setToday] = useState(todayIso);
  useEffect(() => { const t = window.setInterval(() => setToday(todayIso()), 60_000); return () => clearInterval(t); }, []);
  const [years, setYears] = useState<TaxYear[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [section, setSection] = useState<typeof SECTIONS[number][0]>('Overview');
  const [ya, setYa] = useState(0);
  const [form, setForm] = useState<{ year: TaxYear; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<TaxYear | null>(null); const [busy, setBusy] = useState(false);
  const load = async () => { setLoading(true); setError(''); try { setYears(await loadTaxYears()); } catch (e) { setError(errorText(e)); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const sorted = useMemo(() => [...years].sort((a, b) => b.ya - a.ya), [years]);
  const nowYa = currentYa(today);
  const selected = sorted.find(y => y.ya === ya) ?? sorted.find(y => y.ya === nowYa) ?? sorted[0];

  const create = (target = nowYa) => {
    const prev = sorted.find(y => y.ya < target);
    const draft = emptyYear(target, prev);
    const fromIncome = employmentFromIncomes(incomes, incomeYear(target)).total;
    setForm({ isNew: true, year: { ...draft, employment: fromIncome } });
  };
  const nextNewYa = [nowYa, ...Array.from({ length: 10 }, (_, i) => nowYa - 1 - i)].find(t => !years.some(y => y.ya === t)) ?? nowYa;

  return <div className="space-y-5 pb-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-extrabold"><Receipt className="text-primary" />Tax</h1><p className="mt-1 text-sm text-secondary">Singapore income tax: yearly records, estimates and ways to pay less.</p></div>
      <button onClick={() => create(nextNewYa)} disabled={loading || !!error} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Plus size={16} />Add YA {nextNewYa}</button>
    </div>
    {error && <div role="alert" className={`${box} text-sm text-red-400`}>{error}<button onClick={load} className="ml-3 inline-flex items-center gap-1 text-primary"><RefreshCw size={14} />Retry</button></div>}
    {loading ? <p role="status" className="py-10 text-center text-secondary">Loading tax records…</p> : !error && <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Tax sections" className="flex flex-wrap gap-1 rounded-xl bg-surface p-1">{SECTIONS.map(([id, label]) => <button key={id} role="tab" aria-selected={section === id} onClick={() => setSection(id)} className={`rounded-lg px-4 py-2 text-xs font-bold ${section === id ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}>{label}</button>)}</div>
        {selected && section !== 'Learn' && section !== 'Records' && <label className="flex items-center gap-2 text-xs text-secondary">Year of Assessment<select aria-label="Year of Assessment" className="rounded-lg border border-border bg-surface p-2 text-textMain" value={selected.ya} onChange={e => setYa(Number(e.target.value))}>{sorted.map(y => <option key={y.id} value={y.ya}>YA {y.ya} · {incomeYear(y.ya)} income</option>)}</select></label>}
      </div>
      {section === 'Learn' ? <Learn today={today} /> : !selected ? <div className={`${box} py-12 text-center`}>
        <Receipt size={32} className="mx-auto mb-3 text-secondary" /><h2 className="font-bold">Start your tax records</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-secondary">Add YA {nowYa} to estimate the tax on what you earn in {incomeYear(nowYa)}, and see how much SRS, CPF top-ups or donations would save before 31 December.</p>
        <button onClick={() => create(nowYa)} className="mt-4 text-sm font-bold text-primary">Add YA {nowYa}</button>
      </div> : section === 'Overview' ? <Overview year={selected} years={sorted} today={today} onEdit={y => setForm({ year: y, isNew: false })} onSave={() => setSection('Save')} />
        : section === 'Save' ? <SaveTax year={selected} today={today} onEdit={y => setForm({ year: y, isNew: false })} />
        : <Records years={sorted} onEdit={y => setForm({ year: y, isNew: false })} onDelete={setDeleting} />}
    </>}
    {form && <TaxForm year={form.year} isNew={form.isNew} years={years} incomes={incomes} onClose={() => setForm(null)} onSaved={y => { setYears(rows => [...rows.filter(r => r.id !== y.id), y]); setYa(y.ya); setForm(null); }} />}
    {deleting && <div className={`${box} fixed bottom-24 left-1/2 z-50 w-[calc(100%_-_32px)] max-w-md -translate-x-1/2 shadow-2xl`} role="alertdialog" aria-label="Delete tax year"><p className="text-sm">Delete YA {deleting.ya}? This removes the record{deleting.documents?.length ? ' and its stored documents' : ''}.</p><div className="mt-3 flex justify-end gap-4"><button disabled={busy} onClick={() => setDeleting(null)} className="text-sm text-secondary">Cancel</button><button disabled={busy} onClick={async () => { setBusy(true); try { await deleteTaxYear(deleting.id); await removePolicyDocuments(deleting.documents ?? [], 'tax'); setYears(rows => rows.filter(r => r.id !== deleting.id)); setDeleting(null); } catch (e) { setError(errorText(e)); setDeleting(null); } finally { setBusy(false); } }} className="text-sm font-bold text-red-400">{busy ? 'Deleting…' : 'Delete year'}</button></div></div>}
  </div>;
}

// ---------- Overview ----------

const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

function Overview({ year, years, today, onEdit, onSave }: { year: TaxYear; years: TaxYear[]; today: string; onEdit: (y: TaxYear) => void; onSave: () => void }) {
  const r = computeTax(year);
  const shown = year.assessedTax ?? r.tax;
  const left = daysUntil(today, `${incomeYear(year.ya)}-12-31`);
  const best = savings(year)[0];
  const rows: Array<[string, number, string?]> = [
    ['Employment income', Math.max(0, year.employment - year.employmentExpenses), year.employmentExpenses ? `after ${sgd(year.employmentExpenses)} expenses` : undefined],
    ...(year.selfEmployed ? [['Trade / business profit', year.selfEmployed] as [string, number]] : []),
    ...(year.rental ? [['Net rental income', year.rental] as [string, number]] : []),
    ...(year.otherIncome ? [['Other income', year.otherIncome] as [string, number]] : []),
  ];
  const max = Math.max(...years.map(y => y.assessedTax ?? computeTax(y).tax), 1);
  return <div className="space-y-4">
    {left >= 0 && year.status === 'Estimate' && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
      <CalendarClock size={18} className="shrink-0 text-primary" />
      <p className="min-w-0 flex-1"><b>{left} day{left === 1 ? '' : 's'} left</b> to lower YA {year.ya} tax: SRS contributions, CPF cash top-ups and donations must be made by 31 Dec {incomeYear(year.ya)}.{best ? ` Biggest saving: ${best.title.toLowerCase()} (up to ${sgd(best.saving)}).` : ''}</p>
      <button onClick={onSave} className="flex items-center gap-1.5 text-xs font-bold text-primary"><Lightbulb size={14} />See ways to save</button>
    </div>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[
      [year.assessedTax !== undefined ? 'Tax assessed' : 'Estimated tax', sgd(shown, 2), year.assessedTax !== undefined ? `Estimate was ${sgd(r.tax, 2)}` : r.rebateKnown ? 'After rebates' : 'No rebate assumed yet'],
      ['Chargeable income', sgd(r.chargeable), `${sgd(r.totalIncome)} income − deductions and reliefs`],
      ['Effective rate', pct(r.effectiveRate), 'Tax ÷ total income'],
      ['Top rate you pay', pct(r.marginal), 'On your next dollar of income'],
    ].map(([label, value, note]) => <div key={label} className={box}><p className="text-xs text-secondary">{label}</p><p className="mt-2 text-xl font-extrabold tabular-nums">{value}</p><p className="mt-1 text-[11px] text-secondary">{note}</p></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div className={box}>
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">YA {year.ya} breakdown</h2><p className="mt-1 text-xs text-secondary">Income earned in {incomeYear(year.ya)} · {year.residency} · {year.status}</p></div><button onClick={() => onEdit(year)} className="flex items-center gap-1 text-xs font-semibold text-primary"><Pencil size={13} />Edit</button></div>
        {year.residency === 'Non-resident' ? <p className="mt-4 text-sm text-secondary">Non-residents pay the higher of 15% or resident rates on employment income and 24% on other income, with no reliefs. Total income {sgd(r.totalIncome)} → tax {sgd(r.tax, 2)}.</p> : <dl className="mt-4 divide-y divide-border text-sm">
          {rows.map(([label, amount, note]) => <div key={label} className="flex justify-between gap-3 py-2"><dt>{label}{note && <span className="block text-[11px] text-secondary">{note}</span>}</dt><dd className="tabular-nums">{sgd(amount)}</dd></div>)}
          {r.donationDeduction > 0 && <div className="flex justify-between gap-3 py-2"><dt>Donations × 250%</dt><dd className="tabular-nums text-emerald-500">−{sgd(r.donationDeduction)}</dd></div>}
          <div className="flex justify-between gap-3 py-2 font-semibold"><dt>Assessable income</dt><dd className="tabular-nums">{sgd(r.assessable)}</dd></div>
          {r.reliefLines.map(l => <div key={l.key} className="flex justify-between gap-3 py-2 text-secondary"><dt>{l.label}{l.note && <span className="block text-[11px] text-amber-500">{l.note}</span>}</dt><dd className="tabular-nums text-emerald-500">−{sgd(l.allowed)}</dd></div>)}
          {r.capped && <div className="flex justify-between gap-3 py-2 text-amber-500"><dt>Relief cap ($80,000)</dt><dd className="tabular-nums">+{sgd(r.reliefsBeforeCap - RELIEF_CAP)}</dd></div>}
          <div className="flex justify-between gap-3 py-2 font-semibold"><dt>Chargeable income</dt><dd className="tabular-nums">{sgd(r.chargeable)}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt>Tax at resident rates</dt><dd className="tabular-nums">{sgd(r.grossTax, 2)}</dd></div>
          {r.rebate > 0 && <div className="flex justify-between gap-3 py-2"><dt>Personal income tax rebate</dt><dd className="tabular-nums text-emerald-500">−{sgd(r.rebate, 2)}</dd></div>}
          {r.parenthoodRebate > 0 && <div className="flex justify-between gap-3 py-2"><dt>Parenthood tax rebate</dt><dd className="tabular-nums text-emerald-500">−{sgd(r.parenthoodRebate, 2)}</dd></div>}
          <div className="flex justify-between gap-3 py-2 text-base font-extrabold"><dt>Estimated tax payable</dt><dd className="tabular-nums">{sgd(r.tax, 2)}</dd></div>
          {year.assessedTax !== undefined && <div className={`flex justify-between gap-3 py-2 ${Math.abs(year.assessedTax - r.tax) > 1 ? 'text-amber-500' : 'text-secondary'}`}><dt>Notice of Assessment{year.noaDate ? ` · ${year.noaDate}` : ''}</dt><dd className="tabular-nums">{sgd(year.assessedTax, 2)}{Math.abs(year.assessedTax - r.tax) > 1 ? ` (${year.assessedTax > r.tax ? '+' : '−'}${sgd(Math.abs(year.assessedTax - r.tax), 2)})` : ''}</dd></div>}
        </dl>}
        {!r.rebateKnown && <p className="mt-3 text-[11px] text-secondary">No personal tax rebate is assumed for YA {year.ya}; Budget {year.ya} (February) may announce one. Edit the year to add it.</p>}
      </div>
      <div className="space-y-4">
        {year.residency === 'Resident' && <div className={box}><h2 className="text-sm font-bold">Reliefs used</h2><p className="mt-1 text-xs text-secondary">Most reliefs together are capped at $80,000 a year. Donations aren’t.</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-background" role="img" aria-label={`${sgd(r.reliefs)} of $80,000`}><div className={`h-full rounded-full ${r.capped ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, (r.reliefsBeforeCap / RELIEF_CAP) * 100)}%` }} /></div>
          <p className="mt-2 text-xs tabular-nums">{sgd(r.reliefs)} of {sgd(RELIEF_CAP)}</p></div>}
        <div className={box}><h2 className="text-sm font-bold">Tax by year</h2>
          <ul className="mt-3 space-y-2 text-xs">{[...years].sort((a, b) => a.ya - b.ya).map(y => { const t = y.assessedTax ?? computeTax(y).tax; return <li key={y.id} className="grid grid-cols-[56px_1fr_auto] items-center gap-2"><span className={y.ya === year.ya ? 'font-bold' : 'text-secondary'}>YA {y.ya}</span><span className="h-2 overflow-hidden rounded-full bg-background"><span className={`block h-full rounded-full ${y.assessedTax !== undefined ? 'bg-primary' : 'bg-primary/40'}`} style={{ width: `${(t / max) * 100}%` }} /></span><span className="tabular-nums">{sgd(t)}{y.assessedTax === undefined && <span className="text-secondary"> est.</span>}</span></li>; })}</ul>
        </div>
      </div>
    </div>
  </div>;
}

// ---------- Records ----------

function Records({ years, onEdit, onDelete }: { years: TaxYear[]; onEdit: (y: TaxYear) => void; onDelete: (y: TaxYear) => void }) {
  return <div className="grid gap-4 lg:grid-cols-2">{years.map(y => { const r = computeTax(y); return <article key={y.id} className={`${box} flex flex-col`}>
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold">YA {y.ya}</h3><p className="text-xs text-secondary">Income earned in {incomeYear(y.ya)} · {y.residency}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${STATUS_STYLE[y.status]}`}>{y.status}</span></div>
    <dl className="mt-4 grid grid-cols-2 gap-4 text-xs">
      <div><dt className="text-secondary">Total income</dt><dd className="mt-1 font-bold tabular-nums">{sgd(r.totalIncome)}</dd></div>
      <div><dt className="text-secondary">Chargeable income</dt><dd className="mt-1 font-bold tabular-nums">{sgd(r.chargeable)}</dd></div>
      <div><dt className="text-secondary">{y.assessedTax !== undefined ? 'Tax assessed' : 'Estimated tax'}</dt><dd className="mt-1 font-bold tabular-nums">{sgd(y.assessedTax ?? r.tax, 2)}</dd></div>
      <div><dt className="text-secondary">Paid</dt><dd className="mt-1 tabular-nums">{y.paidTax !== undefined ? `${sgd(y.paidTax, 2)}${y.paymentMethod ? ` · ${y.paymentMethod}` : ''}` : 'Not recorded'}</dd></div>
    </dl>
    {y.notes && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-xs text-secondary">{y.notes}</p>}
    <StoredDocuments docs={y.documents ?? []} read={readTaxDocument} />
    <div aria-hidden="true" className="min-h-4 flex-1" />
    <div className="flex justify-end gap-3 border-t border-border pt-3"><button onClick={() => onEdit(y)} className="flex items-center gap-1 text-xs font-semibold text-secondary"><Pencil size={14} />Edit</button><button onClick={() => onDelete(y)} className="flex items-center gap-1 text-xs text-secondary"><Trash2 size={14} />Delete</button></div>
  </article>; })}</div>;
}

// ---------- Save tax ----------

function SaveTax({ year, today, onEdit }: { year: TaxYear; today: string; onEdit: (y: TaxYear) => void }) {
  const ideas = savings(year);
  const base = computeTax(year);
  const srsCap = year.citizenship === 'Foreigner' ? LIMITS.srsForeigner : LIMITS.srsCitizen;
  const [plan, setPlan] = useState({ srs: 0, self: 0, family: 0, donate: 0 });
  const room = { srs: Math.max(0, srsCap - (year.reliefs.srs || 0)), self: Math.max(0, LIMITS.cpfTopUpSelf - (year.reliefs.cpfTopUpSelf || 0)), family: Math.max(0, LIMITS.cpfTopUpFamily - (year.reliefs.cpfTopUpFamily || 0)), donate: 20_000 };
  const after = computeTax({ ...year, donations: year.donations + plan.donate, reliefs: { ...year.reliefs, srs: (year.reliefs.srs || 0) + plan.srs, cpfTopUpSelf: (year.reliefs.cpfTopUpSelf || 0) + plan.self, cpfTopUpFamily: (year.reliefs.cpfTopUpFamily || 0) + plan.family } });
  const putIn = plan.srs + plan.self + plan.family + plan.donate;
  const past = incomeYear(year.ya) < Number(today.slice(0, 4));
  const missing = RELIEF_CHECKLIST.filter(c => !year.reliefs[c.key]);
  if (year.residency === 'Non-resident') return <p className={`${box} text-sm text-secondary`}>Non-residents can’t claim personal reliefs. Staying in Singapore 183 days or more in the year (or across two years) makes you a tax resident, with much lower rates.</p>;
  return <div className="space-y-4">
    {past && <p className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-500">YA {year.ya} covers {incomeYear(year.ya)}, which has ended, so new contributions no longer count for it. Use this to see what you could have saved, or switch to the current YA.</p>}
    <div className={box}><h2 className="flex items-center gap-2 font-bold"><Lightbulb size={18} className="text-primary" />Ways to lower YA {year.ya} tax</h2><p className="mt-1 text-sm text-secondary">Worked out from this year’s figures. Your top rate is {pct(base.marginal)}, so each $1,000 of extra relief saves about {sgd(base.marginal * 1000)}.</p>
      {!ideas.length ? <p className="mt-4 flex items-center gap-1.5 text-sm text-emerald-500"><CheckCircle2 size={15} />{base.chargeable <= 20_000 ? 'Your chargeable income is in the 0% band, so there is no tax left to reduce.' : 'You’ve used all the contribution allowances.'}</p> : <ul className="mt-4 grid gap-3 lg:grid-cols-2">{ideas.map(s => <li key={s.id} className="rounded-xl border border-border bg-background p-4">
        <div className="flex items-start justify-between gap-3"><p className="font-bold">{s.title}</p>{s.saving > 0 && <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-500">Save up to {sgd(s.saving)}</span>}</div>
        <p className="mt-1 text-xs">{s.room ? <>Room left: <b>{sgd(s.room)}</b> · </> : null}about <b>{sgd(s.per1000)}</b> saved per $1,000</p>
        <p className="mt-2 text-xs text-secondary">{s.detail}</p>
        <p className="mt-2 text-xs text-secondary"><span className="font-semibold text-textMain">Trade-off: </span>{s.tradeOff}</p>
      </li>)}</ul>}
    </div>
    <div className={box}><h2 className="flex items-center gap-2 font-bold"><Wand2 size={18} className="text-primary" />What if…</h2><p className="mt-1 text-sm text-secondary">Try amounts before you commit. Nothing is saved.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{([['srs', 'SRS contribution'], ['self', 'CPF top-up · self'], ['family', 'CPF top-up · family'], ['donate', 'IPC donation']] as const).map(([k, label]) => <label key={k} className="text-xs font-semibold text-secondary">{label} <span className="float-right tabular-nums text-textMain">{sgd(plan[k])}</span>
        <input type="range" min={0} max={room[k]} step={100} value={Math.min(plan[k], room[k])} disabled={!room[k]} onChange={e => setPlan(p => ({ ...p, [k]: Number(e.target.value) }))} className="mt-2 w-full accent-[var(--color-primary,#2563eb)]" />
        <span className="font-normal">{room[k] ? `Up to ${sgd(room[k])}` : 'Allowance used'}</span></label>)}</div>
      <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-background p-4 text-center text-sm"><div><p className="text-xs text-secondary">Put in</p><p className="font-extrabold tabular-nums">{sgd(putIn)}</p></div><div><p className="text-xs text-secondary">New tax</p><p className="font-extrabold tabular-nums">{sgd(after.tax, 2)}</p></div><div><p className="text-xs text-secondary">Tax saved</p><p className="font-extrabold tabular-nums text-emerald-500">{sgd(Math.max(0, base.tax - after.tax), 2)}</p></div></div>
      {putIn > 0 && <p className="mt-2 text-xs text-secondary">That’s {pct(Math.max(0, base.tax - after.tax) / putIn)} back on what you put in{plan.donate ? '; the donation itself is given away' : ''}. Once you’ve paid, <button className="text-primary" onClick={() => onEdit(year)}>record it in YA {year.ya}</button>.</p>}
    </div>
    {missing.length > 0 && <div className={box}><h2 className="font-bold">Reliefs you haven’t claimed</h2><p className="mt-1 text-sm text-secondary">Check whether any apply. Most are claimed in your tax return; some (NSman, CPF) are added automatically by IRAS.</p>
      <ul className="mt-3 divide-y divide-border text-sm">{missing.map(c => <li key={c.key} className="py-3"><p className="font-semibold">{c.title} <span className="font-normal text-secondary">· {c.amount}</span></p><p className="mt-1 text-xs text-secondary">{c.when}</p></li>)}</ul>
    </div>}
    <p className="text-[11px] text-secondary">Estimates use IRAS rules as of November 2026 and the figures you entered. They aren’t tax advice; your Notice of Assessment is final.</p>
  </div>;
}

// ---------- Learn ----------

function Learn({ today }: { today: string }) {
  const ya = currentYa(today);
  const link = (href: string, label: string) => <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">{label}<ExternalLink size={12} /></a>;
  return <div className="grid gap-4 lg:grid-cols-2">
    <div className={box}><h2 className="flex items-center gap-2 font-bold"><BookOpen size={18} className="text-primary" />How it works</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-secondary">
      <li><b className="text-textMain">Year of Assessment (YA)</b> is the year you’re taxed, on the previous year’s income. YA {ya} taxes what you earn in {ya - 1}.</li>
      <li><b className="text-textMain">File by 18 April</b> (e-filing) if IRAS asks you to. Many employees are on the No-Filing Service: check the pre-filled figures anyway.</li>
      <li><b className="text-textMain">Notice of Assessment</b> usually arrives April–September. Pay within 30 days, or by GIRO in up to 12 interest-free instalments.</li>
      <li><b className="text-textMain">Tax-free income:</b> most Singapore dividends, bank interest, CPF interest and capital gains aren’t taxed.</li>
      <li><b className="text-textMain">Reliefs</b> reduce taxable income, capped at {sgd(RELIEF_CAP)} a year in total. <b className="text-textMain">Rebates</b> reduce the tax itself. Donations are deducted at {DONATION_MULTIPLIER * 100}% and sit outside the cap.</li>
      <li><b className="text-textMain">Deadline to cut tax</b> is 31 December: SRS, CPF cash top-ups and donations count for the YA after the year you make them.</li>
    </ul></div>
    <div className={box}><h2 className="font-bold">Resident tax rates (from YA 2024)</h2><table className="mt-3 w-full text-sm"><thead><tr className="text-left text-xs text-secondary"><th className="pb-2 font-semibold">Chargeable income</th><th className="pb-2 text-right font-semibold">Rate</th></tr></thead><tbody className="divide-y divide-border">{RATE_TABLE.map(b => <tr key={b.from}><td className="py-1.5 tabular-nums">{b.upTo === Infinity ? `Above ${sgd(b.from)}` : `${sgd(b.from)} – ${sgd(b.upTo)}`}</td><td className="py-1.5 text-right tabular-nums">{pct(b.rate)}</td></tr>)}</tbody></table>
      <p className="mt-3 text-xs text-secondary">Rebates: YA 2024 {pct(REBATES[2024].rate)} and YA 2025 {pct(REBATES[2025].rate)} of tax, capped at $200. None for YA 2026.</p></div>
    <div className={`${box} lg:col-span-2`}><h2 className="font-bold">Main reliefs and limits</h2><div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">{[
      ['Earned income relief', '$1,000; $6,000 at 55–59; $8,000 at 60+'], ['CPF relief (employee)', `Your compulsory contributions, up to ${sgd(LIMITS.cpfRelief)}`],
      ['SRS', `${sgd(LIMITS.srsCitizen)} citizens/PRs; ${sgd(LIMITS.srsForeigner)} foreigners`], ['CPF cash top-up', `${sgd(LIMITS.cpfTopUpSelf)} self + ${sgd(LIMITS.cpfTopUpFamily)} family`],
      ['Spouse relief', `${sgd(LIMITS.spouse)} (spouse income ≤ $8,000)`], ['Qualifying child relief', `${sgd(LIMITS.qcr)} per child; ${sgd(LIMITS.qcrDisability)} with disability`],
      ["Working mother's child relief", '$8k / $10k / $12k (born 2024+); 15/20/25% of income for older children'], ['Parent relief', `${sgd(LIMITS.parentWith)} living together; ${sgd(LIMITS.parentApart)} apart`],
      ['Grandparent caregiver relief', sgd(LIMITS.grandparentCaregiver)], ['Life insurance relief', 'Up to $5,000, only if CPF relief is under $5,000'],
      ['Course fees relief', 'Ended after YA 2025'], ['Parenthood tax rebate', '$5,000 / $10,000 / $20,000 for 1st / 2nd / 3rd+ child (a rebate, used over years)'],
    ].map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-border py-1.5"><span>{k}</span><span className="text-right text-secondary">{v}</span></div>)}</div>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">{link('https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-reliefs-rebates-and-deductions/tax-reliefs', 'IRAS: tax reliefs')}{link('https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates', 'IRAS: tax rates')}{link('https://www.iras.gov.sg/schemes/individual-income-tax/srs-contributions-and-tax-relief', 'IRAS: SRS')}{link('https://mytax.iras.gov.sg', 'myTax Portal')}</p>
    </div>
  </div>;
}

// ---------- Editor ----------

function TaxForm({ year, isNew, years, incomes, onClose, onSaved }: { year: TaxYear; isNew: boolean; years: TaxYear[]; incomes: Income[]; onClose: () => void; onSaved: (y: TaxYear) => void }) {
  const [draft, setDraft] = useState(year); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [pending, setPending] = useState<File[]>([]); const [removed, setRemoved] = useState<TaxDocument[]>([]);
  const [cpfHelp, setCpfHelp] = useState({ open: false, salary: 0, bonus: 0 });
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; d.showModal(); const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { d.close(); document.body.style.overflow = o; }; }, []);
  const result = computeTax(draft);
  const prefill = employmentFromIncomes(incomes, incomeYear(draft.ya));
  const num = (label: string, value: number | undefined, set: (v: number) => void, hint?: string) => <label className="text-xs font-semibold text-secondary">{label}<input className={input} type="number" min={0} step="0.01" value={value ?? ''} placeholder="0" onChange={e => set(e.target.value === '' ? 0 : Number(e.target.value))} />{hint && <span className="mt-1 block font-normal">{hint}</span>}</label>;
  const relief = (k: ReliefKey, v: number) => setDraft(d => ({ ...d, reliefs: { ...d.reliefs, [k]: v } }));
  const heading = (t: string) => <h3 className="pt-2 text-sm font-bold sm:col-span-2">{t}</h3>;
  return <dialog aria-label="Tax year editor" ref={ref} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_24px)] max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-textMain shadow-2xl backdrop:bg-black/60">
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface p-5"><div><h2 className="font-bold">{isNew ? 'Add' : 'Edit'} YA {draft.ya}</h2><p className="text-xs text-secondary">Income earned in {incomeYear(draft.ya)} · estimated tax <b className="tabular-nums text-textMain">{sgd(result.tax, 2)}</b></p></div><button type="button" disabled={busy} aria-label="Close tax form" onClick={onClose} className="p-2 text-secondary"><X size={18} /></button></div>
    <form className="space-y-4 p-5" onSubmit={async e => { e.preventDefault(); setError(''); setBusy(true); const uploaded: TaxDocument[] = []; try {
      for (const file of pending) uploaded.push(await uploadPolicyDocument(draft.id, file, 'tax'));
      const clean: TaxYear = { ...draft, notes: draft.notes.trim(), documents: [...(draft.documents ?? []), ...uploaded], reliefs: Object.fromEntries(Object.entries(draft.reliefs).filter(([, v]) => v)) };
      await saveTaxYear(clean, years); await removePolicyDocuments(removed, 'tax'); onSaved(clean);
    } catch (err) { await removePolicyDocuments(uploaded, 'tax'); setError(errorText(err)); } finally { setBusy(false); } }}>
      <fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-secondary">Year of Assessment<input className={input} type="number" min={2000} max={2100} required value={draft.ya} disabled={!isNew} onChange={e => setDraft({ ...draft, ya: Number(e.target.value) })} /></label>
        <label className="text-xs font-semibold text-secondary">Status<select className={input} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as TaxYear['status'] })}>{['Estimate', 'Filed', 'Assessed'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="text-xs font-semibold text-secondary">Tax residency<select className={input} value={draft.residency} onChange={e => setDraft({ ...draft, residency: e.target.value as TaxYear['residency'] })}><option>Resident</option><option>Non-resident</option></select></label>
        <label className="text-xs font-semibold text-secondary">Citizenship<select className={input} value={draft.citizenship} onChange={e => setDraft({ ...draft, citizenship: e.target.value as TaxYear['citizenship'] })}><option>Citizen / PR</option><option>Foreigner</option></select></label>
        <label className="text-xs font-semibold text-secondary">Age on 31 Dec {incomeYear(draft.ya)}<input className={input} type="number" min={0} max={120} required value={draft.age} onChange={e => setDraft({ ...draft, age: Number(e.target.value) })} /></label>
        {heading('Income')}
        {num('Employment income (salary, bonus, benefits)', draft.employment, v => setDraft({ ...draft, employment: v }), prefill.total ? undefined : 'Your gross pay before CPF, as on your IR8A.')}
        {prefill.total > 0 && prefill.total !== draft.employment && <div className="self-end text-xs text-secondary">Your income records show {sgd(prefill.total)} for {incomeYear(draft.ya)}{prefill.skipped ? ` (${prefill.skipped} non-SGD skipped)` : ''}. <button type="button" className="font-bold text-primary" onClick={() => setDraft({ ...draft, employment: prefill.total })}>Use it</button></div>}
        {num('Allowable employment expenses', draft.employmentExpenses, v => setDraft({ ...draft, employmentExpenses: v }))}
        {num('Trade / business / freelance profit', draft.selfEmployed, v => setDraft({ ...draft, selfEmployed: v }))}
        {num('Net rental income', draft.rental, v => setDraft({ ...draft, rental: v }))}
        {num('Other taxable income', draft.otherIncome, v => setDraft({ ...draft, otherIncome: v }), 'Most SG dividends and bank interest are tax-free; leave them out.')}
        {num('Donations to IPCs (cash given)', draft.donations, v => setDraft({ ...draft, donations: v }), `Deducted at 250%: ${sgd(draft.donations * DONATION_MULTIPLIER)}`)}
        {heading('Reliefs')}
        {RELIEF_FIELDS.map(([k, label]) => <React.Fragment key={k}>{num(label, draft.reliefs[k], v => relief(k, v))}{k === 'cpf' && <div className="self-end text-xs">{cpfHelp.open ? <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"><label className="text-[11px] text-secondary">Monthly salary<input className={input} type="number" min={0} value={cpfHelp.salary || ''} onChange={e => setCpfHelp(h => ({ ...h, salary: Number(e.target.value) }))} /></label><label className="text-[11px] text-secondary">Bonus in year<input className={input} type="number" min={0} value={cpfHelp.bonus || ''} onChange={e => setCpfHelp(h => ({ ...h, bonus: Number(e.target.value) }))} /></label><button type="button" className="mb-2.5 font-bold text-primary" onClick={() => { relief('cpf', estimateCpf(cpfHelp.salary, cpfHelp.bonus, incomeYear(draft.ya))); setCpfHelp(h => ({ ...h, open: false })); }}>Apply</button></div>
          : <span className="text-secondary">{draft.age < 55 ? <button type="button" className="font-bold text-primary" onClick={() => setCpfHelp(h => ({ ...h, open: true }))}>Estimate from salary</button> : 'Use the employee CPF on your IR8A (rates are lower from 55).'}</span>}</div>}</React.Fragment>)}
        {num('Parenthood tax rebate used', draft.parenthoodRebate, v => setDraft({ ...draft, parenthoodRebate: v }), 'A rebate, not a relief: reduces tax directly.')}
        <details className="sm:col-span-2"><summary className="cursor-pointer text-xs font-semibold text-secondary">Personal tax rebate for this YA ({draft.rebateOverride ? `${pct(draft.rebateOverride.rate)} up to ${sgd(draft.rebateOverride.cap)}` : REBATES[draft.ya] ? `${pct(REBATES[draft.ya].rate)} up to ${sgd(REBATES[draft.ya].cap)}` : 'none'})</summary>
          <div className="mt-2 grid grid-cols-2 gap-3">{num('Rebate % of tax', draft.rebateOverride ? draft.rebateOverride.rate * 100 : undefined, v => setDraft({ ...draft, rebateOverride: v ? { rate: Math.min(100, v) / 100, cap: draft.rebateOverride?.cap ?? 200 } : undefined }))}{num('Rebate cap', draft.rebateOverride?.cap, v => setDraft({ ...draft, rebateOverride: draft.rebateOverride ? { ...draft.rebateOverride, cap: v } : undefined }))}</div></details>
        {heading('Notice of Assessment')}
        {num('Tax assessed', draft.assessedTax, v => setDraft({ ...draft, assessedTax: v || undefined }), 'Leave blank until you receive it.')}
        <label className="text-xs font-semibold text-secondary">Notice date<input className={input} type="date" value={draft.noaDate ?? ''} onChange={e => setDraft({ ...draft, noaDate: e.target.value || undefined })} /></label>
        {num('Tax paid so far', draft.paidTax, v => setDraft({ ...draft, paidTax: v || undefined }))}
        <label className="text-xs font-semibold text-secondary">Payment method<select className={input} value={draft.paymentMethod ?? ''} onChange={e => setDraft({ ...draft, paymentMethod: (e.target.value || undefined) as TaxYear['paymentMethod'] })}><option value="">Not recorded</option><option>GIRO (monthly)</option><option>GIRO (one-off)</option><option>Other</option></select></label>
        <label className="text-xs font-semibold text-secondary sm:col-span-2">Notes<textarea className={input} rows={3} maxLength={4000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Objections, IRAS correspondence, what you claimed and why…" /></label>
        <DocumentsEditor title="Tax documents" emptyText="No documents yet. Attach your Notice of Assessment, IR8A or donation and top-up receipts." saved={draft.documents ?? []} pending={pending} onAdd={f => setPending(p => [...p, f])} onRemovePending={f => setPending(p => p.filter(x => x !== f))} onRemoveSaved={doc => { setDraft(d => ({ ...d, documents: (d.documents ?? []).filter(x => x.path !== doc.path) })); setRemoved(r => [...r, doc]); }} />
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save year'}</button>
    </form>
  </dialog>;
}
