import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, MessageCircleQuestion, Pencil, Plane, Printer, Receipt, Repeat, ShieldCheck, Sparkles } from 'lucide-react';
import type { Expense, Income, Subscription } from '../types';
import { convertCurrency, getExpenseCategoryColor } from '../services/storageService';
import { documentStorageAvailable, readPolicyDocument } from '../services/insuranceDocumentService';
import { policyStatus, statusLabel, type InsurancePolicy } from '../services/insuranceService';
import {
  BENCHMARKS, MAX_WORDING_CHARS, annualEarnedIncome, budgetMode, checkTrip, coverPrompt, emergencyCardHtml, emergencyPolicies, inForce,
  linkedTo, parseCoverAnswer, peopleOf, premiumExpense, premiumSubscription, protectionGaps, travelOverlaps, type CoverAnswer, type GapLevel,
} from '../services/insuranceInsightsService';

/** Sections this component renders; InsuranceTab adds them to its section menu. */
export const EXTRA_SECTIONS = ['Budget', 'Gaps', 'Trips', 'Ask', 'Emergency'];

const box = 'rounded-2xl border border-border bg-surface p-5';
const input = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-textMain outline-none focus:border-primary';
const money = (n: number, currency: string) => `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const dateText = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const range = (a: string, b: string) => a === b ? dateText(a) : `${dateText(a)} → ${dateText(b)}`;
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';

export interface ExtrasProps {
  section: string; policies: InsurancePolicy[]; currency: string; today: string;
  incomes: Income[]; subscriptions: Subscription[]; expenses: Expense[];
  onAddSubscription?: (data: Omit<Subscription, 'id' | 'nextPaymentDate'>) => Promise<void> | void;
  onAddExpense?: (data: Omit<Expense, 'id'>) => Promise<unknown>;
  onEdit: (p: InsurancePolicy) => void;
}

export function InsuranceExtras(props: ExtrasProps) {
  switch (props.section) {
    case 'Budget': return <BudgetSection {...props} />;
    case 'Gaps': return <GapsSection {...props} />;
    case 'Trips': return <TripsSection {...props} />;
    case 'Ask': return <AskSection {...props} />;
    case 'Emergency': return <EmergencySection {...props} />;
    default: return null;
  }
}

function Intro({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div className={box}><h2 className="flex items-center gap-2 font-bold">{icon}{title}</h2><p className="mt-1 text-sm text-secondary">{children}</p></div>;
}

// ---------- Budget ----------

function BudgetSection({ policies, today, subscriptions, expenses, onAddSubscription, onAddExpense }: ExtrasProps) {
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const [dates, setDates] = useState<Record<string, string>>({});
  const rows = policies.filter(p => budgetMode(p) !== 'none' && policyStatus(p, today) !== 'Expired')
    .sort((a, b) => a.frequency.localeCompare(b.frequency) || a.name.localeCompare(b.name));
  const color = getExpenseCategoryColor('Insurance');
  const run = async (id: string, action: () => Promise<unknown> | void) => { setBusy(id); setError(''); try { await action(); } catch (e) { setError(errorText(e)); } finally { setBusy(''); } };
  return <div className="space-y-4">
    <Intro icon={<Receipt size={18} className="text-primary" />} title="Premiums in your budget">Monthly and yearly premiums can become recurring expenses, so they show up in Cash Flow and budgets like your subscriptions. Quarterly and one-time premiums are logged as an expense each time you pay. Nothing is added until you choose to.</Intro>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {!rows.length ? <p className={`${box} text-sm text-secondary`}>No current or upcoming policies with a premium.</p> : <ul className="space-y-3">{rows.map(p => {
      const mode = budgetMode(p); const sub = linkedTo(subscriptions, p.id).find(s => s.status === 'Active');
      const logged = linkedTo(expenses, p.id).sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
      const date = dates[p.id] ?? today;
      return <li key={p.id} className={`${box} flex flex-wrap items-center gap-4`}>
        <div className="min-w-0 flex-1"><p className="text-xs text-secondary">{p.kind} · {p.insurer} · {statusLabel(p, today)}</p><p className="font-bold">{p.name}</p><p className="mt-1 text-xs text-secondary">{money(p.premium, p.currency)} · {p.frequency.toLowerCase()}</p></div>
        {mode === 'subscription' ? (sub
          ? <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500"><CheckCircle2 size={15} />Tracked as a {sub.billingCycle.toLowerCase()} expense · next {dateText(sub.nextPaymentDate.slice(0, 10))}</p>
          : <button disabled={!!busy || !onAddSubscription} onClick={() => run(p.id, () => onAddSubscription!(premiumSubscription(p, today, color)))} className="flex items-center gap-1.5 rounded-xl border border-primary px-3 py-2 text-xs font-bold text-primary disabled:opacity-40"><Repeat size={14} />{busy === p.id ? 'Adding…' : 'Track as recurring expense'}</button>)
          : <div className="flex flex-wrap items-end gap-2">
            {logged.length > 0 && <p className="w-full text-right text-xs text-secondary sm:w-auto">Logged {logged.length}× · last {dateText(logged[0].expenseDate.slice(0, 10))}</p>}
            <label className="text-[11px] text-secondary">Paid on<input type="date" max={today} value={date} onChange={e => setDates(d => ({ ...d, [p.id]: e.target.value }))} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-textMain" /></label>
            <button disabled={!!busy || !onAddExpense || !date || (p.frequency === 'One-time' && logged.length > 0)} onClick={() => run(p.id, async () => { await onAddExpense!(premiumExpense(p, date, color)); })} className="flex items-center gap-1.5 rounded-xl border border-primary px-3 py-2 text-xs font-bold text-primary disabled:opacity-40"><Receipt size={14} />{busy === p.id ? 'Logging…' : p.frequency === 'One-time' && logged.length ? 'Already logged' : 'Log as expense'}</button>
          </div>}
      </li>;
    })}</ul>}
    <p className="text-[11px] text-secondary">Linked entries carry a reference to the policy in their notes. Edit or remove them from Subscriptions or Expenses; changing the policy premium later does not update them.</p>
  </div>;
}

// ---------- Protection gaps ----------

const LEVEL_STYLE: Record<GapLevel, string> = { Covered: 'bg-emerald-500/10 text-emerald-500', Low: 'bg-amber-500/10 text-amber-500', None: 'bg-red-500/10 text-red-400', Check: 'bg-background text-secondary' };

function GapsSection({ policies, currency, today, incomes, onEdit }: ExtrasProps) {
  const people = useMemo(() => peopleOf(policies.filter(p => inForce(p, today) && p.kind !== 'Travel')), [policies, today]);
  const [person, setPerson] = useState(''); const key = person || people[0]?.key || '';
  const convert = (amount: number, from: string) => convertCurrency(amount, from, currency);
  const suggested = useMemo(() => annualEarnedIncome(incomes, today, (a, from) => convertCurrency(a, from, currency)), [incomes, today, currency]);
  const [incomeText, setIncomeText] = useState(''); const income = incomeText === '' ? suggested : Math.max(0, Number(incomeText) || 0);
  const rows = key ? protectionGaps(policies, key, income, convert, today) : [];
  return <div className="space-y-4">
    <Intro icon={<ShieldCheck size={18} className="text-primary" />} title="Protection gap check">Compares current cover with common rules of thumb: death cover of about {BENCHMARKS.life}× and critical illness cover of about {BENCHMARKS.critical}× yearly income (Life Insurance Association Singapore protection gap study). These are general guides, not financial advice; your needs depend on dependants, debts and savings.</Intro>
    {!people.length ? <p className={`${box} text-sm text-secondary`}>No current personal (non-travel) policies yet. Add life, medical or critical illness cover to check for gaps.</p> : <>
      <div className={`${box} grid gap-4 sm:grid-cols-2`}>
        <label className="text-xs font-semibold text-secondary">Person<select className={input} value={key} onChange={e => setPerson(e.target.value)}>{people.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-secondary">Yearly earned income · {currency}<input className={input} type="number" min={0} step="100" value={incomeText === '' ? String(suggested || '') : incomeText} placeholder="e.g. 72000" onChange={e => setIncomeText(e.target.value)} />
          <span className="mt-1 block font-normal">{incomeText === '' ? (suggested ? 'From your recorded active income (approximate exchange rates). Edit if this person’s income differs.' : 'No active income recorded. Enter one to compare.') : <button type="button" className="text-primary" onClick={() => setIncomeText('')}>Use recorded income ({money(suggested, currency)})</button>}</span></label>
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">{rows.map(r => <li key={r.kind} className={box}>
        <div className="flex items-start justify-between gap-3"><div><p className="font-bold">{r.label}</p><p className="mt-1 text-xs text-secondary">{r.note}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${LEVEL_STYLE[r.level]}`}>{r.level === 'None' ? 'No cover' : r.level === 'Check' ? 'Has cover' : r.level}</span></div>
        {r.target !== null && <div className="mt-3"><div className="flex justify-between text-xs"><span>{money(r.have, currency)}</span><span className="text-secondary">target {money(r.target, currency)}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-background" role="img" aria-label={`${Math.round(Math.min(1, r.have / r.target) * 100)}% of benchmark`}><div className={`h-full rounded-full ${r.level === 'Covered' ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (r.have / r.target) * 100)}%` }} /></div>{r.level === 'Low' && <p className="mt-1 text-xs text-amber-500">Short by about {money(r.target - r.have, currency)}.</p>}</div>}
        {r.target === null && r.policies.length > 0 && r.have > 0 && <p className="mt-3 text-xs">Recorded limits: {money(r.have, currency)}</p>}
        {r.policies.length > 0 && <p className="mt-2 text-xs text-secondary">From: {r.policies.map((p, i) => <React.Fragment key={p.id}>{i > 0 && ', '}<button className="text-primary" onClick={() => onEdit(p)}>{p.name}</button></React.Fragment>)}</p>}
      </li>)}</ul>
      <p className="text-[11px] text-secondary">Only current policies naming this person are counted. Main limits are added up and converted at approximate rates; check each policy for what it actually pays (lump sum vs reimbursement, early vs late stage).</p>
    </>}
  </div>;
}

// ---------- Trips ----------

function TripsSection({ policies, today, onEdit }: ExtrasProps) {
  const overlaps = travelOverlaps(policies, today);
  const people = useMemo(() => peopleOf(policies.filter(p => p.kind === 'Travel' && p.recordType !== 'Quotation' && !p.archived)), [policies]);
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [person, setPerson] = useState('');
  let spans: ReturnType<typeof checkTrip> = []; let tripError = '';
  try { spans = checkTrip(policies, start, end, person || undefined); } catch (e) { tripError = errorText(e); }
  const gapDays = spans.filter(s => !s.policies.length).reduce((n, s) => n + (Date.parse(s.end) - Date.parse(s.start)) / 86_400_000 + 1, 0);
  return <div className="space-y-4">
    <Intro icon={<Plane size={18} className="text-primary" />} title="Travel cover check">Spots travel policies that cover the same person on the same days, and checks a trip’s dates for days without cover.</Intro>
    <div className={box}><h3 className="text-sm font-bold">Overlapping cover</h3>
      {!overlaps.length ? <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-500"><CheckCircle2 size={15} />No current or upcoming travel policies overlap.</p> : <ul className="mt-3 space-y-2">{overlaps.map(o => <li key={`${o.a.id}-${o.b.id}`} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-semibold text-amber-500"><AlertTriangle size={15} />{range(o.start, o.end)} · {o.people.join(', ')}</p>
        <p className="mt-1 text-xs text-secondary">Covered by both <button className="text-primary" onClick={() => onEdit(o.a)}>{o.a.name}</button> ({o.a.insurer}) and <button className="text-primary" onClick={() => onEdit(o.b)}>{o.b.name}</button> ({o.b.insurer}). If this is the same trip, one may be unnecessary; most travel policies won’t both pay for the same loss. If you bought one by mistake, ask the insurer about cancelling within its free-look period.</p>
      </li>)}</ul>}
    </div>
    <div className={box}><h3 className="text-sm font-bold">Check a trip</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-secondary">Leave on<input className={input} type="date" value={start} onChange={e => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); }} /></label>
        <label className="text-xs font-semibold text-secondary">Return on<input className={input} type="date" min={start} value={end} onChange={e => setEnd(e.target.value)} /></label>
        <label className="text-xs font-semibold text-secondary">Traveller<select className={input} value={person} onChange={e => setPerson(e.target.value)}><option value="">Anyone</option>{people.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
      </div>
      {tripError && <p role="alert" className="mt-3 text-sm text-red-400">{tripError}</p>}
      {spans.length > 0 && <div className="mt-4 space-y-2" aria-live="polite">
        <p className={`flex items-center gap-1.5 text-sm font-semibold ${gapDays ? 'text-red-400' : 'text-emerald-500'}`}>{gapDays ? <><AlertTriangle size={15} />{gapDays} day{gapDays > 1 ? 's' : ''} without travel cover</> : <><CheckCircle2 size={15} />Every day of this trip is covered</>}</p>
        <ul className="space-y-1.5 text-xs">{spans.map(s => <li key={s.start} className={`flex flex-wrap gap-x-2 rounded-lg px-3 py-2 ${s.policies.length ? 'bg-background' : 'bg-red-500/10'}`}><span className="font-semibold">{range(s.start, s.end)}</span><span className="text-secondary">{s.policies.length ? s.policies.map(p => `${p.name} (${p.insurer}${p.destination ? ` · ${p.destination}` : ''})`).join(' + ') : 'No travel policy'}</span></li>)}</ul>
        <p className="text-[11px] text-secondary">Check the destination too: a policy for one region won’t cover a trip elsewhere. Some policies cover the day you leave only from departure.</p>
      </div>}
    </div>
  </div>;
}

// ---------- Ask ----------

// Same model order as the policy importer: Llama 3.3 70B reads policy schedules most reliably.
const ASK_MODELS = ['meta-llama/Llama-3.3-70B-Instruct:novita', 'Qwen/Qwen2.5-72B-Instruct:deepinfra', 'Qwen/Qwen2.5-72B-Instruct:featherless-ai', 'Qwen/Qwen3-235B-A22B-Instruct-2507:deepinfra'];
const EXAMPLES: Record<string, string[]> = {
  Travel: ['Is my flight delay covered, and how much do I get?', 'Am I covered if I go skiing?', 'What if my luggage is lost?', 'Can I cancel the trip if I get sick before leaving?'],
  default: ['Is outpatient treatment covered?', 'Are pre-existing conditions excluded?', 'Is there a waiting period?', 'What do I need to make a claim?'],
};
const VERDICT_STYLE: Record<CoverAnswer['verdict'], string> = { Covered: 'text-emerald-500', 'Partly covered': 'text-amber-500', 'Not covered': 'text-red-400', Unclear: 'text-secondary' };

function AskSection({ policies, today }: ExtrasProps) {
  const options = policies.filter(p => p.recordType !== 'Quotation' && !p.archived).sort((a, b) => Number(inForce(b, today)) - Number(inForce(a, today)) || a.name.localeCompare(b.name));
  const [id, setId] = useState(''); const policy = options.find(p => p.id === id) ?? options[0];
  const [question, setQuestion] = useState(''); const [useDocs, setUseDocs] = useState(true);
  const [step, setStep] = useState(''); const [error, setError] = useState(''); const [result, setResult] = useState<{ answer: CoverAnswer; usedDocs: number; truncated: boolean } | null>(null);
  const pdfs = (policy?.documents ?? []).filter(d => d.type === 'application/pdf');
  const canReadDocs = pdfs.length > 0 && documentStorageAvailable();
  const ask = async () => {
    if (!policy) return;
    setError(''); setResult(null);
    try {
      let wording = ''; let usedDocs = 0;
      if (useDocs && canReadDocs) {
        setStep('Reading the policy documents…');
        const { extractPdfText } = await import('../services/huggingFaceService');
        for (const doc of pdfs) { wording += `\n\n[${doc.name}]\n${await extractPdfText(await readPolicyDocument(doc))}`; usedDocs++; if (wording.length > MAX_WORDING_CHARS) break; }
      }
      const truncated = wording.length > MAX_WORDING_CHARS;
      setStep('Checking the policy…');
      const { requestChatCompletion } = await import('../services/huggingFaceService');
      const data = await requestChatCompletion({ messages: [{ role: 'user', content: coverPrompt(policy, question.trim(), wording.slice(0, MAX_WORDING_CHARS)) }], temperature: 0, max_tokens: 1200 }, 'Policy question', ASK_MODELS);
      const reply: string | undefined = data?.choices?.[0]?.message?.content;
      if (!reply) throw new Error('The model returned an empty answer. Try again.');
      setResult({ answer: parseCoverAnswer(reply), usedDocs, truncated });
    } catch (e) { setError(errorText(e)); } finally { setStep(''); }
  };
  return <div className="space-y-4">
    <Intro icon={<MessageCircleQuestion size={18} className="text-primary" />} title="Am I covered for…?">Ask about a situation and get an answer drawn only from this policy’s recorded benefits, notes and stored wording. AI can misread documents: confirm anything important with the insurer before relying on it.</Intro>
    {!policy ? <p className={`${box} text-sm text-secondary`}>Add a policy first.</p> : <div className={`${box} space-y-3`}>
      <label className="block text-xs font-semibold text-secondary">Policy<select className={input} value={policy.id} onChange={e => { setId(e.target.value); setResult(null); }} disabled={!!step}>{options.map(p => <option key={p.id} value={p.id}>{p.name} · {p.insurer} ({statusLabel(p, today)})</option>)}</select></label>
      <label className="block text-xs font-semibold text-secondary">Question<textarea className={input} rows={2} maxLength={500} disabled={!!step} value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. Is my flight delay covered?" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && question.trim().length >= 5 && !step) { e.preventDefault(); ask(); } }} /></label>
      <div className="flex flex-wrap gap-2">{(EXAMPLES[policy.kind] ?? EXAMPLES.default).map(q => <button key={q} type="button" disabled={!!step} onClick={() => setQuestion(q)} className="rounded-full border border-border px-3 py-1 text-xs text-secondary">{q}</button>)}</div>
      {pdfs.length > 0 && <label className="flex items-center gap-2 text-xs text-secondary"><input type="checkbox" checked={useDocs && canReadDocs} disabled={!canReadDocs || !!step} onChange={e => setUseDocs(e.target.checked)} />Also read the {pdfs.length} stored PDF{pdfs.length > 1 ? 's' : ''}{!canReadDocs && ' (needs cloud sync)'}</label>}
      {!policy.benefits?.length && !pdfs.length && <p className="text-xs text-amber-500">This policy has no benefit schedule or stored PDF, so answers will often be “Unclear”. Import the policy wording first for better answers.</p>}
      <button disabled={!!step || question.trim().length < 5} onClick={ask} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><Sparkles size={15} />{step || 'Ask'}</button>
      <p role="status" className="sr-only">{step}</p>
      <p className="text-[11px] text-secondary">Your question and the policy details are sent to the same AI service used for importing policies.</p>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {result && <div className="space-y-3 rounded-xl border border-border bg-background p-4 text-sm" aria-live="polite">
        <p className={`text-base font-extrabold ${VERDICT_STYLE[result.answer.verdict]}`}>{result.answer.verdict}</p>
        <p>{result.answer.answer}</p>
        {result.answer.limits.length > 0 && <div><p className="text-xs font-bold text-secondary">Limits</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{result.answer.limits.map(x => <li key={x}>{x}</li>)}</ul></div>}
        {result.answer.conditions.length > 0 && <div><p className="text-xs font-bold text-secondary">Conditions and exclusions</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{result.answer.conditions.map(x => <li key={x}>{x}</li>)}</ul></div>}
        {result.answer.evidence.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-secondary">From the policy</summary><ul className="mt-1 space-y-1">{result.answer.evidence.map(x => <li key={x} className="border-l-2 border-border pl-2 italic text-secondary">“{x}”</li>)}</ul></details>}
        <p className="text-[11px] text-secondary">Based on {result.usedDocs ? `the recorded details and ${result.usedDocs} stored document${result.usedDocs > 1 ? 's' : ''}` : 'the recorded details only'}{result.truncated ? ' (long wording was cut short)' : ''}.</p>
      </div>}
    </div>}
  </div>;
}

// ---------- Emergency card ----------

function EmergencySection({ policies, today, onEdit }: ExtrasProps) {
  const rows = emergencyPolicies(policies, today);
  const [error, setError] = useState('');
  const html = () => emergencyCardHtml(rows, today, '');
  const print = () => {
    setError('');
    const tab = window.open('', '_blank');
    if (!tab) { setError('Allow pop-ups for this site to print the card, or download it instead.'); return; }
    tab.document.open(); tab.document.write(html()); tab.document.close(); tab.focus();
    window.setTimeout(() => tab.print(), 250);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([html()], { type: 'text/html' }));
    const link = document.createElement('a'); link.href = url; link.download = `insurance-emergency-card-${today}.html`; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const missing = rows.filter(p => !p.emergencyPhone || !p.policyNumber);
  return <div className="space-y-4">
    <Intro icon={<AlertTriangle size={18} className="text-primary" />} title="Emergency card">A one-page summary of policies in force or starting within 60 days: policy numbers, claims and assistance lines, and cover dates. Print it, save it as a PDF from the print dialog, or keep the downloaded page on your phone for use offline.</Intro>
    {missing.length > 0 && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><p className="flex items-center gap-1.5 font-semibold text-amber-500"><AlertTriangle size={15} />Missing details</p><ul className="mt-2 space-y-1 text-xs">{missing.map(p => <li key={p.id} className="flex flex-wrap items-center gap-2"><span>{p.name}: no {[!p.emergencyPhone && 'claims / emergency phone', !p.policyNumber && 'policy number'].filter(Boolean).join(' or ')}</span><button className="flex items-center gap-1 text-primary" onClick={() => onEdit(p)}><Pencil size={12} />Add</button></li>)}</ul></div>}
    <div className="flex flex-wrap gap-2"><button disabled={!rows.length} onClick={print} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Printer size={16} />Print or save as PDF</button><button disabled={!rows.length} onClick={download} className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-secondary disabled:opacity-40"><Download size={16} />Download page</button></div>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {!rows.length ? <p className={`${box} text-sm text-secondary`}>No policies are in force or starting within 60 days.</p> : <div className="grid gap-3 lg:grid-cols-2">{rows.map(p => <div key={p.id} className="rounded-2xl border-2 border-textMain/70 bg-surface p-4 text-sm">
      <p className="font-bold">{p.name}</p><p className="text-xs text-secondary">{p.kind} · {p.insurer}{p.kind === 'Travel' && p.destination ? ` · ${p.destination}` : ''} · {statusLabel(p, today)}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"><dt className="text-secondary">Policy no.</dt><dd className="font-mono">{p.policyNumber || '—'}</dd><dt className="text-secondary">Claims / emergency</dt><dd className="text-sm font-bold">{p.emergencyPhone ? <a href={`tel:${p.emergencyPhone.replace(/[^+\d]/g, '')}`}>{p.emergencyPhone}</a> : '—'}</dd>{(p.startDate || p.endDate) && <><dt className="text-secondary">Cover</dt><dd>{p.startDate ? dateText(p.startDate) : '?'} – {p.endDate ? dateText(p.endDate) : 'ongoing'}</dd></>}</dl>
    </div>)}</div>}
  </div>;
}
