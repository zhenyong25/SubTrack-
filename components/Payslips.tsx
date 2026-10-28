import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText } from 'lucide-react';
import { deletePayslip, listPayslips, readPayslip, uploadPayslip, type Payslip } from '../services/payslipService';

export default function Payslips() {
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [month, setMonth] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; });
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ url: string; name: string; type: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const reload = async () => {
    setLoading(true); setError('');
    try { setSlips(await listPayslips()); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not load payslips.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };
  const open = (slip: Payslip, download: boolean) => run(async () => {
    const blob = await readPayslip(slip);
    const url = URL.createObjectURL(blob);
    if (!download) { setPreview({ url, name: slip.name, type: blob.type }); return; }
    const link = document.createElement('a'); link.href = url; link.download = slip.name; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  const visible = slips.filter(slip => !filter || slip.month === filter);
  const button = 'text-primary text-sm font-semibold disabled:opacity-50';
  const field = 'block bg-background text-textMain border border-border rounded-lg p-2 mt-1';
  return <section className="income-payslips bg-surface p-4 sm:p-6 rounded-xl border border-border space-y-4" style={{ gridColumn: '1 / -1', order: 4 }}>
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><FileText size={22} /></span>
      <div><h3 className="font-bold text-textMain">Payslips</h3><p className="text-xs text-secondary mt-1">Private storage for your monthly payslips. PDF, JPG, PNG or WebP, up to 10 MB each.</p></div>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs text-secondary">Pay month<input type="month" value={month} onChange={event => setMonth(event.target.value)} className={field} /></label>
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" aria-label="Upload payslip file" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (file) void run(async () => { const slip = await uploadPayslip(file, month); setSlips(items => [slip, ...items].sort((a, b) => b.month.localeCompare(a.month))); });
      }} />
      <button disabled={busy || loading || !month} onClick={() => input.current?.click()} className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? 'Working...' : 'Upload payslip'}</button>
      <label className="text-xs text-secondary sm:ml-auto">Show month<input type="month" value={filter} onChange={event => setFilter(event.target.value)} className={field} /></label>
      {filter && <button className={button} onClick={() => setFilter('')}>Show all</button>}
    </div>
    {error && <div role="alert" className="text-sm text-red-500">{error} <button disabled={busy} onClick={() => void reload()} className="underline">Retry loading</button></div>}
    {loading ? <p className="text-sm text-secondary">Loading payslips...</p> : !visible.length ? <p className="text-sm text-secondary">{filter ? 'No payslips for this month.' : 'No payslips stored yet. Choose a pay month and upload your first file.'}</p> :
      <ul className="divide-y divide-border">{visible.map(slip => <li key={slip.path} className="py-3 flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true"><FileText size={20} /></span>
        <div className="min-w-0 flex-1"><p className="text-sm text-textMain break-all">{slip.name}</p><p className="text-xs text-secondary">{slip.month} · {(slip.size / 1024).toFixed(0)} KB</p></div>
        <div className="flex gap-3">
          <button disabled={busy} onClick={() => void open(slip, false)} aria-label={`View ${slip.name}`} className={button}>View</button>
          <button disabled={busy} onClick={() => void open(slip, true)} aria-label={`Download ${slip.name}`} className={button}>Download</button>
          <button disabled={busy} onClick={() => { if (confirm(`Delete ${slip.name}? This removes the stored file permanently.`)) void run(async () => { await deletePayslip(slip); setSlips(items => items.filter(item => item.path !== slip.path)); }); }} aria-label={`Delete ${slip.name}`} className="text-red-500 text-sm disabled:opacity-50">Delete</button>
        </div>
      </li>)}</ul>}
    {preview && createPortal(<dialog ref={element => { if (element && !element.open) element.showModal(); }} onCancel={() => setPreview(null)} className="m-auto bg-transparent p-4 w-full max-w-4xl backdrop:bg-black/70" aria-label="Payslip preview">
      <div className="bg-surface rounded-xl w-full max-w-4xl p-4"><div className="flex justify-between items-center gap-3 mb-3"><p className="font-bold text-textMain truncate">{preview.name}</p><button autoFocus onClick={() => setPreview(null)} className={button}>Close</button></div>
        {preview.type.startsWith('image/') ? <img src={preview.url} alt={preview.name} className="max-h-[75vh] mx-auto object-contain" /> : <iframe src={preview.url} title={preview.name} className="w-full h-[75vh] border-0" />}
      </div>
    </dialog>, document.body)}
  </section>;
}
