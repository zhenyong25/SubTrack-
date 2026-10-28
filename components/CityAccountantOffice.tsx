import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CheckCircle2, ClipboardList, Loader2, RefreshCw, X } from 'lucide-react';
import type { Expense } from '../types';
import { accountantFingerprint, runAccountantReview, type AccountantProgress, type AccountantReport } from '../services/cityAccountantService';

const AccountantOfficeScene = React.lazy(() => import('./CityAccountantInterior3D'));

interface Props {
  open: boolean;
  expenses: Expense[];
  today: string;
  report?: AccountantReport;
  onReport: (report: AccountantReport) => void;
  onWorking: (working: boolean) => void;
  onClose: () => void;
  onOpenExpenses: () => void;
}
const amount = (value: number, currency: string) => `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export default function CityAccountantOffice(props: Props) {
  const { open, expenses, today, report, onClose, onOpenExpenses } = props;
  const [request, setRequest] = useState(0);
  const [progress, setProgress] = useState<AccountantProgress | null>(null);
  const [error, setError] = useState('');
  const latest = useRef(props); latest.current = props;
  const fingerprint = useMemo(() => accountantFingerprint(expenses, today), [expenses, today]);
  const stale = report?.fingerprint !== fingerprint;
  useEffect(() => { if (stale) setRequest(value => value + 1); }, [fingerprint]);
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    const current = latest.current;
    setError(''); current.onWorking(true);
    runAccountantReview(current.expenses, current.today, { signal: controller.signal, onProgress: setProgress })
      .then(next => { if (!controller.signal.aborted) latest.current.onReport(next); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'The review could not be completed.'); })
      .finally(() => { if (!controller.signal.aborted) { setProgress(null); latest.current.onWorking(false); } });
    return () => { controller.abort(); latest.current.onWorking(false); };
  }, [request]);
  if (!open) return null;
  const working = progress != null;
  return createPortal(<dialog ref={element => { if (element && !element.open) element.showModal(); }} onCancel={onClose} aria-labelledby="accountant-office-title" className="accountant-office-dialog m-auto overflow-y-auto rounded-3xl border border-border bg-surface p-4 text-textMain shadow-2xl backdrop:bg-black/70 sm:p-6">
    <header className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-emerald-500">Town Hall · Resident workspace</p><h2 id="accountant-office-title" className="mt-1 text-xl font-extrabold">Meet Jules, your Accountant</h2><p className="mt-1 text-xs text-secondary">A resident with a job: turn your recent expenses into a clear spending review.</p></div><button autoFocus type="button" onClick={onClose} aria-label="Close accountant office" className="rounded-lg p-2 text-secondary hover:bg-background"><X size={20} /></button></header>
    <div className="accountant-office-layout mt-5 grid gap-5">
      <div className="min-w-0 space-y-3"><React.Suspense fallback={<div className="accountant-interior-canvas flex items-center justify-center rounded-2xl bg-background text-sm text-secondary"><Loader2 size={18} className="mr-2 animate-spin" />Entering the Town Hall...</div>}><AccountantOfficeScene working={working} report={report} /></React.Suspense><div className="rounded-xl border border-border bg-background p-4"><p className="flex items-center gap-2 text-sm font-bold">{working ? <Loader2 size={16} className="animate-spin text-primary" /> : <CheckCircle2 size={16} className="text-emerald-500" />}{working ? 'Working on your review' : report && !stale ? 'Your report is ready' : 'Ready for an assignment'}</p><p className="mt-2 text-xs text-secondary" role="status" aria-live="polite">{progress?.label || 'Assigned to review expenses, compare weeks, and flag entries worth checking.'}</p>{progress && <progress aria-label="Accountant review progress" max={4} value={progress.step + 1} className="mt-3 h-1.5 w-full accent-emerald-500" />}</div><p className="text-[11px] leading-relaxed text-secondary">Jules runs checks on your records in this app. The review continues if you close this room while staying in My City. Expense entries stay unchanged; you decide what to edit.</p></div>
      <div className="accountant-office-report min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-bold"><ClipboardList size={16} className="text-primary" /> Spending report</h3><button type="button" disabled={working} onClick={() => setRequest(value => value + 1)} className="flex items-center gap-1.5 text-xs font-bold text-primary disabled:opacity-40"><RefreshCw size={13} />Run review</button></div>
        {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs text-red-500">{error}</p>}
        {report ? <>
          <p className="text-xs text-secondary">{report.start} – {report.asOf} · {report.reviewed} expenses reviewed{stale && <span className="ml-1 text-amber-600 dark:text-amber-300">· Updating for recent changes</span>}</p>
          {report.reviewed === 0 && <div className="rounded-xl border border-dashed border-border p-4"><p className="text-sm font-semibold">No expenses recorded in this period</p><p className="mt-1 text-xs text-secondary">Record an expense and Jules can prepare your first spending review.</p></div>}
          {report.currencies.map(item => <div key={item.currency} className="rounded-xl border border-border bg-background p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-secondary">Recorded spending · {item.currency}</p><p className="mt-1 text-xl font-extrabold tabular-nums">{amount(item.current, item.currency)}</p><p className="mt-1 text-xs text-secondary">Previous seven days: {amount(item.previous, item.currency)}{item.changePct != null ? ` · ${item.changePct >= 0 ? '+' : ''}${item.changePct.toFixed(1)}%` : ' · No comparison baseline'}</p><p className="mt-2 text-xs text-textMain">Largest category: <strong>{item.topCategory}</strong> · {amount(item.topCategoryAmount, item.currency)}</p></div>)}
          <div><h4 className="text-xs font-bold uppercase tracking-wide text-secondary">Review inbox</h4>{!report.findings.length ? <p className="mt-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">{report.reviewed ? 'No uncategorised or matching duplicate entries found by these checks.' : 'Waiting for expense records.'}</p> : <ul className="mt-2 space-y-2">{report.findings.map((finding, index) => <li key={index} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3"><p className="text-sm font-bold">{finding.title}</p><p className="mt-1 text-xs leading-relaxed text-secondary">{finding.detail}</p></li>)}</ul>}</div>
          <p className="text-[10px] text-secondary">Completed {new Date(report.completedAt).toLocaleString()}. {report.skipped ? `${report.skipped} invalid or repeated record(s) skipped. ` : ''}Currencies are reviewed separately. Includes recorded expenses only.</p>
        </> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-secondary">{working ? 'Jules is preparing your first report...' : 'Run a review to fill your inbox.'}</p>}
        <button type="button" onClick={onOpenExpenses} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Open Expenses <ArrowRight size={15} /></button>
      </div>
    </div>
  </dialog>, document.body);
}
