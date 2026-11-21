import React, { useMemo, useState } from 'react';
import type { Income } from '../types';
import { emptyYear, incomeYear, RELIEF_FIELDS, type TaxYear } from '../services/sgTaxService';
import { projectTax } from '../services/taxProjectionService';
import TaxBreakdown from './TaxBreakdown';
import TaxIncomeSources from './TaxIncomeSources';

const input = 'mt-1 w-full min-w-0 rounded-xl border border-border bg-background p-2.5 text-sm text-textMain';
const money = (n: number) => `S$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const field = 'text-xs font-semibold text-secondary';
function profileFrom(source: TaxYear | undefined, ya: number): TaxYear {
  return { ...emptyYear(ya), residency: source?.residency ?? 'Resident', citizenship: source?.citizenship ?? 'Foreigner', age: source ? Math.max(0, Math.min(120, source.age + ya - source.ya)) : 30, employmentExpenses: source?.employmentExpenses ?? 0, donations: source?.donations ?? 0, reliefs: { ...source?.reliefs } };
}

export default function TaxProjection({ incomes, years, today, onReview }: { incomes: Income[]; years: TaxYear[]; today: string; onReview: (y: TaxYear) => void }) {
  const start = Number(today.slice(0, 4)) + 1;
  const [firstYa, setFirstYa] = useState(start); const [count, setCount] = useState(5); const [growth, setGrowth] = useState(0); const [bonus, setBonus] = useState(0);
  const [treatment, setTreatment] = useState<'Employment' | 'Self-employed'>('Employment');
  const [profile, setProfile] = useState(() => profileFrom(years[0], start)); const [selected, setSelected] = useState(start);
  const [templateId, setTemplateId] = useState(years[0]?.id ?? '');
  const projection = useMemo(() => { try { return { rows: projectTax(incomes, { firstYa, years: count, annualGrowth: growth, annualBonus: bonus, template: profile, incomeTreatment: treatment }), error: '' }; } catch (e) { return { rows: [], error: (e as Error).message }; } }, [incomes, firstYa, count, growth, bonus, profile, treatment]);
  const row = projection.rows.find(r => r.year.ya === selected) ?? projection.rows[0];
  const max = Math.max(1, ...projection.rows.map(r => r.result.tax));
  return <div className="space-y-4">
    <section className="rounded-2xl border border-border bg-surface p-5"><h2 className="text-lg font-bold">Future tax from active income</h2><p className="mt-1 text-sm text-secondary">YA 2027 taxes income earned in 2026; YA 2028 taxes 2027 income. Chargeable income and tax recalculate as your active income or assumptions change.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className={field}>First Year of Assessment<input className={input} type="number" min="2024" max="2100" value={firstYa} onChange={e => setFirstYa(+e.target.value)} /></label>
        <label className={field}>Number of years<input className={input} type="number" min="1" max="15" value={count} onChange={e => setCount(+e.target.value)} /></label>
        <label className={field}>Annual income growth (%)<input className={input} type="number" min="-50" max="100" step="0.1" value={growth} onChange={e => setGrowth(+e.target.value)} /></label>
        <label className={field}>Additional taxable bonus each year (SGD)<input className={input} type="number" min="0" step="0.01" value={bonus} onChange={e => setBonus(+e.target.value)} /></label>
        <label className={field}>Treat active income as<select className={input} value={treatment} onChange={e => setTreatment(e.target.value as typeof treatment)}><option>Employment</option><option>Self-employed</option></select></label>
        <label className={field}>Relief assumptions from<select className={input} value={templateId} onChange={e => { setTemplateId(e.target.value); setProfile(profileFrom(years.find(y => y.id === e.target.value), firstYa)); }}><option value="">No saved year · enter assumptions</option>{years.map(y => <option value={y.id} key={y.id}>YA {y.ya} · review eligibility</option>)}</select></label>
        <label className={field}>Tax residency<select className={input} value={profile.residency} onChange={e => setProfile({ ...profile, residency: e.target.value as TaxYear['residency'] })}><option>Resident</option><option>Non-resident</option></select></label>
        <label className={field}>Citizenship<select className={input} value={profile.citizenship} onChange={e => setProfile({ ...profile, citizenship: e.target.value as TaxYear['citizenship'] })}><option>Citizen / PR</option><option>Foreigner</option></select></label>
      </div>
      <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-primary">Edit deductions, reliefs and age assumptions</summary><p className="mt-2 text-xs text-secondary">Amounts repeat each year; only age-based earned-income relief adjusts automatically. CPF relief is not inferred from salary or citizenship. Enter eligible employee contributions from your statement. No future personal or parenthood rebates are carried over.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={field}>Age on 31 Dec {incomeYear(profile.ya)}<input className={input} type="number" min="0" max="120" value={profile.age} onChange={e => setProfile({ ...profile, age: +e.target.value })} /></label>
        <label className={field}>Annual allowable employment expenses<input className={input} type="number" min="0" step="0.01" value={profile.employmentExpenses} onChange={e => setProfile({ ...profile, employmentExpenses: +e.target.value })} /></label>
        <label className={field}>Annual qualifying donations (cash)<input className={input} type="number" min="0" step="0.01" value={profile.donations} onChange={e => setProfile({ ...profile, donations: +e.target.value })} /></label>
        {RELIEF_FIELDS.map(([key, label]) => <label className={field} key={key}>{label}<input className={input} type="number" min="0" step="0.01" value={profile.reliefs[key] ?? ''} placeholder="0" onChange={e => setProfile({ ...profile, reliefs: { ...profile.reliefs, [key]: +e.target.value } })} /></label>)}
      </div></details>
      <p className="mt-4 rounded-xl bg-background p-3 text-xs leading-relaxed text-secondary">Uses SGD income marked <strong>Active</strong> in both income type and status. Recurring schedules continue until their recorded end date; one-time income stays in its dated year. Growth compounds from {incomeYear(firstYa)} on scheduled income; the additional bonus stays flat. Use gross taxable salary before CPF, or net taxable profit for self-employment. Passive income, foreign currencies and past income records are excluded; add other taxable income when saving a year.</p>
      <p className="mt-3 text-xs text-secondary">Scenario using <a className="text-primary underline" target="_blank" rel="noreferrer" href="https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates">IRAS resident rates from YA 2024</a> and relief rules checked 21 November 2026. Future legislation and rebates can change the result. The 250% qualifying-donation deduction is confirmed only through 2029 donations (YA 2030); later years assume continuation for this scenario.</p>
      {projection.error && <p className="mt-3 text-sm text-red-400" role="alert">{projection.error}</p>}
    </section>
    {row && <><section className="rounded-2xl border border-border bg-surface p-5"><h2 className="font-bold">Projected taxation by year</h2><p className="mt-1 text-xs text-secondary">Select a year for its income and deduction breakdown. Future-year projections are estimates; existing records are preserved.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="text-xs text-secondary"><tr><th className="p-2">YA / income year</th><th className="p-2 text-right">Income after expenses</th><th className="p-2 text-right">Deductions & reliefs</th><th className="p-2 text-right">Chargeable income</th><th className="p-2 text-right">Estimated tax</th></tr></thead><tbody>{projection.rows.map(r => <tr key={r.year.ya} className={`border-t border-border ${r.year.ya === row.year.ya ? 'bg-primary/5' : ''}`}><th className="p-2"><button aria-pressed={r.year.ya === row.year.ya} onClick={() => setSelected(r.year.ya)} className="text-left font-bold text-primary">YA {r.year.ya}<span className="block text-xs font-normal text-secondary">{incomeYear(r.year.ya)} income</span></button></th><td className="p-2 text-right tabular-nums">{money(r.result.totalIncome)}</td><td className="p-2 text-right tabular-nums">{money(r.result.donationDeduction + r.result.reliefs)}</td><td className="p-2 text-right tabular-nums">{money(r.result.chargeable)}</td><td className="p-2 text-right tabular-nums">{money(r.result.tax)}</td></tr>)}</tbody></table></div>
      <div className="mt-4 space-y-2" aria-label="Estimated tax comparison">{projection.rows.map(r => <button key={r.year.ya} onClick={() => setSelected(r.year.ya)} aria-label={`View YA ${r.year.ya} estimated tax ${money(r.result.tax)}`} className="grid w-full grid-cols-[65px_1fr_auto] items-center gap-2 text-xs"><span>YA {r.year.ya}</span><span className="h-3 overflow-hidden rounded-full bg-background"><span className={`block h-full rounded-full ${r.year.ya === row.year.ya ? 'bg-primary' : 'bg-primary/40'}`} style={{ width: `${r.result.tax / max * 100}%` }} /></span><span className="tabular-nums">{money(r.result.tax)}</span></button>)}</div>
    </section><TaxBreakdown year={row.year} /><TaxIncomeSources ya={row.year.ya} incomeYear={incomeYear(row.year.ya)} lines={row.source.lines} skipped={row.source.skipped}
      action={<button className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white" onClick={() => onReview(years.find(y => y.ya === row.year.ya) ?? row.year)}>{years.some(y => y.ya === row.year.ya) ? 'Open existing tax record' : 'Review & save estimate'}</button>} /></>}
  </div>;
}
