import React, { useState } from 'react';
import { documentStorageAvailable } from '../services/insuranceDocumentService';
import { readNoaPdf, type NoaExtraction } from '../services/taxNoaService';
import type { TaxNoaSummary } from '../services/sgTaxService';

export default function TaxNoaImport({ initial, busy, onApply }: { initial?: TaxNoaSummary; busy: boolean; onApply: (summary: TaxNoaSummary, file?: File) => void }) {
  const [draft, setDraft] = useState<NoaExtraction>(initial ?? {}); const [file, setFile] = useState<File>(); const [reading, setReading] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const complete = ['ya', 'income', 'deductions', 'chargeable', 'tax'].every(key => typeof draft[key] === 'number' && Number.isFinite(draft[key]) && draft[key] >= 0) && Number.isInteger(draft.ya) && draft.ya >= 2000 && draft.ya <= 2100;
  const mismatch = complete && Math.abs(Math.max(0, Math.floor(draft.income! - draft.deductions!)) - draft.chargeable!) > 1;
  return <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
    <h3 className="text-sm font-bold">Upload & review an Income Tax NOA</h3>
    <p className="mt-1 text-xs text-secondary">PDF text is read locally in your browser. Review every figure before applying. No assessment is saved until you press Save year.</p>
    <fieldset disabled={busy || reading} className="mt-3 space-y-3">
      <label className="block text-xs font-semibold text-secondary">Notice of Assessment PDF<input aria-label="Notice of Assessment PDF" type="file" accept="application/pdf,.pdf" className="mt-1 block w-full min-w-0 text-xs" onChange={async e => {
        const picked = e.target.files?.[0]; e.target.value = ''; if (!picked) return;
        setReading(true); setError(''); setMessage(''); setFile(undefined); setDraft({});
        try { const result = await readNoaPdf(picked); setFile(picked); setDraft(result); setMessage(Object.keys(result).length ? 'Recognised fields are filled below. Review missing or incorrect values.' : 'No readable fields found. This may be a scanned PDF; enter the totals below and keep the attachment.'); }
        catch (err) { setError((err as Error).message); } finally { setReading(false); }
      }} /></label>
      {file && <p className="break-words text-xs text-secondary">Selected: {file.name}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{([['ya', 'NOA Year of Assessment'], ['income', 'NOA total income (after expenses)'], ['deductions', 'NOA total deductions & reliefs'], ['chargeable', 'NOA chargeable income'], ['tax', 'NOA tax payable']] as const).map(([key, label]) => <label className="text-xs font-semibold text-secondary" key={key}>{label}<input className="mt-1 w-full min-w-0 rounded-xl border border-border bg-background p-2 text-sm text-textMain" type="number" min={key === 'ya' ? 2000 : 0} max={key === 'ya' ? 2100 : undefined} step={key === 'ya' ? 1 : '.01'} value={draft[key] ?? ''} onChange={e => setDraft({ ...draft, [key]: e.target.value === '' ? undefined : +e.target.value })} /></label>)}
        <label className="text-xs font-semibold text-secondary">NOA issue date<input className="mt-1 w-full min-w-0 rounded-xl border border-border bg-background p-2 text-sm text-textMain" type="date" value={draft.date ?? ''} onChange={e => setDraft({ ...draft, date: e.target.value || undefined })} /></label>
      </div>
      {mismatch && <p className="text-xs text-amber-600 dark:text-amber-400">Income minus deductions does not match reported chargeable income. Check the PDF for adjustments or a reading error. Reported figures remain separate from the computed estimate.</p>}
      <button type="button" disabled={!complete} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40" onClick={() => { setError(''); try { onApply(draft as TaxNoaSummary, file); setMessage('Reviewed NOA applied to this draft. Save year to keep it.'); setFile(undefined); } catch (err) { setError((err as Error).message); } }}>Apply reviewed NOA</button>
    </fieldset>
    {reading && <p role="status" className="mt-2 text-xs text-secondary">Reading PDF…</p>}{message && <p role="status" className="mt-2 text-xs text-secondary">{message}</p>}{error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    <p className="mt-3 text-[11px] text-secondary">{documentStorageAvailable() ? 'The PDF will be attached when the year is saved, in your existing private cloud document storage.' : 'Cloud sync is needed to retain the PDF attachment. Reviewed totals can still be saved in this browser.'} Reading an NOA does not infer individual relief eligibility or mark tax as paid.</p>
  </div>;
}
