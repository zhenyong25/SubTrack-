// Singapore individual income tax: rates, reliefs and rebates by Year of Assessment (YA), plus
// "ways to save" estimates. A YA taxes the income of the previous calendar year (YA 2027 =
// income earned in 2026). Figures follow IRAS as checked in November 2026; anything a future
// Budget changes (rebates especially) is kept in the per-YA rules below.
import type { Income } from '../types';

export const RELIEF_CAP = 80_000;
/** Resident progressive rates from YA 2024: [upper bound of band, rate]. */
const BANDS: Array<[number, number]> = [
  [20_000, 0], [30_000, 0.02], [40_000, 0.035], [80_000, 0.07], [120_000, 0.115], [160_000, 0.15], [200_000, 0.18],
  [240_000, 0.19], [280_000, 0.195], [320_000, 0.2], [500_000, 0.22], [1_000_000, 0.23], [Infinity, 0.24],
];
export const RATE_TABLE = BANDS.map(([upTo, rate], i) => ({ from: i ? BANDS[i - 1][0] : 0, upTo, rate }));

/** Personal income tax rebate announced for each YA. None was announced for YA 2026. */
export const REBATES: Record<number, { rate: number; cap: number }> = { 2024: { rate: 0.5, cap: 200 }, 2025: { rate: 0.6, cap: 200 } };
/** Approved donations to IPCs are deducted at 250% for donations made up to 31 Dec 2029 (YA 2030). */
export const DONATION_MULTIPLIER = 2.5;
export const LIMITS = {
  srsCitizen: 15_300, srsForeigner: 35_700, cpfTopUpSelf: 8_000, cpfTopUpFamily: 8_000, cpfRelief: 37_740, lifeInsurance: 5_000,
  spouse: 2_000, qcr: 4_000, qcrDisability: 7_500, parentWith: 9_000, parentApart: 5_500, grandparentCaregiver: 3_000,
};
/** CPF monthly Ordinary Wage ceiling by calendar (income) year; the yearly salary ceiling is $102,000. */
export const OW_CEILING: Record<number, number> = { 2023: 6_300, 2024: 6_800, 2025: 7_400, 2026: 8_000 };
export const ANNUAL_SALARY_CEILING = 102_000;

export type Residency = 'Resident' | 'Non-resident';
export type Citizenship = 'Citizen / PR' | 'Foreigner';
export type TaxStatus = 'Estimate' | 'Filed' | 'Assessed';
export const RELIEF_FIELDS = [
  ['cpf', 'CPF relief (employee contributions)'], ['srs', 'SRS contributions'], ['cpfTopUpSelf', 'CPF cash top-up · self'],
  ['cpfTopUpFamily', 'CPF cash top-up · family'], ['spouse', 'Spouse relief'], ['qcr', 'Qualifying child relief'],
  ['wmcr', "Working mother's child relief"], ['parent', 'Parent relief'], ['grandparentCaregiver', 'Grandparent caregiver relief'],
  ['nsman', 'NSman relief (self, wife, parent)'], ['lifeInsurance', 'Life insurance relief'], ['other', 'Other reliefs'],
] as const;
export type ReliefKey = typeof RELIEF_FIELDS[number][0];

export interface TaxDocument { path: string; name: string; size: number; type: string; uploadedAt: string }
/** Reported totals from a reviewed NOA; kept apart from the calculated estimate. */
export interface TaxNoaSummary {
  ya: number; income: number; deductions: number; chargeable: number; tax: number; date?: string;
  /** Line items read from the NOA, e.g. Employment under income and Earned Income under reliefs. */
  lines?: NoaLine[];
}
export interface NoaLine { kind: 'income' | 'relief' | 'donation' | 'rebate'; label: string; amount: number }
export interface TaxYear {
  id: string; ya: number; status: TaxStatus; residency: Residency; citizenship: Citizenship;
  /** Age on 31 Dec of the income year; sets earned income relief. */
  age: number;
  /** Salary, bonus, director's fees and taxable benefits. */
  employment: number;
  /** Net trade, business or freelance profit (earned income). */
  selfEmployed: number;
  /** Net rental income after expenses. */
  rental: number;
  /** Other taxable income, e.g. royalties. Most SG dividends and bank interest are exempt. */
  otherIncome: number;
  employmentExpenses: number;
  /** Cash donated to IPCs in the income year (the deduction is 2.5×). */
  donations: number;
  reliefs: Partial<Record<ReliefKey, number>>;
  /** Parenthood tax rebate used this YA. */
  parenthoodRebate: number;
  /** Overrides the announced rebate, e.g. once a Budget announces one for this YA. */
  rebateOverride?: { rate: number; cap: number };
  /** From the Notice of Assessment. */
  assessedTax?: number; noaDate?: string; paidTax?: number; paymentMethod?: 'GIRO (monthly)' | 'GIRO (one-off)' | 'Other';
  notes: string; documents?: TaxDocument[];
  noaSummary?: TaxNoaSummary;
}

export const incomeYear = (ya: number) => ya - 1;
/** The YA that income earned in `today`'s year falls into. */
export const currentYa = (today: string) => Number(today.slice(0, 4)) + 1;
export const emptyYear = (ya: number, prev?: TaxYear): TaxYear => ({
  id: crypto.randomUUID(), ya, status: 'Estimate', residency: prev?.residency ?? 'Resident', citizenship: prev?.citizenship ?? 'Citizen / PR',
  age: prev ? prev.age + (ya - prev.ya) : 30, employment: 0, selfEmployed: 0, rental: 0, otherIncome: 0, employmentExpenses: 0, donations: 0,
  // Reliefs that usually repeat year to year carry over; contributions and one-offs start at zero.
  reliefs: prev ? Object.fromEntries((['spouse', 'qcr', 'wmcr', 'parent', 'grandparentCaregiver', 'nsman'] as ReliefKey[]).filter(k => prev.reliefs[k]).map(k => [k, prev.reliefs[k]])) : {},
  parenthoodRebate: 0, notes: '',
});

export function residentTax(chargeable: number) {
  let tax = 0;
  for (const band of RATE_TABLE) { if (chargeable <= band.from) break; tax += (Math.min(chargeable, band.upTo) - band.from) * band.rate; }
  return Math.round(tax * 100) / 100;
}
export const marginalRate = (chargeable: number) => RATE_TABLE.find(b => chargeable <= b.upTo)!.rate;
export const earnedIncomeRelief = (age: number, earned: number) => Math.max(0, Math.min(earned, age >= 60 ? 8_000 : age >= 55 ? 6_000 : 1_000));

export interface ReliefLine { key: ReliefKey | 'earned'; label: string; claimed: number; allowed: number; note?: string }
export interface TaxResult {
  totalIncome: number; donationDeduction: number; assessable: number; earned: number; reliefLines: ReliefLine[]; reliefsBeforeCap: number;
  reliefs: number; capped: boolean; chargeable: number; grossTax: number; rebate: number; parenthoodRebate: number; tax: number;
  effectiveRate: number; marginal: number; rebateKnown: boolean;
}

/** Works out the tax for one YA. Non-residents get no reliefs and pay the higher of 15% or resident rates on employment income. */
export function computeTax(y: TaxYear): TaxResult {
  const n = (v: number | undefined) => Math.max(0, Number(v) || 0);
  const employmentNet = Math.max(0, n(y.employment) - n(y.employmentExpenses));
  const earned = employmentNet + n(y.selfEmployed);
  const totalIncome = earned + n(y.rental) + n(y.otherIncome);
  const announced = y.rebateOverride ?? REBATES[y.ya];
  if (y.residency === 'Non-resident') {
    const other = n(y.selfEmployed) + n(y.rental) + n(y.otherIncome);
    const grossTax = Math.round((Math.max(employmentNet * 0.15, residentTax(employmentNet)) + other * 0.24) * 100) / 100;
    return { totalIncome, donationDeduction: 0, assessable: totalIncome, earned, reliefLines: [], reliefsBeforeCap: 0, reliefs: 0, capped: false, chargeable: totalIncome, grossTax, rebate: 0, parenthoodRebate: 0, tax: grossTax, effectiveRate: totalIncome ? grossTax / totalIncome : 0, marginal: 0.24, rebateKnown: true };
  }
  const donationDeduction = Math.min(totalIncome, n(y.donations) * DONATION_MULTIPLIER);
  const assessable = totalIncome - donationDeduction;
  const r = y.reliefs;
  const cpf = Math.min(n(r.cpf), LIMITS.cpfRelief);
  const srsCap = y.citizenship === 'Foreigner' ? LIMITS.srsForeigner : LIMITS.srsCitizen;
  // Life insurance relief only applies when CPF relief is under $5,000, up to the difference.
  const lifeCap = cpf < LIMITS.lifeInsurance ? LIMITS.lifeInsurance - cpf : 0;
  const line = (key: ReliefKey, label: string, cap: number, note?: string): ReliefLine => ({ key, label, claimed: n(r[key]), allowed: Math.min(n(r[key]), cap), note: n(r[key]) > cap ? note ?? `Capped at $${cap.toLocaleString()}` : undefined });
  const reliefLines: ReliefLine[] = [
    { key: 'earned' as const, label: 'Earned income relief (automatic)', claimed: earnedIncomeRelief(y.age, earned), allowed: earnedIncomeRelief(y.age, earned) },
    ...RELIEF_FIELDS.map(([key, label]) => key === 'cpf' ? line(key, label, LIMITS.cpfRelief)
      : key === 'srs' ? line(key, label, srsCap)
      : key === 'cpfTopUpSelf' ? line(key, label, LIMITS.cpfTopUpSelf)
      : key === 'cpfTopUpFamily' ? line(key, label, LIMITS.cpfTopUpFamily)
      : key === 'lifeInsurance' ? line(key, label, lifeCap, lifeCap ? undefined : 'Not available: CPF relief is $5,000 or more')
      : line(key, label, Infinity)),
  ].filter(l => l.claimed > 0);
  const reliefsBeforeCap = reliefLines.reduce((s, l) => s + l.allowed, 0);
  const reliefs = Math.min(reliefsBeforeCap, RELIEF_CAP);
  const chargeable = Math.max(0, Math.floor(assessable - reliefs));
  const grossTax = residentTax(chargeable);
  const rebate = announced ? Math.min(grossTax * announced.rate, announced.cap) : 0;
  const parenthoodRebate = Math.min(n(y.parenthoodRebate), grossTax - rebate);
  const tax = Math.round((grossTax - rebate - parenthoodRebate) * 100) / 100;
  return { totalIncome, donationDeduction, assessable, earned, reliefLines, reliefsBeforeCap, reliefs, capped: reliefsBeforeCap > RELIEF_CAP, chargeable, grossTax, rebate, parenthoodRebate, tax, effectiveRate: totalIncome ? tax / totalIncome : 0, marginal: marginalRate(chargeable), rebateKnown: !!announced || y.ya <= 2026 };
}

// ---------- Ways to save ----------

export interface Saving { id: string; title: string; room: number; saving: number; per1000: number; detail: string; tradeOff: string }
const withReliefs = (y: TaxYear, patch: Partial<Record<ReliefKey, number>>): TaxYear => ({ ...y, reliefs: { ...y.reliefs, ...patch } });

/** Tax saved by using each remaining contribution allowance in full, and per $1,000 put in. */
export function savings(y: TaxYear): Saving[] {
  if (y.residency === 'Non-resident') return [];
  const base = computeTax(y).tax;
  const saved = (next: TaxYear) => Math.max(0, Math.round((base - computeTax(next).tax) * 100) / 100);
  const out: Saving[] = [];
  const srsCap = y.citizenship === 'Foreigner' ? LIMITS.srsForeigner : LIMITS.srsCitizen;
  const add = (id: string, title: string, key: ReliefKey, cap: number, detail: string, tradeOff: string) => {
    const room = Math.max(0, cap - (Number(y.reliefs[key]) || 0));
    if (!room) return;
    out.push({ id, title, room, saving: saved(withReliefs(y, { [key]: cap })), per1000: saved(withReliefs(y, { [key]: (Number(y.reliefs[key]) || 0) + Math.min(1000, room) })), detail, tradeOff });
  };
  add('srs', 'Contribute to SRS', 'srs', srsCap, `Up to $${srsCap.toLocaleString()} a year into your Supplementary Retirement Scheme account, through a bank (DBS, OCBC or UOB).`, 'Locked until the statutory retirement age; withdrawing early has a 5% penalty and is fully taxed. At retirement only 50% of withdrawals are taxed, spread over 10 years. Invest it, or it earns very little.');
  add('topup-self', 'Top up your own CPF in cash', 'cpfTopUpSelf', LIMITS.cpfTopUpSelf, 'Cash top-ups to your Special/Retirement Account or MediSave, up to $8,000 of relief.', 'The money stays in CPF for retirement (SA/RA) or healthcare (MediSave). Top-ups that get MRSS or Matched MediSave grants don’t qualify. Transfers from your OA don’t count.');
  add('topup-family', "Top up a family member's CPF", 'cpfTopUpFamily', LIMITS.cpfTopUpFamily, 'Cash top-ups for parents, grandparents, spouse or siblings (spouse/siblings: their income must be $8,000 or less, unless they have a disability).', 'The money belongs to their CPF account permanently.');
  const donate = Math.round(1000 * DONATION_MULTIPLIER * computeTax(y).marginal);
  if (computeTax(y).chargeable > 0) out.push({ id: 'donate', title: 'Donate to an IPC charity', room: 0, saving: 0, per1000: Math.min(donate, base), detail: 'Donations to Institutions of a Public Character are deducted at 250% (until 31 Dec 2029). They aren’t subject to the $80,000 relief cap.', tradeOff: 'You give the money away: a $1,000 donation still costs you more than the tax it saves. Only worthwhile if you were going to give anyway.' });
  return out.filter(s => s.per1000 > 0).sort((a, b) => b.saving - a.saving || b.per1000 - a.per1000);
}

/** Reliefs commonly missed, with a short eligibility hint; shown when the YA hasn't claimed them. */
export const RELIEF_CHECKLIST: Array<{ key: ReliefKey; title: string; amount: string; when: string }> = [
  { key: 'parent', title: 'Parent relief', amount: '$9,000 per parent living with you, $5,500 otherwise ($14,000/$10,000 with disability)', when: 'Parent or grandparent aged 55+ with income under $8,000, and you spent at least $2,000 on their support. Share it with siblings.' },
  { key: 'spouse', title: 'Spouse relief', amount: '$2,000', when: 'Your spouse earned $8,000 or less in the income year.' },
  { key: 'qcr', title: 'Qualifying child relief', amount: '$4,000 per child ($7,500 with disability)', when: 'Singapore citizen child under 16, or studying full-time, with income of $8,000 or less.' },
  { key: 'wmcr', title: "Working mother's child relief", amount: '$8,000 / $10,000 / $12,000 for children born from 2024; 15/20/25% of earned income for older children', when: 'Working mothers of Singapore citizen children. QCR plus WMCR is capped at $50,000 per child.' },
  { key: 'grandparentCaregiver', title: 'Grandparent caregiver relief', amount: '$3,000', when: 'Working mothers whose child (12 or under) is cared for by a grandparent who isn’t working.' },
  { key: 'nsman', title: 'NSman relief', amount: '$1,500–$5,000 for yourself; $750 for wife or parent', when: 'Granted automatically if you or your husband/son did NS activities. Check it appears on your assessment.' },
];

// ---------- Prefill ----------

const CYCLE_DAYS: Record<string, number> = { Daily: 1, Weekly: 7 };
/** Earned (Active) income received in a calendar year, in SGD only, from the app's income records. */
export function employmentFromIncomes(incomes: Income[], year: number) {
  const start = `${year}-01-01`, end = `${year}-12-31`;
  let total = 0; let skipped = 0;
  for (const i of incomes) {
    if (i.incomeType !== 'Active') continue;
    if (i.currency !== 'SGD') { skipped++; continue; }
    if (i.incomeMode === 'One-time') { const d = (i.incomeDate || i.firstIncomeDate || '').slice(0, 10); if (d >= start && d <= end) total += i.amount; continue; }
    const stop = i.cancellationDate && i.cancellationDate.slice(0, 10) < end ? i.cancellationDate.slice(0, 10) : end;
    const first = new Date(`${i.firstIncomeDate.slice(0, 10)}T12:00:00Z`);
    for (let k = 0, d = first; k < 2000; k++) {
      const iso = d.toISOString().slice(0, 10);
      if (iso > stop) break;
      if (iso >= start) total += i.amount;
      d = new Date(first);
      if (CYCLE_DAYS[i.incomeCycle]) d.setUTCDate(first.getUTCDate() + CYCLE_DAYS[i.incomeCycle] * (k + 1));
      else if (i.incomeCycle === 'Monthly') d.setUTCMonth(first.getUTCMonth() + k + 1);
      else d.setUTCFullYear(first.getUTCFullYear() + k + 1);
    }
  }
  return { total: Math.round(total * 100) / 100, skipped };
}

/** Employee CPF for an employee under 55 (20% rate), within the Ordinary and Additional Wage ceilings. */
export function estimateCpf(monthlySalary: number, bonus: number, year: number) {
  const ow = Math.min(Math.max(0, monthlySalary), OW_CEILING[year] ?? OW_CEILING[2026]) * 12;
  const aw = Math.min(Math.max(0, bonus), Math.max(0, ANNUAL_SALARY_CEILING - ow));
  return Math.round((ow + aw) * 0.2);
}

export function validateTaxYear(y: TaxYear) {
  if (!Number.isInteger(y.ya) || y.ya < 2000 || y.ya > 2100) throw new Error('Enter a valid Year of Assessment.');
  if (!Number.isInteger(y.age) || y.age < 0 || y.age > 120) throw new Error('Enter a valid age.');
  for (const v of [y.employment, y.selfEmployed, y.rental, y.otherIncome, y.employmentExpenses, y.donations, y.parenthoodRebate, ...Object.values(y.reliefs), y.assessedTax ?? 0, y.paidTax ?? 0]) {
    if (!Number.isFinite(v) || (v as number) < 0) throw new Error('Amounts must be zero or greater.');
  }
  if ((y.documents ?? []).length > 10) throw new Error('A year can store up to 10 documents.');
  if (y.noaSummary) {
    if (y.noaSummary.ya !== y.ya) throw new Error('The NOA Year of Assessment must match the record.');
    for (const value of [y.noaSummary.income, y.noaSummary.deductions, y.noaSummary.chargeable, y.noaSummary.tax, ...(y.noaSummary.lines ?? []).map(l => l.amount)]) if (!Number.isFinite(value) || value < 0) throw new Error('NOA amounts must be zero or greater.');
  }
}

// ---------- NOA-style tax computation ----------

export interface ComputationLine { label: string; amount: number; rate?: number }
/**
 * The tax computation as an IRAS Notice of Assessment sets it out: tax on the first part of
 * chargeable income up to a band edge (cumulative), then the rest at that band's rate.
 */
export function taxComputation(chargeable: number): { lines: ComputationLine[]; gross: number } {
  const c = Math.max(0, Math.floor(chargeable));
  const band = RATE_TABLE.find(b => c <= b.upTo)!;
  const lines: ComputationLine[] = [];
  if (band.from > 0) lines.push({ label: `Tax on the first ${'$'}${band.from.toLocaleString()}`, amount: residentTax(band.from) });
  const rest = c - band.from;
  if (rest > 0) lines.push({ label: `Tax on the next ${'$'}${rest.toLocaleString()}`, rate: band.rate, amount: Math.round(rest * band.rate * 100) / 100 });
  return { lines, gross: residentTax(c) };
}
