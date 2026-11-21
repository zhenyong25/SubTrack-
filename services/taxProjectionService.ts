import type { Income } from '../types';
import { forecastDates } from './cashForecastService';
import { isValidDate } from './savingsGoalMath';
import { computeTax, emptyYear, incomeYear, type TaxYear } from './sgTaxService';

export interface TaxProjectionOptions {
  firstYa: number; years: number; annualGrowth: number; annualBonus: number;
  incomeTreatment: 'Employment' | 'Self-employed'; template: TaxYear;
}
export function activeTaxIncome(incomes: Income[], calendarYear: number) {
  const start = `${calendarYear}-01-01`, end = `${calendarYear}-12-31`;
  const before = `${calendarYear - 1}-12-31`;
  const lines: Array<{ id: string; name: string; amount: number; payments: number }> = [];
  const skipped: string[] = [];
  for (const i of incomes) {
    if (i.incomeType !== 'Active' || i.status !== 'Active') continue;
    if (i.currency !== 'SGD') { skipped.push(`${i.name}: non-SGD income excluded (no currency conversion).`); continue; }
    if (!Number.isFinite(i.amount) || i.amount < 0) { skipped.push(`${i.name}: invalid amount excluded.`); continue; }
    const anchor = (i.incomeMode === 'One-time' ? i.incomeDate || i.firstIncomeDate : i.firstIncomeDate)?.slice(0, 10);
    if (i.cancellationDate && !isValidDate(i.cancellationDate.slice(0, 10))) { skipped.push(`${i.name}: invalid end date excluded.`); continue; }
    const stop = i.cancellationDate?.slice(0, 10) && i.cancellationDate.slice(0, 10) < end ? i.cancellationDate.slice(0, 10) : end;
    if (!anchor || !isValidDate(anchor)) { skipped.push(`${i.name}: missing or invalid income date.`); continue; }
    if (i.incomeMode !== 'One-time' && !['Daily', 'Weekly', 'Monthly', 'Yearly'].includes(i.incomeCycle)) { skipped.push(`${i.name}: unsupported income frequency.`); continue; }
    const payments = forecastDates(anchor, i.incomeMode === 'One-time' ? 'Once' : i.incomeCycle, before, stop).filter(d => d >= start).length;
    if (payments) lines.push({ id: i.id, name: i.name, amount: Math.round(i.amount * payments * 100) / 100, payments });
  }
  return { total: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100, lines, skipped };
}

export function projectTax(incomes: Income[], options: TaxProjectionOptions) {
  const { firstYa, years, annualGrowth, annualBonus, template, incomeTreatment } = options;
  if (!Number.isInteger(firstYa) || firstYa < 2024 || !Number.isInteger(years) || years < 1 || years > 15 || firstYa + years - 1 > 2100) throw new Error('Choose a valid start YA and 1–15 projection years, ending by 2100.');
  if (!Number.isFinite(annualGrowth) || annualGrowth < -50 || annualGrowth > 100 || !Number.isFinite(annualBonus) || annualBonus < 0) throw new Error('Annual growth must be −50% to 100%, and bonus must be non-negative.');
  if (!Number.isInteger(template.age) || template.age < 0 || template.age > 120 || [template.employmentExpenses, template.donations, ...Object.values(template.reliefs)].some(n => !Number.isFinite(n) || n < 0)) throw new Error('Enter a valid age and non-negative deduction and relief assumptions.');
  return Array.from({ length: years }, (_, index) => {
    const ya = firstYa + index;
    const source = activeTaxIncome(incomes, incomeYear(ya));
    const projected = Math.round((source.total * (1 + annualGrowth / 100) ** index + annualBonus) * 100) / 100;
    if (!Number.isFinite(projected)) throw new Error('Projected income is too large. Reduce the income or growth assumption.');
    // Never carry an NOA, payments, files, rebates or an assessed status into an estimate.
    const draft: TaxYear = {
      ...emptyYear(ya), residency: template.residency, citizenship: template.citizenship,
      age: Math.min(120, Math.max(0, template.age + ya - template.ya)),
      employment: incomeTreatment === 'Employment' ? projected : 0,
      selfEmployed: incomeTreatment === 'Self-employed' ? projected : 0,
      employmentExpenses: incomeTreatment === 'Employment' ? template.employmentExpenses : 0,
      donations: template.donations, reliefs: { ...template.reliefs },
      notes: `Projection from active SGD income; ${annualGrowth}% annual growth from ${incomeYear(firstYa)}, annual additional bonus S$${annualBonus}. Relief assumptions repeated; review eligibility.`,
    };
    return { year: draft, result: computeTax(draft), source };
  });
}

// ---------- Income sources, grouped for display ----------

export type SourceGroup = 'Salary' | 'Bonuses & awards' | 'Allowances & supplements' | 'Other';
const GROUP_RULES: Array<[SourceGroup, RegExp]> = [
  ['Allowances & supplements', /allowance|supplement|\bflex|reimburse|subsid/i],
  ['Bonuses & awards', /bonus|\bapip\b|award|recognition|incentive|ang ?pa[ou]|ang ?bao|13th|aws\b|commission|prize|gift/i],
  ['Salary', /salary|wage|\bpay\b|payroll|income|increment|promotion|adjustment|stipend|basic/i],
];
/** A display name without stray spaces or trailing punctuation ("Kaizen Bonus :" → "Kaizen Bonus"). */
export const cleanSourceName = (name: string) => name.replace(/\s+/g, ' ').replace(/[\s:;,.-]+$/, '').trim() || 'Untitled income';
export const sourceGroup = (name: string): SourceGroup => GROUP_RULES.find(([, rule]) => rule.test(name))?.[0] ?? 'Other';

export interface SourceGroupSummary {
  group: SourceGroup; total: number; share: number;
  items: Array<{ id: string; name: string; amount: number; payments: number; share: number }>;
}
/** Income lines grouped by kind, biggest first, with each line's and group's share of the total. */
export function groupIncomeSources(lines: Array<{ id: string; name: string; amount: number; payments: number }>): SourceGroupSummary[] {
  const total = lines.reduce((sum, l) => sum + l.amount, 0) || 1;
  const groups = new Map<SourceGroup, SourceGroupSummary>();
  for (const line of lines) {
    const name = cleanSourceName(line.name);
    const group = sourceGroup(name);
    const entry = groups.get(group) ?? { group, total: 0, share: 0, items: [] };
    entry.items.push({ id: line.id, name, amount: line.amount, payments: line.payments, share: line.amount / total });
    entry.total += line.amount;
    groups.set(group, entry);
  }
  return [...groups.values()]
    .map(g => ({ ...g, total: Math.round(g.total * 100) / 100, share: g.total / total, items: g.items.sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.total - a.total);
}
