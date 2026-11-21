import test from 'node:test';
import assert from 'node:assert/strict';
import { annualPremium, insuranceMetrics, policyStatus, statusLabel, validatePolicy, loadInsurance, saveInsurance, deleteInsurance, type InsurancePolicy } from '../services/insuranceService';
import { findInsurer } from '../services/insurerLogoService';
import { validateDocument } from '../services/insuranceDocumentService';

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

import { htmlToText, isFetchableUrl } from '../server/insurancePage';
import { applyExtraction, firstJsonObject, parsePolicyExtraction } from '../services/insuranceImportService';

test('policy page fetcher only accepts public https links', () => {
  assert.ok(isFetchableUrl('https://sg.trip.com/inpath/generalInfo?typeId=X'));
  for (const bad of ['http://example.com', 'https://localhost/x', 'https://127.0.0.1/', 'https://[::1]/', 'https://printer.local/', 'https://user:pw@example.com/', 'https://example.com:8080/', 'file:///etc/passwd', 'nonsense'])
    assert.equal(isFetchableUrl(bad), null, bad);
});
test('page text keeps benefit table rows and drops scripts and icon glyphs', () => {
  const page = htmlToText(`<html><head><title>Plan &amp; Cover</title><script>var x = "Medical";</script></head><body>
    <table><tr><th>Benefits</th><th>Maximum Sum Insured (S$)</th></tr><tr><td>Overseas Medical Expenses</td><td>250,000 \uDB87\uDC50</td></tr>
    <tr><td>Travel Delay</td><td>200 per every 6 hours, up to 800</td></tr></table><a href="https://x.com/Policy%20Wording.pdf">Wording</a></body></html>`);
  assert.equal(page.title, 'Plan & Cover');
  assert.match(page.text, /^Overseas Medical Expenses \| 250,000$/m);
  assert.match(page.text, /^Travel Delay \| 200 per every 6 hours, up to 800$/m);
  assert.doesNotMatch(page.text, /var x/);
  assert.deepEqual(page.pdfLinks, ['https://x.com/Policy%20Wording.pdf']);
});
test('model replies are parsed defensively', () => {
  assert.deepEqual(firstJsonObject('Sure! ```json\n{"a":{"b":"}"}}\n``` done'), { a: { b: '}' } });
  assert.throws(() => parsePolicyExtraction('no json here'), /couldn’t be read/);
  let n = 0;
  const result = parsePolicyExtraction(JSON.stringify({
    name: 'Single Trip', insurer: 'Chubb', kind: 'travel', currency: 'sgd', frequency: 'one-time', premium: null, coverage: '250,000',
    startDate: '2026-02-30', emergencyPhone: '+65 6299 0988', notes: 'Only from Singapore\nCancel before departure', policyNumber: '',
    benefits: [
      { name: 'Overseas Medical Expenses', limit: 250000, limitText: '', details: 'Ages 18-70: 250,000; others: 125,000', subLimit: false },
      { name: 'Sub-limit for Traditional Chinese Medicine', limit: '500', limitText: '500', details: '' },
      { name: 'Emergency Medical Evacuation', limit: null, limitText: 'Included', details: '', subLimit: false },
      { name: '', limit: 1 }, { name: 'Bad limit', limit: -5, limitText: '', details: '', subLimit: false },
    ],
  }), () => `b${++n}`);
  assert.deepEqual(result.fields, { name: 'Single Trip', insurer: 'Chubb', emergencyPhone: '+65 6299 0988', notes: 'Only from Singapore\nCancel before departure', kind: 'Travel', currency: 'SGD', frequency: 'One-time', coverage: 250000 });
  assert.equal(result.benefits.length, 4);
  assert.deepEqual(result.benefits[1], { id: 'b2', name: 'Sub-limit for Traditional Chinese Medicine', limit: 500, limitText: '', details: '', subLimit: true });
  assert.equal(result.benefits[2].limit, null); assert.equal(result.benefits[2].limitText, 'Included');
  assert.equal(result.benefits[3].limit, null);
});
test('imports fill placeholders but keep what the user typed', () => {
  const blank: InsurancePolicy = { ...policy, name: '', insurer: '', kind: 'Medical', frequency: 'Monthly', premium: 0, coverage: 0, startDate: '2026-11-15' };
  const benefits = [{ id: 'x', name: 'Baggage', limit: 3000, limitText: '', details: '', subLimit: false }];
  const { policy: next, filled } = applyExtraction({ ...blank, insurer: 'My insurer', insuredPerson: 'Alex' }, { fields: { name: 'Trip', insurer: 'Chubb', kind: 'Travel', frequency: 'One-time', coverage: 250000, startDate: '2026-12-01' }, benefits }, 'https://a.com/p', blank);
  assert.equal(next.insurer, 'My insurer');
  assert.deepEqual(filled.sort(), ['coverage', 'frequency', 'kind', 'name', 'startDate']);
  assert.equal(next.benefits, benefits); assert.equal(next.sourceUrl, 'https://a.com/p');
  // Editing a saved policy: its type and frequency are real choices, not placeholders.
  const edited = applyExtraction(policy, { fields: { kind: 'Travel', coverage: 1 }, benefits: [] }).policy;
  assert.equal(edited.kind, 'Medical'); assert.equal(edited.coverage, 100000); assert.equal(edited.benefits, undefined);
});
test('benefits are validated and saved with the policy', async () => {
  assert.throws(() => validatePolicy({ ...policy, benefits: [{ id: '1', name: ' ', limit: 1, limitText: '', details: '', subLimit: false }] }), /name/);
  assert.throws(() => validatePolicy({ ...policy, benefits: [{ id: '1', name: 'A', limit: -1, limitText: '', details: '', subLimit: false }] }), /zero/);
  const withBenefits = { ...policy, id: 'b', benefits: [{ id: '1', name: 'Medical', limit: null, limitText: 'Included', details: '', subLimit: false }] };
  await saveInsurance(withBenefits);
  assert.deepEqual((await loadInsurance()).find(p => p.id === 'b')?.benefits, withBenefits.benefits);
});
test('one-time policies read Upcoming, Current and Expired', () => {
  const trip: InsurancePolicy = { ...policy, kind: 'Travel', frequency: 'One-time', startDate: '2026-12-03', endDate: '2026-12-10', destination: 'Asia' };
  assert.equal(statusLabel(trip, '2026-11-21'), 'Upcoming');
  assert.equal(statusLabel(trip, '2026-12-03'), 'Current');
  assert.equal(statusLabel(trip, '2026-12-10'), 'Current');
  assert.equal(statusLabel(trip, '2026-12-11'), 'Expired');
  assert.equal(statusLabel({ ...trip, archived: true }, '2026-12-05'), 'Archived');
  assert.equal(statusLabel(policy, '2026-11-21'), 'Active');
});
test('matches insurer names to logo domains', () => {
  assert.equal(findInsurer('Income')?.domain, 'income.com.sg');
  assert.equal(findInsurer('NTUC Income Insurance')?.domain, 'income.com.sg');
  assert.equal(findInsurer('Chubb')?.name, 'Chubb');
  assert.equal(findInsurer('FWD Singapore')?.name, 'FWD');
  assert.equal(findInsurer('Tiq by Etiqa')?.name, 'Tiq');
  assert.equal(findInsurer('Some Local Mutual'), undefined);
  assert.equal(findInsurer(''), undefined);
});
test('accepts PDF and image policy documents within the size limit', () => {
  validateDocument({ type: 'application/pdf', size: 1000 });
  assert.throws(() => validateDocument({ type: 'application/zip', size: 1000 }), /PDF/);
  assert.throws(() => validateDocument({ type: 'application/pdf', size: 0 }), /15 MB/);
  assert.throws(() => validateDocument({ type: 'application/pdf', size: 16 * 1024 * 1024 }), /15 MB/);
  assert.throws(() => validatePolicy({ ...policy, documents: Array.from({ length: 11 }, (_, i) => ({ path: `p${i}`, name: 'a.pdf', size: 1, type: 'application/pdf', uploadedAt: '' })) }), /10 documents/);
});
