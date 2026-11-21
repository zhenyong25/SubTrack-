import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Download, FileText, FileUp, Loader2, Pencil, Trash2, Upload } from 'lucide-react';
import { documentStorageAvailable, readPolicyDocument, removePolicyDocuments, uploadPolicyDocument } from '../services/insuranceDocumentService';
import { incomeYear, type TaxDocument, type TaxYear } from '../services/sgTaxService';
import { noaComplete, noaConsistent, readNoaPdf, yearFromNoa, type NoaExtraction } from '../services/taxNoaService';
import { saveTaxYear } from '../services/taxRecordService';

/** NOAs are tracked from this Year of Assessment onwards. */
export const NOA_FIRST_YA = 2024;
const money = (n: number) => `S$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
const input = 'mt-1 w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 py-2 text-sm tabular-nums text-textMain outline-none focus:border-primary';

interface QueueItem { id: string; file: File; expectedYa?: number; reading: boolean; saving?: boolean; error?: string; draft: NoaExtraction }

const hasNoa = (y?: TaxYear) => Boolean(y && (y.noaSummary || (y.status === 'Assessed' && y.assessedTax !== undefined)));
const noaDoc = (y?: TaxYear) => y?.documents?.find(d => d.type === 'application/pdf' && /noa|assessment|notice/i.test(d.name)) ?? y?.documents?.find(d => d.type === 'application/pdf');

async function openDoc(doc: TaxDocument, download: boolean) {
  const tab = download ? null : window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await readPolicyDocument(doc, 'tax'));
    if (download) { const a = document.createElement('a'); a.href = url; a.download = doc.name; document.body.appendChild(a); a.click(); a.remove(); }
    else if (tab) tab.location.href = url; else window.location.assign(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (e) { tab?.close(); throw e; }
}

export default function TaxNoaLibrary({ years, nowYa, pickRequest, onSaved, onOpen }: {
  years: TaxYear[]; nowYa: number; pickRequest: number; onSaved: (year: TaxYear) => void; onOpen: (year: TaxYear) => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const expectedFor = useRef<number | undefined>(undefined);
  const known = useRef(years); known.current = years;
  const storage = documentStorageAvailable();

  // The page's "Upload NOA" button opens the file picker here.
  useEffect(() => { if (pickRequest) { expectedFor.current = undefined; picker.current?.click(); } }, [pickRequest]);

  const update = (id: string, patch: Partial<QueueItem>) => setQueue(items => items.map(item => (item.id === id ? { ...item, ...patch } : item)));
  const addFiles = (files: File[], expectedYa?: number) => {
    setError(''); setNotice('');
    const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length < files.length) setError('Only PDF Notices of Assessment can be read. Other files were skipped.');
    for (const file of pdfs) {
      const id = crypto.randomUUID();
      setQueue(items => [...items, { id, file, expectedYa, reading: true, draft: expectedYa ? { ya: expectedYa } : {} }]);
      readNoaPdf(file)
        .then(draft => update(id, { reading: false, draft: { ...draft, ya: draft.ya ?? expectedYa }, error: Object.keys(draft).length ? undefined : 'Nothing readable was found (it may be scanned). Enter the totals from the notice.' }))
        .catch(e => update(id, { reading: false, error: errorText(e) }));
    }
  };

  const save = async (item: QueueItem) => {
    const draft = item.draft;
    if (!noaComplete(draft)) { update(item.id, { error: 'Fill in the Year of Assessment and all four amounts first.' }); return false; }
    update(item.id, { saving: true, error: undefined });
    const all = known.current;
    const existing = all.find(y => y.ya === draft.ya);
    const previous = [...all].filter(y => y.ya < draft.ya!).sort((a, b) => b.ya - a.ya)[0];
    let year = yearFromNoa(draft, existing, previous);
    let uploaded: TaxDocument | undefined;
    try {
      if (storage) {
        uploaded = await uploadPolicyDocument(year.id, item.file, 'tax');
        year = { ...year, documents: [...(year.documents ?? []), uploaded] };
      }
      await saveTaxYear(year, all);
      known.current = [...all.filter(y => y.id !== year.id), year];
      onSaved(year);
      setQueue(items => items.filter(i => i.id !== item.id));
      setNotice(`YA ${year.ya} saved${existing ? ' - NOA added to your existing record' : ' - new record created from the NOA'}.`);
      return true;
    } catch (e) {
      if (uploaded) await removePolicyDocuments([uploaded], 'tax');
      update(item.id, { saving: false, error: errorText(e) });
      return false;
    }
  };
  const saveAll = async () => { for (const item of queue.filter(i => !i.reading && noaComplete(i.draft))) await save(item); };

  const span = Array.from({ length: Math.max(1, nowYa - NOA_FIRST_YA + 1) }, (_, i) => nowYa - i);
  const older = years.filter(y => y.ya < NOA_FIRST_YA).map(y => y.ya);
  const rows = [...span, ...older.sort((a, b) => b - a)];
  const assessable = span.filter(ya => ya < nowYa); // the current YA's notice arrives next year
  const onFile = assessable.filter(ya => hasNoa(years.find(y => y.ya === ya))).length;
  const ready = queue.filter(i => !i.reading && noaComplete(i.draft)).length;

  return <section aria-label="Notices of Assessment" className="space-y-4">
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 font-bold"><FileText size={18} className="text-primary" />Notices of Assessment</h2>
          <p className="mt-0.5 text-xs text-secondary">Keep every NOA from YA {NOA_FIRST_YA} onwards: the figures for your records, the PDF for safekeeping.</p></div>
        <div className="text-right"><p className="text-xl font-black tabular-nums">{onFile}<span className="text-sm font-bold text-secondary"> / {assessable.length || 0}</span></p><p className="text-[11px] text-secondary">years on file</p></div>
      </div>
      {assessable.length > 0 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-background" aria-hidden="true"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(onFile / assessable.length) * 100}%` }} /></div>}

      <label onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]); }}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors ${dragging ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/60'}`}>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary"><FileUp size={22} /></span>
        <span className="text-sm font-bold">Drop NOA PDFs here, or <span className="text-primary underline">browse</span></span>
        <span className="text-[11px] text-secondary">Several at once is fine: each is read in your browser and matched to its Year of Assessment.</span>
        <input ref={picker} type="file" multiple accept="application/pdf,.pdf" aria-label="Notice of Assessment PDFs" className="sr-only"
          onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; addFiles(files, expectedFor.current); expectedFor.current = undefined; }} />
      </label>
      {!storage && <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">Sign in with cloud sync to keep the PDFs. Without it, only the figures are saved, in this browser.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      {notice && <p role="status" className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} />{notice}</p>}

      {queue.length > 0 && <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold">Review before saving</h3>{ready > 1 && <button type="button" onClick={saveAll} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">Save all {ready}</button>}</div>
        {queue.map(item => {
          const d = item.draft; const complete = noaComplete(d);
          const existing = d.ya ? years.find(y => y.ya === d.ya) : undefined;
          const set = (key: keyof NoaExtraction, value: string) => update(item.id, { draft: { ...d, [key]: value === '' ? undefined : key === 'date' ? value : Number(value) } });
          return <article key={item.id} className="rounded-xl border border-border bg-background p-3 sm:p-4" aria-label={`Review ${item.file.name}`}>
            <div className="flex flex-wrap items-center gap-2">
              <FileText size={16} className="shrink-0 text-primary" />
              <p className="min-w-0 flex-1 truncate text-xs font-bold" title={item.file.name}>{item.file.name}</p>
              {item.reading ? <span className="flex items-center gap-1 text-[11px] text-secondary"><Loader2 size={12} className="animate-spin" />Reading…</span>
                : complete ? (noaConsistent(d) ? <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={11} />Figures add up</span>
                  : <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400"><AlertTriangle size={11} />Income − deductions ≠ chargeable</span>)
                  : <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">Needs details</span>}
              <button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => setQueue(items => items.filter(i => i.id !== item.id))} className="p-1 text-secondary"><Trash2 size={14} /></button>
            </div>
            {!item.reading && <>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {([['ya', 'Year of Assessment'], ['income', 'Income'], ['deductions', 'Deductions'], ['chargeable', 'Chargeable income'], ['tax', 'Tax payable']] as const).map(([key, label]) =>
                  <label key={key} className="text-[11px] font-semibold text-secondary">{label}<input className={input} type="number" min={key === 'ya' ? 2000 : 0} step={key === 'ya' ? 1 : '0.01'} value={d[key] ?? ''} onChange={e => set(key, e.target.value)} /></label>)}
                <label className="text-[11px] font-semibold text-secondary">Notice date<input className={input} type="date" value={d.date ?? ''} onChange={e => set('date', e.target.value)} /></label>
              </div>
              {!!d.lines?.length && <p className="mt-2 flex flex-wrap gap-1.5">{d.lines.map(l => <span key={l.kind + l.label} className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-secondary">{l.label} {money(l.amount)}</span>)}</p>}
              {item.expectedYa && d.ya && d.ya !== item.expectedYa && <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">You picked this for YA {item.expectedYa}, but the notice says YA {d.ya}.</p>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-secondary">{!d.ya ? 'Enter the Year of Assessment.' : existing ? (hasNoa(existing) ? `Replaces the NOA figures on YA ${d.ya}; your detailed estimate is kept.` : `Adds the NOA to your YA ${d.ya} record; your detailed estimate is kept.`) : `Creates a YA ${d.ya} record (${incomeYear(d.ya)} income) from the notice.`}</p>
                <button type="button" disabled={!complete || item.saving} onClick={() => void save(item)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">{item.saving ? 'Saving…' : 'Save NOA'}</button>
              </div>
            </>}
            {item.error && <p role="alert" className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">{item.error}</p>}
          </article>;
        })}
      </div>}
    </div>

    <ol className="relative space-y-2 border-l-2 border-border pl-5" aria-label="Notices by Year of Assessment">{rows.map(ya => {
      const record = years.find(y => y.ya === ya);
      const noa = hasNoa(record); const doc = noaDoc(record);
      const current = ya >= nowYa;
      const tax = record?.noaSummary?.tax ?? record?.assessedTax;
      return <li key={ya} className="relative">
        <span className={`absolute -left-[29px] top-4 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface ${noa ? 'bg-emerald-500' : current ? 'bg-blue-400' : 'bg-border'}`} aria-hidden="true" />
        <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${noa ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-surface'}`}>
          <div className="w-24 shrink-0"><p className="text-sm font-black">YA {ya}</p><p className="text-[10px] text-secondary">{incomeYear(ya)} income</p></div>
          <div className="min-w-0 flex-1 text-xs">
            {noa ? <><p className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={13} />NOA on file{record?.noaDate ? ` · ${dateText(record.noaDate)}` : ''}</p>
              <p className="mt-0.5 text-secondary">Tax payable <b className="tabular-nums text-textMain">{money(tax ?? 0)}</b>{record?.noaSummary ? ` · chargeable ${money(record.noaSummary.chargeable)}` : ''}{doc ? '' : ' · no PDF attached'}</p></>
              : current ? <p className="flex items-center gap-1.5 text-secondary"><Clock size={13} />Notice expected Apr–Sep {ya}{record ? ' · estimate recorded' : ''}</p>
                : <p className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><AlertTriangle size={13} />{record ? 'Estimate only - add the NOA' : 'No record yet'}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {doc && <><button type="button" onClick={() => openDoc(doc, false).catch(e => setError(errorText(e)))} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold hover:border-primary"><FileText size={12} />View</button>
              <button type="button" aria-label={`Download YA ${ya} NOA`} onClick={() => openDoc(doc, true).catch(e => setError(errorText(e)))} className="rounded-lg border border-border p-1.5 hover:border-primary"><Download size={12} /></button></>}
            {record && <button type="button" aria-label={`Edit YA ${ya}`} onClick={() => onOpen(record)} className="rounded-lg border border-border p-1.5 hover:border-primary"><Pencil size={12} /></button>}
            {!current && (!noa || !doc) && <button type="button" onClick={() => { expectedFor.current = ya; picker.current?.click(); }} className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-white"><Upload size={12} />{noa ? 'Attach PDF' : 'Upload NOA'}</button>}
          </div>
        </div>
      </li>;
    })}</ol>
  </section>;
}
