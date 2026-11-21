import test from 'node:test';
import assert from 'node:assert/strict';
import type { Income } from '../types';
import { computeTax, currentYa, earnedIncomeRelief, emptyYear, employmentFromIncomes, estimateCpf, marginalRate, residentTax, savings, taxComputation, validateTaxYear, type TaxYear } from '../services/sgTaxService';
import { activeTaxIncome, cleanSourceName, groupIncomeSources, projectTax } from '../services/taxProjectionService';
import { noaComplete, noaConsistent, parseNoaText, yearFromNoa } from '../services/taxNoaService';

const year = (over: Partial<TaxYear> = {}): TaxYear => ({ ...emptyYear(2027), age: 30, employment: 100_000, reliefs: { cpf: 20_000 }, ...over });

test('resident rates match the IRAS cumulative tax at each band edge', () => {
  const edges: Array<[number, number]> = [[20_000, 0], [30_000, 200], [40_000, 550], [80_000, 3_350], [120_000, 7_950], [160_000, 13_950], [200_000, 21_150], [240_000, 28_750], [280_000, 36_550], [320_000, 44_550], [500_000, 84_150], [1_000_000, 199_150], [1_200_000, 247_150]];
  for (const [income, tax] of edges) assert.equal(residentTax(income), tax, `tax on ${income}`);
  assert.equal(residentTax(0), 0);
  assert.equal(marginalRate(79_000), 0.07); assert.equal(marginalRate(80_001), 0.115);
});

test('a typical employee: CPF and earned income relief, no rebate for YA 2027', () => {
  const r = computeTax(year());
  assert.equal(r.reliefs, 21_000); assert.equal(r.chargeable, 79_000);
  assert.equal(r.tax, 3_280); assert.equal(r.rebate, 0); assert.equal(r.rebateKnown, false);
  assert.equal(computeTax(year({ ya: 2026 })).rebateKnown, true);
});

test('YA 2025 rebate is 60% capped at $200, and overrides apply', () => {
  assert.equal(computeTax(year({ ya: 2025 })).tax, 3_080);
  assert.equal(computeTax(year({ ya: 2025, employment: 30_000, reliefs: {} })).rebate, 0.6 * residentTax(29_000));
  assert.equal(computeTax(year({ rebateOverride: { rate: 0.5, cap: 300 } })).tax, 2_980);
});

test('caps: $80,000 relief cap, SRS by citizenship, CPF top-ups, life insurance', () => {
  const capped = computeTax(year({ employment: 500_000, reliefs: { cpf: 20_400, srs: 15_300, cpfTopUpSelf: 8_000, cpfTopUpFamily: 8_000, parent: 18_000, qcr: 12_000 } }));
  assert.equal(capped.reliefsBeforeCap, 82_700); assert.equal(capped.reliefs, 80_000); assert.equal(capped.capped, true);
  assert.equal(computeTax(year({ reliefs: { srs: 40_000 } })).reliefs, 1_000 + 15_300);
  assert.equal(computeTax(year({ citizenship: 'Foreigner', reliefs: { srs: 40_000 } })).reliefs, 1_000 + 35_700);
  assert.equal(computeTax(year({ reliefs: { cpfTopUpSelf: 9_000 } })).reliefLines.find(l => l.key === 'cpfTopUpSelf')?.allowed, 8_000);
  assert.equal(computeTax(year({ reliefs: { cpf: 3_000, lifeInsurance: 4_000 } })).reliefLines.find(l => l.key === 'lifeInsurance')?.allowed, 2_000);
  assert.equal(computeTax(year({ reliefs: { cpf: 6_000, lifeInsurance: 4_000 } })).reliefLines.find(l => l.key === 'lifeInsurance')?.allowed, 0);
});

test('donations are deducted at 250% before reliefs, and parenthood rebate cannot go below zero', () => {
  const r = computeTax(year({ donations: 1_000 }));
  assert.equal(r.donationDeduction, 2_500); assert.equal(r.chargeable, 76_500);
  assert.equal(computeTax(year({ parenthoodRebate: 1_000_000 })).tax, 0);
});

test('earned income relief by age, limited to earned income', () => {
  assert.equal(earnedIncomeRelief(30, 50_000), 1_000); assert.equal(earnedIncomeRelief(56, 50_000), 6_000);
  assert.equal(earnedIncomeRelief(62, 50_000), 8_000); assert.equal(earnedIncomeRelief(62, 3_000), 3_000);
});

test('non-residents pay the higher of 15% or resident rates on employment and 24% on other income', () => {
  const r = computeTax(year({ residency: 'Non-resident', employment: 50_000, rental: 10_000 }));
  assert.equal(r.tax, 7_500 + 2_400); assert.equal(r.reliefs, 0);
  assert.equal(computeTax(year({ residency: 'Non-resident', employment: 1_000_000 })).tax, residentTax(1_000_000));
  assert.deepEqual(savings(year({ residency: 'Non-resident' })), []);
});

test('ways to save price each allowance from the real tax calculation', () => {
  const ideas = savings(year());
  const srs = ideas.find(s => s.id === 'srs')!;
  assert.equal(srs.room, 15_300); assert.equal(srs.saving, 3_280 - (550 + (79_000 - 15_300 - 40_000) * 0.07)); assert.equal(srs.per1000, 70);
  assert.equal(ideas[0].id, 'srs');
  assert.equal(ideas.find(s => s.id === 'donate')!.per1000, 175);
  assert.equal(savings(year({ reliefs: { cpf: 20_000, srs: 15_300 } })).some(s => s.id === 'srs'), false);
  assert.deepEqual(savings(year({ employment: 15_000, reliefs: {} })), []);
});

test('CPF estimate respects the Ordinary and Additional Wage ceilings by year', () => {
  assert.equal(estimateCpf(8_000, 4_000, 2026), 20_000);
  assert.equal(estimateCpf(10_000, 20_000, 2025), 20_400);
  assert.equal(estimateCpf(5_000, 0, 2026), 12_000);
});

test('employment income from income records: recurring, cancelled, one-off, non-SGD', () => {
  const inc = (over: Partial<Income>): Income => ({ id: 'i', name: 'Pay', amount: 5_000, currency: 'SGD', incomeType: 'Active', incomeMode: 'Recurring', incomeCycle: 'Monthly', firstIncomeDate: '2025-03-15', nextIncomeDate: '', category: 'Salary', color: '', status: 'Active', ...over });
  assert.equal(employmentFromIncomes([inc({})], 2026).total, 60_000);
  assert.equal(employmentFromIncomes([inc({ cancellationDate: '2026-06-30' })], 2026).total, 30_000);
  assert.equal(employmentFromIncomes([inc({})], 2025).total, 50_000);
  const rows = [inc({ incomeMode: 'One-time', amount: 8_000, incomeDate: '2026-12-20' }), inc({ currency: 'USD' }), inc({ incomeType: 'Passive' }), inc({ incomeCycle: 'Yearly', amount: 1_000, firstIncomeDate: '2024-07-01' })];
  assert.deepEqual(employmentFromIncomes(rows, 2026), { total: 9_000, skipped: 1 });
});

test('new years carry repeating reliefs and age forward; validation rejects bad input', () => {
  const prev = year({ ya: 2026, age: 40, reliefs: { cpf: 20_000, parent: 9_000, srs: 15_300 } });
  const next = emptyYear(2027, prev);
  assert.deepEqual(next.reliefs, { parent: 9_000 }); assert.equal(next.age, 41); assert.equal(next.employment, 0);
  assert.equal(currentYa('2026-11-21'), 2027);
  validateTaxYear(year());
  assert.throws(() => validateTaxYear(year({ employment: -1 })), /zero/);
  assert.throws(() => validateTaxYear(year({ ya: 1990 })), /Year of Assessment/);
  assert.throws(() => validateTaxYear(year({ reliefs: { srs: Number.NaN } })), /zero/);
});

const income = (over: Partial<Income> = {}): Income => ({ id: 'pay', name: 'Salary', amount: 5000, currency: 'SGD', incomeType: 'Active', incomeMode: 'Recurring', incomeCycle: 'Monthly', firstIncomeDate: '2025-01-31', nextIncomeDate: '', category: 'Salary', color: '', status: 'Active', ...over });

test('future income respects active status, currency, schedule end and one-time years', () => {
  const rows = [income(), income({ status: 'Past' }), income({ incomeType: 'Passive' }), income({ currency: 'MYR' }), income({ id: 'bonus', incomeMode: 'One-time', amount: 1000, incomeDate: '2026-12-15' })];
  assert.equal(activeTaxIncome(rows, 2026).total, 61000);
  assert.equal(activeTaxIncome(rows, 2027).total, 60000);
  assert.equal(activeTaxIncome(rows, 2026).skipped.length, 1);
  assert.equal(activeTaxIncome([income({ cancellationDate: '2026-06-30' })], 2026).total, 30000);
  assert.equal(activeTaxIncome([income({ firstIncomeDate: '2026-02-30' })], 2026).total, 0);
  assert.equal(activeTaxIncome([income({ cancellationDate: '2026-00-01' })], 2026).total, 0);
  assert.equal(activeTaxIncome([income({ incomeCycle: 'Daily', firstIncomeDate: '2000-01-01', amount: 1 })], 2028).total, 366, 'old recurring anchors are not truncated by a loop limit');
});

test('projections map YA to previous calendar year and recalculate chargeable income, growth and tax', () => {
  const template = year({ ya: 2027, employment: 999999, age: 54, reliefs: { cpf: 12000 }, assessedTax: 777, status: 'Assessed', rebateOverride: { rate: 1, cap: 10000 }, parenthoodRebate: 1000, paidTax: 100, documents: [{ path: 'private', name: 'NOA', size: 1, type: 'application/pdf', uploadedAt: '' }] });
  const rows = projectTax([income()], { firstYa: 2027, years: 3, annualGrowth: 10, annualBonus: 1000, template, incomeTreatment: 'Employment' });
  assert.equal(rows[0].year.employment, 61000); assert.equal(rows[1].year.employment, 67000); assert.equal(rows[2].year.employment, 73600);
  assert.equal(rows[0].result.chargeable, 48000); assert.equal(rows[1].result.chargeable, 49000, 'earned-income relief increases with age');
  assert.equal(rows[0].result.tax, residentTax(48000));
  for (const r of rows) { assert.equal(r.year.status, 'Estimate'); assert.equal(r.year.assessedTax, undefined); assert.equal(r.year.paidTax, undefined); assert.equal(r.year.rebateOverride, undefined); assert.equal(r.year.parenthoodRebate, 0); assert.equal(r.year.documents, undefined); }
  assert.equal(template.reliefs.cpf, 12000, 'template remains unchanged');
});

test('self-employed and non-resident projections use their corresponding tax treatment', () => {
  const template = year({ residency: 'Non-resident', reliefs: {} });
  const result = projectTax([income()], { firstYa: 2027, years: 1, annualGrowth: 0, annualBonus: 0, template, incomeTreatment: 'Self-employed' })[0];
  assert.equal(result.year.employment, 0); assert.equal(result.year.selfEmployed, 60000); assert.equal(result.result.tax, 14400); assert.equal(result.result.reliefs, 0);
});

test('projection assumptions reject invalid ranges, negative reliefs and invalid ages', () => {
  const args = { firstYa: 2027, years: 5, annualGrowth: 0, annualBonus: 0, template: year(), incomeTreatment: 'Employment' as const };
  assert.throws(() => projectTax([], { ...args, annualGrowth: -100 }), /growth/);
  assert.throws(() => projectTax([], { ...args, years: 16 }), /projection/);
  assert.throws(() => projectTax([], { ...args, template: { ...year(), reliefs: { cpf: -1 } } }), /assumptions/);
  assert.throws(() => projectTax([], { ...args, template: { ...year(), age: 30.5 } }), /age/);
});

test('NOA parsing recognises reported totals and issue date without confusing due dates', () => {
  const text = 'Tax Reference Number : Date : GXXXX123A 28 May 2026 Income Tax – Notice of Assessment (Original) YEAR OF ASSESSMENT 2026 EMPLOYMENT 80,000.00 INCOME^ 80,000.00 ($) + RELIEFS 1,000.00 Earned Income 1,000.00 DEDUCTIONS 1,000.00 ($) - TAX COMPUTATION First 40,000.00 550.00 Next 39,000.00 @ 7% 2,730.00 Tax Payable by 29 Jun 2026 $3,280.00 CHARGEABLE INCOME 79,000.00 ($) =';
  assert.deepEqual(parseNoaText(text), { ya: 2026, income: 80000, deductions: 1000, chargeable: 79000, tax: 3280, date: '2026-05-28',
    lines: [{ kind: 'income', label: 'Employment', amount: 80000 }, { kind: 'relief', label: 'Earned Income', amount: 1000 }] });
  const partial = parseNoaText('YEAR OF ASSESSMENT 2029 Notice of Assessment Tax Payable by 20 May 2029 $0.00');
  assert.equal(partial.tax, 0); assert.equal(partial.date, undefined); assert.equal(partial.income, undefined);
  assert.throws(() => parseNoaText('Invoice 123 $400.00'), /Notice of Assessment/);
});

test('NOA summary keeps reported amounts distinct and validates the assessment year', () => {
  const y = year({ noaSummary: { ya: 2027, income: 80000, deductions: 1000, chargeable: 79000, tax: 3280 }, assessedTax: 3280 });
  validateTaxYear(y); assert.equal(computeTax(y).chargeable, 79000);
  assert.throws(() => validateTaxYear({ ...y, noaSummary: { ...y.noaSummary!, ya: 2026 } }), /match/);
  assert.throws(() => validateTaxYear({ ...y, noaSummary: { ...y.noaSummary!, tax: NaN } }), /NOA/);
});

test('a zero-tax NOA in the IRAS layout: totals, line items and notice date', () => {
  // Fictional details, laid out as pdf.js reads a real 2024 notice.
  const text = 'Tax Reference Number : Date : GXXXX000A 01 Apr 2024 Website: www.iras.gov.sg MR TEST PERSON 1 SAMPLE ROAD Income Tax – Notice of Assessment (Original) What do you need to do? You have no tax payable. No payment is required. YEAR OF ASSESSMENT 2024 EMPLOYMENT 3,428.00 INCOME^ 3,428.00 ($) + ^ All income are net after deduction of expenses. RELIEFS 1,000.00 Earned Income 1,000.00 DEDUCTIONS 1,000.00 ($) - TAX COMPUTATION Tax Payable $0.00 CHARGEABLE INCOME 2,428.00 ($) = • Your tax assessment is based on information given by you through e-Filing on 15 Mar 2024. by 01 May 2024.';
  const noa = parseNoaText(text);
  assert.deepEqual({ ya: noa.ya, income: noa.income, deductions: noa.deductions, chargeable: noa.chargeable, tax: noa.tax, date: noa.date }, { ya: 2024, income: 3428, deductions: 1000, chargeable: 2428, tax: 0, date: '2024-04-01' });
  assert.deepEqual(noa.lines, [{ kind: 'income', label: 'Employment', amount: 3428 }, { kind: 'relief', label: 'Earned Income', amount: 1000 }]);
  assert.ok(noaComplete(noa) && noaConsistent(noa));
  assert.equal(noaConsistent({ ...noa, chargeable: 9999 } as any), false);
  // Reliefs are only read after the RELIEFS heading, and Working Mother's Child isn't also a QCR.
  const family = parseNoaText('Notice of Assessment YEAR OF ASSESSMENT 2025 INCOME^ 90,000.00 RELIEFS 21,000.00 Earned Income 1,000.00 CPF/Provident Fund 12,000.00 Working Mother\'s Child 8,000.00 DEDUCTIONS 21,000.00');
  assert.deepEqual(family.lines!.filter(l => l.kind === 'relief').map(l => l.label), ['Earned Income', 'CPF/Provident Fund', "Working Mother's Child"]);
});

test('a year built from an NOA: new records take its items, existing ones keep their detail', () => {
  const summary = { ya: 2024, income: 3428, deductions: 1000, chargeable: 2428, tax: 0, date: '2024-04-01', lines: [{ kind: 'income' as const, label: 'Employment', amount: 3428 }, { kind: 'relief' as const, label: 'Earned Income', amount: 1000 }, { kind: 'relief' as const, label: 'CPF/Provident Fund', amount: 500 }] };
  const created = yearFromNoa(summary, undefined, year({ ya: 2025, age: 31 }));
  assert.equal(created.ya, 2024); assert.equal(created.status, 'Assessed'); assert.equal(created.assessedTax, 0); assert.equal(created.noaDate, '2024-04-01');
  assert.equal(created.employment, 3428); assert.deepEqual(created.reliefs, { cpf: 500 });
  validateTaxYear(created);
  const bare = yearFromNoa({ ...summary, lines: undefined }, undefined, undefined);
  assert.equal(bare.employment, 3428, 'total income when no items were read');
  const existing = year({ ya: 2024, employment: 5000, reliefs: { cpf: 900 } });
  const kept = yearFromNoa(summary, existing, undefined);
  assert.equal(kept.id, existing.id); assert.equal(kept.employment, 5000); assert.deepEqual(kept.reliefs, { cpf: 900 }); assert.equal(kept.noaSummary, summary);
});

test('NOA-style tax computation: first part at a band edge, the rest at its rate', () => {
  assert.deepEqual(taxComputation(85251), { gross: 3350 + 603.87, lines: [{ label: 'Tax on the first $80,000', amount: 3350 }, { label: 'Tax on the next $5,251', rate: 0.115, amount: 603.87 }] });
  assert.deepEqual(taxComputation(2428), { gross: 0, lines: [{ label: 'Tax on the next $2,428', rate: 0, amount: 0 }] });
  assert.deepEqual(taxComputation(80000).lines, [{ label: 'Tax on the first $40,000', amount: 550 }, { label: 'Tax on the next $40,000', rate: 0.07, amount: 2800 }]);
  assert.equal(taxComputation(1_200_000).gross, residentTax(1_200_000));
});

test('income sources are grouped by kind with tidy names and shares', () => {
  const groups = groupIncomeSources([
    { id: 'a', name: 'SMRT Income ', amount: 49608, payments: 12 }, { id: 'b', name: 'APIP :', amount: 23431, payments: 1 },
    { id: 'c', name: 'Monthly Wage Supplement (May)', amount: 344, payments: 1 }, { id: 'd', name: 'Eflex Allowance', amount: 347, payments: 1 },
    { id: 'e', name: 'Merit Increment ', amount: 1092, payments: 6 }, { id: 'f', name: 'Chinese New Year Angpau', amount: 20, payments: 1 }, { id: 'g', name: 'Misc', amount: 10, payments: 1 },
  ]);
  assert.deepEqual(groups.map(g => g.group), ['Salary', 'Bonuses & awards', 'Allowances & supplements', 'Other']);
  assert.deepEqual(groups[0].items.map(i => i.name), ['SMRT Income', 'Merit Increment']);
  assert.deepEqual(groups[1].items.map(i => i.name), ['APIP', 'Chinese New Year Angpau']);
  assert.ok(Math.abs(groups.reduce((s, g) => s + g.share, 0) - 1) < 1e-9);
  assert.equal(cleanSourceName('  Kaizen   Bonus :  '), 'Kaizen Bonus');
});
