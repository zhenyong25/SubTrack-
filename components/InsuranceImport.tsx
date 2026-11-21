import React, { useState } from 'react';
import { Sparkles, Link as LinkIcon, FileText, ClipboardPaste, ExternalLink, Plus, X } from 'lucide-react';
import { applyExtraction, extractPolicy, readPolicyFile, readPolicyLink, readPolicyText, type PolicySource } from '../services/insuranceImportService';
import { MAX_BENEFITS, insuranceToday, type InsuranceBenefit, type InsurancePolicy } from '../services/insuranceService';

const input = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-textMain outline-none focus:border-primary';
const small = 'w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-textMain outline-none focus:border-primary';
const money = (n: number, currency: string) => `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';
export const benefitLimit = (b: InsuranceBenefit, currency: string) => b.limitText || (b.limit === null ? 'Included' : money(b.limit, currency));

const FIELD_LABELS: Record<string, string> = {
  name: 'plan name', insurer: 'insurer', policyNumber: 'policy number', insuredPerson: 'insured person', kind: 'type', currency: 'currency',
  premium: 'premium', frequency: 'frequency', coverage: 'main limit', deductible: 'deductible', startDate: 'start date', endDate: 'end date',
  renewalDate: 'renewal date', destination: 'destination', emergencyPhone: 'emergency phone', notes: 'notes',
};
const SOURCES = [['link', 'Link', LinkIcon], ['file', 'PDF / file', FileText], ['paste', 'Paste text', ClipboardPaste]] as const;

/** Reads a link, file or pasted text, and fills the policy form draft with what the model finds. */
export function ImportPanel({ draft, initial, isNew, onApply, onFileRead }: { draft: InsurancePolicy; initial: InsurancePolicy; isNew: boolean; onApply: (p: InsurancePolicy) => void; /** Called with an imported file so it can be kept with the policy. */ onFileRead?: (file: File) => void }) {
  const [mode, setMode] = useState<'link' | 'file' | 'paste'>('link');
  const [url, setUrl] = useState(draft.sourceUrl || ''); const [pasted, setPasted] = useState(''); const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState(''); const [error, setError] = useState('');
  const [result, setResult] = useState<{ summary: string; source: PolicySource } | null>(null);
  const busy = !!step;
  const ready = mode === 'link' ? /^https:\/\/\S+\.\S+/.test(url.trim()) : mode === 'file' ? !!file : pasted.trim().length >= 40;

  const run = async () => {
    setError(''); setResult(null);
    try {
      setStep('Reading the document…');
      const source = mode === 'link' ? await readPolicyLink(url) : mode === 'file' ? await readPolicyFile(file!) : readPolicyText(pasted);
      setStep('Analysing with AI… this can take a minute');
      const extraction = await extractPolicy(source, insuranceToday());
      const existing = draft.benefits?.length || 0;
      if (existing && extraction.benefits.length && !window.confirm(`Replace the ${existing} benefits already listed with ${extraction.benefits.length} imported ones?`)) return;
      // A new policy's starting values (today's date, Medical, Monthly) are placeholders, not the user's input.
      const { policy, filled } = applyExtraction(draft, extraction, source.sourceUrl, isNew ? initial : undefined);
      onApply(policy);
      if (mode === 'file' && file) onFileRead?.(file);
      const parts = [extraction.benefits.length ? `${extraction.benefits.length} benefits` : '', filled.map(f => FIELD_LABELS[f] || f).join(', ')].filter(Boolean);
      setResult({ summary: parts.length ? `Filled ${parts.join(', plus ')}.` : 'Nothing new was found to fill in.', source });
    } catch (e) { setError(errorText(e)); } finally { setStep(''); }
  };

  return <section aria-label="Import policy details" className="rounded-xl border border-primary/30 bg-primary/5 p-4">
    <p className="flex items-center gap-2 text-sm font-bold"><Sparkles size={16} className="text-primary" />Fill in from a policy page or document</p>
    <p className="mt-1 text-xs text-secondary">AI reads the benefits schedule and key details. Fields you’ve already typed are kept. Check everything before saving: tables can be misread.</p>
    <div className="mt-3 flex gap-1 rounded-lg bg-background p-1" role="group" aria-label="Import source">{SOURCES.map(([m, label, Icon]) =>
      <button key={m} type="button" disabled={busy} aria-pressed={mode === m} onClick={() => setMode(m)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-bold ${mode === m ? 'bg-primary text-white' : 'text-secondary'}`}><Icon size={13} />{label}</button>)}</div>
    <div className="mt-3">
      {mode === 'link' && <input aria-label="Policy page link" type="url" inputMode="url" disabled={busy} className={input} placeholder="https://… policy page or PDF link" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (ready && !busy) run(); } }} />}
      {mode === 'file' && <input aria-label="Policy document" type="file" disabled={busy} accept=".pdf,.html,.htm,.txt,.md,application/pdf,text/html,text/plain" className={`${input} file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-bold file:text-primary`} onChange={e => setFile(e.target.files?.[0] || null)} />}
      {mode === 'paste' && <textarea aria-label="Policy text" disabled={busy} className={input} rows={4} placeholder="Paste the summary of benefits or certificate text…" value={pasted} onChange={e => setPasted(e.target.value)} />}
    </div>
    <button type="button" disabled={busy || !ready} onClick={run} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-40"><Sparkles size={15} />{busy ? step : 'Analyse and fill in'}</button>
    <p role="status" className="sr-only">{step}</p>
    {error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}
    {result && <div className="mt-3 space-y-1.5 text-xs">
      <p className="text-emerald-500">{result.summary} Review below before saving.</p>
      {result.source.truncated && <p className="text-amber-500">The document was long, so only the first part was read. If benefits are missing, paste the benefits table on its own.</p>}
      {result.source.pdfLinks.length > 0 && <div className="text-secondary">This page links to the full policy wording:{result.source.pdfLinks.map(link =>
        <a key={link} href={link} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 break-all text-primary">{safeName(link)}<ExternalLink size={12} className="shrink-0" /></a>)}</div>}
    </div>}
  </section>;
}

const safeName = (link: string) => { const last = link.split('/').pop() || link; try { return decodeURIComponent(last); } catch { return last; } };

export function BenefitsEditor({ benefits, currency, onChange }: { benefits: InsuranceBenefit[]; currency: string; onChange: (b: InsuranceBenefit[]) => void }) {
  const edit = (id: string, patch: Partial<InsuranceBenefit>) => onChange(benefits.map(b => b.id === id ? { ...b, ...patch } : b));
  const add = () => onChange([...benefits, { id: crypto.randomUUID(), name: '', limit: null, limitText: '', details: '', subLimit: false }]);
  return <div className="sm:col-span-2">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold text-secondary">Benefits and limits <span className="font-normal">· {benefits.length} · {currency}</span></p>
      <button type="button" disabled={benefits.length >= MAX_BENEFITS} onClick={add} className="flex items-center gap-1 text-xs font-bold text-primary disabled:opacity-40"><Plus size={13} />Add benefit</button>
    </div>
    {!benefits.length ? <p className="mt-2 rounded-lg bg-background p-3 text-xs text-secondary">No itemised benefits yet. Import them from a link or document, or add them here.</p> :
      <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">{benefits.map((b, i) => <li key={b.id} className={`grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-border p-2 ${b.subLimit ? 'ml-4 border-dashed' : ''}`}>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1.4fr]">
          <input aria-label={`Benefit ${i + 1} name`} required maxLength={200} className={small} placeholder="Benefit" value={b.name} onChange={e => edit(b.id, { name: e.target.value })} />
          <input aria-label={`Benefit ${i + 1} limit`} type="number" min={0} step="0.01" className={small} placeholder="Limit (blank = included)" value={b.limit ?? ''} onChange={e => edit(b.id, { limit: e.target.value === '' ? null : Number(e.target.value) })} />
          <input aria-label={`Benefit ${i + 1} limit wording`} maxLength={200} className={small} placeholder="Wording, e.g. 200 per 6 hours" value={b.limitText} onChange={e => edit(b.id, { limitText: e.target.value })} />
          <input aria-label={`Benefit ${i + 1} conditions`} maxLength={500} className={`${small} sm:col-span-2`} placeholder="Conditions, e.g. age bands" value={b.details} onChange={e => edit(b.id, { details: e.target.value })} />
          <label className="flex items-center gap-1.5 text-[11px] text-secondary"><input type="checkbox" checked={b.subLimit} disabled={i === 0} onChange={e => edit(b.id, { subLimit: e.target.checked })} />Sub-limit of the one above</label>
        </div>
        <button type="button" aria-label={`Remove ${b.name || `benefit ${i + 1}`}`} onClick={() => onChange(benefits.filter(x => x.id !== b.id))} className="self-start p-1 text-secondary"><X size={15} /></button>
      </li>)}</ul>}
  </div>;
}

export function BenefitsList({ policy }: { policy: InsurancePolicy }) {
  const benefits = policy.benefits ?? [];
  if (!benefits.length) return null;
  return <details className="mt-4 text-xs">
    <summary className="cursor-pointer text-secondary">Coverage details · {benefits.length} benefits</summary>
    <dl className="mt-3 divide-y divide-border">{benefits.map(b => <div key={b.id} className={`flex items-start justify-between gap-3 py-2 ${b.subLimit ? 'pl-4 text-secondary' : ''}`}>
      <dt className="min-w-0 break-words">{b.name}{b.details && <span className="mt-0.5 block text-[11px] text-secondary">{b.details}</span>}</dt>
      <dd className={`max-w-[45%] shrink-0 break-words text-right tabular-nums ${b.subLimit ? '' : 'font-bold'}`}>{benefitLimit(b, policy.currency)}</dd>
    </div>)}</dl>
    {policy.sourceUrl && <a href={policy.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-primary">Source page<ExternalLink size={12} /></a>}
  </details>;
}
