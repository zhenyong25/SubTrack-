import React from 'react';
import { computeTax, incomeYear, marginalRate, RELIEF_CAP, taxComputation, type TaxYear } from '../services/sgTaxService';

const money = (n: number, digits = 2) => `S$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const pct = (n: number) => `${(n * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

type Line = { label: string; amount: number; note?: string };
const Badge = ({ sign, tone }: { sign: string; tone: string }) =>
  <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 bg-surface text-lg font-black ${tone}`}>{sign}</span>;

/** A tinted heading row with its items, like the coloured bars on a Notice of Assessment. */
function Group({ title, total, lines, tint }: { title: string; total?: number; lines: Line[]; tint: string }) {
  return <div className="mt-3 overflow-hidden rounded-lg border border-border/60">
    <div className={`flex items-baseline justify-between gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide ${tint}`}><span>{title}</span>{total !== undefined && <span className="tabular-nums">{money(total)}</span>}</div>
    {lines.length > 0 && <dl className="divide-y divide-border/60 bg-surface/60 text-xs">{lines.map(l => <div key={l.label} className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 px-3 py-1.5">
      <dt className="text-secondary">{l.label}{l.note && <span className="block text-[10px] text-amber-600 dark:text-amber-400">{l.note}</span>}</dt><dd className="tabular-nums">{money(l.amount)}</dd>
    </div>)}</dl>}
  </div>;
}

/** Income − deductions = chargeable income, then the tax computation, laid out like an IRAS NOA. */
export default function TaxBreakdown({ year, assessment = false }: { year: TaxYear; assessment?: boolean; key?: string }) {
  const r = computeTax(year);
  const noa = assessment ? year.noaSummary : undefined;
  const resident = year.residency === 'Resident';
  const income = noa?.income ?? r.totalIncome;
  const deductions = noa?.deductions ?? r.donationDeduction + r.reliefs;
  const chargeable = noa?.chargeable ?? r.chargeable;
  const tax = noa?.tax ?? r.tax;

  // Income and deduction lines: from the NOA's items when it was read, else from the record.
  const noaLines = noa?.lines ?? [];
  const incomeLines: Line[] = noa
    ? (noaLines.filter(l => l.kind === 'income').length ? noaLines.filter(l => l.kind === 'income') : [{ label: 'Total income (as reported)', amount: noa.income }])
    : ([['Employment', Math.max(0, year.employment - year.employmentExpenses), year.employmentExpenses ? `after ${money(year.employmentExpenses, 0)} expenses` : undefined],
      ['Trade, business or profession', year.selfEmployed], ['Rent', year.rental], ['Other income', year.otherIncome]] as Array<[string, number, string?]>)
      .filter(([, n]) => n > 0).map(([label, amount, note]) => ({ label, amount, note }));
  const reliefLines: Line[] = noa ? noaLines.filter(l => l.kind === 'relief') : r.reliefLines.map(l => ({ label: l.label.replace(' (automatic)', ''), amount: l.allowed, note: l.note }));
  const reliefTotal = noa ? (reliefLines.length ? reliefLines.reduce((s, l) => s + l.amount, 0) : undefined) : r.reliefs;
  const donation = noa ? noaLines.find(l => l.kind === 'donation')?.amount : r.donationDeduction;

  // The computation: bands on chargeable income, then rebates. For an NOA, anything between the
  // band result and the assessed tax is shown as rebates or adjustments.
  const computation = taxComputation(chargeable);
  const gross = resident ? computation.gross : r.grossTax;
  const rebates: Line[] = noa
    ? (noaLines.filter(l => l.kind === 'rebate').length ? noaLines.filter(l => l.kind === 'rebate')
      : gross - tax > 0.5 ? [{ label: 'Rebates / adjustments on NOA', amount: Math.round((gross - tax) * 100) / 100 }] : [])
    : [...(r.rebate > 0 ? [{ label: 'Personal income tax rebate', amount: r.rebate }] : []), ...(r.parenthoodRebate > 0 ? [{ label: 'Parenthood tax rebate', amount: r.parenthoodRebate }] : [])];

  const share = (n: number) => (income > 0 ? Math.max(0, Math.min(1, n / income)) : 0);
  const kept = Math.max(0, income - tax);
  return <section aria-label={`YA ${year.ya} income deductions and chargeable income`} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">YA {year.ya} · Income to tax</h2>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${noa ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary'}`}>{incomeYear(year.ya)} income · {noa ? 'Reviewed NOA totals' : 'Calculated estimate'}</span>
    </div>
    <div className="mt-4 grid gap-3 lg:grid-cols-3">
      <div className="min-w-0 rounded-2xl border border-blue-500/25 bg-blue-500/5 p-4">
        <div className="flex items-center gap-3"><Badge sign="+" tone="border-blue-500 text-blue-600 dark:text-blue-400" /><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-wide text-blue-700 dark:text-blue-300">Income</p><p className="break-words text-xl font-extrabold tabular-nums">{money(income)}</p></div></div>
        <Group title="Income" lines={incomeLines} tint="bg-blue-500/15 text-blue-800 dark:text-blue-200" />
        <p className="mt-2 text-[10px] text-secondary">All income is net of allowable expenses.</p>
      </div>
      <div className="min-w-0 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
        <div className="flex items-center gap-3"><Badge sign="−" tone="border-amber-500 text-amber-600 dark:text-amber-400" /><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">Deductions</p><p className="break-words text-xl font-extrabold tabular-nums">{money(deductions)}</p></div></div>
        {(reliefLines.length > 0 || reliefTotal !== undefined) && <Group title="Reliefs" total={reliefTotal} lines={reliefLines} tint="bg-amber-400/30 text-amber-900 dark:text-amber-200" />}
        {!!donation && <Group title="Donations (250%)" total={donation} lines={[]} tint="bg-amber-400/30 text-amber-900 dark:text-amber-200" />}
        {noa && !reliefLines.length && !donation && <p className="mt-3 text-xs text-secondary">Itemised reliefs weren’t read from this NOA; the total is as reported.</p>}
        {!noa && r.capped && <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">Personal reliefs are capped at {money(RELIEF_CAP, 0)}.</p>}
      </div>
      <div className="min-w-0 rounded-2xl border border-slate-400/30 bg-slate-500/5 p-4">
        <div className="flex items-center gap-3"><Badge sign="=" tone="border-slate-500 text-slate-700 dark:text-slate-200" /><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">Chargeable income</p><p className="break-words text-xl font-extrabold tabular-nums">{money(chargeable)}</p></div></div>
        <div className="mt-3 overflow-hidden rounded-lg border border-border/60" aria-label="Tax computation">
          <p className="bg-slate-400/25 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">Tax computation</p>
          <dl className="divide-y divide-border/60 bg-surface/60 text-xs">
            {resident ? (computation.lines.length ? computation.lines.map(l => <div key={l.label} className="flex flex-wrap justify-between gap-x-2 px-3 py-1.5"><dt className="text-secondary">{l.label}{l.rate !== undefined && <span className="font-semibold text-textMain"> @ {pct(l.rate)}</span>}</dt><dd className="tabular-nums">{money(l.amount)}</dd></div>)
              : <div className="px-3 py-1.5 text-secondary">The first $20,000 is taxed at 0%.</div>)
              : <div className="px-3 py-1.5 text-secondary">Non-resident: the higher of 15% or resident rates on employment income, 24% on other income.</div>}
            {(rebates.length > 0 || computation.lines.length > 1) && <div className="flex justify-between gap-2 px-3 py-1.5 font-semibold"><dt>Gross tax</dt><dd className="tabular-nums">{money(gross)}</dd></div>}
            {rebates.map(l => <div key={l.label} className="flex flex-wrap justify-between gap-x-2 px-3 py-1.5"><dt className="text-secondary">Less: {l.label}</dt><dd className="tabular-nums text-emerald-600 dark:text-emerald-400">−{money(l.amount)}</dd></div>)}
          </dl>
          <div className="flex items-baseline justify-between gap-2 bg-slate-400/25 px-3 py-2"><span className="text-xs font-bold">{noa ? 'Tax payable (assessed)' : 'Tax payable (estimate)'}</span><span className="text-lg font-black tabular-nums text-primary">{money(tax)}</span></div>
        </div>
        {!noa && tax > 0 && <p className="mt-2 text-[11px] text-secondary">About {money(tax / 12)} a month if you set it aside, or pay by GIRO in up to 12 instalments once assessed.</p>}
      </div>
    </div>
    {income > 0 && <figure className="mt-5">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs"><span className="font-semibold">Where each {money(100, 0)} of income goes</span><span className="text-secondary">Effective rate {pct(income ? tax / income : 0)}{resident ? ` · top rate ${pct(marginalRate(chargeable))}` : ''}</span></figcaption>
      <div className="flex h-4 overflow-hidden rounded-full bg-background" role="img" aria-label={`Deductions ${money(Math.min(income, deductions))}, tax ${money(tax)}, kept ${money(kept)}`}>
        <span className="bg-amber-400" style={{ width: `${share(deductions) * 100}%` }} />
        <span className="bg-primary/70" style={{ width: `${Math.max(0, share(chargeable) - share(tax)) * 100}%` }} />
        <span className="bg-rose-500" style={{ width: `${share(tax) * 100}%` }} />
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-secondary">
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Not taxed (reliefs) · {money(share(deductions) * 100)}</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary/70" />Taxed, kept · {money(Math.max(0, share(chargeable) - share(tax)) * 100)}</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />Tax · {money(share(tax) * 100)}</li>
      </ul>
    </figure>}
  </section>;
}
