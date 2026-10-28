import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS, FIX_REWARD, agentFor, agentForBuilding, fixedSince, monthlyCost, parseAgentRecords, runAgent, type AgentInput } from '../services/cityAgents';
import { BUILDINGS, newCity, recordAgentReport, staffRoster } from '../services/cityGameService';
import type { Loan, LoanPayment, SavingsEntry, SavingsGoal, Subscription } from '../types';

const TODAY = '2026-10-28';
const T0 = Date.UTC(2026, 9, 28, 1);
const sub = (id: string, name: string, price: number, extra: Partial<Subscription> = {}): Subscription => ({
  id, name, price, currency: 'MYR', billingCycle: 'Monthly', firstPaymentDate: '2026-01-05', nextPaymentDate: '2026-11-05', category: 'Entertainment',
  cardName: 'Cash', color: '#000', status: 'Active', ...extra,
} as Subscription);
const input = (overrides: Partial<AgentInput> = {}): AgentInput => ({ today: TODAY, subscriptions: [], loans: [], payments: [], goals: [], entries: [], ...overrides });

test('every advisor has a building and a hired role', () => {
  AGENTS.forEach(agent => {
    const building = BUILDINGS.find(type => type.id === agent.building);
    assert.ok(building, `${agent.id} has a building`);
    assert.equal(building!.category, 'advisors');
    assert.ok((building!.jobs || 0) > 0);
    assert.equal(staffRoster('b1', agent.building, building!.jobs!)[0].role, agent.role); // first on staff is the advisor
    assert.equal(agentForBuilding(agent.building), agent);
  });
});

test('Subscription Auditor: overlaps, trials about to charge, stale and annual renewals, monthly totals', () => {
  const subs = [
    sub('s1', 'Spotify Premium', 17.9),
    sub('s2', 'Apple Music', 16.9),
    sub('s3', 'Netflix', 55),
    sub('s4', 'iCloud+', 120, { billingCycle: 'Yearly', nextPaymentDate: '2026-11-15' }),
    sub('s5', 'Notion', 0, { billingCycle: 'Free Trial', firstPaymentDate: '2026-11-02', price: 40 }),
    sub('s6', 'Old gym', 99, { nextPaymentDate: '2026-09-01' }),
    sub('s7', 'Cancelled thing', 20, { status: 'Past' }),
  ];
  const report = runAgent(agentFor('auditor'), input({ subscriptions: subs }));
  const ids = report.findings.map(finding => finding.id);
  assert.ok(ids.includes('overlap:music:s1,s2'));
  assert.ok(ids.includes('trial:s5:2026-11-02'));
  assert.ok(ids.includes('stale:s6:2026-09-01'));
  assert.ok(ids.includes('annual:s4:2026-11-15'));
  assert.equal(report.findings.find(f => f.id === 'trial:s5:2026-11-02')!.title, 'Notion trial ends in 5 days');
  const monthly = report.summary.find(item => item.label === 'Per month · MYR')!;
  assert.equal(monthly.value, `MYR ${(17.9 + 16.9 + 55 + 10 + 99).toFixed(2)}`);
  assert.equal(monthlyCost(subs[3]), 10);
  // Nothing wrong: a clean bill of health.
  const clean = runAgent(agentFor('auditor'), input({ subscriptions: [sub('a', 'Netflix', 55), sub('b', 'Spotify', 17.9)] }));
  assert.equal(clean.findings[0].id, 'clean');
});

const loan = (id: string, extra: Partial<Loan>): Loan => ({
  id, name: id, kind: 'Personal', currency: 'MYR', principal: 10000, annualRate: 8, interestMethod: 'Reducing', termMonths: 36,
  startDate: '2026-01-15', paymentDay: 15, color: '#000', isArchived: false, ...extra,
} as Loan);

test('Debt Advisor: what to pay first, the effect of paying more, and what\'s overdue', () => {
  const loans = [loan('Car', { annualRate: 3, interestMethod: 'Flat', principal: 60000, termMonths: 84 }), loan('Personal', { annualRate: 12, principal: 20000, termMonths: 48 })];
  const payments: LoanPayment[] = [];
  const report = runAgent(agentFor('debt'), input({ loans, payments }));
  const ids = report.findings.map(finding => finding.id);
  assert.ok(ids.some(id => id.startsWith('overdue:')), 'nine months with no payments logged');
  assert.ok(ids.includes('avalanche:Personal'), 'the 12% loan beats a 3% flat (about 5.6% real) one');
  assert.ok(ids.includes('flat:Car'));
  assert.ok(ids.some(id => id.startsWith('extra:Personal:')));
  assert.ok(report.summary.some(item => item.label === 'Owed · MYR'));
  assert.equal(runAgent(agentFor('debt'), input()).findings[0].id, 'debt-free');
});

test('Savings Coach: monthly amounts, past-due goals, celebrating funded ones', () => {
  const goal = (id: string, extra: Partial<SavingsGoal>): SavingsGoal => ({ id, name: id, kind: 'Savings goal', targetAmount: 1200, openingBalance: 0, currency: 'MYR', repeatMonths: 0, color: '#000', createdAt: '', updatedAt: '', ...extra } as SavingsGoal);
  const goals = [goal('Trip', { targetDate: '2027-04-30' }), goal('Laptop', { targetDate: '2026-09-30' }), goal('Fund', { openingBalance: 1200 }), goal('Someday', {})];
  const entries: SavingsEntry[] = [];
  const report = runAgent(agentFor('savings'), input({ goals, entries }));
  const ids = report.findings.map(finding => finding.id);
  assert.ok(ids.includes('monthly:Trip:2026-10'));
  assert.ok(ids.includes('overdue:Laptop:2026-09-30'));
  assert.ok(ids.includes('funded:Fund'));
  assert.ok(ids.includes('nodate:Someday'));
  // Saving this month turns the nudge into a tick - and the nudge counts as fixed.
  const after = runAgent(agentFor('savings'), input({ goals, entries: [{ id: 'e', goalId: 'Trip', direction: 'Contribution', amount: 200, entryDate: '2026-10-28', createdAt: '' } as SavingsEntry] }));
  assert.ok(after.findings.some(finding => finding.id === 'monthly:Trip:2026-10:paid' && finding.tone === 'good'));
  assert.deepEqual(fixedSince(report, after, []), ['monthly:Trip:2026-10']);
});

test('fixing a flagged issue pays once; reports survive saving', () => {
  const auditor = agentFor('auditor');
  const before = runAgent(auditor, input({ subscriptions: [sub('s1', 'Spotify', 17.9), sub('s2', 'Apple Music', 16.9)] }));
  let city = recordAgentReport(newCity(T0, TODAY), before, T0, TODAY).state;
  assert.equal(city.coins, 300); // a first report pays nothing
  const after = runAgent(auditor, input({ subscriptions: [sub('s1', 'Spotify', 17.9), sub('s2', 'Apple Music', 16.9, { status: 'Past' })] }));
  const result = recordAgentReport(city, after, T0, TODAY);
  assert.equal(result.fixed, 1);
  assert.equal(result.state.coins, 300 + FIX_REWARD.coins);
  city = result.state;
  // The same overlap coming back and going again doesn't pay twice.
  city = recordAgentReport(city, before, T0, TODAY).state;
  const again = recordAgentReport(city, after, T0, TODAY);
  assert.equal(again.fixed, 0);
  const parsed = parseAgentRecords(JSON.parse(JSON.stringify(again.state.agents)));
  assert.deepEqual(parsed.auditor!.rewarded, ['overlap:music:s1,s2']);
  assert.equal(parsed.auditor!.report!.agent, 'auditor');
  assert.deepEqual(parseAgentRecords({ auditor: { report: { version: 9 } } }).auditor!.report, undefined);
});
