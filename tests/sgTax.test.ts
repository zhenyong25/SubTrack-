import test from 'node:test';
import assert from 'node:assert/strict';
import type { Income } from '../types';
import { computeTax, currentYa, earnedIncomeRelief, emptyYear, employmentFromIncomes, estimateCpf, marginalRate, residentTax, savings, validateTaxYear, type TaxYear } from '../services/sgTaxService';

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
