import test from 'node:test';
import assert from 'node:assert/strict';
import { annualPremium, insuranceMetrics, policyStatus, validatePolicy, loadInsurance, saveInsurance, deleteInsurance, type InsurancePolicy } from '../services/insuranceService';

const policy: InsurancePolicy = { id: 'test', name: 'Medical plan', insurer: 'Insurer', insuredPerson: 'Alex', policyNumber: '', kind: 'Medical', currency: 'SGD', premium: 100, frequency: 'Monthly', coverage: 100000, deductible: 500, startDate: '2026-01-01', endDate: '', renewalDate: '2026-11-01', destination: '', emergencyPhone: '', notes: '', archived: false };
test('annualizes recurring premiums and excludes single payments', () => {
  assert.equal(annualPremium(policy), 1200);
  assert.equal(annualPremium({ ...policy, frequency: 'Quarterly' }), 400);
  assert.equal(annualPremium({ ...policy, frequency: 'One-time' }), 0);
});
test('metrics separate currencies, dates and coverage types', () => {
  const travel: InsurancePolicy = { ...policy, id: 'travel', kind: 'Travel', premium: 50, frequency: 'One-time', startDate: '2026-11-01', endDate: '2026-11-10', destination: 'Japan' };
  const rows = [policy, travel, { ...policy, currency: 'USD' }, { ...policy, archived: true }, { ...policy, endDate: '2026-10-01' }];
  const result = insuranceMetrics(rows, 'SGD', '2026-10-29');
  assert.equal(result.annual, 1200); assert.equal(result.active, 1); assert.equal(result.travel, 50);
  assert.equal(result.coverage.find(c => c.kind === 'Medical')?.amount, 100000);
  assert.equal(result.coverage.find(c => c.kind === 'Travel')?.amount, 0);
  assert.equal(policyStatus(travel, '2026-11-10'), 'Active');
  assert.equal(policyStatus(travel, '2026-11-11'), 'Expired');
});
test('validates travel dates and nonnegative amounts', () => {
  assert.throws(() => validatePolicy({ ...policy, kind: 'Travel' }), /destination/);
  assert.throws(() => validatePolicy({ ...policy, premium: -1 }), /zero/);
  assert.throws(() => validatePolicy({ ...policy, endDate: '2025-01-01' }), /end/);
  validatePolicy(policy);
});
test('local records persist edits and deletion', async () => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
  await saveInsurance(policy); await saveInsurance({ ...policy, premium: 200 });
  assert.equal((await loadInsurance()).length, 1); assert.equal((await loadInsurance())[0].premium, 200);
  await deleteInsurance(policy.id); assert.deepEqual(await loadInsurance(), []);
});
