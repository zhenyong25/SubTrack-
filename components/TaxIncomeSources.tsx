import React, { useState } from 'react';
import { ChevronDown, Wallet } from 'lucide-react';
import { groupIncomeSources, type SourceGroup } from '../services/taxProjectionService';

const money = (n: number) => `S$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
const STYLE: Record<SourceGroup, { icon: string; bar: string; chip: string }> = {
  Salary: { icon: '💼', bar: 'bg-blue-500', chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  'Bonuses & awards': { icon: '🎁', bar: 'bg-violet-500', chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  'Allowances & supplements': { icon: '🧾', bar: 'bg-teal-500', chip: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
  Other: { icon: '➕', bar: 'bg-slate-500', chip: 'bg-slate-500/10 text-slate-700 dark:text-slate-300' },
};
const payments = (n: number) => (n === 1 ? 'one payment' : n === 12 ? 'monthly · 12 payments' : `${n} payments`);

/** Taxable income sources for one YA, grouped by kind with each source's share. */
export default function TaxIncomeSources({ ya, incomeYear, lines, skipped, action }: {
  ya: number; incomeYear: number; lines: Array<{ id: string; name: string; amount: number; payments: number }>; skipped: string[]; action?: React.ReactNode;
}) {
  const groups = groupIncomeSources(lines);
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  const [open, setOpen] = useState<SourceGroup[]>(() => groups.slice(0, 2).map(g => g.group));
  const toggle = (group: SourceGroup) => setOpen(current => current.includes(group) ? current.filter(g => g !== group) : [...current, group]);
  return <section aria-label={`YA ${ya} income sources`} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="flex items-center gap-2 font-bold"><Wallet size={17} className="text-primary" />YA {ya} income sources</h3>
        <p className="mt-0.5 text-xs text-secondary">{lines.length} source{lines.length === 1 ? '' : 's'} scheduled in {incomeYear} · <b className="tabular-nums text-textMain">{money(total)}</b> before growth assumptions</p></div>
      {action}
    </div>
    {lines.length > 0 && <>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-background" role="img" aria-label={groups.map(g => `${g.group} ${pct(g.share)}`).join(', ')}>
        {groups.map(g => <span key={g.group} className={STYLE[g.group].bar} style={{ width: `${g.share * 100}%` }} title={`${g.group} · ${pct(g.share)}`} />)}
      </div>
      <ul className="mt-4 space-y-2">{groups.map(g => {
        const expanded = open.includes(g.group);
        return <li key={g.group} className="overflow-hidden rounded-xl border border-border">
          <button type="button" aria-expanded={expanded} onClick={() => toggle(g.group)} className="flex w-full items-center gap-3 bg-background px-3 py-2.5 text-left hover:bg-primary/5">
            <span className="text-lg" aria-hidden="true">{STYLE[g.group].icon}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{g.group}</span><span className="text-[11px] text-secondary">{g.items.length} source{g.items.length === 1 ? '' : 's'}</span></span>
            <span className={`hidden rounded-full px-2 py-0.5 text-[11px] font-bold sm:inline ${STYLE[g.group].chip}`}>{pct(g.share)}</span>
            <span className="shrink-0 text-right text-sm font-bold tabular-nums sm:w-32">{money(g.total)}<span className="block text-[10px] font-semibold text-secondary sm:hidden">{pct(g.share)}</span></span>
            <ChevronDown size={16} className={`shrink-0 text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          {expanded && <ul className="divide-y divide-border">{g.items.map(item => <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
            <div className="min-w-0"><p className="truncate text-xs font-semibold" title={item.name}>{item.name}</p><p className="text-[11px] text-secondary">{payments(item.payments)}</p></div>
            <div className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-background sm:col-span-1 sm:row-start-auto" aria-hidden="true"><div className={`h-full rounded-full ${STYLE[g.group].bar}`} style={{ width: `${Math.max(2, item.share * 100)}%` }} /></div>
            <p className="text-right text-xs tabular-nums"><b>{money(item.amount)}</b><span className="ml-1.5 text-[10px] text-secondary">{pct(item.share)}</span></p>
          </li>)}</ul>}
        </li>;
      })}</ul>
    </>}
    {!lines.length && <p className="mt-3 rounded-xl bg-background p-3 text-sm text-secondary">No eligible scheduled income in {incomeYear}. Check your Income records or enter an additional bonus.</p>}
    {skipped.length > 0 && <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300"><p className="font-bold">Not included</p><ul className="mt-1 list-disc space-y-0.5 pl-4">{skipped.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
  </section>;
}
